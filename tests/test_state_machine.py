"""The contract's state machine, driven through the fake GenVM.

Every test exercises a real branch: registration and collateral, the bond
lifecycle, consensus agreement and disagreement, the fail-closed paths, the
settlement arithmetic, the escape hatches, and the pull-only payout.
"""

import datetime
import json

import Covenant as covenant_module
import pytest
from fake_genlayer import UserError

Address = covenant_module.Address

A = "0x" + "aa" * 20
B = "0x" + "bb" * 20
TREASURY = "0x" + "cc" * 20
OTHER = "0x" + "dd" * 20

T0 = 1_700_000_000

REG = covenant_module.REG_COLLATERAL
BOND = covenant_module.DEFAULT_BOND
DBOND = covenant_module.DEFAULT_DISPUTE_BOND
CUT = BOND * covenant_module.FEE_BPS // covenant_module.BPS_DENOM
FUND = REG + 10 * BOND

EV_A = "https://a.example.com/report"
EV_B = "https://b.example.com/report"
PATTERNS = ["*.example.com"]
CLAUSES = ["uphold", "deliver"]


def set_time(gl, ts):
    dt = datetime.datetime.fromtimestamp(ts, datetime.UTC)
    gl.message.raw = {"datetime": dt.isoformat()}


def set_sender(gl, addr):
    gl.message.sender_address = Address(addr)


@pytest.fixture
def app(gl):
    set_time(gl, T0)
    set_sender(gl, A)
    gl.message.value = 0
    return covenant_module.Covenant(TREASURY)


def register(app, gl, addr, name="agent", value=FUND):
    set_sender(gl, addr)
    gl.message.value = value
    return app.register_agent(name)


def propose(app, gl, proposer=A, respondent=B, key="cov-1", hours=24, patterns=None):
    set_sender(gl, proposer)
    gl.message.value = 0
    return app.propose_covenant(
        key,
        respondent,
        "Service covenant",
        "the parties will uphold their obligations",
        list(CLAUSES),
        list(patterns or PATTERNS),
        "",
        hours,
    )


def ratify(app, gl, cid, respondent=B):
    set_sender(gl, respondent)
    gl.message.value = 0
    return app.ratify_covenant(cid)


def file_dispute(app, gl, cid, filer=A, clause="uphold", key="d-1", value=DBOND):
    set_sender(gl, filer)
    gl.message.value = value
    return app.file_dispute(key, cid, clause, "the other party breached", EV_A, EV_B)


def active(app, gl):
    register(app, gl, A)
    register(app, gl, B)
    cid = propose(app, gl)
    ratify(app, gl, cid)
    return cid


def agree(nondet, verdict, sources=(0,), clauses=CLAUSES[:1]):
    answer = {"verdict": verdict, "supporting_sources": list(sources), "clause_ids": list(clauses)}
    nondet.leader_answers = [json.dumps(answer)]


def solvency(app):
    return json.loads(app.get_solvency())


# --- agents ----------------------------------------------------------------


def test_register_agent_and_view(app, gl):
    assert register(app, gl, A, name="Alpha") == A
    agent = json.loads(app.get_agent(A))
    assert agent["address"] == A
    assert agent["name"] == "Alpha"
    assert json.loads(app.get_agent_ids()) == [A]
    assert solvency(app)["balanced"] is True


def test_register_rejects_duplicate(app, gl):
    register(app, gl, A)
    with pytest.raises(UserError):
        register(app, gl, A)


def test_register_rejects_under_collateral(app, gl):
    with pytest.raises(UserError):
        register(app, gl, A, value=REG - 1)


def test_withdraw_excess_respects_the_collateral_floor(app, gl, chain):
    register(app, gl, A)
    set_sender(gl, A)
    assert int(app.withdraw_excess()) == FUND - REG
    assert int(app.get_claimable(A)) == FUND - REG
    assert app.claim() == str(FUND - REG)
    assert chain.sent == [(A, FUND - REG)]
    assert solvency(app)["balanced"] is True


# --- covenants -------------------------------------------------------------


def test_propose_reserves_the_bond(app, gl):
    register(app, gl, A)
    register(app, gl, B)
    cid = propose(app, gl)
    cov = json.loads(app.get_covenant(cid))
    assert cov["status"] == "PROPOSED"
    assert cov["proposer"] == A and cov["respondent"] == B
    assert cov["bond_amount"] == str(BOND)
    assert solvency(app)["escrow"] == str(BOND)


def test_propose_rejects_an_unregistered_counterparty(app, gl):
    register(app, gl, A)
    with pytest.raises(UserError):
        propose(app, gl)


def test_propose_rejects_a_duplicate_key(app, gl):
    register(app, gl, A)
    register(app, gl, B)
    propose(app, gl)
    with pytest.raises(UserError):
        propose(app, gl, key="cov-1")


def test_only_the_respondent_may_ratify(app, gl):
    register(app, gl, A)
    register(app, gl, B)
    cid = propose(app, gl)
    with pytest.raises(UserError):
        ratify(app, gl, cid, respondent=A)


def test_ratify_activates_and_locks_the_matching_bond(app, gl):
    cid = active(app, gl)
    cov = json.loads(app.get_covenant(cid))
    assert cov["status"] == "ACTIVE"
    assert solvency(app)["escrow"] == str(2 * BOND)


# --- filing disputes -------------------------------------------------------


def test_file_dispute_freezes_the_commitment(app, gl):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    d = json.loads(app.get_dispute(did))
    assert d["status"] == "OPEN"
    assert d["claimant"] == A and d["accused"] == B
    assert d["commitment"] and len(d["commitment"]) == 64
    assert json.loads(app.get_covenant(cid))["status"] == "DISPUTED"
    assert solvency(app)["escrow"] == str(2 * BOND + DBOND)


def test_file_dispute_rejects_a_stranger(app, gl):
    cid = active(app, gl)
    with pytest.raises(UserError):
        file_dispute(app, gl, cid, filer=OTHER)


def test_file_dispute_rejects_an_unknown_clause(app, gl):
    cid = active(app, gl)
    with pytest.raises(UserError):
        file_dispute(app, gl, cid, clause="invented")


def test_file_dispute_rejects_a_disallowed_host(app, gl):
    cid = active(app, gl)
    set_sender(gl, A)
    gl.message.value = DBOND
    with pytest.raises(UserError):
        app.file_dispute("d-1", cid, "uphold", "claim", "https://evil.net/x", EV_B)


def test_file_dispute_rejects_underpayment(app, gl):
    cid = active(app, gl)
    with pytest.raises(UserError):
        file_dispute(app, gl, cid, value=DBOND - 1)


def test_file_dispute_rejects_identical_evidence_urls(app, gl):
    # The validator de-duplicates URLs, so the same document twice must be a
    # clean rejection, never an index past the end of the normalized list.
    cid = active(app, gl)
    set_sender(gl, A)
    gl.message.value = DBOND
    with pytest.raises(UserError):
        app.file_dispute("d-1", cid, "uphold", "claim", EV_A, EV_A)


def test_overpayment_is_held_as_refundable_balance(app, gl):
    cid = active(app, gl)
    file_dispute(app, gl, cid, value=DBOND + 50)
    assert solvency(app)["balanced"] is True
    assert solvency(app)["held_total"] == str(2 * (FUND - BOND) + 50)


# --- adjudication: breach --------------------------------------------------


def test_breach_slashes_the_accused_and_pays_the_claimant(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "the accused stopped delivering")
    nondet.web[EV_B] = (200, "the accused missed the deadline")
    agree(nondet, "BREACH", sources=[0], clauses=["uphold"])
    set_sender(gl, A)

    assert app.adjudicate(did) == "BREACH"
    assert int(app.get_claimable(A)) == (BOND - CUT) + BOND + DBOND
    assert int(app.get_claimable(TREASURY)) == CUT
    assert int(app.get_claimable(B)) == 0
    assert json.loads(app.get_dispute(did))["status"] == "RESOLVED"
    assert json.loads(app.get_covenant(cid))["status"] == "SETTLED"
    assert solvency(app)["balanced"] is True
    assert solvency(app)["escrow"] == "0"


def test_breach_when_the_respondent_files(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid, filer=B)
    nondet.web[EV_A] = (200, "the proposer failed")
    nondet.web[EV_B] = (200, "the proposer failed")
    agree(nondet, "BREACH", sources=[0], clauses=["uphold"])
    set_sender(gl, B)

    assert app.adjudicate(did) == "BREACH"
    assert int(app.get_claimable(B)) == (BOND - CUT) + BOND + DBOND
    assert int(app.get_claimable(A)) == 0
    assert solvency(app)["balanced"] is True


# --- adjudication: non-breach ----------------------------------------------


@pytest.mark.parametrize("verdict,sources", [("NO_BREACH", []), ("INCONCLUSIVE", [])])
def test_non_breach_refunds_both_bonds(app, gl, nondet, verdict, sources):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "clean")
    nondet.web[EV_B] = (200, "clean")
    agree(nondet, verdict, sources=sources)
    set_sender(gl, A)

    assert app.adjudicate(did) == verdict
    assert int(app.get_claimable(A)) == BOND + DBOND
    assert int(app.get_claimable(B)) == BOND
    assert solvency(app)["balanced"] is True


def test_conflicting_divergent_bytes_refunds(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "version one")
    nondet.web[EV_B] = (200, "a different story")
    agree(nondet, "CONFLICTING", sources=[])
    set_sender(gl, A)

    assert app.adjudicate(did) == "CONFLICTING"
    assert int(app.get_claimable(A)) == BOND + DBOND
    assert int(app.get_claimable(B)) == BOND


# --- adjudication: fail-closed ---------------------------------------------


def test_identical_bytes_cannot_be_conflicting(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "the same text")
    nondet.web[EV_B] = (200, "the same text")
    agree(nondet, "CONFLICTING", sources=[])
    set_sender(gl, A)

    assert app.adjudicate(did) == "INCONCLUSIVE"


def test_breach_without_sources_is_downgraded(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "maybe a breach")
    nondet.web[EV_B] = (200, "maybe a breach")
    nondet.leader_answers = [json.dumps({"verdict": "BREACH"})]
    set_sender(gl, A)

    assert app.adjudicate(did) == "INCONCLUSIVE"
    assert int(app.get_claimable(A)) == BOND + DBOND


def test_divergent_evidence_fails_closed(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    # Leader and validator fetch different bytes for the same URL.
    nondet.web[EV_A] = [(200, "one"), (200, "two")]
    nondet.web[EV_B] = (200, "two")
    agree(nondet, "BREACH", sources=[0], clauses=["uphold"])
    set_sender(gl, A)

    assert app.adjudicate(did) == "INCONCLUSIVE"
    assert int(app.get_claimable(A)) == BOND + DBOND


def test_fetch_failure_is_inconclusive_and_never_consults_the_model(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    # No web entries: render raises inside both passes.
    agree(nondet, "BREACH", sources=[0], clauses=["uphold"])
    set_sender(gl, A)

    assert app.adjudicate(did) == "INCONCLUSIVE"
    assert nondet.prompts == []


def test_consensus_exception_fails_closed(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "x")
    nondet.web[EV_B] = (200, "y")
    agree(nondet, "BREACH", sources=[0], clauses=["uphold"])
    nondet.force_exception = True
    set_sender(gl, A)

    assert app.adjudicate(did) == "INCONCLUSIVE"


def test_adjudicate_twice_is_rejected(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "x")
    nondet.web[EV_B] = (200, "y")
    agree(nondet, "NO_BREACH", sources=[])
    set_sender(gl, A)
    app.adjudicate(did)
    with pytest.raises(UserError):
        app.adjudicate(did)


# --- adjudication: authorization -------------------------------------------


def test_stranger_cannot_adjudicate_before_the_delay(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    set_sender(gl, OTHER)
    set_time(gl, T0)
    with pytest.raises(UserError):
        app.adjudicate(did)


def test_stranger_can_adjudicate_after_the_delay(app, gl, nondet):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "x")
    nondet.web[EV_B] = (200, "y")
    agree(nondet, "NO_BREACH", sources=[])
    set_sender(gl, OTHER)
    set_time(gl, T0 + covenant_module.ASSESS_DELAY_SECONDS + 1)
    assert app.adjudicate(did) == "NO_BREACH"


# --- escape hatches --------------------------------------------------------


def test_cancel_stale_refunds_and_reactivates(app, gl):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    set_sender(gl, A)
    with pytest.raises(UserError):
        app.cancel_stale(did)
    set_time(gl, T0 + covenant_module.STALE_TIMEOUT_SECONDS + 1)
    assert app.cancel_stale(did) == "CANCELLED"
    assert int(app.get_claimable(A)) == DBOND
    assert json.loads(app.get_covenant(cid))["status"] == "ACTIVE"
    assert solvency(app)["balanced"] is True


def test_expire_covenant_returns_both_bonds(app, gl):
    cid = active(app, gl)
    set_sender(gl, A)
    with pytest.raises(UserError):
        app.expire_covenant(cid)
    set_time(gl, T0 + 24 * 3600 + 1)
    assert app.expire_covenant(cid) == "EXPIRED"
    assert int(app.get_claimable(A)) == BOND
    assert int(app.get_claimable(B)) == BOND
    assert solvency(app)["escrow"] == "0"


def test_expire_covenant_is_blocked_while_disputed(app, gl):
    cid = active(app, gl)
    file_dispute(app, gl, cid)
    set_sender(gl, A)
    set_time(gl, T0 + 24 * 3600 + 1)
    with pytest.raises(UserError):
        app.expire_covenant(cid)


def test_expire_proposed_covenant_refunds_the_proposer(app, gl):
    register(app, gl, A)
    register(app, gl, B)
    cid = propose(app, gl)
    set_sender(gl, A)
    set_time(gl, T0 + 24 * 3600 + 1)
    assert app.expire_covenant(cid) == "EXPIRED"
    assert int(app.get_claimable(A)) == BOND


# --- payouts and indexes ---------------------------------------------------


def test_claim_is_pull_only_and_once(app, gl, nondet, chain):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    nondet.web[EV_A] = (200, "x")
    nondet.web[EV_B] = (200, "y")
    agree(nondet, "NO_BREACH", sources=[])
    set_sender(gl, A)
    app.adjudicate(did)

    assert app.claim() == str(BOND + DBOND)
    assert chain.sent == [(A, BOND + DBOND)]
    with pytest.raises(UserError):
        app.claim()


def test_board_index(app, gl):
    cid = active(app, gl)
    did = file_dispute(app, gl, cid)
    board = json.loads(app.get_board(10))
    assert board and board[0]["dispute_id"] == did
    assert board[0]["status"] == "OPEN"
    assert json.loads(app.get_covenant_ids()) == [cid]


def test_config_reports_the_constants(app, gl):
    cfg = json.loads(app.get_config())
    assert cfg["reg_collateral"] == str(REG)
    assert cfg["default_bond"] == str(BOND)
    assert cfg["default_dispute_bond"] == str(DBOND)
    assert cfg["fee_bps"] == covenant_module.FEE_BPS
    assert cfg["treasury"] == TREASURY

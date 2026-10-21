"""Dispute settlement: who is paid what, and that nothing is created or lost."""

import pytest
from covenantlib.accounting import (
    BREACH,
    CONFLICTING,
    INCONCLUSIVE,
    NO_BREACH,
    conserved,
    escrow_for,
    settle,
)

BOND = 10**16
DBOND = 2 * 10**16
ESCROW = escrow_for(BOND, DBOND)


@pytest.mark.parametrize("verdict", [NO_BREACH, INCONCLUSIVE, CONFLICTING])
@pytest.mark.parametrize("role", ["proposer", "respondent"])
def test_non_breach_refunds_only_the_dispute_bond(verdict, role):
    credits, consumed = settle(verdict, BOND, DBOND, 1000, 10000, role)
    assert credits["treasury"] == 0
    assert credits[role] == DBOND
    other = "respondent" if role == "proposer" else "proposer"
    assert credits[other] == 0
    assert consumed == DBOND
    assert conserved(credits, consumed)


def test_non_breach_never_consumes_the_covenant_bonds():
    _credits, consumed = settle(NO_BREACH, BOND, DBOND, 1000, 10000, "proposer")
    assert consumed < ESCROW
    assert consumed == DBOND


def test_breach_slashes_the_accused_and_pays_the_claimant():
    credits, consumed = settle(BREACH, BOND, DBOND, 1000, 10000, "proposer")
    cut = BOND * 1000 // 10000
    assert credits["treasury"] == cut
    assert credits["proposer"] == (BOND - cut) + BOND + DBOND
    assert credits["respondent"] == 0
    assert consumed == ESCROW
    assert conserved(credits, consumed)


def test_breach_when_the_respondent_is_the_claimant():
    credits, consumed = settle(BREACH, BOND, DBOND, 1000, 10000, "respondent")
    cut = BOND * 1000 // 10000
    assert credits["respondent"] == (BOND - cut) + BOND + DBOND
    assert credits["proposer"] == 0
    assert consumed == ESCROW
    assert conserved(credits, consumed)


def test_zero_fee_keeps_the_whole_bond_with_the_claimant():
    credits, consumed = settle(BREACH, BOND, DBOND, 0, 10000, "proposer")
    assert credits["treasury"] == 0
    assert credits["proposer"] == ESCROW
    assert conserved(credits, consumed)


def test_conservation_catches_a_leak():
    leaked = {"proposer": 1, "respondent": 0, "treasury": 0}
    assert not conserved(leaked, ESCROW)
    assert not conserved(leaked, DBOND)


def test_bad_role_is_rejected():
    with pytest.raises(ValueError):
        settle(BREACH, BOND, DBOND, 1000, 10000, "stranger")

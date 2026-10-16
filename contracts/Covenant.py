# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }
"""COVENANT — a bilateral agent covenant protocol.

Agents register with a refundable collateral. Two agents form a covenant: a
written agreement with named clauses and an allow-list of evidence hosts, one
party proposing and the other ratifying, each locking a bond. While active,
either party may file a dispute that cites a clause and freezes two contested
evidence documents plus the covenant's telemetry URL.

Validators then independently fetch that evidence and decide, under the
Equivalence Principle, exactly one of four discrete verdicts. Only `BREACH`
slashes a bond: the accused's bond is cut and paid to the claimant, a protocol
fee goes to the treasury, and every other verdict refunds both covenant bonds
and the filer's dispute bond. Every technical failure resolves to
`INCONCLUSIVE`, which refunds in full.

State is JSON documents in TreeMaps rather than nested storage dataclasses:
covenants and disputes are read and written whole, so a single document is the
natural unit, and a flat storage surface is easier to audit than a graph of one.
"""

import datetime
import json

import genlayer as gl

# isort: off
# These two MUST stay above the covenantlib marker below. The bundler replaces
# everything between the markers with inlined covenantlib source, so an SDK
# import that drifts inside the block is silently deleted from the deployable
# while every local test keeps passing against the fake runtime. That happened
# on a sibling project, and the fix is this comment.
from genlayer.storage import TreeMap
from genlayer.types import *
# isort: on

# --- covenantlib (inlined by contracts/build_bundle.py for deployment) -------
from covenantlib.accounting import conserved, escrow_for, settle
from covenantlib.canonicalize import (
    covenant_digest,
    dispute_commitment,
    normalize_address,
    normalize_claim,
    normalize_clause_id,
    normalize_clause_ids,
    normalize_covenant_key,
    normalize_terms,
    normalize_title,
)
from covenantlib.judgment import (
    INCONCLUSIVE,
    build_comparable,
    build_prompt,
    canon_verdict,
    comparable_json,
    normalize_evidence,
)
from covenantlib.ssrf import (
    MAX_EVIDENCE_URLS,
    CovenantError,
    normalize_evidence_urls,
    normalize_optional_url,
    normalize_patterns,
)

# --- end covenantlib ---------------------------------------------------------

ST_PROPOSED = "PROPOSED"
ST_ACTIVE = "ACTIVE"
ST_DISPUTED = "DISPUTED"
ST_SETTLED = "SETTLED"
ST_EXPIRED = "EXPIRED"

DS_OPEN = "OPEN"
DS_RESOLVED = "RESOLVED"
DS_CANCELLED = "CANCELLED"

REG_COLLATERAL = 10**15  # 0.001 GEN locked while registered
DEFAULT_BOND = 10**16  # 0.01 GEN per covenant side
DEFAULT_DISPUTE_BOND = 2 * 10**16  # 0.02 GEN to file a dispute
FEE_BPS = 1000
BPS_DENOM = 10000

ASSESS_DELAY_SECONDS = 1800  # parties first, then permissionless
STALE_TIMEOUT_SECONDS = 86400  # a dispute nobody adjudicated is cancelled
MIN_DURATION_HOURS = 1
MAX_DURATION_HOURS = 720
MAX_BOARD = 50


@gl.evm.contract_interface
class _Recipient:
    """Nameless-transfer interface used to pay native GEN out to a wallet."""

    class View:
        pass

    class Write:
        pass


def _err(reason):
    """Raise a stable, lowercase, machine-comparable user error."""
    raise gl.vm.UserError(reason)


def _safe_json(raw):
    """Parse model output without ever letting a parse failure become a verdict."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", "replace")
    if not isinstance(raw, str):
        return {}
    try:
        parsed = json.loads(raw)
    except Exception:
        start, end = raw.find("{"), raw.rfind("}")
        if start == -1 or end <= start:
            return {}
        try:
            parsed = json.loads(raw[start:end + 1])
        except Exception:
            return {}
    return parsed if isinstance(parsed, dict) else {}


def _parse_agreed(agreed, fallback):
    """Read what the validators agreed on, failing closed on anything else."""
    if not isinstance(agreed, str) or not agreed.strip():
        return dict(fallback)
    try:
        parsed = json.loads(agreed)
    except Exception:
        return dict(fallback)
    return parsed if isinstance(parsed, dict) else dict(fallback)


def _to_account_str(value):
    """Coerce an address-shaped argument into the lowercase hex string stored here.

    Tooling can hand a 40-hex address to a `str`-annotated parameter already
    decoded as an `Address`; accepting both means an address-typed caller is
    never locked out by an encoding detail while local tests pass.
    """
    if isinstance(value, Address):
        return value.as_hex.lower()
    if isinstance(value, str):
        return value.strip().lower()
    return ""


def _to_address(value):
    """Coerce a constructor argument into an Address, or None if unset."""
    if value is None or value == "":
        return None
    if isinstance(value, Address):
        return value
    return Address(value)


def _guard(fn):
    """Run pure-lib code, translating its CovenantError into a GenVM user error."""
    try:
        return fn()
    except CovenantError as e:
        _err(str(e))


_FAIL_CLOSED = build_comparable({"verdict": INCONCLUSIVE}, [], [])


class Covenant(gl.contract.Contract):
    # --- storage ----------------------------------------------------------
    owner: Address
    treasury: Address
    next_covenant: u256
    next_dispute: u256

    escrow: u256
    deposits_total: u256
    withdrawn_total: u256
    held_total: u256
    claimable_total: u256

    agents: TreeMap[str, str]        # address -> agent JSON
    agent_ids: TreeMap[str, str]     # "all" -> JSON list of addresses
    covenants: TreeMap[str, str]     # covenant id -> covenant JSON
    covenant_keys: TreeMap[str, str]  # covenant key -> covenant id
    covenant_ids: TreeMap[str, str]  # "all" -> JSON list of covenant ids
    disputes: TreeMap[str, str]      # dispute id -> dispute JSON
    board: TreeMap[str, str]         # "all" -> JSON list of recent dispute ids
    held: TreeMap[str, u256]         # address -> attributable on-contract wei
    claimable: TreeMap[str, u256]    # address -> wei owed

    def __init__(self, treasury: str = ""):
        self.owner = gl.message.sender_address
        self.treasury = _to_address(treasury) or gl.message.sender_address
        self.next_covenant = u256(1)
        self.next_dispute = u256(1)
        # Constructor-time scalars are plain annotations; GenVM initializes them
        # to zero, but assigning them keeps the invariant readable in source.
        self.escrow = u256(0)
        self.deposits_total = u256(0)
        self.withdrawn_total = u256(0)
        self.held_total = u256(0)
        self.claimable_total = u256(0)

    # ------------------------------------------------------------------
    # internals
    # ------------------------------------------------------------------

    def _now(self) -> int:
        """Current time in whole seconds.

        Read from the message itself (`gl.message.raw["datetime"]`), which every
        validator re-executing this call sees identically. `gl.block` does not
        exist and `gl.vm.get_timestamp()` raises on this runtime; the message
        field is the one that works and the right source on the merits.
        """
        try:
            raw = gl.message.raw["datetime"]
        except Exception:
            raw = gl.message.datetime
        raw = str(raw).strip()
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        return int(datetime.datetime.fromisoformat(raw).timestamp())

    def _sender(self) -> str:
        return gl.message.sender_address.as_hex.lower()

    def _load_agent(self, addr: str):
        blob = self.agents.get(_to_account_str(addr))
        return json.loads(blob) if blob is not None else None

    def _load_covenant(self, covenant_id: str):
        blob = self.covenants.get(str(covenant_id).strip())
        return json.loads(blob) if blob is not None else None

    def _load_dispute(self, dispute_id: str):
        blob = self.disputes.get(str(dispute_id).strip())
        return json.loads(blob) if blob is not None else None

    def _store_agent(self, agent: dict) -> None:
        self.agents[agent["address"]] = json.dumps(agent, sort_keys=True)

    def _store_covenant(self, covenant: dict) -> None:
        self.covenants[covenant["covenant_id"]] = json.dumps(covenant, sort_keys=True)

    def _store_dispute(self, dispute: dict) -> None:
        self.disputes[dispute["dispute_id"]] = json.dumps(dispute, sort_keys=True)

    def _held_of(self, addr: str) -> int:
        return int(self.held.get(_to_account_str(addr), 0))

    def _add_held(self, addr: str, amount: int) -> None:
        """Move attributable value on-contract, keeping `held_total` in step."""
        amount = int(amount)
        if amount == 0:
            return
        key = _to_account_str(addr)
        new = int(self.held.get(key, 0)) + amount
        if new < 0:
            _err("insufficient held balance")
        self.held[key] = u256(new)
        self.held_total = u256(int(self.held_total) + amount)

    def _add_claimable(self, addr: str, amount: int) -> None:
        """Owe wei to an address. Never pushes funds — claim() pulls."""
        amount = int(amount)
        if amount == 0:
            return
        key = _to_account_str(addr)
        self.claimable[key] = u256(int(self.claimable.get(key, 0)) + amount)
        self.claimable_total = u256(int(self.claimable_total) + amount)

    def _move_escrow(self, delta: int) -> None:
        new = int(self.escrow) + int(delta)
        if new < 0:
            _err("escrow underflow")
        self.escrow = u256(new)

    def _append_id(self, store: TreeMap, value: str) -> None:
        raw = store.get("all")
        items = json.loads(raw) if raw else []
        if value not in items:
            items.append(value)
        store["all"] = json.dumps(items)

    def _append_board(self, dispute_id: str) -> None:
        raw = self.board.get("all")
        items = json.loads(raw) if raw else []
        if dispute_id not in items:
            items.append(dispute_id)
        if len(items) > MAX_BOARD:
            items = items[-MAX_BOARD:]
        self.board["all"] = json.dumps(items)

    def _fresh_covenant_id(self) -> str:
        n = int(self.next_covenant)
        self.next_covenant = u256(n + 1)
        return f"v{n}"

    def _fresh_dispute_id(self) -> str:
        n = int(self.next_dispute)
        self.next_dispute = u256(n + 1)
        return f"d{n}"

    # ------------------------------------------------------------------
    # writes: agents
    # ------------------------------------------------------------------

    @gl.public.write.payable
    def register_agent(self, name: str, endpoint: str = "") -> str:
        """Register an agent with at least the collateral posted.

        The attached value is credited to the sender's attributable balance. The
        registration is live while that balance stays at or above
        `REG_COLLATERAL`; `withdraw_excess` can never draw it below.
        """
        sender = self._sender()
        if self.agents.get(sender) is not None:
            _err("agent already registered")
        nm = _guard(lambda: normalize_title(name))
        ep = _guard(lambda: normalize_optional_url(endpoint))

        value = int(gl.message.value)
        if value < REG_COLLATERAL:
            _err("attached value is below the registration collateral")

        self.deposits_total = u256(int(self.deposits_total) + value)
        self._add_held(sender, value)

        agent = {
            "address": sender,
            "name": nm,
            "endpoint": ep,
            "collateral": str(REG_COLLATERAL),
            "registered_at": self._now(),
        }
        self._store_agent(agent)
        self._append_id(self.agent_ids, sender)
        return sender

    @gl.public.write
    def withdraw_excess(self) -> str:
        """Move everything above the registration collateral to `claimable`.

        The collateral itself cannot be withdrawn while the agent is registered,
        so an agent that still has live bonds can never strip itself below the
        floor.
        """
        sender = self._sender()
        if self.agents.get(sender) is None:
            _err("agent not registered")
        excess = self._held_of(sender) - REG_COLLATERAL
        if excess <= 0:
            _err("no excess collateral to withdraw")
        self._add_held(sender, -excess)
        self._add_claimable(sender, excess)
        return str(excess)

    # ------------------------------------------------------------------
    # writes: covenant lifecycle
    # ------------------------------------------------------------------

    @gl.public.write
    def propose_covenant(
        self,
        covenant_key: str,
        respondent: str,
        title: str,
        terms: str,
        clause_ids: list,
        evidence_patterns: list,
        telemetry_url: str,
        duration_hours: int,
    ) -> str:
        """Propose a covenant and lock the proposer's bond.

        Both parties must already be registered. The bond is reserved from the
        proposer's held balance; the registration collateral stays locked.
        """
        sender = self._sender()
        if self.agents.get(sender) is None:
            _err("proposer is not a registered agent")
        resp = _to_account_str(respondent)
        if not resp or normalize_address(resp) == "":
            _err("respondent address is invalid")
        if resp == sender:
            _err("a covenant needs two distinct parties")
        if self.agents.get(resp) is None:
            _err("respondent is not a registered agent")

        key = _guard(lambda: normalize_covenant_key(covenant_key))
        if self.covenant_keys.get(key):
            _err("a covenant with this key already exists")

        ttl = _guard(lambda: normalize_title(title))
        tms = _guard(lambda: normalize_terms(terms))
        clauses = _guard(lambda: normalize_clause_ids(clause_ids))
        pats = _guard(lambda: normalize_patterns(evidence_patterns))
        tele = _guard(lambda: normalize_optional_url(telemetry_url, pats))

        hours = int(duration_hours)
        if hours < MIN_DURATION_HOURS or hours > MAX_DURATION_HOURS:
            _err("duration out of range")

        if self._held_of(sender) - DEFAULT_BOND < REG_COLLATERAL:
            _err("insufficient balance to lock the bond and keep the collateral")

        now = self._now()
        expires_at = now + hours * 3600
        treasury_hex = self.treasury.as_hex.lower()
        chash = covenant_digest(
            key,
            sender,
            resp,
            ttl,
            tms,
            clauses,
            pats,
            tele,
            DEFAULT_BOND,
            expires_at,
            treasury_hex,
        )
        cid = self._fresh_covenant_id()

        # Reserve the proposer's bond. This is the only place value leaves `held`
        # for a covenant, so the escrow and the balance move together.
        self._add_held(sender, -DEFAULT_BOND)
        self._move_escrow(DEFAULT_BOND)

        covenant = {
            "covenant_id": cid,
            "covenant_key": key,
            "proposer": sender,
            "respondent": resp,
            "title": ttl,
            "terms": tms,
            "clause_ids": clauses,
            "evidence_patterns": pats,
            "telemetry_url": tele,
            "bond_amount": str(DEFAULT_BOND),
            "covenant_hash": chash,
            "status": ST_PROPOSED,
            "created_at": now,
            "expires_at": expires_at,
            "ratified_at": 0,
            "dispute_id": "",
            "verdict": "",
            "resolved_at": 0,
        }
        self._store_covenant(covenant)
        self.covenant_keys[key] = cid
        self._append_id(self.covenant_ids, cid)
        return cid

    @gl.public.write
    def ratify_covenant(self, covenant_id: str) -> str:
        """Ratify a proposed covenant and lock the respondent's matching bond."""
        covenant = self._load_covenant(covenant_id)
        if covenant is None:
            _err("covenant not found")
        if covenant["status"] != ST_PROPOSED:
            _err("covenant is not awaiting ratification")

        sender = self._sender()
        if sender != covenant["respondent"]:
            _err("only the named respondent may ratify")
        if self._held_of(sender) - DEFAULT_BOND < REG_COLLATERAL:
            _err("insufficient balance to lock the bond and keep the collateral")

        self._add_held(sender, -DEFAULT_BOND)
        self._move_escrow(DEFAULT_BOND)

        covenant["status"] = ST_ACTIVE
        covenant["ratified_at"] = self._now()
        self._store_covenant(covenant)
        return covenant_id

    @gl.public.write
    def expire_covenant(self, covenant_id: str) -> str:
        """Refund a covenant whose term has lapsed and that is not in dispute."""
        covenant = self._load_covenant(covenant_id)
        if covenant is None:
            _err("covenant not found")
        status = covenant["status"]
        if status == ST_DISPUTED:
            _err("covenant is under dispute")
        if status not in (ST_PROPOSED, ST_ACTIVE):
            _err("covenant is already closed")
        if self._now() <= int(covenant["expires_at"]):
            _err("covenant has not expired")

        bond = int(covenant["bond_amount"])
        if status == ST_PROPOSED:
            self._move_escrow(-bond)
            self._add_claimable(covenant["proposer"], bond)
        else:
            self._move_escrow(-2 * bond)
            self._add_claimable(covenant["proposer"], bond)
            self._add_claimable(covenant["respondent"], bond)

        covenant["status"] = ST_EXPIRED
        covenant["resolved_at"] = self._now()
        self._store_covenant(covenant)
        return ST_EXPIRED

    # ------------------------------------------------------------------
    # writes: disputes
    # ------------------------------------------------------------------

    @gl.public.write.payable
    def file_dispute(
        self,
        dispute_key: str,
        covenant_id: str,
        clause_id: str,
        claim: str,
        evidence_a: str,
        evidence_b: str,
    ) -> str:
        """File a dispute against an active covenant.

        The attached value must cover the dispute bond; anything above it is
        held as refundable balance, so no value is ever stranded by an
        overpayment. The two contested documents are frozen, and the covenant's
        telemetry URL is captured alongside them as a neutral third source.
        """
        covenant = self._load_covenant(covenant_id)
        if covenant is None:
            _err("covenant not found")
        if covenant["status"] != ST_ACTIVE:
            _err("covenant is not active")

        sender = self._sender()
        if sender not in (covenant["proposer"], covenant["respondent"]):
            _err("only a covenant party may file a dispute")

        key = _guard(lambda: normalize_covenant_key(dispute_key))
        clause = _guard(lambda: normalize_clause_id(clause_id))
        if clause not in covenant["clause_ids"]:
            _err("cited clause is not part of the covenant")
        stmt = _guard(lambda: normalize_claim(claim))
        urls = _guard(
            lambda: normalize_evidence_urls(
                [evidence_a, evidence_b], covenant["evidence_patterns"]
            )
        )
        # Two contested documents are the minimum a breach can rest on. The
        # validator de-duplicates, so two spellings of the same URL collapse to
        # one; reject that rather than index past the end of the list.
        if len(urls) < 2:
            _err("evidence urls must be two distinct documents")
        evidence_a, evidence_b = urls[0], urls[1]
        tele = covenant["telemetry_url"]

        value = int(gl.message.value)
        if value < DEFAULT_DISPUTE_BOND:
            _err("attached value is below the dispute bond")

        self.deposits_total = u256(int(self.deposits_total) + value)
        self._add_held(sender, value)
        self._add_held(sender, -DEFAULT_DISPUTE_BOND)
        self._move_escrow(DEFAULT_DISPUTE_BOND)

        commitment = dispute_commitment(
            key, covenant["covenant_hash"], clause, stmt, evidence_a, evidence_b, tele
        )
        did = self._fresh_dispute_id()
        dispute = {
            "dispute_id": did,
            "dispute_key": key,
            "covenant_id": covenant["covenant_id"],
            "covenant_hash": covenant["covenant_hash"],
            "claimant": sender,
            "accused": covenant["respondent"] if sender == covenant["proposer"]
            else covenant["proposer"],
            "clause_id": clause,
            "claim": stmt,
            "evidence_a": evidence_a,
            "evidence_b": evidence_b,
            "telemetry_url": tele,
            "commitment": commitment,
            "bond": str(DEFAULT_DISPUTE_BOND),
            "status": DS_OPEN,
            "verdict": "",
            "code": "",
            "supporting_sources": [],
            "clause_ids": [],
            "fingerprints": [],
            "findings_hash": "",
            "opened_at": self._now(),
            "resolved_at": 0,
        }
        self._store_dispute(dispute)

        covenant["status"] = ST_DISPUTED
        covenant["dispute_id"] = did
        self._store_covenant(covenant)
        self._append_board(did)
        return did

    @gl.public.write
    def adjudicate(self, dispute_id: str) -> str:
        """Run the breach judgment under consensus and settle the bonds.

        The claimant and the accused may adjudicate immediately; anyone else may
        once the assess delay has passed, so a dispute cannot be left to rot by
        a party that stops responding.
        """
        dispute = self._load_dispute(dispute_id)
        if dispute is None:
            _err("dispute not found")
        if dispute["status"] != DS_OPEN:
            _err("dispute is not open")

        covenant = self._load_covenant(dispute["covenant_id"])
        if covenant is None:
            _err("covenant not found")

        sender = self._sender()
        authorized = (
            sender in (dispute["claimant"], dispute["accused"])
            or self._now() >= int(dispute["opened_at"]) + ASSESS_DELAY_SECONDS
        )
        if not authorized:
            _err("not authorized to adjudicate yet")

        # The stored dispute must be the one that was filed. If the commitment
        # does not re-derive, the inputs were altered and no judgment runs.
        rederived = dispute_commitment(
            dispute["dispute_key"],
            dispute["covenant_hash"],
            dispute["clause_id"],
            dispute["claim"],
            dispute["evidence_a"],
            dispute["evidence_b"],
            dispute["telemetry_url"],
        )
        if rederived != dispute["commitment"]:
            _err("dispute commitment mismatch")

        urls = [dispute["evidence_a"], dispute["evidence_b"]]
        if dispute["telemetry_url"]:
            urls.append(dispute["telemetry_url"])

        result = self._judge(
            covenant["title"],
            covenant["terms"],
            dispute["clause_id"],
            dispute["claim"],
            urls,
            covenant["clause_ids"],
        )
        verdict = canon_verdict(result.get("verdict"))

        bond = int(covenant["bond_amount"])
        dispute_bond = int(dispute["bond"])
        claimant_role = "proposer" if dispute["claimant"] == covenant["proposer"] else "respondent"
        credits = settle(verdict, bond, dispute_bond, FEE_BPS, BPS_DENOM, claimant_role)
        if not conserved(credits, escrow_for(bond, dispute_bond)):
            _err("settlement did not conserve value")

        self._move_escrow(-escrow_for(bond, dispute_bond))
        self._add_claimable(covenant["proposer"], credits["proposer"])
        self._add_claimable(covenant["respondent"], credits["respondent"])
        self._add_claimable(self.treasury.as_hex, credits["treasury"])

        dispute["status"] = DS_RESOLVED
        dispute["verdict"] = verdict
        dispute["code"] = str(result.get("code", ""))
        dispute["supporting_sources"] = list(result.get("supporting_sources", []))
        dispute["clause_ids"] = list(result.get("clause_ids", []))
        dispute["fingerprints"] = list(result.get("fingerprints", []))
        dispute["findings_hash"] = str(result.get("findings_hash", ""))
        dispute["resolved_at"] = self._now()
        self._store_dispute(dispute)

        covenant["status"] = ST_SETTLED
        covenant["verdict"] = verdict
        covenant["resolved_at"] = self._now()
        self._store_covenant(covenant)
        return verdict

    @gl.public.write
    def cancel_stale(self, dispute_id: str) -> str:
        """Cancel a dispute nobody adjudicated after the stale timeout.

        The dispute bond is refunded to the filer and the covenant returns to
        active, so a stalled adjudication can never strand the bonds.
        """
        dispute = self._load_dispute(dispute_id)
        if dispute is None:
            _err("dispute not found")
        if dispute["status"] != DS_OPEN:
            _err("dispute is not open")
        if self._now() < int(dispute["opened_at"]) + STALE_TIMEOUT_SECONDS:
            _err("dispute is not stale yet")

        self._move_escrow(-int(dispute["bond"]))
        self._add_claimable(dispute["claimant"], int(dispute["bond"]))

        dispute["status"] = DS_CANCELLED
        dispute["resolved_at"] = self._now()
        self._store_dispute(dispute)

        covenant = self._load_covenant(dispute["covenant_id"])
        if covenant is not None and covenant["status"] == ST_DISPUTED:
            covenant["status"] = ST_ACTIVE
            covenant["dispute_id"] = ""
            self._store_covenant(covenant)
        return DS_CANCELLED

    # ------------------------------------------------------------------
    # writes: payouts
    # ------------------------------------------------------------------

    @gl.public.write
    def claim(self) -> str:
        """Withdraw everything owed to the sender.

        Pull-only, and zeroed before the transfer, so nothing is pushed to an
        address that cannot receive it and no balance is double-spent. This is
        the only function that moves value out.
        """
        key = self._sender()
        amount = int(self.claimable.get(key, 0))
        if amount <= 0:
            _err("nothing to claim")
        self.claimable[key] = u256(0)
        self.claimable_total = u256(int(self.claimable_total) - amount)
        self.withdrawn_total = u256(int(self.withdrawn_total) + amount)
        _Recipient(gl.message.sender_address).emit_transfer(value=u256(amount))
        return str(amount)

    # ------------------------------------------------------------------
    # the one non-deterministic path
    # ------------------------------------------------------------------

    def _judge(self, title, terms, clause_id, claim, urls, allowed_clauses) -> dict:
        """Run the breach judgment under validator consensus.

        One `strict_eq` block, and it is the only non-deterministic call an
        adjudication makes. Every validator runs `judge` itself, fetching the
        evidence independently, and each canonicalizes its result through the
        same pure function, so agreement is decided on the verdict class and the
        sorted source/clause sets — never on prose.
        """

        def judge() -> str:
            # Inlined rather than factored: genvm-lint only follows
            # gl.nondet.* calls made directly inside the function handed to the
            # equivalence principle, and rejects the contract when they sit one
            # closure hop away.
            evidence = []
            all_ok = True
            for u in urls:
                try:
                    resp = gl.nondet.web.render(u, mode="text")
                    ev = normalize_evidence(u, 200, resp)
                except Exception:
                    ev = normalize_evidence(u, 0, b"")
                if not ev["ok"]:
                    all_ok = False
                evidence.append(ev)

            # An unreadable or partially-read evidence set can only ever be
            # INCONCLUSIVE. The model is not consulted at all in that case, so a
            # fetch failure is structurally incapable of slashing a bond.
            if not all_ok:
                return comparable_json(
                    build_comparable({"verdict": INCONCLUSIVE}, evidence, allowed_clauses)
                )

            prompt = build_prompt(title, terms, clause_id, claim, evidence)
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            return comparable_json(build_comparable(_safe_json(raw), evidence, allowed_clauses))

        try:
            agreed = gl.eq_principle.strict_eq(judge)
            return _parse_agreed(agreed, _FAIL_CLOSED)
        except Exception:
            # No consensus, or the judgment could not run at all. A technical
            # failure, not a finding: fail closed and never slash a bond.
            return dict(_FAIL_CLOSED)

    # ------------------------------------------------------------------
    # views
    # ------------------------------------------------------------------

    @gl.public.view
    def get_config(self) -> str:
        return json.dumps(
            {
                "owner": self.owner.as_hex,
                "treasury": self.treasury.as_hex,
                "reg_collateral": str(REG_COLLATERAL),
                "default_bond": str(DEFAULT_BOND),
                "default_dispute_bond": str(DEFAULT_DISPUTE_BOND),
                "fee_bps": FEE_BPS,
                "bps_denom": BPS_DENOM,
                "assess_delay_seconds": ASSESS_DELAY_SECONDS,
                "stale_timeout_seconds": STALE_TIMEOUT_SECONDS,
                "min_duration_hours": MIN_DURATION_HOURS,
                "max_duration_hours": MAX_DURATION_HOURS,
                "max_evidence_urls": MAX_EVIDENCE_URLS,
                "next_covenant": int(self.next_covenant),
                "next_dispute": int(self.next_dispute),
            },
            sort_keys=True,
        )

    @gl.public.view
    def get_agent(self, addr: str) -> str:
        return self.agents.get(_to_account_str(addr), "")

    @gl.public.view
    def get_agent_ids(self) -> str:
        return self.agent_ids.get("all", "[]")

    @gl.public.view
    def get_covenant(self, covenant_id: str) -> str:
        return self.covenants.get(str(covenant_id).strip(), "")

    @gl.public.view
    def get_covenant_ids(self) -> str:
        return self.covenant_ids.get("all", "[]")

    @gl.public.view
    def get_dispute(self, dispute_id: str) -> str:
        return self.disputes.get(str(dispute_id).strip(), "")

    @gl.public.view
    def get_board(self, limit: int = 20) -> str:
        raw = self.board.get("all")
        items = json.loads(raw) if raw else []
        n = int(limit)
        if n < 0:
            n = 0
        if n > MAX_BOARD:
            n = MAX_BOARD
        items = items[-n:] if n else []
        out = []
        for did in reversed(items):
            blob = self.disputes.get(did)
            if blob is None:
                continue
            d = json.loads(blob)
            out.append(
                {
                    "dispute_id": d["dispute_id"],
                    "covenant_id": d["covenant_id"],
                    "clause_id": d["clause_id"],
                    "status": d["status"],
                    "verdict": d["verdict"],
                    "claimant": d["claimant"],
                    "accused": d["accused"],
                    "opened_at": d["opened_at"],
                }
            )
        return json.dumps(out, sort_keys=True)

    @gl.public.view
    def get_claimable(self, addr: str) -> str:
        return str(int(self.claimable.get(_to_account_str(addr), 0)))

    @gl.public.view
    def get_solvency(self) -> str:
        held_total = int(self.held_total)
        claimable_total = int(self.claimable_total)
        escrow = int(self.escrow)
        deposits = int(self.deposits_total)
        withdrawn = int(self.withdrawn_total)
        return json.dumps(
            {
                "held_total": str(held_total),
                "claimable_total": str(claimable_total),
                "escrow": str(escrow),
                "deposits_total": str(deposits),
                "withdrawn_total": str(withdrawn),
                "balanced": deposits - withdrawn
                == held_total + claimable_total + escrow,
            },
            sort_keys=True,
        )

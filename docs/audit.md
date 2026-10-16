# Audit

This is a safety argument, not a proof. Each invariant below names where it is
enforced and which test exercises it. Anything a reader can falsify against the
deployed source is a finding.

## Invariants

### 1. Exactly one non-deterministic call per adjudication

Enforced: `_judge` holds the single `gl.eq_principle.strict_eq(judge)`; the fetch
loop is inlined into `judge` so `genvm-lint` can see every `gl.nondet.*` call
reachable from the equivalence block. `genvm-lint check` passes.
Tests: `test_state_machine.py` (every adjudication path); the linter gate in CI.

### 2. Fail closed

Enforced: any exception, no-consensus result, or unparseable agreement returns
`_FAIL_CLOSED` (`INCONCLUSIVE`). If any evidence URL fails to fetch or parse the
verdict short-circuits to `INCONCLUSIVE` and the model is never consulted.
Tests: `test_fetch_failure_is_inconclusive_and_never_consults_the_model` (also
asserts `nondet.prompts == []`), `test_consensus_exception_fails_closed`,
`test_divergent_evidence_fails_closed`.

### 3. A closed decision taxonomy

Enforced: `canon_verdict` strips non-letters and maps to one of four verdicts;
anything unrecognized becomes `INCONCLUSIVE`. A `BREACH` with no cited source, or
none citing a covenant clause, is voided to `INCONCLUSIVE`.
Tests: `test_judgment_pure.py`, `test_breach_without_sources_is_downgraded`.

### 4. Disputes are commitment-bound

Enforced: `file_dispute` computes and stores a `dispute_commitment`; `adjudicate`
re-derives it from the stored fields and rejects on mismatch before any judgment
runs.
Tests: `test_file_dispute_freezes_the_commitment`; the guard is exercised by
every adjudication path.

### 5. Escrow is conserved

Enforced: `settle` returns a credit for every owed role and the contract asserts
`conserved(credits, escrow_for(bond, dispute_bond))` before moving value; the
credit sums exactly to the escrowed bonds.
Tests: `test_accounting.py` (all verdicts and both claimant roles),
`test_breach_slashes_the_accused_and_pays_the_claimant`,
`test_non_breach_refunds_both_bonds`.

### 6. The whole value system balances

Enforced: every value transition goes through `_add_held`, `_add_claimable`,
`_move_escrow`, or the `deposits_total`/`withdrawn_total` counters, and
`get_solvency` recomputes
`deposits_total - withdrawn_total == held_total + claimable_total + escrow`.
Tests: `solvency(app)["balanced"]` is asserted after registration, bond locking,
filing, settlement, cancellation, and expiry.

### 7. The collateral floor holds

Enforced: `propose_covenant` and `ratify_covenant` require the sender's held
balance to stay at or above `REG_COLLATERAL` after locking the bond, and
`withdraw_excess` can only move value above `REG_COLLATERAL`.
Tests: `test_withdraw_excess_respects_the_collateral_floor`.

### 8. Payouts are pull-only

Enforced: `claim()` zeroes the balance before transferring and is the only
function that moves value out.
Tests: `test_claim_is_pull_only_and_once`.

### 9. Every escrowed status has an escape hatch

Enforced: `cancel_stale` refunds an open dispute after the stale timeout and
reactivates the covenant; `expire_covenant` refunds a lapsed covenant's bonds;
a non-`BREACH` verdict refunds in full at adjudication.
Tests: `test_cancel_stale_refunds_and_reactivates`,
`test_expire_covenant_returns_both_bonds`,
`test_expire_proposed_covenant_refunds_the_proposer`,
`test_expire_covenant_is_blocked_while_disputed`.

### 10. Evidence is confined

Enforced: `normalize_evidence_urls` requires https, a default port, a public
domain, no credentials, and a match against a host pattern frozen in the
covenant. The pattern check is applied at filing time and the URL is re-checked
at fetch time.
Tests: `test_ssrf.py`, `test_file_dispute_rejects_a_disallowed_host`.

### 11. Inputs are bounded

Enforced: length caps in `canonicalize.py` (title ≤ 200, terms ≤ 4000, claim ≤
2000; covenant-key and clause-id patterns), a maximum of five evidence URLs, at
most 32 patterns, and at most 16 clause ids.
Tests: `test_canonicalize.py`, `test_ssrf.py`.

### 12. Prompt injection is blunted

Enforced: `strip_html` removes script/style and other non-content tags;
fence-like runs of `=` are collapsed so quoted text cannot forge a fence;
backticks and control characters are stripped; the hostile-data note is stated
after the evidence.
Tests: `test_judgment_pure.py`.

### 13. Adjudication authorization

Enforced: `adjudicate` allows the claimant and the accused immediately, and
anyone else only after the assess delay.
Tests: `test_stranger_cannot_adjudicate_before_the_delay`,
`test_stranger_can_adjudicate_after_the_delay`.

### 14. Money is exact

Enforced: bond and balance values are serialized into record JSON as decimal
strings, so a JS client never round-trips a value above `2**53` through a float.
Tests: contract tests carry exact integers; the frontend parses with `BigInt`.

### 15. The deployable matches the source

Enforced: `build_bundle.py` regenerates deterministically and CI diffs the
result.
Tests: `test_bundle.py`.

## Known limits

- The verdict is only as good as the evidence hosts a covenant allows. A covenant
  authored to trust a compromised host can be fooled; the protocol bounds this to
  hosts named in advance, not to truth.
- The accused's evidence is located through the two contested documents the
  claimant freezes and the covenant's neutral telemetry URL, not submitted live
  by the accused after the fact. A design that let both parties file evidence
  would need its own anti-spam and liveness argument.
- `CONFLICTING` is a model judgment over the fetched text; it is corroborated by
  validators re-fetching, but it is not a cryptographic proof of provenance.
- Studio Dev state can be reset. The interface treats an unconfirmed deployment
  as "not live" rather than assuming persistence.

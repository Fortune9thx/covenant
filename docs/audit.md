# Audit

This is a safety argument, not a proof. Each invariant below names where it is
enforced and which test exercises it. Anything a reader can falsify against the
deployed source is a finding.

## Invariants

### 1. Exactly one non-deterministic call per adjudication

Enforced: `_judge` holds the single `gl.eq_principle.strict_eq(judge)`; the fetch
loop is inlined into `judge` so `genvm-lint` can see every `gl.nondet.*` call
reachable from the equivalence block. `genvm-lint lint` passes.
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

Enforced: `settle` returns `(credits, consumed)`; the contract asserts
`conserved(credits, consumed)` before moving value. Only `BREACH` consumes
`2 * bond + dispute_bond`; every other verdict consumes only `dispute_bond`, so
no non-breach outcome can move either covenant bond or close the covenant.
Tests: `test_accounting.py` (all verdicts and both claimant roles),
`test_breach_slashes_the_accused_and_pays_the_claimant`,
`test_non_breach_returns_only_the_dispute_bond_and_keeps_the_covenant`.

### 6. The whole value system balances

Enforced: every value transition goes through `_add_held`, `_add_claimable`,
`_move_escrow`, or the `deposits_total`/`withdrawn_total` counters, and
`get_solvency` recomputes
`deposits_total - withdrawn_total == held_total + claimable_total + escrow`.
Tests: `solvency(app)["balanced"]` is asserted after registration, bond locking,
filing, settlement, cancellation, and expiry.

### 7. The collateral floor holds

Enforced: `propose_covenant` and `ratify_covenant` require the sender's held
balance to stay at or above `REG_COLLATERAL` after locking the bond;
`withdraw_excess` can only move value above `REG_COLLATERAL`;
`withdraw_collateral` closes the agent and returns units only when no covenant
still names the agent, so registration collateral is not a one-way deposit.
Tests: `test_withdraw_excess_respects_the_collateral_floor`,
`test_withdraw_collateral_closes_and_refunds`, and the live withdrawal recorded
in `STATUS.md`.

### 8. Payouts are pull-only

Enforced: `claim()` zeroes the balance before transferring and is the only
function that moves value out.
Tests: `test_claim_is_pull_only_and_once`.

### 9. Every escrowed status has an escape hatch

Enforced: `cancel_stale` refunds an open dispute after the stale timeout and
reactivates the covenant; `expire_covenant` refunds a lapsed covenant's bonds
and is blocked while a dispute is open; a non-`BREACH` verdict returns the
dispute bond at adjudication and leaves both covenant bonds escrowed.
`withdraw_collateral` is the registration-collateral escape hatch.
Tests: `test_cancel_stale_refunds_and_reactivates`,
`test_expire_covenant_returns_both_bonds`,
`test_expire_proposed_covenant_refunds_the_proposer`,
`test_expire_covenant_is_blocked_while_disputed`,
`test_non_breach_returns_only_the_dispute_bond_and_keeps_the_covenant`,
`test_withdraw_collateral_closes_and_refunds`.

### 10. Evidence is confined

Enforced: `normalize_evidence_urls` requires https, a default port, a public
domain, no credentials, and a match against a host pattern frozen in the
covenant. The check runs once, when the URL is filed; the validated string is
stored and that stored value is what validators fetch, so no later caller can
substitute a URL. The check covers the URL string, not where a redirect leads.
Tests: `test_ssrf.py`, `test_file_dispute_rejects_a_disallowed_host`.

### 10a. Evidence sources are independent

Enforced: `propose_covenant` requires a telemetry URL; `ratify_covenant`
freezes it. `file_dispute` rejects a claimant document that resolves to the same
host as the telemetry, or whose path matches the telemetry's path, so the
claimant cannot cite the same document twice. The judge always reads the
claimant document and the neutral telemetry; on `BREACH` it also requires the
verdict to cite at least one source and at least one covenant clause, otherwise
the result is downgraded to `INCONCLUSIVE`. The accused's contradictory reading
is the telemetry, not a document the claimant controls.
Tests: `test_file_dispute_rejects_same_host_evidence`,
`test_file_dispute_rejects_same_path_evidence`,
`test_breach_without_sources_is_downgraded`,
`test_adjudicate_requires_telemetry`. The live run used a public gist and a
different host, recorded in `STATUS.md`.

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

### 16. Expiry and adjudication windows are bounded on both sides

Enforced: `expire_covenant` requires `now >= expires_at`; `file_dispute` and
`adjudicate` require the covenant to be active and not past expiry.
`adjudicate` rejects a stranger before `opened_at + assess_delay` and any
caller after the covenant expires or the stale timeout, so neither party can
sit on a dispute indefinitely. It also rejects an already resolved dispute and
a covenant that another dispute already settled.
Tests: `test_adjudicate_rejects_after_expiry`,
`test_adjudicate_is_bounded_by_the_upper_window`,
`test_expire_covenant_is_blocked_while_disputed`,
`test_stranger_cannot_adjudicate_before_the_delay`.

## Known limits

- The verdict is only as good as the evidence hosts a covenant allows. A covenant
  authored to trust a compromised host can be fooled; the protocol bounds this to
  hosts named in advance, not to truth.
- The claimant files one document and the covenant freezes one neutral telemetry
  URL. The contract enforces that those are different hosts, but not that either
  is honest. The proposer chooses the telemetry host and the respondent accepts
  it by ratifying; a respondent that ratifies a host it does not trust has
  consented to that source. A design that let both parties file evidence would
  need its own anti-spam and liveness argument.
- `CONFLICTING` is a model judgment over the fetched text; it is corroborated by
  validators re-fetching, but it is not a cryptographic proof of provenance.
- The URL check does not inspect redirects. An allow-listed host that redirects
  to an internal address would still be fetched, which is why the allow-list
  should name hosts that serve evidence directly rather than link shorteners or
  open redirectors.
- A dispute must be filed while the covenant is active. Once the term lapses,
  `expire_covenant` is permissionless and refunds both bonds, so a breach that no
  one filed before expiry cannot be adjudicated afterwards.
- Studio Dev state can be reset. The interface treats an unconfirmed deployment
  as "not live" rather than assuming persistence.

# Steward notes

What to check to trust this deployment without taking the README's word for it.
Each item is falsifiable from the repository and the chain.

## 1. The source is the deployed source

```sh
python contracts/build_bundle.py
git diff --exit-code -- contracts/build/Covenant.bundled.py
```

No diff means the committed bundle is exactly what the bundler emits from
`Covenant.py` and `covenantlib/`.

```sh
genlayer.cmd code 0x<address> | diff - contracts/build/Covenant.bundled.py
```

The chain's source should match the bundle.

## 2. One nondeterministic path

```sh
genvm-lint lint contracts/build/Covenant.bundled.py
```

Read `_judge` in the bundle: it should contain the only `gl.eq_principle` call,
and every `gl.nondet.*` call should be directly inside the `judge` closure.

## 3. Fail-closed is real

```sh
python -m pytest -p no:gltest
```

Then read `test_fetch_failure_is_inconclusive_and_never_consults_the_model` — it
asserts the model is never consulted when evidence does not read cleanly.

## 4. The value system balances

Read `get_solvency` in the contract and `covenantlib/accounting.py`, then run
`test_accounting.py` and the state-machine tests. `settle` returns
`(credits, consumed)` and the contract asserts `conserved(credits, consumed)`
before moving value. Only `BREACH` consumes `2 * bond + dispute_bond`; every
other verdict consumes only `dispute_bond` and leaves the covenant active with
both covenant bonds in escrow. `get_solvency` recomputes

```
deposits_total - withdrawn_total == held_total + claimable_total + escrow
```

on chain; it should read `balanced: true`. `claim()` should zero the balance
before transferring, and be the only transfer.

## 5. Evidence is confined

Read `covenantlib/ssrf.py`. Confirm https-only, default-port-only, no IP
literals, no credentials, public domains only, and that a URL must match a host
pattern frozen in the covenant. Confirm the check runs when the URL is filed and
that `_judge` fetches only the stored string. Redirect targets are not checked;
see Known limits in `docs/audit.md`.

Confirm `propose_covenant` requires a telemetry URL and `ratify_covenant` freezes
it, and that `file_dispute` rejects a claimant document on the telemetry's host
or path. The judge must read the claimant document and the telemetry; a `BREACH`
must cite a source and a clause, or it is downgraded.

## 6. The interface fails closed

Read `frontend/src/lib/tx.ts`. Success is an allow-list; a missing or
unrecognized field is failure. A write that executed but reached no consensus
must not read as success. Read `frontend/src/lib/chain.ts` to confirm liveness
uses `gen_getContractSchema`, not `eth_getCode`.

## 7. Live schema

```sh
genlayer.cmd schema 0x<address>
```

Expect 19 methods: 9 views and 10 writes, one constructor parameter, and exactly
two payable methods (`register_agent`, `file_dispute`).

## 8. Try to make it slash a bond it should not

- Register two agents, form a covenant, and file a dispute against a healthy
  status page. It must not settle `BREACH`: it returns the dispute bond, keeps
  the covenant active, and leaves both covenant bonds escrowed. The live run's
  d1 (`INCONCLUSIVE`) is this path.
- File a dispute whose document is on the telemetry's host or path. It must be
  rejected before any validator sees it.
- Point an evidence URL outside the covenant's allow-list. It must be rejected.
- File a dispute citing a clause that is not in the covenant. It must be
  rejected.
- Adjudicate the same dispute twice. The second call must be rejected.
- Register a fresh agent with no covenants, call `withdraw_collateral`, then
  `claim`. The agent record must disappear and the full collateral must be paid
  back. The live run's agent C did this.

## 9. Agreement is on content, not just verdicts

Read `normalize_evidence` in `covenantlib/judgment.py`. The `digest` it returns
is taken over the **whole** stripped document, not the `MAX_FETCH_CHARS` excerpt
the model is shown, and `build_comparable` echoes those fingerprints into
`findings_hash`. So two validators agree only if they fetched the same bytes —
and if they had agreed on the bounded excerpt alone, a divergence past the cutoff
would have been invisible to consensus. `test_digest_covers_content_past_the_excerpt_cap`
pins this: two documents that differ only after the cutoff keep an identical
prompt excerpt but must have different digests.

## 10. Consensus is exercised under a fake runtime

`strict_eq` and the one-nondet-path rule are checked structurally by
`genvm-lint`, and the judgment pipeline is driven end to end in `pytest` through
`tests/fake_genlayer.py`, which models the leader/validator split. There is no
`gltest` fixture in this repository, so the suite does not exercise the real
runner; `genvm-lint lint` and the live deploy recorded in `STATUS.md` stand in for
that.

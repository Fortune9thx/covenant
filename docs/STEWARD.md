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

## 7a. Live evidence (Studio Dev, 2026-10-21)

Contract `0x50172760E21bD2dCebD23FBfcF6e0dab7773ebD8`, deploy tx
`0x3e44e5e8e0bb85e8353d712dfbb767c2755c9a1fdf91e069c898826a6ece90de`
(`Finalized · Accepted`). Source read back with `genlayer code` matches the
committed bundle exactly. Interface: `https://covenant-seven-xi.vercel.app`.

| Path | Tx | Result |
|---|---|---|
| Successful claim | d2 file `0x61df647e0d244a1d445bee47c11689e9cc5c3f484ce04a30f93a2cd68ab6ed32`, adjudicate `0xd1d0dbaf6899e97ad868b688f62c03d28756092f630c8174929794dd464ece31`, claim `0x2312cde8727308161137ffef89bd0eb54f301f24809efcb280a2d44322b62fe8` | `BREACH`, v2 `SETTLED`, 0.06 GEN external transfer finalized |
| Adverse claim | d1 file `0xe56fadec42424d81abe9ee04de3c4717e7e406a7e77f37ec06f2e43468d23caf`, adjudicate `0x364d4c39d2ca5248d33a41e5aed6f1f725345094da40fcf2620077acab8460f6` | `INCONCLUSIVE`, v1 remains `ACTIVE`, both covenant bonds still escrowed |
| Collateral withdrawal | register C `0xfbb8f5a06097638dbfe511517f47d4d20348c9620fbb866e2e900038cf1ea0c2`, withdraw `0x316cd2fe9552b3e58ee92708724d45e9d65b74351271eefeb73862087752d612`, claim `0xb9010f79ebfe0de574f7abf320503ffa4089a2dab16f3ead4cde05c012651b60` | agent record removed, 0.011 GEN external transfer finalized |
| Independent evidence | d1 `0xe56fadec42424d81abe9ee04de3c4717e7e406a7e77f37ec06f2e43468d23caf`, d2 `0x61df647e0d244a1d445bee47c11689e9cc5c3f484ce04a30f93a2cd68ab6ed32` | gist document + different telemetry host; distinct on-chain fingerprints |

Source fingerprints (read back from `get_dispute`):

| Dispute | Commitment | `findings_hash` | Fingerprints |
|---|---|---|---|
| d1 | `1ce42a5ce8aad2859bc032334f5e253b840ea468be71aab2583c27b7d7257d55` | `e117d0e0c550cb4acc56a11531e432c8428185d57c1fd59fe147b780252fe6eb` | `0:60b857cd5bc78dcd9eb862fa6e35333176d14ce8c85aa3abf2f7a56e3eb2239c`, `1:43338e32beb5871d10be1ac1816172af356bb5a731591005220a4bd4043c5ca4` |
| d2 | `67ee049e17f669c2aa710d12c89a43d193de37faf6a3304087d9fdfeec123351` | `e937cedb7caf0f6e82b5c7e7329628e4122552841eb0e96bf3b5b51a81beb50b` | `0:b8d7655f136bfb7b86bd22e2c08e9b36a4a91becae55e4525af9b1d1ace3c402`, `1:5bd1f07389c5271f7074c51f6bd2745bd83b9113a14818e68d9e88ba0955b4d4` |

Payout proof is in the receipts, not only the ledger: claim A has
`message_phase_emitted: {accepted: true, finalized: true}` and
`message_value_effects[0x475b49242d5021199ebfb0a1950c54d0040ade6fa300b43999a3379f48c365b6]
= {phase: "finalized", value: "60000000000000000", include: true}`; claim C has
the same accepted/finalized phase with 0.011 GEN
(`0x896d13c3a8221b41b9230b81523e950d9701b81421b21804e634dca49ac60640`).

Final on-chain balances: `deposits_total 0.113`, `withdrawn_total 0.071`,
`held_total 0.022`, `escrow 0.02`, `claimable_total 0`, `balanced true`.

Adverse is a real outcome: d1's first attempt was `UNDETERMINED` /
`MAJORITY_DISAGREE` and wrote nothing (`0x203f851b…bf2e8`); the retry above is
the accepted `INCONCLUSIVE`.

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

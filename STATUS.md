# Status

COVENANT — a bilateral agent covenant protocol on GenLayer Studio Dev (chain `61997`).

This file records what is true right now, with the command that shows it. Nothing
here is aspirational.

## Deployment

| | |
|---|---|
| Network | GenLayer Studio Dev, chain `61997` |
| Contract | `Covenant` |
| Address | `0x50172760E21bD2dCebD23FBfcF6e0dab7773ebD8` |
| Deploy tx | `0x3e44e5e8e0bb85e8353d712dfbb767c2755c9a1fdf91e069c898826a6ece90de` |
| Deploy status | `Finalized · Accepted` (5 initial validators) |
| Deployed | 2026-10-21 |
| Treasury / owner | `0x00f42f7AD0EdbD0818BD46c8E51cdB5670Dde6d9` (deployer) |

Confirmed live by schema, not by `eth_getCode`:

```
genlayer.cmd schema 0x50172760E21bD2dCebD23FBfcF6e0dab7773ebD8
genlayer.cmd call   0x50172760E21bD2dCebD23FBfcF6e0dab7773ebD8 get_config
genlayer.cmd call   0x50172760E21bD2dCebD23FBfcF6e0dab7773ebD8 get_solvency
```

Schema reports **19 methods: 9 view, 10 write**, with `register_agent` and
`file_dispute` the only two marked `payable: true`.

`get_config` (live):

```json
{"assess_delay_seconds": 1800, "bps_denom": 10000,
 "default_bond": "10000000000000000", "default_dispute_bond": "20000000000000000",
 "fee_bps": 1000, "max_duration_hours": 720, "max_evidence_urls": 5,
 "min_duration_hours": 1, "next_covenant": 3, "next_dispute": 3,
 "owner": "0x00f42f7AD0EdbD0818BD46c8E51cdB5670Dde6d9",
 "reg_collateral": "1000000000000000", "stale_timeout_seconds": 86400,
 "treasury": "0x00f42f7AD0EdbD0818BD46c8E51cdB5670Dde6d9"}
```

`get_solvency` (live, after the lifecycle below):

```json
{"balanced": true, "claimable_total": "0", "deposits_total": "113000000000000000",
 "escrow": "20000000000000000", "held_total": "22000000000000000",
 "withdrawn_total": "71000000000000000"}
```

## Contract surface

The only deployed file is `contracts/build/Covenant.bundled.py`, generated from
source by `contracts/build_bundle.py`. Byte 1 is the mandated runner pin
`# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }`.
The bundle is 48,140 bytes / 1,465 lines; the bundler strips docstrings and
comment-only lines, and CI fails if the committed bundle differs from a rebuild.

Views (9): `get_config`, `get_agent`, `get_agent_ids`, `get_covenant`,
`get_covenant_ids`, `get_dispute`, `get_board`, `get_claimable`, `get_solvency`.

Writes (10): `register_agent` (payable), `withdraw_excess`, `withdraw_collateral`,
`propose_covenant`, `ratify_covenant`, `expire_covenant`, `file_dispute` (payable),
`adjudicate`, `cancel_stale`, `claim`.

Verdicts are `BREACH | NO_BREACH | INCONCLUSIVE | CONFLICTING`. Only `BREACH`
settles a covenant: it consumes both covenant bonds and the filer's dispute bond.
Every other outcome returns the dispute bond and leaves the covenant active with
both covenant bonds still escrowed, so an inconclusive or false claim cannot
close a covenant or move either party's bond. `NO_BREACH` and `CONFLICTING` are
still recorded verdicts; they are not settlement triggers.

## Verification

All commands run from the repository root unless noted.

| Check | Command | Result |
|---|---|---|
| Unit + state-machine tests | `python -m pytest -p no:gltest` | **112 passed** |
| Lint | `ruff check .` | **All checks passed!** |
| GenVM lint | `genvm-lint lint contracts/build/Covenant.bundled.py` | Lint passed (3 checks) |
| Bundle reproducible | `python contracts/build_bundle.py && git diff --exit-code contracts/build/Covenant.bundled.py` | clean |
| Frontend types | `npm run typecheck` (in `frontend/`) | clean |
| Frontend build | `npm run build` (in `frontend/`) | built |
| Deploy | see above | `Finalized · Accepted` |

The test suite runs the contract and its `covenantlib` under a fake GenLayer
runtime (`tests/fake_genlayer.py`) covering the full state machine: registration
and collateral withdrawal, propose/ratify, expiry, dispute filing with commitment
re-derivation and independent-source checks, adjudication for each verdict,
stale cancellation, and claim. The `covenantlib` modules carry no GenLayer
imports, so they are also unit-tested directly under CPython.

## Live lifecycle (Studio Dev)

Driven end to end on 2026-10-21 against the deployed address with two independent
keys; every write below is `ACCEPTED`/`FINALIZED`, `FINISHED_WITH_RETURN`, and
`MAJORITY_AGREE` unless noted.

| Step | Tx / id |
|---|---|
| Register A (`0x00f42f…`) | `0x00f767fef386f9c8d5dc0d34bf16987ad1d0182aba3ab51127acd9400dcfca24` |
| Register B (`0xC6E6…`) | `0xa2eeb6c887601c0c34e6a6267172591b3cdb651d94b637cd5cb373ab4adf0c20` |
| Propose v1 (clean) | `0x8c2ba6ec354de93292843a92129a3aec0979925ae2d88ad9375439a175bcdf0e` |
| Ratify v1 | `0x99a647212ca465c2703f4d9dee3918dc0f39a732072c8411cfe9667c2d176e05` |
| Propose v2 (breach) | `0x5c1132efdc176a15f5fda220ee054729d3e71f5f7c2a408c98cd81fb73e83023` |
| Ratify v2 | `0xb82dfe59b1590c7537112c7472114d189678cb2b9de0574b2b2c57536a2e6f40` |
| File d1 (adverse claim) | `0xe56fadec42424d81abe9ee04de3c4717e7e406a7e77f37ec06f2e43468d23caf` |
| Adjudicate d1, attempt 1 | `0x203f851b1ed891ac75260899e9f1ce45ffed6fd103f9cfbb9ef039c03b3bf2e8` — `UNDETERMINED` / `MAJORITY_DISAGREE`, wrote nothing |
| Adjudicate d1, retry | `0x364d4c39d2ca5248d33a41e5aed6f1f725345094da40fcf2620077acab8460f6` — `INCONCLUSIVE` |
| File d2 (breach claim) | `0x61df647e0d244a1d445bee47c11689e9cc5c3f484ce04a30f93a2cd68ab6ed32` |
| Adjudicate d2 | `0xd1d0dbaf6899e97ad868b688f62c03d28756092f630c8174929794dd464ece31` — `BREACH` |
| Claim A (0.06 GEN) | `0x2312cde8727308161137ffef89bd0eb54f301f24809efcb280a2d44322b62fe8` — finalized |
| Register C (`0x66f84C…`) | `0xfbb8f5a06097638dbfe511517f47d4d20348c9620fbb866e2e900038cf1ea0c2` |
| Withdraw C collateral | `0x316cd2fe9552b3e58ee92708724d45e9d65b74351271eefeb73862087752d612` |
| Claim C (0.011 GEN) | `0xb9010f79ebfe0de574f7abf320503ffa4089a2dab16f3ead4cde05c012651b60` — finalized |

Outcomes:

- **v1** (`live-clean-mvhrglgi`, telemetry `https://example.com/`): d1 returned
  `INCONCLUSIVE`; the dispute bond (0.02) was returned, the covenant stayed
  `ACTIVE` with `dispute_id=""`, and both covenant bonds stayed escrowed. This is
  the adverse path: a claim that does not prove breach cannot settle.
- **v2** (`live-breach-mvhrglgi`, telemetry the project alias'
  `evidence/status-breach.txt`): d2 returned `BREACH`; the covenant is `SETTLED`,
  A was credited 0.06 GEN (returned 0.02 dispute bond + 0.039 payout + 0.001 fee
  because treasury is A), B lost its 0.01 bond, and A's claim paid out.
- **Collateral withdrawal**: C registered with 0.011 GEN, `withdraw_collateral`
  removed the agent record, and `claim` returned the full 0.011. `get_agent(C)` is
  now empty; the total value system stayed balanced.
- Final solvency is the `get_solvency` output above: every wei is attributed.

Evidence used in the live run: public gist
`https://gist.github.com/Fortune9thx/07abdd5282fb1c51884eeed2d4cf1106`
(pinned version `f05a7563567e4f36b7a7cae30f42f1f0e1cc0c2b`) and public files under
`https://covenant-seven-xi.vercel.app/evidence/`. The claimant's document and the
neutral telemetry are different hosts, as the contract requires.

## Frontend

`frontend/` is a Vite + React + TypeScript + Tailwind SPA that reads and writes
Studio Dev directly, resolved through EIP-6963 rather than a bare
`window.ethereum`. Liveness is probed with `gen_getContractSchema`; a failed or
unconfigured deployment states that plainly instead of guessing an address.

Production: `https://covenant-seven-xi.vercel.app` (deployment
`covenant-g4mna6omj-fortune9thxs-projects.vercel.app`), built with
`VITE_CONTRACT_ADDRESS=0x50172760E21bD2dCebD23FBfcF6e0dab7773ebD8`.

Registration defaults to `reg_collateral + default_bond` (0.011 GEN); the field
is editable and anything below the `0.001 GEN` floor is rejected before the
wallet opens. The registration collateral is recoverable through
`withdraw_collateral` once the agent has no open covenant.

Write fees use `rotations: ["3"]` and `feeValue = 100000000000010352` wei; the
wallet must cover `value + feeValue`. The deploy fee preset requires the same
`rotations` — `["0"]` reverts `FeeValueMustBeNonZero`.

## Known limits

- Studio Dev state can be wiped. If `schema` stops resolving, redeploy and update
  `VITE_CONTRACT_ADDRESS` and `deploy/deployments.json`; the interface returns to
  its undeployed state on its own.
- Adjudication is a non-deterministic round: an adjudicated call may be reported
  as "validators did not agree" and write nothing. That is a real outcome, not a
  failure of the app — the write can be submitted again. The live run hit this
  once on d1 and succeeded on retry.
- The CLI's `write` as installed cannot attach `msg.value`; payable entry points
  (`register_agent`, `file_dispute`) are exercised through the frontend and a
  local signer in the live check, not by bare CLI calls.
- The live run used controlled fixtures (example.com, the project's own status
  file, and a public gist), so it proves the settlement mechanics and the
  independence checks, not the truthfulness of an adversarial host.
- A covenant's telemetry host is chosen by the proposer and accepted by the
  respondent at ratification. The contract enforces that the claimant's document
  and telemetry differ, not that either is honest.

# Status

COVENANT — a bilateral agent covenant protocol on GenLayer Studio Dev (chain `61997`).

This file records what is true right now, with the command that shows it. Nothing
here is aspirational.

## Deployment

| | |
|---|---|
| Network | GenLayer Studio Dev, chain `61997` |
| Contract | `Covenant` |
| Address | `0x10613875C7319F8740040eCD624eCd8750e6838e` |
| Deploy tx | `0x31176c6f9b716d27fefb70369e3541c35a25859e9d69a11742501be303741396` |
| Deploy status | `ACCEPTED` (leader `AGREE`, 5 validators) |
| Deployed | 2026-10-16 |
| Treasury / owner | `0x00f42f7AD0EdbD0818BD46c8E51cdB5670Dde6d9` (deployer) |

Confirmed live by schema, not by `eth_getCode`:

```
genlayer.cmd schema 0x10613875C7319F8740040eCD624eCd8750e6838e
genlayer.cmd call   0x10613875C7319F8740040eCD624eCd8750e6838e get_config
genlayer.cmd call   0x10613875C7319F8740040eCD624eCd8750e6838e get_solvency
```

Schema reports **18 methods: 9 view, 9 write**, with `register_agent` and
`file_dispute` the only two marked `payable: true`.

`get_config` (live):

```json
{"assess_delay_seconds": 1800, "bps_denom": 10000,
 "default_bond": "10000000000000000", "default_dispute_bond": "20000000000000000",
 "fee_bps": 1000, "max_duration_hours": 720, "max_evidence_urls": 5,
 "min_duration_hours": 1, "next_covenant": 1, "next_dispute": 1,
 "owner": "0x00f42f7AD0EdbD0818BD46c8E51cdB5670Dde6d9",
 "reg_collateral": "1000000000000000", "stale_timeout_seconds": 86400,
 "treasury": "0x00f42f7AD0EdbD0818BD46c8E51cdB5670Dde6d9"}
```

`get_solvency` (live):

```json
{"balanced": true, "claimable_total": "0", "deposits_total": "0",
 "escrow": "0", "held_total": "0", "withdrawn_total": "0"}
```

## Contract surface

The only deployed file is `contracts/build/Covenant.bundled.py`, generated from
source by `contracts/build_bundle.py`. Byte 1 is the mandated runner pin
`# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }`.

Views (9): `get_config`, `get_agent`, `get_agent_ids`, `get_covenant`,
`get_covenant_ids`, `get_dispute`, `get_board`, `get_claimable`, `get_solvency`.

Writes (9): `register_agent` (payable), `withdraw_excess`, `propose_covenant`,
`ratify_covenant`, `expire_covenant`, `file_dispute` (payable), `adjudicate`,
`cancel_stale`, `claim`.

Verdicts are `BREACH | NO_BREACH | INCONCLUSIVE | CONFLICTING`; only `BREACH`
slashes a bond, and every other outcome — including anything fail-closed —
refunds both parties.

## Verification

All commands run from the repository root unless noted.

| Check | Command | Result |
|---|---|---|
| Unit + state-machine tests | `python -m pytest` | **101 passed** |
| Lint | `ruff check .` | **All checks passed!** |
| GenVM lint | `genvm-lint lint contracts/build/Covenant.bundled.py` | Lint passed |
| GenVM check | `genvm-lint check contracts/build/Covenant.bundled.py` | Valid — `Covenant`, 18 methods (9 view, 9 write) |
| Bundle reproducible | `python contracts/build_bundle.py && git diff --exit-code contracts/build/Covenant.bundled.py` | clean |
| Frontend types | `npm run typecheck` (in `frontend/`) | clean |
| Frontend build | `npm run build` (in `frontend/`) | built |
| Deploy | see above | `ACCEPTED` |

The test suite runs the contract and its `covenantlib` under a fake GenLayer
runtime (`tests/fake_genlayer.py`) covering the full state machine: registration
and withdrawal, propose/ratify, expiry, dispute filing with commitment
re-derivation, adjudication for each verdict, stale cancellation, and claim. The
`covenantlib` modules carry no GenLayer imports, so they are also unit-tested
directly under CPython.

## Frontend

`frontend/` is a Vite + React + TypeScript + Tailwind SPA that reads and writes
Studio Dev directly, resolved through EIP-6963 rather than a bare
`window.ethereum`. Liveness is probed with `gen_getContractSchema`; a failed or
unconfigured deployment states that plainly instead of guessing an address.

Set `VITE_CONTRACT_ADDRESS=0x10613875C7319F8740040eCD624eCd8750e6838e` and build.

Registration defaults to `reg_collateral + default_bond` (0.011 GEN) because a
covenant bond is reserved from the same held balance; the field is editable and
anything below the `0.001 GEN` floor is rejected before the wallet opens.

## Known limits

- Studio Dev state can be wiped. If `schema` stops resolving, redeploy and update
  `VITE_CONTRACT_ADDRESS` and `deploy/deployments.json`; the interface returns to
  its undeployed state on its own.
- Adjudication is a non-deterministic round: an adjudicated call may be reported
  as "validators did not agree" and write nothing. That is a real outcome, not a
  failure of the app — the write can be submitted again.
- The CLI's `write`/`call` as installed cannot attach `msg.value`, so payable
  entry points (`register_agent`, `file_dispute`) are exercised through the
  frontend and the contract's own deposit checks rather than by bare CLI calls.

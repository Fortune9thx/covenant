# Changelog

All notable changes to COVENANT are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-16

### Added

- `Covenant` Intelligent Contract for GenLayer Studio Dev (chain id 61997),
  pinned to `py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng`.
- Agent registry with a refundable registration collateral and a
  `withdraw_excess` path that can never draw below the floor.
- Bilateral covenant lifecycle: `propose_covenant` and `ratify_covenant` each
  lock a bond, `expire_covenant` refunds a lapsed covenant.
- Bonded dispute lifecycle: `file_dispute` (payable) freezes two contested
  documents plus the covenant's telemetry URL and a `dispute_commitment`;
  `adjudicate` runs the breach judgment under validator consensus and settles the
  bonds; `cancel_stale` refunds a dispute nobody adjudicated.
- Four discrete verdicts (`BREACH`, `NO_BREACH`, `INCONCLUSIVE`,
  `CONFLICTING`); only `BREACH` slashes a bond.
- `covenantlib`: dependency-free pure-logic package (`ssrf`, `canonicalize`,
  `accounting`, `judgment`) with its own test suite, inlined into the deployable
  by `contracts/build_bundle.py`.
- A single conservation invariant over the whole value system
  (`deposits_total - withdrawn_total == held_total + claimable_total + escrow`),
  exposed by `get_solvency`.
- Vite + React + TypeScript + Tailwind frontend with a fail-closed status
  surface that reads liveness from `gen_getContractSchema`, never `eth_getCode`.

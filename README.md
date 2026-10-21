# COVENANT

A bilateral agent covenant protocol on GenLayer.

An **agent** registers with a refundable collateral. Two agents form a
**covenant**: a written agreement with named clauses and an allow-list of
evidence hosts, one party proposing and the other ratifying, each locking a
bond. The proposal must name a **telemetry URL** — a neutral document on an
allowed host that both parties ratify. While active, either party may file a
**dispute** that cites a clause, supplies one evidence document on a different
host, and freezes the covenant's telemetry URL as the second, independent source.

Validators then independently fetch both documents and decide, under the
Equivalence Principle, exactly one of four discrete verdicts. Only `BREACH`
settles the covenant — the accused's bond is cut, the claimant is paid, and a
protocol fee goes to the treasury. Every other verdict, including every technical
failure, returns only the filer's dispute bond and leaves the covenant active
with both covenant bonds still escrowed.

The whole protocol is one contract, deployed on GenLayer Studio Dev (chain
`61997`). Nothing here targets another network.

## Deployed

- **Contract:** see [deploy/deployments.json](deploy/deployments.json) and
  [STATUS.md](STATUS.md) for the current address on Studio Dev, chain `61997`.
- **Interface:** see [STATUS.md](STATUS.md) for the deployed interface URL.
- **Live run:** [STATUS.md](STATUS.md) records a real `INCONCLUSIVE` claim, a
  real `BREACH` settlement, a paid claim, and a registration-collateral
  withdrawal, with transaction hashes.

Studio Dev state resets periodically; see [STATUS.md](STATUS.md) for the current
state rather than assuming an address still resolves.

## The four verdicts

| Verdict        | Meaning                                            | Effect                                             |
| -------------- | -------------------------------------------------- | -------------------------------------------------- |
| `BREACH`       | The evidence shows the cited clause was breached.  | Covenant settled: accused bond slashed, claimant paid, fee to treasury |
| `NO_BREACH`    | The evidence shows the clause was honored.         | Dispute bond returned; covenant stays active       |
| `INCONCLUSIVE` | Absent, unreadable or too thin.                    | Dispute bond returned (the fail-closed default)    |
| `CONFLICTING`  | The two sources disagree irreconcilably.           | Dispute bond returned; covenant stays active       |

A bond is slashed only for `BREACH`; it must cite at least one supporting source
and a covenant clause or the verdict is voided to `INCONCLUSIVE`.

## Why the design holds

- **One non-deterministic call per adjudication.** A judgment runs inside a
  single `strict_eq` block. Each validator fetches the evidence itself and
  re-derives the verdict through the same pure canonicalizer, so agreement is
  decided on the verdict class, the sorted source/clause sets, and the
  per-source fingerprints — never on prose.
- **Unreadable evidence can never slash a bond.** If any evidence URL fails to
  fetch or parse, the verdict is `INCONCLUSIVE` and the model is never consulted.
- **One invariant covers all the money.**
  `deposits_total - withdrawn_total == held_total + claimable_total + escrow`,
  recomputed and exposed by `get_solvency`. `held` is value attributable to an
  address, `claimable` is value an address may pull, and `escrow` is value locked
  in live covenants and open disputes.
- **The collateral floor is structural, and the collateral is refundable.**
  `withdraw_excess` can only move value above `REG_COLLATERAL` to `claimable`, so
  a registered agent can never strip itself below the floor while it holds live
  bonds. `withdraw_collateral` closes the registration and moves the whole held
  balance to `claimable`, but only when no covenant binds the agent (an open
  proposal, an active term, or a dispute).
- **One claimant, one neutral source.** A dispute accepts exactly one
  claimant-supplied URL. The second document is the telemetry URL frozen at
  proposal and ratified by both parties. The two must be distinct documents on
  distinct hosts, so the claimant cannot manufacture agreement by supplying both
  sides.
- **Escape hatches on every escrowed status, with an upper bound too.** A dispute
  nobody adjudicates is cancelled by `cancel_stale` (bond refunded, covenant
  reactivated); `adjudicate` refuses once the dispute window has closed; a lapsed
  covenant is refunded by `expire_covenant`; expired proposals cannot be ratified
  and expired covenants cannot be disputed; `claim()` is pull-only, zeroes the
  balance before transferring, and is the only function that moves value out.
- **Evidence is confined.** URLs are https, default port, public domains only,
  and must match a host pattern frozen in the covenant. The check runs once, when
  the URL is filed; the stored string is what validators fetch.

## Repository layout

```
contracts/
  Covenant.py                 the contract; one nondet path
  covenantlib/                pure logic: ssrf, canonicalize, judgment, accounting
  build_bundle.py             inlines covenantlib into the deployable
  build/Covenant.bundled.py   what actually deploys (generated; do not edit)
tests/                        the contract driven through a fake GenVM
frontend/                     Vite + React + TypeScript interface
docs/                         architecture, audit, deploy, steward notes
deploy/                       deployment metadata
```

## Develop

```sh
# contract
pip install -r requirements-dev.txt
ruff check .
python -m pytest -p no:gltest
python contracts/build_bundle.py        # regenerate the deployable
genvm-lint lint contracts/build/Covenant.bundled.py

# frontend
cd frontend
npm install
npm run typecheck
npm run build
```

The committed bundle must always match the source it claims to come from; CI
rebuilds it and fails on any diff.

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md). The deployable is
`contracts/build/Covenant.bundled.py`; its first byte is the pinned GenVM
`Depends` directive.

## Security

See [SECURITY.md](SECURITY.md) and [docs/audit.md](docs/audit.md).

## License

MIT — see [LICENSE](LICENSE).

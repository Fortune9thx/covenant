# Architecture

COVENANT is one contract, `Covenant`, plus a pure library it inlines
(`covenantlib`). The split exists so that every rule that can be tested without a
chain is, and the contract is left holding only the parts that need storage,
value, or consensus.

## The deployable

`contracts/Covenant.py` is the source of record. `contracts/build_bundle.py`
inlines `covenantlib` between two markers and writes
`contracts/build/Covenant.bundled.py`, which is the only file deployed. The
bundler:

- re-emits the pinned `Depends` directive as the first byte;
- strips docstrings (AST-based) and comment-only lines to keep the bundle small;
- refuses to drop imported names, to write a BOM, or to emit code that does not
  compile.

CI rebuilds the bundle and fails if it differs from the committed one, so the
deployed artifact can never drift from the reviewed source.

## covenantlib

Four pure modules, no `genlayer` imports, each independently testable.

| Module            | Responsibility |
| ----------------- | -------------- |
| `ssrf.py`         | Evidence URL and host-pattern validation. https only, default port, no IP literals or credentials, public domains only; a URL must match a covenant's frozen pattern. |
| `canonicalize.py` | Field validators, canonical JSON, and the digest functions `covenant_digest` / `dispute_commitment`. |
| `judgment.py`     | Verdict coercion, comparable construction, `findings_hash`, evidence normalization (HTML strip, fence-collapse, control-char removal), prompt building. |
| `accounting.py`   | `settle(verdict, bond, dispute_bond, fee_bps, bps_denom, claimant_role)` and the conservation check. |

## The contract

Storage is JSON documents in `TreeMap`s plus a small set of balance maps and
scalars. A covenant or a dispute is read and written whole, so a document is the
natural unit and a flat storage surface is easier to audit than a graph of one.

```
agents          address -> agent JSON
agent_ids       "all"   -> JSON list of registered addresses
covenants       covenant id -> covenant JSON
covenant_keys   covenant key -> covenant id (uniqueness)
covenant_ids    "all"   -> JSON list of covenant ids
disputes        dispute id -> dispute JSON
board           "all"   -> JSON list of recent dispute ids
held            address -> attributable on-contract wei
claimable       address -> wei owed
escrow          scalar  -> wei locked in live covenants and open disputes
deposits_total  scalar  -> sum of all value ever attached
withdrawn_total scalar  -> sum of all value ever paid out
held_total      scalar  -> sum of `held`
claimable_total scalar  -> sum of `claimable`
```

### Methods

Writes (10): `register_agent` (payable), `withdraw_excess`,
`withdraw_collateral`, `propose_covenant`, `ratify_covenant`, `expire_covenant`,
`file_dispute` (payable), `adjudicate`, `cancel_stale`, `claim`.

Views (9): `get_config`, `get_agent`, `get_agent_ids`, `get_covenant`,
`get_covenant_ids`, `get_dispute`, `get_board`, `get_claimable`, `get_solvency`.

### The value model

Value enters only through the two payable methods (`register_agent`,
`file_dispute`), which credit the sender's `held` balance and add to
`deposits_total`. Bonds are reserved from `held` into `escrow`
(`propose_covenant` and `ratify_covenant` lock `DEFAULT_BOND` each;
`file_dispute` locks `DEFAULT_DISPUTE_BOND`). Registration collateral is held
value, not a fee: `withdraw_collateral` closes an agent with no open covenant
and moves the whole balance to `claimable`.

Adjudication returns settlement credits to `claimable`; only `BREACH` consumes
both covenant bonds and the dispute bond, pays the claimant minus `fee_bps`, and
sends the fee to `treasury`. `NO_BREACH`, `INCONCLUSIVE`, and `CONFLICTING`
consume only the dispute bond, return it to the filer, and leave the covenant
active with both covenant bonds still escrowed. `claim()` zeroes a `claimable`
balance and pays it out. Under every transition the invariant

```
deposits_total - withdrawn_total == held_total + claimable_total + escrow
```

holds, and `get_solvency` recomputes it from the live maps so a reader can check
it on chain.

### The one nondeterministic path

`adjudicate` re-derives the dispute's `dispute_commitment` and rejects on any
mismatch, then calls `_judge`, whose only nondeterministic call is a single
`gl.eq_principle.strict_eq(judge)`. Inside `judge`, evidence is fetched with
`gl.nondet.web.render` and, when every source read cleanly, the model is asked
once. The result is canonicalized by the same pure function in every validator,
so consensus is on the verdict class, the sorted index/clause sets, and the
per-source fingerprints. Any exception — including no consensus — falls back to
`INCONCLUSIVE` (`_FAIL_CLOSED`).

The fetch loop is inlined into `judge` rather than factored into a helper,
because `genvm-lint` only follows `gl.nondet.*` calls made directly inside the
function handed to the equivalence principle.

### Evidence independence

A covenant freezes one neutral telemetry URL at proposal/ratification. A dispute
adds one claimant document. `file_dispute` rejects a document whose host or path
matches the telemetry, so the two sources are not the same page, and `adjudicate`
reads both. A `BREACH` must cite at least one source and one covenant clause;
otherwise the verdict is downgraded to `INCONCLUSIVE`. The model sees the
claimant's document and the telemetry, not a document chosen by the accused.

### Time

Time is read from `gl.message.raw["datetime"]`, which every validator
re-executing the call sees identically. `gl.block` does not exist and
`gl.vm.get_timestamp()` raises on this runtime.

### Value encoding

Bonds and balances are `u256` wei on chain but are serialized into record JSON as
decimal **strings**, because `0.01 GEN` is `1e16` wei — beyond the exactly
representable range of a JavaScript number. All internal reads wrap them in
`int()`. The only function that moves value out is `claim()`, which zeroes the
balance before transferring through an `@gl.evm.contract_interface` recipient.

## The interface

`frontend/` is a Vite + React + TypeScript app. It reads the chain directly over
JSON-RPC, treats every unconfirmed state as failure (see `src/lib/tx.ts`), and
renders an explicit empty state rather than inventing a record. Liveness is
probed with `gen_getContractSchema`, not `eth_getCode` — a live GenLayer
contract can return `0x` for `eth_getCode`.

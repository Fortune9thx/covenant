# Deploy

COVENANT deploys to GenLayer Studio Dev (chain `61997`). Nothing here touches
another network.

The only file deployed is `contracts/build/Covenant.bundled.py`. Regenerate it
from source first; never edit it by hand.

```sh
python contracts/build_bundle.py
genvm-lint lint contracts/build/Covenant.bundled.py
```

## Contract

The CLI is `genlayer` (on Windows PowerShell use `genlayer.cmd`).

```sh
# Target Studio Dev.
genlayer.cmd network set studio-dev
genlayer.cmd network info

# Deploy. The constructor takes one optional argument, the treasury address;
# omitted, the deployer becomes the treasury.
genlayer.cmd deploy --contract contracts/build/Covenant.bundled.py --wallet keystore
# or, explicitly:
genlayer.cmd deploy --contract contracts/build/Covenant.bundled.py --wallet keystore \
  --args 0x<treasury-address>
```

Studio Dev currently requires a fee preset on deploy. `rotations: ["0"]` reverts
with `FeeValueMustBeNonZero`; use the estimate and its `rotations`:

```sh
genlayer.cmd estimate-fees --json
```

At the recorded deployment the preset was `rotations: ["3"]` and
`feeValue = 100000000000010352`. Pass it with `--fee-value` and `--fees` (the
`distribution` object from the estimate). The frontend uses the same rotations
for writes.

Record the deployed address in `deploy/deployments.json`, then confirm it is live
by its schema — not by `eth_getCode`:

```sh
genlayer.cmd schema 0x<address>
genlayer.cmd call 0x<address> get_config
genlayer.cmd call 0x<address> get_solvency
```

`get_config` should return the owner, treasury, bond/collateral/fee constants,
the delay/timeout seconds, the duration range, and the evidence cap.
`get_solvency` should return `balanced` as `true`.

## Frontend

Point the interface at the deployment with build-time environment variables
(see `frontend/.env.example`):

```
VITE_CONTRACT_ADDRESS=0x<address>
VITE_GENLAYER_RPC_URL=https://studio-dev.genlayer.com/api
VITE_GENLAYER_CHAIN_ID=61997
VITE_EXPLORER=https://explorer-studio-dev.genlayer.com
```

Local build and preview:

```sh
cd frontend
npm install
VITE_CONTRACT_ADDRESS=0x<address> npm run build
npm run preview
```

Production on Vercel (from `frontend/`):

```sh
vercel.cmd --prod
```

Set the same variables in the Vercel project so the deployed build embeds the
confirmed address. Until `VITE_CONTRACT_ADDRESS` is set and the schema check
passes, the interface states plainly that nothing is live — it never guesses an
address.

## After a Studio Dev reset

Studio Dev state can be wiped. If `schema` no longer resolves, redeploy and
update `VITE_CONTRACT_ADDRESS` and `deploy/deployments.json`; the interface
returns to its undeployed state on its own.

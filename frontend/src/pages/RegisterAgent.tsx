import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { TxStatus, useTx } from "../components/TxPanel";
import { useHealth } from "../components/Chrome";
import { Eyebrow, Field, Section } from "../components/ui";
import { getConfig, hasWallet } from "../lib/chain";
import { gen, toWei } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function RegisterAgent() {
  const navigate = useNavigate();
  const { health, account, connectWallet } = useHealth();
  const live = health.state === "live";

  const cfg = useAsync(() => (live ? getConfig() : Promise.resolve(null)), [live]);
  const tx = useTx();

  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [amount, setAmount] = useState<string | null>(null);

  useEffect(() => {
    if (tx.outcome?.ok) navigate("/app/agents");
  }, [tx.outcome, navigate]);

  // The floor keeps you registered; one more bond's worth lets you back a
  // covenant. Funds cannot be added after registration, so this is the one
  // chance to post enough.
  const floor = cfg.data ? BigInt(cfg.data.reg_collateral) : 0n;
  const suggested = cfg.data
    ? BigInt(cfg.data.reg_collateral) + BigInt(cfg.data.default_bond)
    : 0n;
  const defaultAmount = cfg.data ? gen(suggested).replace(" GEN", "") : "";
  const amountStr = amount ?? defaultAmount;
  const amountWei = toWei(amountStr);
  const amountOk = !!cfg.data && amountWei >= floor;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amountOk) return;
    tx.run("register_agent", [name.trim(), endpoint.trim()], amountWei);
  };

  return (
    <Section className="py-12">
      <div className="mx-auto max-w-xl">
        <Eyebrow>Register</Eyebrow>
        <h1 className="h-display mt-3 text-[32px]">Post your collateral</h1>
        <p className="mt-2 text-sm text-mute">
          This posts a one-time refundable deposit. It stays locked while you hold active covenants
          and returns when you withdraw.
        </p>

        <form onSubmit={submit} className="card mt-8 p-7">
          <div className="space-y-5">
            <Field label="Name">
              <input
                className="input mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Oracle-7"
                maxLength={64}
              />
            </Field>
            <Field label="Endpoint (optional)">
              <input
                className="input mt-1.5"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://agent.example.com"
              />
            </Field>
            <Field label="Collateral you post (GEN)">
              <input
                className="input mt-1.5"
                value={amountStr}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={defaultAmount || "0.011"}
              />
              <p className="mt-1.5 text-[12px] leading-relaxed text-mute">
                Locked while registered. The floor is {cfg.data ? gen(floor) : "—"}; post at least{" "}
                {cfg.data ? gen(suggested) : "—"} to back one covenant bond. You cannot add funds
                later, so post more if you expect several covenants.
              </p>
            </Field>
          </div>

          {!hasWallet() && (
            <p className="mt-5 text-[13px] text-amber-700">
              No injected wallet found. Install one to register.
            </p>
          )}
          {hasWallet() && !account && (
            <button type="button" className="btn-white mt-5" onClick={() => connectWallet()}>
              Connect wallet
            </button>
          )}

          <div className="mt-6">
            <button
              className="btn-primary w-full"
              disabled={tx.busy || !live || !name.trim() || !amountOk}
            >
              {tx.busy ? "Submitting…" : "Register agent"}
            </button>
          </div>

          <div className="mt-4">
            <TxStatus hash={tx.hash} outcome={tx.outcome} error={tx.error} />
          </div>

          <p className="mt-5 text-[12px] text-mute">
            Already registered?{" "}
            <Link to="/app/agents" className="font-semibold text-brand-deep">
              View the registry
            </Link>
          </p>
        </form>
      </div>
    </Section>
  );
}

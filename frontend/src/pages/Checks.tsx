import { useEffect } from "react";

import { TxStatus, useTx } from "../components/TxPanel";
import { useHealth } from "../components/Chrome";
import {
  Empty,
  ErrorNote,
  Eyebrow,
  Field,
  Mono,
  Section,
  Spinner,
} from "../components/ui";
import { getClaimable, getConfig, getSolvency, hasWallet } from "../lib/chain";
import { gen } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function Checks() {
  const { health, account, connectWallet } = useHealth();
  const live = health.state === "live";

  const cfg = useAsync(() => (live ? getConfig() : Promise.resolve(null)), [live]);
  const sol = useAsync(() => (live ? getSolvency() : Promise.resolve(null)), [live]);
  const claimable = useAsync(
    () => (live && account ? getClaimable(account) : Promise.resolve("0")),
    [live, account],
  );
  const tx = useTx();

  useEffect(() => {
    if (tx.outcome?.ok) {
      sol.reload();
      claimable.reload();
      tx.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.outcome]);

  if (!live) {
    return (
      <Section className="py-12">
        <Empty
          title="Checks are offline until the contract is live"
          hint="Configuration, solvency and balances are all read from the chain."
        />
      </Section>
    );
  }

  return (
    <Section className="py-12">
      <Eyebrow>On-chain checks</Eyebrow>
      <h1 className="h-display mt-3 text-[34px]">Configuration, solvency & balances</h1>
      <p className="mt-2 max-w-xl text-sm text-mute">
        These are direct reads of the contract's own accounting. Nothing is cached or inferred.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-7">
          <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink">Configuration</p>
          {cfg.error ? (
            <div className="mt-4">
              <ErrorNote error={cfg.error} />
            </div>
          ) : cfg.loading || !cfg.data ? (
            <div className="mt-4">
              <Spinner label="Reading configuration…" />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Treasury">
                <span className="break-all text-[12px]">{cfg.data.treasury}</span>
              </Field>
              <Field label="Fee (bps)">
                <span className="text-ink">
                  {cfg.data.fee_bps} / {cfg.data.bps_denom}
                </span>
              </Field>
              <Field label="Registration collateral">
                <span className="text-ink">{gen(cfg.data.reg_collateral)}</span>
              </Field>
              <Field label="Default bond">
                <span className="text-ink">{gen(cfg.data.default_bond)}</span>
              </Field>
              <Field label="Default dispute bond">
                <span className="text-ink">{gen(cfg.data.default_dispute_bond)}</span>
              </Field>
              <Field label="Assess delay">
                <span className="text-ink">{cfg.data.assess_delay_seconds}s</span>
              </Field>
              <Field label="Stale timeout">
                <span className="text-ink">{cfg.data.stale_timeout_seconds}s</span>
              </Field>
              <Field label="Duration range">
                <span className="text-ink">
                  {cfg.data.min_duration_hours}–{cfg.data.max_duration_hours}h
                </span>
              </Field>
              <Field label="Covenants">
                <Mono>{cfg.data.next_covenant}</Mono>
              </Field>
              <Field label="Disputes">
                <Mono>{cfg.data.next_dispute}</Mono>
              </Field>
            </div>
          )}
        </div>

        <div className="card p-7">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink">Solvency</p>
            {sol.data && (
              <span
                className={`rounded-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${
                  sol.data.balanced
                    ? "bg-emerald-100/70 text-emerald-700 ring-emerald-400/30"
                    : "bg-rose-100/70 text-rose-700 ring-rose-400/30"
                }`}
              >
                {sol.data.balanced ? "balanced" : "imbalanced"}
              </span>
            )}
          </div>
          {sol.error ? (
            <div className="mt-4">
              <ErrorNote error={sol.error} />
            </div>
          ) : sol.loading || !sol.data ? (
            <div className="mt-4">
              <Spinner label="Reading solvency…" />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Field label="Held (attributable)">
                <span className="text-ink">{gen(sol.data.held_total)}</span>
              </Field>
              <Field label="Claimable">
                <span className="text-ink">{gen(sol.data.claimable_total)}</span>
              </Field>
              <Field label="Escrow">
                <span className="text-ink">{gen(sol.data.escrow)}</span>
              </Field>
              <Field label="Deposits total">
                <span className="text-ink">{gen(sol.data.deposits_total)}</span>
              </Field>
              <Field label="Withdrawn total">
                <span className="text-ink">{gen(sol.data.withdrawn_total)}</span>
              </Field>
            </div>
          )}
          <p className="mt-5 text-[12px] leading-relaxed text-mute">
            The invariant holds when deposits minus withdrawals equals held plus claimable plus
            escrow. If it never does, something is wrong and this says so.
          </p>
        </div>
      </div>

      <div className="card mt-6 p-7">
        <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink">Your balances</p>
        {!hasWallet() ? (
          <p className="mt-3 text-sm text-mute">No injected wallet found.</p>
        ) : !account ? (
          <button className="btn-white mt-3" onClick={() => connectWallet()}>
            Connect wallet
          </button>
        ) : (
          <div className="mt-4 grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Address">
                <span className="break-all text-[12px]">{account}</span>
              </Field>
              <Field label="Claimable">
                <span className="text-ink">
                  {claimable.loading ? "…" : gen(claimable.data ?? "0")}
                </span>
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                className="btn-white"
                disabled={tx.busy}
                onClick={() => tx.run("withdraw_excess", [])}
              >
                {tx.busy ? "Submitting…" : "Move excess to claimable"}
              </button>
              <button
                className="btn-primary"
                disabled={tx.busy}
                onClick={() => tx.run("claim", [])}
              >
                {tx.busy ? "Submitting…" : "Claim"}
              </button>
            </div>
          </div>
        )}
        <div className="mt-4">
          <TxStatus hash={tx.hash} outcome={tx.outcome} error={tx.error} />
        </div>
      </div>
    </Section>
  );
}

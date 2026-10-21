import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

import { TxStatus, useTx } from "../components/TxPanel";
import { useHealth } from "../components/Chrome";
import {
  AddressLink,
  DisputePill,
  Empty,
  ErrorNote,
  Eyebrow,
  Field,
  Mono,
  Section,
  Spinner,
  VerdictPill,
} from "../components/ui";
import { getConfig, getCovenant, getDispute, hasWallet } from "../lib/chain";
import { fromNow, gen, shortHash } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function DisputeDetail() {
  const { id = "" } = useParams();
  const { health, account, connectWallet } = useHealth();
  const live = health.state === "live";
  const q = useAsync(() => (live ? getDispute(id) : Promise.resolve(null)), [live, id]);
  const cfg = useAsync(() => (live ? getConfig() : Promise.resolve(null)), [live]);
  const tx = useTx();

  const d = q.data;
  const cov = useAsync(
    () => (live && d ? getCovenant(d.covenant_id) : Promise.resolve(null)),
    [live, d?.covenant_id],
  );
  const now = Math.floor(Date.now() / 1000);
  const windowClosed =
    !!d && !!cfg.data && now >= d.opened_at + cfg.data.stale_timeout_seconds;
  const covenantExpired = !!cov.data && now >= cov.data.expires_at;
  const canAdjudicate =
    !!d &&
    d.status === "OPEN" &&
    !!cfg.data &&
    now >= d.opened_at + cfg.data.assess_delay_seconds &&
    !windowClosed &&
    !covenantExpired;
  const canCancel = !!d && d.status === "OPEN" && windowClosed;

  useEffect(() => {
    if (tx.outcome?.ok) q.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.outcome]);

  if (!live) {
    return (
      <Section className="py-12">
        <Empty title="Offline until the contract is live" hint="This record is read from the chain." />
      </Section>
    );
  }

  return (
    <Section className="py-12">
      <Link to="/app/board" className="text-[12px] font-semibold text-brand-deep">
        ← Board
      </Link>

      <div className="mt-5">
        {q.error ? (
          <ErrorNote error={q.error} />
        ) : q.loading ? (
          <Spinner label="Reading the dispute…" />
        ) : !d ? (
          <Empty title="No such dispute" hint={`Nothing is stored under ${id}.`} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>{d.dispute_id}</Eyebrow>
                  <h1 className="h-display mt-2 text-[28px]">Dispute over {d.clause_id}</h1>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <DisputePill status={d.status} />
                  <VerdictPill verdict={d.verdict} />
                </div>
              </div>

              <div className="card mt-6 p-6">
                <Field label="Claim">
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-mute">
                    {d.claim}
                  </p>
                </Field>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Claimant evidence">
                    <span className="break-all text-sm text-mute">{d.evidence_a}</span>
                  </Field>
                  <Field label="Neutral source (from covenant)">
                    <span className="break-all text-sm text-mute">{d.evidence_b}</span>
                  </Field>
                </div>
              </div>

              {d.status === "RESOLVED" && (
                <div className="card mt-5 p-6">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink">
                      Judgment
                    </p>
                    <VerdictPill verdict={d.verdict} />
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Code">
                      <Mono>{d.code || "—"}</Mono>
                    </Field>
                    <Field label="Findings hash">
                      <Mono>{shortHash(d.findings_hash)}</Mono>
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Supporting sources">
                      <span className="text-sm text-ink">
                        {d.supporting_sources.length
                          ? d.supporting_sources.join(", ")
                          : "none"}
                      </span>
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Source fingerprints (index · sha256)">
                      <div className="mt-1 space-y-1">
                        {d.fingerprints.length ? (
                          d.fingerprints.map(([i, h]) => (
                            <p key={`${i}-${h}`} className="text-[12px] text-mute">
                              <Mono>{i}</Mono> <Mono>{shortHash(h)}</Mono>
                            </p>
                          ))
                        ) : (
                          <span className="text-mute">—</span>
                        )}
                      </div>
                    </Field>
                  </div>
                  <p className="mt-4 border-t border-line pt-4 text-[12px] leading-relaxed text-mute">
                    {d.covenant_settled
                      ? "A breach was proven. The covenant is settled, the accused bond was slashed, the claimant was paid, and the fee went to the treasury."
                      : "No breach was proven. The covenant stays active with both covenant bonds still escrowed; only the claimant's dispute bond was returned. The same covenant can be disputed again."}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className="card p-6">
                <Field label="Claimant">
                  <AddressLink value={d.claimant} />
                </Field>
                <div className="mt-4">
                  <Field label="Accused">
                    <AddressLink value={d.accused} />
                  </Field>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Field label="Dispute bond">
                    <span className="font-semibold text-ink">{gen(d.bond)}</span>
                  </Field>
                  <Field label="Opened">
                    <span className="text-ink">{fromNow(d.opened_at)}</span>
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Covenant">
                    <Link
                      to={`/app/covenants/${d.covenant_id}`}
                      className="font-medium text-brand-deep underline decoration-brand/30 underline-offset-2"
                    >
                      {d.covenant_id}
                    </Link>
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Commitment">
                    <Mono>{shortHash(d.commitment)}</Mono>
                  </Field>
                </div>
              </div>

              {hasWallet() && !account && (
                <button className="btn-white w-full" onClick={() => connectWallet()}>
                  Connect wallet
                </button>
              )}

              {d.status === "OPEN" && !canAdjudicate && !windowClosed && !covenantExpired && cfg.data && (
                <p className="text-[12px] text-mute">
                  Assessment opens shortly after filing, so validators observe the evidence as
                  frozen. Adjudication unlocks then.
                </p>
              )}

              {d.status === "OPEN" && covenantExpired && !windowClosed && (
                <p className="text-[12px] text-mute">
                  The covenant term has lapsed, so this round can no longer be adjudicated. Once
                  the stale timeout passes, cancel it to return the dispute bond.
                </p>
              )}

              {d.status === "OPEN" && windowClosed && cfg.data && (
                <p className="text-[12px] text-mute">
                  The adjudication window has closed. Nobody can judge this round now; cancel it to
                  return the dispute bond and reopen the covenant.
                </p>
              )}

              {canAdjudicate && (
                <button
                  className="btn-primary w-full"
                  disabled={tx.busy}
                  onClick={() => tx.run("adjudicate", [d.dispute_id])}
                >
                  {tx.busy ? "Judging…" : "Adjudicate now"}
                </button>
              )}

              {canCancel && (
                <button
                  className="btn-white w-full"
                  disabled={tx.busy}
                  onClick={() => tx.run("cancel_stale", [d.dispute_id])}
                >
                  {tx.busy ? "Submitting…" : "Cancel stale dispute"}
                </button>
              )}

              <TxStatus hash={tx.hash} outcome={tx.outcome} error={tx.error} />
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

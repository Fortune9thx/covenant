import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { TxStatus, useTx } from "../components/TxPanel";
import { useHealth } from "../components/Chrome";
import { Eyebrow, Field, Mono, Section } from "../components/ui";
import { getConfig, hasWallet } from "../lib/chain";
import { clampInt, gen, toList } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function NewCovenant() {
  const navigate = useNavigate();
  const { health, account, connectWallet } = useHealth();
  const live = health.state === "live";

  const cfg = useAsync(() => (live ? getConfig() : Promise.resolve(null)), [live]);
  const tx = useTx();

  const [key, setKey] = useState("");
  const [respondent, setRespondent] = useState("");
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [clauses, setClauses] = useState("");
  const [patterns, setPatterns] = useState("");
  const [telemetry, setTelemetry] = useState("");
  const [hours, setHours] = useState("24");

  useEffect(() => {
    if (tx.outcome?.ok) navigate("/app/covenants");
  }, [tx.outcome, navigate]);

  const minH = cfg.data?.min_duration_hours ?? 1;
  const maxH = cfg.data?.max_duration_hours ?? 720;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clauseIds = toList(clauses);
    if (!key.trim() || !respondent.trim() || !title.trim() || !terms.trim()) return;
    if (!clauseIds.length || !telemetry.trim()) return;
    const dur = clampInt(hours, minH, maxH, 24);
    tx.run("propose_covenant", [
      key.trim(),
      respondent.trim(),
      title.trim(),
      terms.trim(),
      clauseIds,
      toList(patterns),
      telemetry.trim(),
      dur,
    ]);
  };

  const ready =
    live &&
    key.trim() &&
    respondent.trim() &&
    title.trim() &&
    terms.trim() &&
    telemetry.trim() &&
    toList(clauses).length;

  return (
    <Section className="py-12">
      <div className="mx-auto max-w-2xl">
        <Eyebrow>Propose</Eyebrow>
        <h1 className="h-display mt-3 text-[32px]">Write a covenant</h1>
        <p className="mt-2 text-sm text-mute">
          You propose; the other party ratifies. Both bonds are locked only once both sides agree.
        </p>

        <form onSubmit={submit} className="card mt-8 p-7">
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Covenant key (unique)">
                <input
                  className="input mt-1.5"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="e.g. settlement-2026-01"
                />
              </Field>
              <Field label="Respondent address">
                <input
                  className="input mt-1.5"
                  value={respondent}
                  onChange={(e) => setRespondent(e.target.value)}
                  placeholder="0x…"
                />
              </Field>
            </div>

            <Field label="Title">
              <input
                className="input mt-1.5"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Service level covenant"
              />
            </Field>

            <Field label="Terms">
              <textarea
                className="input mt-1.5 min-h-[120px]"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="The written agreement both parties are bound to."
              />
            </Field>

            <Field label="Clause ids (comma or newline separated)">
              <textarea
                className="input mt-1.5 min-h-[80px]"
                value={clauses}
                onChange={(e) => setClauses(e.target.value)}
                placeholder={"uptime\nresponse-time"}
              />
            </Field>

            <Field label="Allowed evidence hosts (patterns)">
              <textarea
                className="input mt-1.5 min-h-[80px]"
                value={patterns}
                onChange={(e) => setPatterns(e.target.value)}
                placeholder={"example.com\n*.status.example.com"}
              />
            </Field>

            <Field label="Telemetry URL (required, frozen at proposal)">
              <input
                className="input mt-1.5"
                value={telemetry}
                onChange={(e) => setTelemetry(e.target.value)}
                placeholder="https://status.example.com/telemetry.json"
              />
            </Field>
            <p className="-mt-3 text-[12px] leading-relaxed text-mute">
              This neutral document is the second evidence source in a dispute, so the claimant can
              never supply both sides. It must match an allowed evidence host and be on a different
              host from the claimant's own document.
            </p>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={`Duration (hours, ${minH}–${maxH})`}>
                <input
                  className="input mt-1.5"
                  type="number"
                  min={minH}
                  max={maxH}
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </Field>
              <Field label="Your bond (locked on proposal)">
                <p className="mt-1.5 text-sm font-semibold text-ink">
                  {cfg.data ? gen(cfg.data.default_bond) : "—"}
                </p>
              </Field>
            </div>
          </div>

          {!hasWallet() && (
            <p className="mt-5 text-[13px] text-amber-700">
              No injected wallet found. Install one to propose.
            </p>
          )}
          {hasWallet() && !account && (
            <button type="button" className="btn-white mt-5" onClick={() => connectWallet()}>
              Connect wallet
            </button>
          )}

          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-[12px] text-mute">
              Locked from your balance: <Mono>{cfg.data ? gen(cfg.data.default_bond) : "—"}</Mono>
            </p>
            <button className="btn-primary" disabled={tx.busy || !ready}>
              {tx.busy ? "Submitting…" : "Propose covenant"}
            </button>
          </div>

          <div className="mt-4">
            <TxStatus hash={tx.hash} outcome={tx.outcome} error={tx.error} />
          </div>
        </form>
      </div>
    </Section>
  );
}

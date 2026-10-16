import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { TxStatus, useTx } from "../components/TxPanel";
import { useHealth } from "../components/Chrome";
import {
  AddressLink,
  Empty,
  ErrorNote,
  Eyebrow,
  Field,
  Mono,
  Section,
  Spinner,
  StatusPill,
} from "../components/ui";
import { getConfig, getCovenant, hasWallet } from "../lib/chain";
import { fromNow, gen, shortHash } from "../lib/format";
import type { Covenant } from "../lib/types";
import { useAsync } from "../lib/useAsync";

function FileDispute({ covenant, disputeBond }: { covenant: Covenant; disputeBond: bigint }) {
  const tx = useTx();
  const [key, setKey] = useState("");
  const [clause, setClause] = useState(covenant.clause_ids[0] ?? "");
  const [claim, setClaim] = useState("");
  const [evA, setEvA] = useState("");
  const [evB, setEvB] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !clause || !claim.trim() || !evA.trim() || !evB.trim()) return;
    tx.run(
      "file_dispute",
      [key.trim(), covenant.covenant_id, clause, claim.trim(), evA.trim(), evB.trim()],
      disputeBond,
    );
  };

  return (
    <form onSubmit={submit} className="card mt-5 p-6">
      <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink">File a dispute</p>
      <p className="mt-1 text-[12px] text-mute">
        Cite a clause and freeze two documents. Validators re-fetch both and judge; a disputed round
        costs <Mono>{gen(disputeBond)}</Mono>.
      </p>
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dispute key (unique)">
            <input className="input mt-1.5" value={key} onChange={(e) => setKey(e.target.value)} />
          </Field>
          <Field label="Clause">
            <select
              className="input mt-1.5"
              value={clause}
              onChange={(e) => setClause(e.target.value)}
            >
              {covenant.clause_ids.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Claim">
          <textarea
            className="input mt-1.5 min-h-[70px]"
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="What the cited clause requires and how it was breached."
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your evidence URL">
            <input className="input mt-1.5" value={evA} onChange={(e) => setEvA(e.target.value)} />
          </Field>
          <Field label="Counterparty evidence URL">
            <input className="input mt-1.5" value={evB} onChange={(e) => setEvB(e.target.value)} />
          </Field>
        </div>
      </div>
      <button className="btn-primary mt-5 w-full" disabled={tx.busy}>
        {tx.busy ? "Submitting…" : "File dispute"}
      </button>
      <div className="mt-4">
        <TxStatus hash={tx.hash} outcome={tx.outcome} error={tx.error} />
      </div>
    </form>
  );
}

export default function CovenantDetail() {
  const { id = "" } = useParams();
  const { health, account, connectWallet } = useHealth();
  const live = health.state === "live";
  const q = useAsync(() => (live ? getCovenant(id) : Promise.resolve(null)), [live, id]);
  const cfg = useAsync(() => (live ? getConfig() : Promise.resolve(null)), [live]);
  const tx = useTx();

  const c = q.data;
  const me = account?.toLowerCase();
  const isRespondent = !!c && me === c.respondent.toLowerCase();
  const isParty = !!c && me && (me === c.proposer.toLowerCase() || me === c.respondent.toLowerCase());
  const expired = !!c && c.expires_at > 0 && Math.floor(Date.now() / 1000) >= c.expires_at;

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
      <Link to="/app/covenants" className="text-[12px] font-semibold text-brand-deep">
        ← Covenants
      </Link>

      <div className="mt-5">
        {q.error ? (
          <ErrorNote error={q.error} />
        ) : q.loading ? (
          <Spinner label="Reading the covenant…" />
        ) : !c ? (
          <Empty title="No such covenant" hint={`Nothing is stored under ${id}.`} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Eyebrow>{c.covenant_id}</Eyebrow>
                  <h1 className="h-display mt-2 text-[30px]">{c.title}</h1>
                </div>
                <StatusPill status={c.status} />
              </div>

              <div className="card mt-6 p-6">
                <Field label="Terms">
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-mute">
                    {c.terms}
                  </p>
                </Field>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Field label="Clauses">
                    <div className="mt-1 flex flex-wrap gap-2">
                      {c.clause_ids.map((cl) => (
                        <Mono key={cl}>{cl}</Mono>
                      ))}
                    </div>
                  </Field>
                  <Field label="Allowed evidence hosts">
                    <div className="mt-1 flex flex-wrap gap-2">
                      {c.evidence_patterns.length ? (
                        c.evidence_patterns.map((p) => <Mono key={p}>{p}</Mono>)
                      ) : (
                        <span className="text-mute">—</span>
                      )}
                    </div>
                  </Field>
                </div>
                {c.telemetry_url && (
                  <div className="mt-4">
                    <Field label="Telemetry URL">
                      <span className="text-sm text-mute">{c.telemetry_url}</span>
                    </Field>
                  </div>
                )}
              </div>

              {c.status === "DISPUTED" && c.dispute_id && (
                <div className="card mt-5 flex items-center justify-between gap-4 p-6">
                  <div>
                    <p className="text-[13px] font-bold uppercase tracking-[0.1em] text-ink">
                      Under dispute
                    </p>
                    <p className="mt-1 text-[12px] text-mute">Verdict: {c.verdict || "pending"}</p>
                  </div>
                  <Link to={`/app/disputes/${c.dispute_id}`} className="btn-white shrink-0">
                    View dispute
                  </Link>
                </div>
              )}

              {c.status === "ACTIVE" && isParty && cfg.data && (
                <FileDispute covenant={c} disputeBond={BigInt(cfg.data.default_dispute_bond)} />
              )}
            </div>

            <div className="space-y-5">
              <div className="card p-6">
                <Field label="Proposer">
                  <AddressLink value={c.proposer} />
                </Field>
                <div className="mt-4">
                  <Field label="Respondent">
                    <AddressLink value={c.respondent} />
                  </Field>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <Field label="Bond each">
                    <span className="font-semibold text-ink">{gen(c.bond_amount)}</span>
                  </Field>
                  <Field label="Created">
                    <span className="text-ink">{fromNow(c.created_at)}</span>
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Covenant hash">
                    <Mono>{shortHash(c.covenant_hash)}</Mono>
                  </Field>
                </div>
                <div className="mt-4">
                  <Field label="Expires">
                    <span className="text-ink">{c.expires_at ? fromNow(c.expires_at) : "—"}</span>
                  </Field>
                </div>
              </div>

              {hasWallet() && !account && (
                <button className="btn-white w-full" onClick={() => connectWallet()}>
                  Connect wallet
                </button>
              )}

              {c.status === "PROPOSED" && isRespondent && (
                <button
                  className="btn-primary w-full"
                  disabled={tx.busy}
                  onClick={() => tx.run("ratify_covenant", [c.covenant_id])}
                >
                  {tx.busy ? "Submitting…" : "Ratify & lock your bond"}
                </button>
              )}

              {c.status === "PROPOSED" && !isRespondent && (
                <p className="text-[12px] text-mute">
                  Waiting for the respondent to ratify and lock their bond.
                </p>
              )}

              {c.status === "ACTIVE" && expired && (
                <button
                  className="btn-white w-full"
                  disabled={tx.busy}
                  onClick={() => tx.run("expire_covenant", [c.covenant_id])}
                >
                  {tx.busy ? "Submitting…" : "Expire covenant"}
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

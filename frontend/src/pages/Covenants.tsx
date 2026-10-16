import { Link } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import { Empty, ErrorNote, Eyebrow, Section, Spinner, StatusPill } from "../components/ui";
import { listCovenants } from "../lib/chain";
import { fromNow, gen, shortAddr } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function Covenants() {
  const { health } = useHealth();
  const live = health.state === "live";
  const q = useAsync(() => (live ? listCovenants(60) : Promise.resolve([])), [live]);

  return (
    <Section className="py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Agreements</Eyebrow>
          <h1 className="h-display mt-3 text-[34px]">Covenants</h1>
          <p className="mt-2 max-w-xl text-sm text-mute">
            Each covenant is two bonds. It becomes active only when both parties have locked theirs.
          </p>
        </div>
        <Link to="/app/covenants/new" className="btn-primary shrink-0">
          Write a covenant
        </Link>
      </div>

      <div className="mt-8">
        {!live ? (
          <Empty
            title="The ledger is offline until the contract is live"
            hint="Reads hit the contract directly. No deployment, no records."
          />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : q.loading ? (
          <Spinner label="Reading covenants…" />
        ) : q.data && q.data.length ? (
          <div className="card divide-y divide-white/50 overflow-hidden">
            {q.data.map((c) => (
              <Link
                key={c.covenant_id}
                to={`/app/covenants/${c.covenant_id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition hover:bg-white/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{c.title}</p>
                  <p className="text-[12px] text-mute">
                    {shortAddr(c.proposer)} ↔ {shortAddr(c.respondent)} · bond {gen(c.bond_amount)}{" "}
                    · {fromNow(c.created_at)}
                  </p>
                </div>
                <StatusPill status={c.status} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="No covenants yet" hint="Write the first one." />
        )}
      </div>
    </Section>
  );
}

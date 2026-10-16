import { Link } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import { DisputePill, Empty, ErrorNote, Eyebrow, Section, Spinner, VerdictPill } from "../components/ui";
import { getBoard } from "../lib/chain";
import { fromNow, shortAddr } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function Board() {
  const { health } = useHealth();
  const live = health.state === "live";
  const q = useAsync(() => (live ? getBoard(60) : Promise.resolve([])), [live]);

  return (
    <Section className="py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>The board</Eyebrow>
          <h1 className="h-display mt-3 text-[34px]">Disputes</h1>
          <p className="mt-2 max-w-xl text-sm text-mute">
            Every dispute is a bonded adjudication. A verdict appears below only once a round has
            settled.
          </p>
        </div>
        <Link to="/app/covenants" className="btn-primary shrink-0">
          Covenants
        </Link>
      </div>

      <div className="mt-8">
        {!live ? (
          <Empty
            title="The board is offline until the contract is live"
            hint="Nothing is fabricated here. Configure a confirmed deployment and this fills in."
          />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : q.loading ? (
          <Spinner label="Reading the board…" />
        ) : q.data && q.data.length ? (
          <div className="card divide-y divide-white/50 overflow-hidden">
            {q.data.map((e) => (
              <Link
                key={e.dispute_id}
                to={`/app/disputes/${e.dispute_id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition hover:bg-white/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {shortAddr(e.claimant)} → {shortAddr(e.accused)} ·{" "}
                    <span className="text-mute">{e.clause_id}</span>
                  </p>
                  <p className="text-[12px] text-mute">
                    {e.dispute_id} · covenant {e.covenant_id} · {fromNow(e.opened_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DisputePill status={e.status} />
                  <VerdictPill verdict={e.verdict} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty title="No disputes yet" hint="Form a covenant and file one to see it here." />
        )}
      </div>
    </Section>
  );
}

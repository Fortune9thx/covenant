import { Link } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import { CtaBand, Empty, Eyebrow, Seal, Section, VerdictPill } from "../components/ui";
import { getBoard } from "../lib/chain";
import { shortAddr, fromNow } from "../lib/format";
import type { Verdict } from "../lib/types";
import { useAsync } from "../lib/useAsync";

const STEPS = [
  {
    title: "Register as an agent",
    body: "Post the refundable collateral once. Your balance can be topped up and withdrawn above the floor at any time, and the collateral itself is recoverable once you have no open covenant.",
  },
  {
    title: "Write the covenant",
    body: "One party proposes terms, named clauses and the evidence hosts both sides may be judged against, and locks a bond. The other ratifies and locks the matching bond.",
  },
  {
    title: "Let validators decide",
    body: "Either party files a dispute citing a clause and one document. The covenant's neutral telemetry is the second source. Each validator re-fetches both and re-derives the verdict. Only a confirmed breach settles the covenant.",
  },
];

const VERDICTS: { key: Verdict; line: string }[] = [
  { key: "BREACH", line: "The evidence shows the cited clause was breached. The accused's bond is slashed." },
  { key: "NO_BREACH", line: "The evidence shows the clause was honored. The dispute bond is returned and the covenant stays active." },
  { key: "INCONCLUSIVE", line: "Absent, unreadable or too thin. The fail-closed default; the dispute bond is returned and the covenant stays active." },
  { key: "CONFLICTING", line: "The two independent sources disagree irreconcilably. The dispute bond is returned and the covenant stays active." },
];

export default function Home() {
  const { health } = useHealth();
  const live = health.state === "live";
  const board = useAsync(() => (live ? getBoard(6) : Promise.resolve([])), [live]);

  return (
    <div className="pb-4">
      <Section className="pt-14 sm:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <Eyebrow>Bilateral agent covenant protocol</Eyebrow>
            <h1 className="h-display mt-4 text-[44px] sm:text-[58px]">
              A bond is only worth as much as the judgment behind it.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-mute">
              COVENANT lets two agents bind themselves to a written agreement and settle a breach
              between them — but only when independent validators confirm the breach from evidence
              they fetched and judged themselves. Anything short of that returns only the dispute
              bond and leaves the covenant active.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/app/covenants/new" className="btn-primary">
                Write a covenant
              </Link>
              <Link to="/app/agents/new" className="btn-white">
                Register an agent
              </Link>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Seal />
          </div>
        </div>
      </Section>

      <Section className="mt-16">
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="card p-7">
              <span className="text-[12px] font-extrabold text-brand">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-[17px] font-bold tracking-[-0.01em] text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{s.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="mt-16">
        <Eyebrow>Four discrete verdicts</Eyebrow>
        <h2 className="h-display mt-3 text-[30px]">One of these, or the bonds come back.</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {VERDICTS.map((v) => (
            <div key={v.key} className="glass p-5">
              <VerdictPill verdict={v.key} />
              <p className="mt-3 text-sm text-mute">{v.line}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section className="mt-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Latest on the board</Eyebrow>
            <h2 className="h-display mt-3 text-[30px]">Recent disputes</h2>
          </div>
          <Link to="/app/board" className="btn-ghost shrink-0">
            View all
          </Link>
        </div>
        <div className="mt-6">
          {!live ? (
            <Empty
              title="Nothing is live yet"
              hint="The board reads the contract directly. Until a deployment is confirmed by gen_getContractSchema, this stays empty on purpose."
            />
          ) : board.loading ? (
            <Empty title="Reading the board…" />
          ) : board.data && board.data.length ? (
            <div className="card divide-y divide-white/50 overflow-hidden">
              {board.data.map((e) => (
                <Link
                  key={e.dispute_id}
                  to={`/app/disputes/${e.dispute_id}`}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-white/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {shortAddr(e.claimant)} → {shortAddr(e.accused)} · {e.clause_id}
                    </p>
                    <p className="text-[12px] text-mute">
                      {e.dispute_id} · {fromNow(e.opened_at)}
                    </p>
                  </div>
                  <VerdictPill verdict={e.verdict} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty title="No disputes yet" hint="Form a covenant and file one to see it here." />
          )}
        </div>
      </Section>

      <Section className="mt-16">
        <CtaBand
          title="Write the covenant. Let independent validators decide."
          action="Write a covenant"
          to="/app/covenants/new"
        />
      </Section>
    </div>
  );
}

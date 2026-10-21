import { Link } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import { AddressLink, Empty, ErrorNote, Eyebrow, Section, Spinner } from "../components/ui";
import { listAgents } from "../lib/chain";
import { fromNow, gen } from "../lib/format";
import { useAsync } from "../lib/useAsync";

export default function Agents() {
  const { health } = useHealth();
  const live = health.state === "live";
  const q = useAsync(() => (live ? listAgents(60) : Promise.resolve([])), [live]);

  return (
    <Section className="py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Registered parties</Eyebrow>
          <h1 className="h-display mt-3 text-[34px]">Agents</h1>
          <p className="mt-2 max-w-xl text-sm text-mute">
            An agent posts refundable collateral once. A breach slashes the bond, not the
            collateral; when no covenant binds you, withdraw collateral to close the registration
            and take the whole balance back.
          </p>
        </div>
        <Link to="/app/agents/new" className="btn-primary shrink-0">
          Register an agent
        </Link>
      </div>

      <div className="mt-8">
        {!live ? (
          <Empty
            title="The registry is offline until the contract is live"
            hint="Reads hit the contract directly. No deployment, no list."
          />
        ) : q.error ? (
          <ErrorNote error={q.error} />
        ) : q.loading ? (
          <Spinner label="Reading the registry…" />
        ) : q.data && q.data.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {q.data.map((a) => (
              <div key={a.address} className="card p-6">
                <p className="text-[16px] font-bold tracking-[-0.01em] text-ink">{a.name}</p>
                <p className="mt-1 text-[12px] text-mute">
                  <AddressLink value={a.address} />
                </p>
                <div className="mt-4 flex items-center justify-between text-[12px]">
                  <span className="text-mute">Collateral</span>
                  <span className="font-semibold text-ink">{gen(a.collateral)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[12px]">
                  <span className="text-mute">Registered</span>
                  <span className="text-ink">{fromNow(a.registered_at)}</span>
                </div>
                {a.endpoint && (
                  <p className="mt-3 truncate text-[12px] text-mute">{a.endpoint}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No agents yet" hint="Be the first to register." />
        )}
      </div>
    </Section>
  );
}

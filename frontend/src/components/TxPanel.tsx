import { useState } from "react";

import { writeAndConfirm } from "../lib/chain";
import type { TxOutcome } from "../lib/tx";
import { HashLink, Mono } from "./ui";

/** Drives one write from submission through a settled, classified outcome. */
export function useTx() {
  const [hash, setHash] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TxOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (method: string, args: unknown[], value = 0n): Promise<TxOutcome | null> => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    setHash(null);
    try {
      const res = await writeAndConfirm(method, args, value, (h, o) => {
        setHash(h);
        setOutcome(o);
      });
      setHash(res.hash);
      setOutcome(res.outcome);
      return res.outcome;
    } catch (e) {
      setError(e instanceof Error ? e.message : "write failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  return {
    run,
    busy,
    hash,
    outcome,
    error,
    reset: () => {
      setOutcome(null);
      setError(null);
      setHash(null);
    },
  };
}

export function TxStatus({
  hash,
  outcome,
  error,
}: {
  hash: string | null;
  outcome: TxOutcome | null;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-chip border border-rose-200/70 bg-rose-50/70 p-4">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-rose-600">Write failed</p>
        <p className="mt-1 break-words text-sm text-rose-700/90">{error}</p>
      </div>
    );
  }
  if (!hash) return null;

  const tone =
    outcome?.state === "success"
      ? "border-emerald-200/70 bg-emerald-50/70"
      : outcome?.settled
        ? "border-amber-200/70 bg-amber-50/70"
        : "border-white/70 bg-white/50";

  return (
    <div className={`rounded-chip border p-4 ${tone}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-ink">
          {outcome?.title ?? "Submitting"}
        </p>
        {outcome && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-mute">
            {outcome.state}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-mute">{outcome?.detail}</p>
      <p className="mt-2 text-[12px]">
        tx <HashLink value={hash} label={hash.slice(0, 14) + "…"} />
        {outcome?.exec && (
          <>
            {" · "}
            <Mono>{outcome.exec}</Mono>
          </>
        )}
      </p>
    </div>
  );
}

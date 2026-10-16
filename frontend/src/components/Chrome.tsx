import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { CHAIN_LABEL, explorerAddress } from "../lib/config";
import { type Health, checkHealth, connect, currentAccount, hasWallet } from "../lib/chain";
import { Section, Wordmark } from "./ui";

/* --- health ------------------------------------------------------------- */

type HealthCtx = {
  health: Health;
  account: string | null;
  connectWallet: () => Promise<void>;
  refresh: () => void;
};

const Ctx = createContext<HealthCtx | null>(null);

export function useHealth(): HealthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHealth outside HealthProvider");
  return ctx;
}

export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health>({ state: "checking" });
  const [account, setAccount] = useState<string | null>(null);

  const refresh = useCallback(() => {
    checkHealth().then(setHealth, (e) =>
      setHealth({ state: "rpc-down", detail: e instanceof Error ? e.message : "unreachable" }),
    );
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    currentAccount().then(setAccount);
  }, []);

  const connectWallet = useCallback(async () => {
    const addr = await connect();
    setAccount(addr);
  }, []);

  return (
    <Ctx.Provider value={{ health, account, connectWallet, refresh }}>{children}</Ctx.Provider>
  );
}

/* --- nav ---------------------------------------------------------------- */

const LINKS = [
  { to: "/app/agents", label: "Agents" },
  { to: "/app/covenants", label: "Covenants" },
  { to: "/app/board", label: "Board" },
  { to: "/app/checks", label: "Checks" },
];

export function Nav() {
  const { health, account, connectWallet } = useHealth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onConnect = async () => {
    setErr(null);
    setBusy(true);
    try {
      await connectWallet();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not connect");
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/50 bg-white/40 backdrop-blur-xl">
      <Section className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Wordmark />
          <nav className="hidden items-center gap-6 md:flex">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `text-[13px] font-semibold transition ${
                    isActive ? "text-brand-deep" : "text-mute hover:text-ink"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.12em] text-mute sm:inline">
            {CHAIN_LABEL}
            {health.state === "live" ? " · live" : ""}
          </span>
          {hasWallet() ? (
            account ? (
              <a
                href={explorerAddress(account)}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost"
              >
                {account.slice(0, 6)}…{account.slice(-4)}
              </a>
            ) : (
              <button className="btn-primary" onClick={onConnect} disabled={busy}>
                {busy ? "Connecting…" : "Connect wallet"}
              </button>
            )
          ) : (
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">
              no wallet
            </span>
          )}
        </div>
      </Section>
      {err && (
        <Section className="pb-3">
          <p className="text-[12px] text-rose-600">{err}</p>
        </Section>
      )}
    </header>
  );
}

/* --- banner ------------------------------------------------------------- */

/** A fail-closed status line. Anything but `live` is stated plainly. */
export function Banner() {
  const { health } = useHealth();

  const tone =
    health.state === "live" || health.state === "checking"
      ? "border-white/50 bg-white/40 text-mute"
      : health.state === "undeployed" || health.state === "no-code"
        ? "border-amber-300/60 bg-amber-50/70 text-amber-800"
        : "border-rose-300/60 bg-rose-50/70 text-rose-700";

  const text = (() => {
    switch (health.state) {
      case "checking":
        return "Checking the contract…";
      case "live":
        return `Live at ${health.address}. Reads and writes go to it directly.`;
      case "undeployed":
        return "No contract address is configured, so nothing here is live yet. The interface shows exactly this rather than a guessed address.";
      case "rpc-down":
        return `The Studio Dev RPC is unreachable (${health.detail}). Nothing can be confirmed until it answers.`;
      case "wrong-chain":
        return `The RPC answered with chain ${health.found}, not 61997. COVENANT writes to Studio Dev only and will not act on another chain.`;
      case "no-code":
        return `No contract is deployed at ${health.address} on Studio Dev. Studio Dev resets wipe state, so treat this as "not live".`;
    }
  })();

  return (
    <div className={`border-b ${tone}`}>
      <Section className="py-2.5">
        <p className="text-[12px] font-medium">{text}</p>
      </Section>
    </div>
  );
}

/* --- footer ------------------------------------------------------------- */

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/50 bg-white/30 backdrop-blur">
      <Section className="flex flex-col gap-2 py-8 text-[12px] text-mute sm:flex-row sm:items-center sm:justify-between">
        <p>COVENANT — a bilateral agent covenant protocol. {CHAIN_LABEL}.</p>
        <p>Adjudicated by independent validators. Fail-closed by default.</p>
      </Section>
    </footer>
  );
}

/** The layout's recurring pieces, built once. */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { EXPLORER, explorerAddress } from "../lib/config";
import type { CovenantStatus, DisputeStatus, Verdict } from "../lib/types";

/* --- page canvas -------------------------------------------------------- */

export function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 top-4 h-[540px] w-[540px] animate-float rounded-full bg-white/60 blur-3xl" />
      <div className="absolute -right-36 top-[30%] h-[500px] w-[500px] rounded-full bg-brand/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/4 h-[440px] w-[440px] rounded-full bg-brand-tint blur-3xl" />
      <svg
        className="absolute -left-24 top-1/4 h-[380px] w-[380px] text-white/70"
        viewBox="0 0 200 200"
      >
        <path
          fill="currentColor"
          d="M45 -60C58 -49 67 -33 71 -15C74 3 72 22 62 37C52 52 34 62 14 68C-6 73 -28 73 -46 63C-64 53 -78 33 -81 12C-84 -10 -76 -33 -61 -49C-46 -65 -25 -73 -4 -70C17 -67 32 -71 45 -60Z"
          transform="translate(100 100)"
        />
      </svg>
    </div>
  );
}

export function Section({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mx-auto w-full max-w-6xl px-5 ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

/* --- marks -------------------------------------------------------------- */

/** COVENANT's mark: two linked rings — a covenant is two parties bound. */
export function Logo({ className = "h-7 w-7 text-brand" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="12.5" cy="16" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="19.5" cy="16" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.6" opacity=".55" />
      <circle cx="16" cy="16" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function Seal({ size = 116 }: { size?: number }) {
  const text = "COVENANT · INDEPENDENTLY ADJUDICATED · STUDIO DEV 61997 · ";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 animate-spinslow">
        <defs>
          <path id="seal-arc" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
        </defs>
        <text className="fill-mute" style={{ fontSize: 6.2, letterSpacing: 1.0, fontWeight: 700 }}>
          <textPath href="#seal-arc">{text}</textPath>
        </text>
      </svg>
      <div className="absolute inset-0 rounded-full border border-white/70 bg-white/30 backdrop-blur" />
      <Logo className="h-7 w-7 text-brand" />
    </div>
  );
}

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <Logo className="h-7 w-7 text-brand" />
      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">COVENANT</span>
    </Link>
  );
}

/* --- pills -------------------------------------------------------------- */

const COVENANT_STYLE: Record<CovenantStatus, string> = {
  PROPOSED: "bg-amber-100/70 text-amber-700 ring-amber-400/30",
  ACTIVE: "bg-brand-tint text-brand-deep ring-brand/30",
  DISPUTED: "bg-rose-100/70 text-rose-700 ring-rose-400/30",
  SETTLED: "bg-emerald-100/70 text-emerald-700 ring-emerald-400/30",
  EXPIRED: "bg-slate-100/80 text-slate-500 ring-slate-400/20",
};

export function StatusPill({ status }: { status: CovenantStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${
        COVENANT_STYLE[status] ?? COVENANT_STYLE.PROPOSED
      }`}
    >
      {status}
    </span>
  );
}

const DISPUTE_STYLE: Record<DisputeStatus, string> = {
  OPEN: "bg-sky-100/70 text-sky-700 ring-sky-400/30",
  RESOLVED: "bg-brand-tint text-brand-deep ring-brand/30",
  CANCELLED: "bg-slate-100/80 text-slate-500 ring-slate-400/20",
};

export function DisputePill({ status }: { status: DisputeStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${
        DISPUTE_STYLE[status] ?? DISPUTE_STYLE.OPEN
      }`}
    >
      {status}
    </span>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  BREACH: "bg-rose-100/80 text-rose-700 ring-rose-500/30",
  NO_BREACH: "bg-emerald-100/80 text-emerald-700 ring-emerald-500/30",
  INCONCLUSIVE: "bg-slate-100/80 text-slate-600 ring-slate-400/25",
  CONFLICTING: "bg-violet-100/80 text-violet-700 ring-violet-500/30",
};

export function VerdictPill({ verdict }: { verdict: Verdict | "" }) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center rounded-pill bg-white/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-mute ring-1 ring-inset ring-white/70">
        pending
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${
        VERDICT_STYLE[verdict] ?? VERDICT_STYLE.INCONCLUSIVE
      }`}
    >
      {verdict.replace(/_/g, " ")}
    </span>
  );
}

/* --- small building blocks --------------------------------------------- */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="break-words text-sm text-ink">{children}</div>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-lg bg-white/60 px-2 py-0.5 text-[12px] font-medium text-ink ring-1 ring-inset ring-white/70">
      {children}
    </code>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-chip bg-brand-tint">
        <Logo className="h-6 w-6 text-brand" />
      </div>
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-md text-sm text-mute">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = "Reading the chain…" }: { label?: string }) {
  return (
    <div className="card flex items-center justify-center gap-3 p-10 text-sm text-mute">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-brand" />
      {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="card border border-rose-200/70 p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rose-600">
        Could not read the chain
      </p>
      <p className="mt-2 break-words text-sm text-mute">{error}</p>
    </div>
  );
}

export function CtaBand({ title, action, to }: { title: string; action: string; to: string }) {
  return (
    <div className="relative overflow-hidden rounded-card bg-brand/90 px-8 py-8 shadow-glow backdrop-blur sm:px-10">
      <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-white">
          {title}
        </p>
        <Link to={to} className="btn-white shrink-0">
          {action}
        </Link>
      </div>
    </div>
  );
}

export function HashLink({ value, label }: { value: string; label?: string }) {
  if (!value) return <span className="text-mute">—</span>;
  return (
    <a
      href={`${EXPLORER}/tx/${value}`}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-brand-deep underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
    >
      {label ?? value}
    </a>
  );
}

export function AddressLink({ value, label }: { value: string; label?: string }) {
  if (!value) return <span className="text-mute">—</span>;
  return (
    <a
      href={explorerAddress(value)}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-brand-deep underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
    >
      {label ?? value}
    </a>
  );
}

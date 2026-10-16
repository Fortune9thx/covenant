/** Display helpers. Nothing here decides truth; it only shortens it. */

export function shortAddr(addr: string, size = 4): string {
  if (!addr) return "—";
  if (addr.length <= 2 + size * 2) return addr;
  return `${addr.slice(0, 2 + size)}…${addr.slice(-size)}`;
}

export function shortHash(hash: string, size = 8): string {
  if (!hash) return "—";
  return `${hash.slice(0, size)}…${hash.slice(-size)}`;
}

/** Wei to a compact GEN string without pulling in a bignumber library. */
export function gen(wei: number | string | bigint): string {
  const n = BigInt(wei);
  const whole = n / 10n ** 18n;
  const frac = n % 10n ** 18n;
  if (frac === 0n) return `${whole} GEN`;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fracStr.slice(0, 6)} GEN`;
}

export function fromNow(seconds: number, now = Math.floor(Date.now() / 1000)): string {
  const delta = now - seconds;
  if (delta < 0) return "just now";
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function until(seconds: number, now = Math.floor(Date.now() / 1000)): string {
  const delta = seconds - now;
  if (delta <= 0) return "expired";
  if (delta < 60) return `${delta}s`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h`;
  return `${Math.floor(delta / 86400)}d`;
}

/** A GEN decimal string to wei, without a bignumber library. */
export function toWei(input: string): bigint {
  const s = input.trim();
  if (!s) return 0n;
  const [whole, frac = ""] = s.split(".");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) return 0n;
  const w = BigInt(whole || "0");
  const f = BigInt((frac + "0".repeat(18)).slice(0, 18) || "0");
  return w * 10n ** 18n + f;
}

export function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Comma-or-newline separated text into a clean, de-duplicated list. */
export function toList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Chain access, fail-closed.
 *
 * Nothing here ever invents a record. Every read either returns what the chain
 * said or throws, and the UI renders an empty state rather than a placeholder.
 */

import { CHAIN_ID, CONTRACT_ADDRESS, RPC_URL, isTargetChain } from "./config";
import type {
  Agent,
  BoardEntry,
  Config,
  Covenant,
  Dispute,
  Solvency,
} from "./types";
import type { TxOutcome } from "./tx";
import { describeOutcome, needsFinality } from "./tx";

let rpcId = 1;

const RPC_TIMEOUT_MS = 15_000;
const RPC_ATTEMPTS = 3;

/**
 * One JSON-RPC call with a hard timeout. Transport failures (timeout, network,
 * non-2xx) are retried by `rpc`; a JSON-RPC `error` object is the chain's own
 * answer and is marked `definitive` so it is never retried.
 */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RPC_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`rpc ${method}: http ${res.status}`);
      const json = await res.json();
      if (json.error) {
        throw Object.assign(new Error(`rpc ${method}: ${json.error.message ?? "failed"}`), {
          definitive: true,
        });
      }
      return json.result as T;
    } catch (e) {
      lastError = e;
      if ((e as { definitive?: boolean } | null)?.definitive) throw e;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < RPC_ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(`rpc ${method}: unreachable`);
}

/** The banner states, evaluated in this order. */
export type Health =
  | { state: "checking" }
  | { state: "undeployed" }
  | { state: "rpc-down"; detail: string }
  | { state: "wrong-chain"; found: number }
  | { state: "no-code"; address: string }
  | { state: "live"; address: string };

export async function checkHealth(): Promise<Health> {
  if (!CONTRACT_ADDRESS) return { state: "undeployed" };

  let chainHex: string;
  try {
    chainHex = await rpc<string>("eth_chainId", []);
  } catch (e) {
    return { state: "rpc-down", detail: e instanceof Error ? e.message : "unreachable" };
  }

  const found = Number.parseInt(chainHex, 16);
  if (!isTargetChain(found)) return { state: "wrong-chain", found };

  // Liveness is probed with gen_getContractSchema, NOT eth_getCode.
  // eth_getCode returns "0x" for a GenLayer contract that is demonstrably
  // live, so using it here would report every healthy deployment as "no-code".
  try {
    const schema = await rpc<unknown>("gen_getContractSchema", [CONTRACT_ADDRESS]);
    const methods = (schema as { methods?: Record<string, unknown> } | null)?.methods;
    if (!schema || !methods || Object.keys(methods).length === 0) {
      return { state: "no-code", address: CONTRACT_ADDRESS };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unreachable";
    if (/not found|does not exist|invalid_contract|execution failed/i.test(msg)) {
      return { state: "no-code", address: CONTRACT_ADDRESS };
    }
    return { state: "rpc-down", detail: msg };
  }

  return { state: "live", address: CONTRACT_ADDRESS };
}

/* -------------------------------------------------------------------------
 * Contract reads — genlayer-js is loaded lazily so an incompatible build
 * degrades to an error banner instead of breaking the whole bundle.
 * ---------------------------------------------------------------------- */

let clientPromise: Promise<any> | null = null;

/**
 * The chain must be the library's own definition, not a hand-rolled lookalike.
 * genlayer-js reads fields we would never guess — `defaultNumberOfInitialValidators`,
 * for one — off `chain` while encoding a write, and a missing one throws
 * ("Cannot convert undefined to a BigInt") before the transaction is ever sent.
 * We only override the RPC endpoint.
 */
async function studioDevChain() {
  const chains: any = await import("genlayer-js/chains");
  return { ...chains.studioDevnet, rpcUrls: { default: { http: [RPC_URL] } } };
}

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const gl: any = await import("genlayer-js");
      return gl.createClient({ chain: await studioDevChain(), endpoint: RPC_URL });
    })();
  }
  return clientPromise;
}

async function read<T = string>(method: string, args: unknown[] = []): Promise<T> {
  if (!CONTRACT_ADDRESS) throw new Error("contract address is not configured");
  const client = await getClient();
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
  }) as Promise<T>;
}

/** Contract views return JSON strings; "" means "no such record". */
function parseOrNull<T>(raw: unknown): T | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const getConfig = async (): Promise<Config | null> =>
  parseOrNull<Config>(await read("get_config"));

export const getSolvency = async (): Promise<Solvency | null> =>
  parseOrNull<Solvency>(await read("get_solvency"));

export const getAgent = async (addr: string): Promise<Agent | null> =>
  parseOrNull<Agent>(await read("get_agent", [addr]));

export const getCovenant = async (id: string): Promise<Covenant | null> =>
  parseOrNull<Covenant>(await read("get_covenant", [id]));

export const getDispute = async (id: string): Promise<Dispute | null> =>
  parseOrNull<Dispute>(await read("get_dispute", [id]));

export async function getAgentIds(): Promise<string[]> {
  return parseOrNull<string[]>(await read("get_agent_ids")) ?? [];
}

export async function listAgents(limit = 60): Promise<Agent[]> {
  const ids = await getAgentIds();
  const slice = ids.slice(-limit).reverse();
  const settled = await Promise.allSettled(slice.map((id) => getAgent(id)));
  const out: Agent[] = [];
  for (const r of settled) if (r.status === "fulfilled" && r.value) out.push(r.value);
  return out;
}

export async function getCovenantIds(): Promise<string[]> {
  return parseOrNull<string[]>(await read("get_covenant_ids")) ?? [];
}

export async function listCovenants(limit = 60): Promise<Covenant[]> {
  const ids = await getCovenantIds();
  const slice = ids.slice(-limit).reverse();
  const settled = await Promise.allSettled(slice.map((id) => getCovenant(id)));
  const out: Covenant[] = [];
  for (const r of settled) if (r.status === "fulfilled" && r.value) out.push(r.value);
  return out;
}

export async function getBoard(limit = 40): Promise<BoardEntry[]> {
  return parseOrNull<BoardEntry[]>(await read("get_board", [limit])) ?? [];
}

export async function getClaimable(addr: string): Promise<string> {
  const raw = await read("get_claimable", [addr]);
  return typeof raw === "string" && raw !== "" ? raw : "0";
}

/* -------------------------------------------------------------------------
 * Writes — injected wallet, resolved through EIP-6963
 * ---------------------------------------------------------------------- */

/** `window.ethereum` alone is not the wallet; prefer an announced provider. */
let announced: any[] = [];

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event: any) => {
    const detail = event?.detail;
    if (!detail?.provider) return;
    if (!announced.some((p) => p.provider === detail.provider)) announced.push(detail);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function availableWallets(): { name: string; provider: any }[] {
  const list = announced.map((d) => ({
    name: d.info?.name ?? "Injected wallet",
    provider: d.provider,
  }));
  const injected = (window as any)?.ethereum;
  if (injected && !list.some((w) => w.provider === injected)) {
    list.push({ name: "Injected wallet", provider: injected });
  }
  return list;
}

function eth(): any {
  const wallets = availableWallets();
  if (!wallets.length) throw new Error("no wallet found");
  return wallets[0].provider;
}

export function hasWallet(): boolean {
  if (typeof window === "undefined") return false;
  return availableWallets().length > 0;
}

const CHAIN_HEX = `0x${CHAIN_ID.toString(16)}`;

export async function ensureChain(): Promise<void> {
  try {
    await eth().request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err: any) {
    if (err?.code !== 4902) throw err;
    await eth().request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: "GenLayer Studio Dev",
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
        },
      ],
    });
  }
}

export async function connect(): Promise<string> {
  const accounts: string[] = await eth().request({ method: "eth_requestAccounts" });
  if (!accounts?.length) throw new Error("wallet returned no account");
  await ensureChain();
  return accounts[0];
}

export async function currentAccount(): Promise<string | null> {
  if (!hasWallet()) return null;
  try {
    const accounts: string[] = await eth().request({ method: "eth_accounts" });
    return accounts?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Poll budget, matching the GenLayer CLI's own receipt default. */
const POLL_ATTEMPTS = 100;
const POLL_INTERVAL_MS = 5_000;
const CONSENSUS_MAX_ROTATIONS = 6;

/**
 * A write on Studio Dev is rejected client-side with `FeeValueMustBeNonZero(1)`
 * unless it carries a complete fee distribution *and* a non-zero deposit; the
 * SDK does not infer one here. This is the distribution a successful deploy on
 * this network uses. The wallet must hold `value + feeValue`; the deposit is
 * mostly returned once the round settles.
 */
const WRITE_FEES = {
  distribution: {
    rotations: [3],
    appealRounds: 0,
    totalMessageFees: 0,
    executionConsumed: 0,
    receiptFeeMaxGasPrice: "300000000",
    storageFeeMaxGasPrice: "300000000",
    maxPriceGenPerTimeUnit: "2",
    executionBudgetPerRound: "25000000000000000",
    leaderTimeunitsAllocation: "100",
    validatorTimeunitsAllocation: "200",
  },
  feeValue: 100000000000010352n,
};

async function writeClient() {
  if (!CONTRACT_ADDRESS) throw new Error("contract address is not configured");
  await ensureChain();
  const account = await connect();
  const gl: any = await import("genlayer-js");
  const chain = await studioDevChain();
  return gl.createClient({ chain, endpoint: RPC_URL, account, provider: eth() });
}

export async function write(method: string, args: unknown[], value = 0n): Promise<string> {
  const client = await writeClient();
  return client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
    value,
    fees: WRITE_FEES,
    consensusMaxRotations: CONSENSUS_MAX_ROTATIONS,
  });
}

export async function getReceipt(hash: string): Promise<any | null> {
  try {
    return await rpc<any>("eth_getTransactionByHash", [hash]);
  } catch {
    return null;
  }
}

export async function writeAndConfirm(
  method: string,
  args: unknown[],
  value = 0n,
  onProgress?: (hash: string, outcome: TxOutcome) => void,
): Promise<{ hash: string; outcome: TxOutcome }> {
  const hash = await write(method, args, value);
  const requireFinalized = needsFinality(method);

  let outcome = describeOutcome(null, requireFinalized);
  onProgress?.(hash, outcome);

  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const receipt = await getReceipt(hash);
    outcome = describeOutcome(receipt, requireFinalized);
    onProgress?.(hash, outcome);
    if (outcome.settled) return { hash, outcome };
  }

  return {
    hash,
    outcome: {
      ...outcome,
      state: "unknown",
      ok: false,
      settled: false,
      title: "Still not confirmed",
      detail:
        "The transaction did not reach a settled state within the polling budget. It may still land — check the explorer before retrying.",
    },
  };
}

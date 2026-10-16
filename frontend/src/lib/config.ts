/** Network configuration. COVENANT targets Studio Dev (61997) and nothing else. */

export const RPC_URL =
  import.meta.env.VITE_GENLAYER_RPC_URL ?? "https://studio-dev.genlayer.com/api";

export const CHAIN_ID = Number(import.meta.env.VITE_GENLAYER_CHAIN_ID ?? 61997);

export const EXPLORER =
  import.meta.env.VITE_EXPLORER ?? "https://explorer-studio-dev.genlayer.com";

/** Empty until a deploy is confirmed by gen_getContractSchema. Never guessed. */
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ?? "").trim();

export const CHAIN_LABEL = "Studio Dev · 61997";

export const explorerAddress = (addr: string) => `${EXPLORER}/address/${addr}`;

/** The one place the chain id is enforced, so no page can drift off 61997. */
export const isTargetChain = (id: number) => id === CHAIN_ID;

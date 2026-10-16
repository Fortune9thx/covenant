/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GENLAYER_RPC_URL?: string;
  readonly VITE_GENLAYER_CHAIN_ID?: string;
  readonly VITE_EXPLORER?: string;
  readonly VITE_CONTRACT_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

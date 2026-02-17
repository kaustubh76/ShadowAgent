/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_FACILITATOR_URL?: string;
  readonly VITE_SHIELD_WALLET_PRIVATE_KEY?: string;
  readonly VITE_SHIELD_WALLET_VIEW_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

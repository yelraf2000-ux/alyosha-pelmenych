/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" builds the static demo that runs without a server. */
  readonly VITE_DEMO?: string;
  /** Origin of the API when it is not served from the same host. Empty by default. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

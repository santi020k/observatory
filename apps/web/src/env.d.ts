interface ImportMetaEnv {
  readonly API_INTERNAL_URL?: string
  readonly PUBLIC_AUTH_PILOT_ENABLED?: string
  readonly PUBLIC_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

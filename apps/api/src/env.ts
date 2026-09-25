export interface Bindings {
  APP_STORE_CONNECT_ISSUER_ID?: string
  APP_STORE_CONNECT_KEY_ID?: string
  APP_STORE_CONNECT_PRIVATE_KEY?: string
  APP_STORE_CONNECT_REPORT_REQUESTS_JSON?: string
  AUTH_SECRET: string
  AUTH_PILOT_ENABLED?: string
  OWNER_PASSCODE: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CORS_ORIGIN: string
  DB: D1Database
  ENVIRONMENT: 'development' | 'production' | 'test'
  FEEDBACK_HASH_SECRET?: string
  GITHUB_TOKEN?: string
  GOOGLE_PLAY_REPORT_BUCKET?: string
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?: string
  MAIL_FROM: string
  OWNER_EMAIL: string
  SITE_URL: string
  TURNSTILE_SECRET_KEY?: string
  TURNSTILE_SITE_KEY?: string
  RESEND_API_KEY?: string
}

export interface Variables {
  sessionEmail: string
}

export interface WorkerEnv {
  Bindings: Bindings
  Variables: Variables
}

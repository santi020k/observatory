export interface Bindings {
  AUTH_SECRET: string
  OWNER_PASSCODE: string
  CLOUDFLARE_ACCOUNT_ID?: string
  CLOUDFLARE_API_TOKEN?: string
  CORS_ORIGIN: string
  DB: D1Database
  ENVIRONMENT: 'development' | 'production' | 'test'
  FEEDBACK_HASH_SECRET?: string
  GITHUB_TOKEN?: string
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

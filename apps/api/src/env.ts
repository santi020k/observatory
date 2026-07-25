export interface Bindings {
  AUTH_SECRET: string
  CORS_ORIGIN: string
  DB: D1Database
  ENVIRONMENT: 'development' | 'production' | 'test'
  GITHUB_TOKEN?: string
  MAIL_FROM: string
  OWNER_EMAIL: string
  RESEND_API_KEY?: string
}

export interface Variables {
  sessionEmail: string
}

export interface WorkerEnv {
  Bindings: Bindings
  Variables: Variables
}

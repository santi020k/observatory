CREATE TABLE IF NOT EXISTS auth_codes (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS auth_codes_email_created_idx
  ON auth_codes (email, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token_hash);

CREATE TABLE IF NOT EXISTS project_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  repository_url TEXT NOT NULL,
  website_url TEXT,
  npm_packages TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '[]',
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  open_issues INTEGER NOT NULL DEFAULT 0,
  github_views_14d INTEGER,
  github_clones_14d INTEGER,
  npm_downloads_30d INTEGER NOT NULL DEFAULT 0,
  latest_version TEXT,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  response_time_ms INTEGER,
  pushed_at TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  collected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS project_snapshots_slug_collected_idx
  ON project_snapshots (slug, collected_at DESC);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  project_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS sync_runs_started_idx ON sync_runs (started_at DESC);

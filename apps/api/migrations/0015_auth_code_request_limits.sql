CREATE TABLE IF NOT EXISTS auth_code_requests (
  id TEXT PRIMARY KEY NOT NULL,
  identity_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_code_requests_identity_created_idx
  ON auth_code_requests (identity_hash, created_at);

CREATE INDEX IF NOT EXISTS auth_code_requests_expires_idx
  ON auth_code_requests (expires_at);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  identity TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  succeeded INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_attempts_identity_created_idx
  ON auth_attempts (identity, created_at);

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT NOT NULL DEFAULT '[]',
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  id TEXT PRIMARY KEY NOT NULL,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL,
  owner_email TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE INDEX IF NOT EXISTS passkey_challenges_expires_idx
  ON passkey_challenges (expires_at);

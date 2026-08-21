CREATE TABLE IF NOT EXISTS feedback_items (
  id TEXT PRIMARY KEY NOT NULL,
  project_slug TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('idea', 'bug', 'message')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 120),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 20 AND 2000),
  locale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'inbox'
    CHECK (status IN ('inbox', 'under_review', 'planned', 'in_progress', 'shipped', 'closed')),
  moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0, 1)),
  vote_count INTEGER NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  contact_email TEXT,
  diagnostic_report TEXT,
  source TEXT NOT NULL CHECK (source IN ('android', 'ios', 'website')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (type = 'idea' OR is_public = 0)
);

CREATE INDEX feedback_items_public_feed
  ON feedback_items (project_slug, type, moderation_status, is_public, status);

CREATE INDEX feedback_items_admin_board
  ON feedback_items (project_slug, status, updated_at);

CREATE TABLE IF NOT EXISTS feedback_votes (
  item_id TEXT NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, voter_hash)
);

CREATE INDEX feedback_votes_voter ON feedback_votes (voter_hash, item_id);

CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  key_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (key_hash, action, window_start)
);

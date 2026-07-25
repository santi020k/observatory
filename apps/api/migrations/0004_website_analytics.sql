CREATE TABLE IF NOT EXISTS website_analytics_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  hostname TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  page_views INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  sample_interval REAL NOT NULL DEFAULT 1,
  collected_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS website_analytics_slug_period_idx
  ON website_analytics_snapshots (slug, period_start);

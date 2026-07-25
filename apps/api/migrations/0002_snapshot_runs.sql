ALTER TABLE project_snapshots ADD COLUMN sync_run_id TEXT
  REFERENCES sync_runs (id);

UPDATE project_snapshots
SET sync_run_id = (
  SELECT id
  FROM sync_runs
  WHERE sync_runs.started_at = project_snapshots.collected_at
    AND sync_runs.status = 'succeeded'
  LIMIT 1
);

CREATE INDEX IF NOT EXISTS project_snapshots_sync_run_idx
  ON project_snapshots (sync_run_id);

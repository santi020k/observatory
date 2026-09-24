CREATE TABLE `release_asset_snapshots` (
  `asset_id` text NOT NULL,
  `asset_name` text NOT NULL,
  `channel` text NOT NULL,
  `collected_at` integer NOT NULL,
  `downloads` integer DEFAULT 0 NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `release_tag` text NOT NULL,
  `repository` text NOT NULL,
  `slug` text NOT NULL,
  `sync_run_id` text REFERENCES `sync_runs` (`id`)
);

CREATE INDEX `release_asset_snapshots_collected_idx`
ON `release_asset_snapshots` (`collected_at`);

CREATE INDEX `release_asset_snapshots_slug_collected_idx`
ON `release_asset_snapshots` (`slug`, `collected_at`);

CREATE UNIQUE INDEX `release_asset_snapshots_asset_run_idx`
ON `release_asset_snapshots` (`repository`, `asset_id`, `sync_run_id`);

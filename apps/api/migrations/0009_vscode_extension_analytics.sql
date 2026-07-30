CREATE TABLE IF NOT EXISTS `vscode_extension_snapshots` (
  `collected_at` integer NOT NULL,
  `downloads` integer DEFAULT 0 NOT NULL,
  `extension_id` text NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `installs` integer DEFAULT 0 NOT NULL,
  `last_updated` text NOT NULL,
  `provider` text NOT NULL,
  `rating` real,
  `review_count` integer DEFAULT 0 NOT NULL,
  `slug` text NOT NULL,
  `sync_run_id` text REFERENCES `sync_runs` (`id`),
  `update_count` integer DEFAULT 0 NOT NULL,
  `version` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `vscode_extension_snapshots_collected_idx`
ON `vscode_extension_snapshots` (`collected_at`);

CREATE INDEX IF NOT EXISTS `vscode_extension_snapshots_slug_collected_idx`
ON `vscode_extension_snapshots` (`slug`, `collected_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `vscode_extension_snapshots_provider_extension_run_idx`
ON `vscode_extension_snapshots` (`provider`, `extension_id`, `sync_run_id`);

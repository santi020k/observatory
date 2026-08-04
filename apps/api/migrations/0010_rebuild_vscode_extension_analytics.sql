CREATE TABLE `vscode_extension_snapshots_v2` (
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

INSERT INTO `vscode_extension_snapshots_v2` (
  `collected_at`,
  `downloads`,
  `extension_id`,
  `id`,
  `installs`,
  `last_updated`,
  `provider`,
  `rating`,
  `review_count`,
  `slug`,
  `sync_run_id`,
  `update_count`,
  `version`
)
SELECT
  `collected_at`,
  `downloads`,
  `extension_id`,
  `id`,
  `installs`,
  `last_updated`,
  'vscode-marketplace',
  `rating`,
  0,
  `slug`,
  `sync_run_id`,
  `update_count`,
  `version`
FROM `vscode_extension_snapshots`;

DROP TABLE `vscode_extension_snapshots`;

ALTER TABLE `vscode_extension_snapshots_v2`
RENAME TO `vscode_extension_snapshots`;

CREATE INDEX `vscode_extension_snapshots_collected_idx`
ON `vscode_extension_snapshots` (`collected_at`);

CREATE INDEX `vscode_extension_snapshots_slug_collected_idx`
ON `vscode_extension_snapshots` (`slug`, `collected_at`);

CREATE UNIQUE INDEX `vscode_extension_snapshots_provider_extension_run_idx`
ON `vscode_extension_snapshots` (`provider`, `extension_id`, `sync_run_id`);

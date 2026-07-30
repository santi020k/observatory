CREATE TABLE IF NOT EXISTS `npm_download_snapshots` (
  `collected_at` integer NOT NULL,
  `downloads` integer DEFAULT 0 NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `package_name` text NOT NULL,
  `period_start` integer NOT NULL,
  `slug` text NOT NULL
);

CREATE INDEX IF NOT EXISTS `npm_download_snapshots_period_idx`
ON `npm_download_snapshots` (`period_start`);

CREATE INDEX IF NOT EXISTS `npm_download_snapshots_slug_period_idx`
ON `npm_download_snapshots` (`slug`, `period_start`);

CREATE UNIQUE INDEX IF NOT EXISTS `npm_download_snapshots_package_period_idx`
ON `npm_download_snapshots` (`package_name`, `period_start`);

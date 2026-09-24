CREATE TABLE `store_metric_points` (
  `app_slug` text NOT NULL,
  `collected_at` integer NOT NULL,
  `dimension` text NOT NULL,
  `dimension_value` text NOT NULL,
  `id` text PRIMARY KEY NOT NULL,
  `metric` text NOT NULL,
  `period_start` integer NOT NULL,
  `provider` text NOT NULL,
  `source` text NOT NULL,
  `value` real NOT NULL
);

CREATE INDEX `store_metric_points_app_period_idx`
ON `store_metric_points` (`app_slug`, `period_start`);

CREATE INDEX `store_metric_points_provider_period_idx`
ON `store_metric_points` (`provider`, `period_start`);

CREATE UNIQUE INDEX `store_metric_points_fact_idx`
ON `store_metric_points` (
  `app_slug`,
  `provider`,
  `period_start`,
  `metric`,
  `dimension`,
  `dimension_value`
);

CREATE TABLE `store_sync_runs` (
  `app_slug` text NOT NULL,
  `completed_at` integer,
  `error_code` text,
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `records` integer DEFAULT 0 NOT NULL,
  `started_at` integer NOT NULL,
  `status` text NOT NULL
);

CREATE INDEX `store_sync_runs_app_provider_started_idx`
ON `store_sync_runs` (`app_slug`, `provider`, `started_at`);

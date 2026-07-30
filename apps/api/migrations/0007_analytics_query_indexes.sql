CREATE INDEX IF NOT EXISTS `project_snapshots_visibility_collected_idx`
ON `project_snapshots` (`visibility`, `collected_at`);

CREATE INDEX IF NOT EXISTS `website_analytics_period_idx`
ON `website_analytics_snapshots` (`period_start`);

ALTER TABLE project_preferences
ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

ALTER TABLE project_preferences
ADD COLUMN attention_mode TEXT NOT NULL DEFAULT 'all';

ALTER TABLE project_preferences
ADD COLUMN website_analytics_enabled INTEGER NOT NULL DEFAULT 1;

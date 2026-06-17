-- Phase 5: reports filed by external viewers against public recipe links.
-- (shared_recipes already has is_active/revoked_at/flagged_count from Phase 1.)
CREATE TABLE IF NOT EXISTS content_reports (
  id               CHAR(36)     NOT NULL,
  shared_recipe_id CHAR(36)     NULL,
  token            VARCHAR(64)  NULL,
  reason           VARCHAR(512) NOT NULL DEFAULT '',
  reporter_ip      VARCHAR(64)  NULL,
  status           VARCHAR(16)  NOT NULL DEFAULT 'open',  -- open | resolved
  created_at       DATETIME     NOT NULL,
  resolved_at      DATETIME     NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY content_reports_status_idx (status),
  KEY content_reports_share_idx (shared_recipe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

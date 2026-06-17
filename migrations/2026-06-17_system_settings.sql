-- Phase 4: global key/value system settings (e.g. the active AI model, set from
-- the admin UI without a redeploy). Idempotent.

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key   VARCHAR(64) NOT NULL,
  setting_value TEXT        NULL,
  updated_at    DATETIME    NOT NULL,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

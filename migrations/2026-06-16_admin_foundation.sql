-- Admin area foundation (Phase 1): RBAC, subscription tiers, user subscriptions,
-- monthly usage ledger, AI job logs, admin audit log, and public-link moderation
-- fields. Idempotent (MariaDB IF NOT EXISTS on columns + CREATE TABLE IF NOT EXISTS
-- + INSERT IGNORE on the seed). Apply to existing databases; schema.sql carries the
-- same definitions for fresh installs.
--
-- Convention: max_* columns are NULL = unlimited, an integer = the monthly cap.

SET FOREIGN_KEY_CHECKS = 0;

-- 1. RBAC + moderation/impersonation columns on existing tables --------------
ALTER TABLE users          ADD COLUMN IF NOT EXISTS is_admin     TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users          ADD COLUMN IF NOT EXISTS suspended_at DATETIME   NULL DEFAULT NULL;
ALTER TABLE sessions       ADD COLUMN IF NOT EXISTS impersonated_by CHAR(36) NULL DEFAULT NULL;
ALTER TABLE shared_recipes ADD COLUMN IF NOT EXISTS is_active     TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE shared_recipes ADD COLUMN IF NOT EXISTS revoked_at    DATETIME   NULL DEFAULT NULL;
ALTER TABLE shared_recipes ADD COLUMN IF NOT EXISTS flagged_count INT        NOT NULL DEFAULT 0;

-- 2. Subscription tiers ------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id                    CHAR(36)      NOT NULL,
  tier_name             VARCHAR(64)   NOT NULL,
  monthly_cost          DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_recipes           INT           NULL DEFAULT NULL,   -- NULL = unlimited
  max_url_imports       INT           NULL DEFAULT NULL,   -- per month; NULL = unlimited
  max_image_scans       INT           NULL DEFAULT NULL,   -- per month; NULL = unlimited
  multi_device_enabled  TINYINT(1)    NOT NULL DEFAULT 1,
  kitchen_mode_enabled  TINYINT(1)    NOT NULL DEFAULT 1,
  planner_enabled       TINYINT(1)    NOT NULL DEFAULT 1,
  shopping_list_enabled TINYINT(1)    NOT NULL DEFAULT 1,
  pantry_match_enabled  TINYINT(1)    NOT NULL DEFAULT 1,
  is_default            TINYINT(1)    NOT NULL DEFAULT 0,   -- tier assigned to new/free users
  position              INT           NOT NULL DEFAULT 0,
  created_at            DATETIME      NOT NULL,
  updated_at            DATETIME      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY subscription_tiers_name_unique (tier_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. User subscriptions (one row per user) -----------------------------------
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                   CHAR(36)     NOT NULL,
  user_id              CHAR(36)     NOT NULL,
  tier_id              CHAR(36)     NOT NULL,
  status               VARCHAR(32)  NOT NULL DEFAULT 'active', -- active|canceled|past_due|gifted
  current_period_start DATETIME     NULL DEFAULT NULL,
  current_period_end   DATETIME     NULL DEFAULT NULL,
  stripe_customer_id   VARCHAR(255) NULL DEFAULT NULL,         -- billing ref (unused until Stripe)
  created_at           DATETIME     NOT NULL,
  updated_at           DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY user_subscriptions_user_unique (user_id),
  KEY user_subscriptions_tier_idx (tier_id),
  CONSTRAINT user_subscriptions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_subscriptions_tier_fk FOREIGN KEY (tier_id) REFERENCES subscription_tiers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Monthly usage ledger (one row per user per period) ----------------------
CREATE TABLE IF NOT EXISTS usage_ledger (
  id                CHAR(36) NOT NULL,
  user_id           CHAR(36) NOT NULL,
  period_start      DATE     NOT NULL,             -- first day of the tracked month (UTC)
  url_imports_count INT      NOT NULL DEFAULT 0,
  image_scans_count INT      NOT NULL DEFAULT 0,
  reset_date        DATE     NOT NULL,             -- when counters roll over
  created_at        DATETIME NOT NULL,
  updated_at        DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY usage_ledger_user_period_unique (user_id, period_start),
  CONSTRAINT usage_ledger_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. AI job logs (one row per extraction attempt) ----------------------------
CREATE TABLE IF NOT EXISTS ai_job_logs (
  id            CHAR(36)      NOT NULL,
  user_id       CHAR(36)      NULL,                -- SET NULL if user removed; keep cost record
  job_type      VARCHAR(16)   NOT NULL,            -- url | image
  status        VARCHAR(16)   NOT NULL,            -- success | failed
  tokens_used   INT           NOT NULL DEFAULT 0,
  cost          DECIMAL(12,6) NOT NULL DEFAULT 0,
  model         VARCHAR(64)   NOT NULL DEFAULT '',
  error_message TEXT          NULL,
  created_at    DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY ai_job_logs_user_idx (user_id),
  KEY ai_job_logs_created_idx (created_at),
  CONSTRAINT ai_job_logs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Admin audit log (admin actions + unauthorized-access security alerts) ----
-- No FK on admin_user_id: it also records attempts by non-admins and survives user deletion.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            CHAR(36)    NOT NULL,
  admin_user_id CHAR(36)    NULL,
  action        VARCHAR(64) NOT NULL,
  target_type   VARCHAR(64) NULL,
  target_id     VARCHAR(64) NULL,
  detail        TEXT        NULL,
  ip            VARCHAR(64) NULL,
  created_at    DATETIME    NOT NULL,
  PRIMARY KEY (id),
  KEY admin_audit_log_admin_idx (admin_user_id),
  KEY admin_audit_log_action_idx (action),
  KEY admin_audit_log_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Seed default tiers (idempotent via the unique tier_name) -----------------
INSERT IGNORE INTO subscription_tiers
  (id, tier_name, monthly_cost, max_recipes, max_url_imports, max_image_scans,
   multi_device_enabled, kitchen_mode_enabled, planner_enabled, shopping_list_enabled,
   pantry_match_enabled, is_default, position, created_at, updated_at)
VALUES
  (UUID(), 'Free', 0.00,   25,   10,    5, 0, 1, 1, 1, 0, 1, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()),
  (UUID(), 'Pro',  4.99, NULL, NULL, NULL, 1, 1, 1, 1, 1, 0, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP());

SET FOREIGN_KEY_CHECKS = 1;

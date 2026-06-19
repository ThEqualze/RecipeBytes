-- Phase 7: global announcement bar. A typed, schedulable, dismissible banner shown
-- in the authenticated app and on the login page. The single newest currently-active
-- row is the one shown. Idempotent.
-- created_at/updated_at use microsecond precision so rows created in the same second
-- still order deterministically (newest-active-wins / hidden_by_newer).

CREATE TABLE IF NOT EXISTS announcements (
  id          CHAR(36)     NOT NULL,
  message     VARCHAR(280) NOT NULL,
  type        ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  link_label  VARCHAR(60)  NULL,
  link_url    VARCHAR(500) NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  starts_at   DATETIME     NULL,
  ends_at     DATETIME     NULL,
  created_by  CHAR(36)     NULL,
  created_at  DATETIME(6)  NOT NULL,
  updated_at  DATETIME(6)  NOT NULL,
  PRIMARY KEY (id),
  KEY idx_active_window (is_active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

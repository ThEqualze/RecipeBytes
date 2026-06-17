-- Phase 2c: password reset tokens. Only a SHA-256 hash of the token is stored,
-- never the raw token. Idempotent.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,           -- sha256 hex of the raw token
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY prt_token_hash_unique (token_hash),
  KEY prt_user_idx (user_id),
  CONSTRAINT prt_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

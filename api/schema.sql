SET FOREIGN_KEY_CHECKS = 0;

-- users (replaces auth.users) -------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36)     NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sessions ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token      CHAR(64)  NOT NULL,
  user_id    CHAR(36)  NOT NULL,
  created_at DATETIME  NOT NULL,
  expires_at DATETIME  NOT NULL,
  PRIMARY KEY (token),
  KEY sessions_user_id_idx (user_id),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- profiles ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id                  CHAR(36)     NOT NULL,
  display_name        VARCHAR(255) NOT NULL DEFAULT '',
  avatar_url          VARCHAR(1024) NOT NULL DEFAULT '',
  default_unit_system VARCHAR(20)  NOT NULL DEFAULT 'imperial',
  created_at          DATETIME     NOT NULL,
  updated_at          DATETIME     NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT profiles_user_fk FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- folders ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS folders (
  id         CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  parent_id  CHAR(36)     NULL,
  name       VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  icon       VARCHAR(64)  NOT NULL DEFAULT 'folder',
  position   INT          NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL,
  updated_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY folders_user_id_idx (user_id),
  KEY folders_parent_id_idx (parent_id),
  CONSTRAINT folders_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT folders_parent_fk FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- tags -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id         CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  name       VARCHAR(255) NOT NULL,
  color      VARCHAR(32)  NOT NULL DEFAULT '#64748b',
  category   VARCHAR(64)  NOT NULL DEFAULT 'custom',
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY tags_user_name_unique (user_id, name),
  KEY tags_user_id_idx (user_id),
  CONSTRAINT tags_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- recipes ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
  id                 CHAR(36)      NOT NULL,
  user_id            CHAR(36)      NOT NULL,
  folder_id          CHAR(36)      NULL,
  title              VARCHAR(512)  NOT NULL DEFAULT 'Untitled Recipe',
  description        TEXT          NOT NULL,
  source_type        VARCHAR(32)   NOT NULL DEFAULT 'manual',
  source_url         VARCHAR(2048) NOT NULL DEFAULT '',
  source_author      VARCHAR(512)  NOT NULL DEFAULT '',
  cover_image_url    VARCHAR(2048) NOT NULL DEFAULT '',
  yield_amount       DECIMAL(10,2) NOT NULL DEFAULT 1,
  yield_unit         VARCHAR(64)   NOT NULL DEFAULT 'servings',
  prep_time_minutes  INT           NOT NULL DEFAULT 0,
  cook_time_minutes  INT           NOT NULL DEFAULT 0,
  total_time_minutes INT           NOT NULL DEFAULT 0,
  notes              TEXT          NOT NULL,
  is_favorite        TINYINT(1)    NOT NULL DEFAULT 0,
  status             VARCHAR(32)   NOT NULL DEFAULT 'active',
  last_cooked_at     DATETIME      NULL,
  created_at         DATETIME      NOT NULL,
  updated_at         DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY recipes_user_id_idx (user_id),
  KEY recipes_folder_id_idx (folder_id),
  KEY recipes_status_idx (status),
  CONSTRAINT recipes_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT recipes_folder_fk FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ingredients ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ingredients (
  id         CHAR(36)      NOT NULL,
  recipe_id  CHAR(36)      NOT NULL,
  position   INT           NOT NULL DEFAULT 0,
  group_name VARCHAR(255)  NOT NULL DEFAULT '',
  quantity   DECIMAL(10,2) NULL,
  unit       VARCHAR(64)   NOT NULL DEFAULT '',
  name       VARCHAR(512)  NOT NULL DEFAULT '',
  prep_note  VARCHAR(512)  NOT NULL DEFAULT '',
  raw_text   TEXT          NOT NULL,
  created_at DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY ingredients_recipe_id_idx (recipe_id),
  CONSTRAINT ingredients_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- instructions -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS instructions (
  id            CHAR(36)     NOT NULL,
  recipe_id     CHAR(36)     NOT NULL,
  position      INT          NOT NULL DEFAULT 0,
  step_number   INT          NOT NULL DEFAULT 1,
  group_name    VARCHAR(255) NOT NULL DEFAULT '',
  content       TEXT         NOT NULL,
  timer_seconds INT          NULL,
  created_at    DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY instructions_recipe_id_idx (recipe_id),
  CONSTRAINT instructions_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- recipe_tags ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id  CHAR(36) NOT NULL,
  tag_id     CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  KEY recipe_tags_tag_id_idx (tag_id),
  CONSTRAINT recipe_tags_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT recipe_tags_tag_fk FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- extraction_jobs --------------------------------------------------------
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id             CHAR(36)      NOT NULL,
  user_id        CHAR(36)      NOT NULL,
  source_url     VARCHAR(2048) NOT NULL,
  source_type    VARCHAR(32)   NOT NULL DEFAULT 'other',
  status         VARCHAR(32)   NOT NULL DEFAULT 'pending',
  raw_transcript TEXT          NOT NULL,
  raw_ocr_text   TEXT          NOT NULL,
  extracted_data JSON          NOT NULL,
  thumbnail_url  VARCHAR(2048) NOT NULL DEFAULT '',
  recipe_id      CHAR(36)      NULL,
  error_message  TEXT          NOT NULL,
  created_at     DATETIME      NOT NULL,
  updated_at     DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY extraction_jobs_user_id_idx (user_id),
  KEY extraction_jobs_status_idx (status),
  CONSTRAINT extraction_jobs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT extraction_jobs_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- grocery_lists ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS grocery_lists (
  id         CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  name       VARCHAR(255) NOT NULL DEFAULT 'Shopping List',
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL,
  updated_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY grocery_lists_user_id_idx (user_id),
  CONSTRAINT grocery_lists_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- grocery_list_items -----------------------------------------------------
CREATE TABLE IF NOT EXISTS grocery_list_items (
  id              CHAR(36)      NOT NULL,
  grocery_list_id CHAR(36)      NOT NULL,
  recipe_id       CHAR(36)      NULL,
  ingredient_id   CHAR(36)      NULL,
  name            VARCHAR(512)  NOT NULL DEFAULT '',
  quantity        DECIMAL(10,2) NULL,
  unit            VARCHAR(64)   NOT NULL DEFAULT '',
  aisle           VARCHAR(32)   NOT NULL DEFAULT 'other',
  is_checked      TINYINT(1)    NOT NULL DEFAULT 0,
  position        INT           NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL,
  updated_at      DATETIME      NOT NULL,
  PRIMARY KEY (id),
  KEY gli_list_id_idx (grocery_list_id),
  KEY gli_aisle_idx (aisle),
  CONSTRAINT gli_list_fk FOREIGN KEY (grocery_list_id) REFERENCES grocery_lists(id) ON DELETE CASCADE,
  CONSTRAINT gli_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL,
  CONSTRAINT gli_ingredient_fk FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- shared_recipes ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS shared_recipes (
  id         CHAR(36)     NOT NULL,
  recipe_id  CHAR(36)     NOT NULL,
  user_id    CHAR(36)     NOT NULL,
  token      VARCHAR(64)  NOT NULL,
  message    VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY shared_recipes_token_unique (token),
  KEY shared_recipes_user_id_idx (user_id),
  KEY shared_recipes_recipe_id_idx (recipe_id),
  CONSTRAINT shared_recipes_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT shared_recipes_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- meal_plans -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meal_plans (
  id           CHAR(36)    NOT NULL,
  user_id      CHAR(36)    NOT NULL,
  recipe_id    CHAR(36)    NOT NULL,
  planned_date DATE        NOT NULL,
  meal_type    VARCHAR(16) NOT NULL,
  position     INT         NOT NULL DEFAULT 0,
  created_at   DATETIME    NOT NULL,
  PRIMARY KEY (id),
  KEY meal_plans_user_date_idx (user_id, planned_date),
  CONSTRAINT meal_plans_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT meal_plans_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  CONSTRAINT meal_plans_meal_type_chk CHECK (meal_type IN ('breakfast','lunch','dinner','snack'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- collections ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collections (
  id              CHAR(36)      NOT NULL,
  user_id         CHAR(36)      NOT NULL,
  title           VARCHAR(512)  NOT NULL,
  description     TEXT          NOT NULL,
  cover_image_url VARCHAR(2048) NOT NULL DEFAULT '',
  is_public       TINYINT(1)    NOT NULL DEFAULT 0,
  share_token     VARCHAR(64)   NULL,
  position        INT           NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL,
  updated_at      DATETIME      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY collections_share_token_unique (share_token),
  KEY collections_user_idx (user_id),
  CONSTRAINT collections_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- collection_recipes -----------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_recipes (
  id            CHAR(36) NOT NULL,
  collection_id CHAR(36) NOT NULL,
  recipe_id     CHAR(36) NOT NULL,
  position      INT      NOT NULL DEFAULT 0,
  added_at      DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY collection_recipes_unique (collection_id, recipe_id),
  KEY collection_recipes_collection_idx (collection_id),
  CONSTRAINT cr_collection_fk FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
  CONSTRAINT cr_recipe_fk FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

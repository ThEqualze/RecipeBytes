# Migration Plan 1: Backend Foundation & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the self-hosted backend foundation for RecipeBytes — git connected to the existing remote, the full MySQL schema, a dependency-free PHP API skeleton, working email/password auth, and the centralised ownership-check layer that replaces Supabase Row-Level Security.

**Architecture:** A single front-controller PHP router (`api/index.php`) dispatches `METHOD /path` to handler files. Auth uses bcrypt password hashing plus an `httpOnly` session-cookie backed by a `sessions` table. All data access goes through PDO prepared statements. Every authenticated query is scoped to the session user; a central ownership helper enforces this. Tests are dependency-free PHP scripts that hit the running API over HTTP via curl.

**Tech Stack:** PHP 8.x (no Composer), MySQL/MariaDB (InnoDB), PDO, Apache `.htaccess`. Local dev uses the PHP built-in server (`php -S`) and a local MySQL/MariaDB.

**Spec:** `docs/superpowers/specs/2026-06-07-supabase-to-php-mysql-migration-design.md`

---

## File Structure (created in this plan)

```
api/
  index.php              Front controller / router
  config.example.php     Committed template (no real creds)
  config.php             Real creds — gitignored, requires file above webroot
  db.php                 PDO singleton
  auth.php               current_user(), require_auth(), session create/destroy
  lib/
    response.php         json_ok(), json_error(), read_json_body()
    uuid.php             uuid4()
    ownership.php        require_owner(), owned_query helpers
  routes/
    auth.php             signup / login / logout / session handlers
  schema.sql             Full MySQL schema (15 tables)
router.php               Local dev-server front controller (php -S); prod uses .htaccess
tests/
  harness.php            assert + HTTP helpers (curl based)
  run.php                Test runner (includes all test_*.php)
  test_auth.php          Auth + session tests
  test_ownership.php     Cross-user boundary tests (security contract)
.htaccess                SPA fallback + /api passthrough
.env.development         VITE_API_BASE for local dev (gitignored)
```

---

## Task 1: Initialise git and connect to the existing remote

**Files:**
- Create: `.gitignore` (modify existing)
- Create: `api/config.example.php`

**Context:** The working directory is not yet a git repo. The remote `git@github.com:ThEqualze/RecipeBytes.git` "already exists" and may contain commits (e.g. a README). We must inspect before integrating and must NOT force-push.

- [ ] **Step 1: Initialise the local repo and add the remote**

```bash
cd /c/Users/andym/Projects/RecipeBytes
git init
git branch -M main
git remote add origin git@github.com:ThEqualze/RecipeBytes.git
```

- [ ] **Step 2: Inspect what the remote already contains (do NOT push yet)**

```bash
git fetch origin
git log --oneline origin/main 2>/dev/null || echo "remote main is empty"
git ls-tree -r --name-only origin/main 2>/dev/null || echo "no remote files"
```

Expected: either "remote main is empty" (clean slate) or a list of existing files. **Stop and report the result to the user before continuing.** If the remote has commits, the reconciliation approach (merge vs rebase) is a checkpoint decision for the user.

- [ ] **Step 3: Extend `.gitignore` to keep secrets and build output out**

Append to the existing `.gitignore`:

```
# Backend secrets & build
api/config.php
.env.development
.env.production
/dist
```

- [ ] **Step 4: Add a committed credentials template**

Create `api/config.example.php`:

```php
<?php
// Copy to api/config.php (gitignored) on each environment, OR point this to a
// file ABOVE the web root. Real credentials must never be committed.
return [
    'db_host' => '127.0.0.1',
    'db_name' => 'recipebytes',
    'db_user' => 'root',
    'db_pass' => '',
    'db_charset' => 'utf8mb4',
    // Session cookie lifetime in seconds (24 hours)
    'session_ttl' => 60 * 60 * 24,
    // Set true in production (HTTPS) so the cookie is Secure
    'cookie_secure' => false,
];
```

- [ ] **Step 5: First commit (local only — do not push yet)**

```bash
git add -A
git commit -m "chore: initialise repo, gitignore secrets, add config template and migration spec"
```

Expected: commit succeeds. Pushing happens only after Step 2's reconciliation decision with the user.

---

## Task 2: Local dev environment check

**Files:** none (environment verification)

**Context:** All subsequent tasks test against a locally running PHP + MySQL. Confirm the tools exist before writing code.

- [ ] **Step 1: Verify PHP and MySQL clients are available**

```bash
php --version
php -m | grep -E "pdo_mysql|curl|json"
mysql --version
```

Expected: PHP 8.x; `pdo_mysql`, `curl`, `json` all listed; a MySQL/MariaDB client. If `pdo_mysql` or `curl` is missing, stop and report — they are required.

- [ ] **Step 2: Create the local database and a real config**

```bash
mysql -u root -e "CREATE DATABASE IF NOT EXISTS recipebytes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
cp api/config.example.php api/config.php
```

Edit `api/config.php` with your local MySQL user/password. Expected: database `recipebytes` exists; `api/config.php` present (and gitignored).

---

## Task 3: MySQL schema

**Files:**
- Create: `api/schema.sql`

**Context:** Converts the 6 Postgres migrations into one MySQL script. UUIDs become `CHAR(36)` (app-generated). Large free-text fields are `TEXT NOT NULL` with values always supplied by the API (MySQL/MariaDB cannot reliably default TEXT across versions). Short/defaulted strings use `VARCHAR`. Booleans are `TINYINT(1)`. JSON uses `JSON`. All tables InnoDB to support foreign keys + cascades.

- [ ] **Step 1: Write `api/schema.sql`**

```sql
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
```

- [ ] **Step 2: Import the schema and verify all 15 tables exist**

```bash
mysql -u root recipebytes < api/schema.sql
mysql -u root recipebytes -e "SHOW TABLES;" | tail -n +2 | wc -l
```

Expected: `15` tables (users, sessions, profiles, folders, tags, recipes, ingredients, instructions, recipe_tags, extraction_jobs, grocery_lists, grocery_list_items, shared_recipes, meal_plans, collections, collection_recipes — note: that is 16 lines; `wc -l` returns 16). Confirm no SQL errors were printed.

- [ ] **Step 3: Commit**

```bash
git add api/schema.sql
git commit -m "feat(db): add MySQL schema converted from Supabase migrations"
```

---

## Task 4: PHP bootstrap — config, DB, helpers, router

**Files:**
- Create: `api/db.php`, `api/lib/response.php`, `api/lib/uuid.php`, `api/index.php`, `router.php`

**Context:** A minimal front controller. `index.php` computes the path after `/api`, then `include`s the matching route file. Route files call helpers from `lib/`. We add a `GET /api/health` endpoint first so we can test the skeleton end-to-end before auth.

- [ ] **Step 1: Write `api/lib/uuid.php`**

```php
<?php
function uuid4(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
```

- [ ] **Step 2: Write `api/lib/response.php`**

```php
<?php
function json_ok($data = null, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['data' => $data]);
    exit;
}

function json_error(string $message, int $status = 400): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}
```

- [ ] **Step 3: Write `api/db.php`**

```php
<?php
function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $configPath = __DIR__ . '/config.php';
    if (!file_exists($configPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Server config missing']);
        exit;
    }
    $cfg = require $configPath;
    $dsn = "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset={$cfg['db_charset']}";
    $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function app_config(): array {
    return require __DIR__ . '/config.php';
}
```

- [ ] **Step 4: Write `api/index.php` (router) with a health route**

```php
<?php
require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/uuid.php';
require __DIR__ . '/db.php';

// Path after the /api prefix, e.g. "/auth/login"
$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^.*/api#', '', $uri);
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];

// Expose to route files
$GLOBALS['ROUTE_PATH'] = $path;
$GLOBALS['ROUTE_METHOD'] = $method;

try {
    if ($path === '/health') {
        json_ok(['status' => 'ok']);
    }

    if (str_starts_with($path, '/auth')) {
        require __DIR__ . '/routes/auth.php';
        json_error('Not found', 404);
    }

    json_error('Not found', 404);
} catch (Throwable $e) {
    json_error('Server error', 500);
}
```

- [ ] **Step 5: Write `router.php` (dev-server front controller)**

The PHP built-in server (`php -S`) does NOT route sub-paths like `/api/health` to `api/index.php` on its own — it 404s. This tiny router script (used only for local dev; production uses `.htaccess`) forwards `/api/*` to the API front controller and lets the built-in server serve any real static file directly.

```php
<?php
// Local dev front controller for: php -S 127.0.0.1:8000 router.php
// Production does NOT use this file (Apache .htaccess handles routing).
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (preg_match('#^/api(/|$)#', $path)) {
    require __DIR__ . '/api/index.php';
    return true;
}

// Serve an existing static file as-is
$file = __DIR__ . $path;
if ($path !== '/' && is_file($file)) {
    return false;
}

// SPA fallback (only meaningful once the frontend is built into ./index.html)
if (is_file(__DIR__ . '/index.html')) {
    require __DIR__ . '/index.html';
    return true;
}
return false;
```

- [ ] **Step 6: Start the server and verify the health endpoint**

Note: on this machine the MariaDB server (XAMPP) is already running on 127.0.0.1:3306 — do not start a database. Start the PHP dev server with the router script:

```bash
php -S 127.0.0.1:8000 router.php >/tmp/php-server.log 2>&1 &
sleep 1
curl -s http://127.0.0.1:8000/api/health
```

Expected: `{"data":{"status":"ok"}}`

- [ ] **Step 7: Commit**

```bash
git add api/index.php api/db.php api/lib/response.php api/lib/uuid.php router.php
git commit -m "feat(api): add PHP router, PDO connection, response helpers, dev front controller"
```

---

## Task 5: Test harness

**Files:**
- Create: `tests/harness.php`, `tests/run.php`

**Context:** Dependency-free tests. The harness makes HTTP calls to a running API base URL (default `http://127.0.0.1:8000/api`) and asserts on responses. A cookie jar file makes session tests possible. `run.php` resets the DB tables, then includes every `test_*.php`.

- [ ] **Step 1: Write `tests/harness.php`**

```php
<?php
$BASE = getenv('API_BASE') ?: 'http://127.0.0.1:8000/api';
$COOKIE_JAR = sys_get_temp_dir() . '/recipebytes_test_cookies.txt';
$TESTS_RUN = 0;
$TESTS_FAILED = 0;

function api(string $method, string $path, ?array $body = null, bool $useCookies = true): array {
    global $BASE, $COOKIE_JAR;
    $ch = curl_init($BASE . $path);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    if ($useCookies) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $COOKIE_JAR);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $COOKIE_JAR);
    }
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $code, 'json' => json_decode($resp, true)];
}

function reset_cookies(): void {
    global $COOKIE_JAR;
    if (file_exists($COOKIE_JAR)) unlink($COOKIE_JAR);
}

function check(string $label, bool $cond): void {
    global $TESTS_RUN, $TESTS_FAILED;
    $TESTS_RUN++;
    if ($cond) {
        echo "  PASS: $label\n";
    } else {
        $TESTS_FAILED++;
        echo "  FAIL: $label\n";
    }
}
```

- [ ] **Step 2: Write `tests/run.php`**

```php
<?php
require __DIR__ . '/harness.php';

// Reset all data between full test runs (truncate in FK-safe order).
$cfg = require __DIR__ . '/../api/config.php';
$pdo = new PDO(
    "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset={$cfg['db_charset']}",
    $cfg['db_user'], $cfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach (['sessions','users','profiles','folders','tags','recipes','ingredients',
          'instructions','recipe_tags','extraction_jobs','grocery_lists',
          'grocery_list_items','shared_recipes','meal_plans','collections',
          'collection_recipes'] as $t) {
    $pdo->exec("TRUNCATE TABLE `$t`");
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

foreach (glob(__DIR__ . '/test_*.php') as $file) {
    echo "\n== " . basename($file) . " ==\n";
    reset_cookies();
    require $file;
}

echo "\n----------------------------\n";
echo "Ran $TESTS_RUN checks, $TESTS_FAILED failed\n";
exit($TESTS_FAILED > 0 ? 1 : 0);
```

- [ ] **Step 3: Verify the runner executes (no tests yet = 0 failures)**

```bash
php tests/run.php
```

Expected: prints "Ran 0 checks, 0 failed" and exits 0. (Requires the schema imported from Task 3.)

- [ ] **Step 4: Commit**

```bash
git add tests/harness.php tests/run.php
git commit -m "test: add dependency-free HTTP test harness and runner"
```

---

## Task 6: Auth endpoints + session layer

**Files:**
- Create: `api/auth.php`, `api/routes/auth.php`, `tests/test_auth.php`

**Context:** Implements signup/login/logout/session. Session token is 64 hex chars stored in `sessions`; delivered as an `httpOnly` cookie named `rb_session`. `current_user()` resolves the cookie to a user row (or null). Signup creates `users` + `profiles` in a transaction, then logs in.

- [ ] **Step 1: Write the failing test `tests/test_auth.php`**

```php
<?php
// Signup returns the new user and sets a session
reset_cookies();
$email = 'alice_' . bin2hex(random_bytes(4)) . '@example.com';
$r = api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'Alice']);
check('signup returns 200', $r['status'] === 200);
check('signup returns user id', !empty($r['json']['data']['id']));
check('signup returns email', ($r['json']['data']['email'] ?? null) === $email);

// Session endpoint now reports the logged-in user (cookie persisted in jar)
$s = api('GET', '/auth/session');
check('session returns the user', ($s['json']['data']['email'] ?? null) === $email);

// Duplicate email rejected
$dup = api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'Alice2']);
check('duplicate email rejected 409', $dup['status'] === 409);

// Logout clears the session
$out = api('POST', '/auth/logout');
check('logout returns 200', $out['status'] === 200);
$s2 = api('GET', '/auth/session');
check('session is null after logout', ($s2['json']['data'] ?? 'x') === null);

// Login with correct password works
reset_cookies();
$login = api('POST', '/auth/login', ['email' => $email, 'password' => 'secret123']);
check('login returns 200', $login['status'] === 200);

// Login with wrong password rejected
reset_cookies();
$bad = api('POST', '/auth/login', ['email' => $email, 'password' => 'wrong']);
check('bad password rejected 401', $bad['status'] === 401);
```

- [ ] **Step 2: Run it to verify it fails**

```bash
php tests/run.php
```

Expected: FAIL — `/auth/*` routes return 404 / null, so most checks fail.

- [ ] **Step 3: Write `api/auth.php`**

```php
<?php
require_once __DIR__ . '/db.php';

const SESSION_COOKIE = 'rb_session';

function start_session_for(string $userId): string {
    $cfg = app_config();
    $token = bin2hex(random_bytes(32)); // 64 hex chars
    $now = gmdate('Y-m-d H:i:s');
    $exp = gmdate('Y-m-d H:i:s', time() + (int)$cfg['session_ttl']);
    $stmt = db()->prepare(
        'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)'
    );
    $stmt->execute([$token, $userId, $now, $exp]);
    setcookie(SESSION_COOKIE, $token, [
        'expires'  => time() + (int)$cfg['session_ttl'],
        'path'     => '/',
        'httponly' => true,
        'secure'   => (bool)$cfg['cookie_secure'],
        'samesite' => 'Lax',
    ]);
    return $token;
}

function destroy_current_session(): void {
    $token = $_COOKIE[SESSION_COOKIE] ?? null;
    if ($token) {
        db()->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
    }
    setcookie(SESSION_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);
}

function current_user(): ?array {
    $token = $_COOKIE[SESSION_COOKIE] ?? null;
    if (!$token) return null;
    $stmt = db()->prepare(
        'SELECT u.id, u.email, p.display_name
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN profiles p ON p.id = u.id
          WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP()'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function require_auth(): array {
    $u = current_user();
    if (!$u) json_error('Unauthorized', 401);
    return $u;
}
```

- [ ] **Step 4: Write `api/routes/auth.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

if ($path === '/auth/signup' && $method === 'POST') {
    $body = read_json_body();
    $email = trim(strtolower($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $displayName = trim($body['display_name'] ?? '');
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Valid email required', 400);
    if (strlen($password) < 6) json_error('Password must be at least 6 characters', 400);

    $exists = db()->prepare('SELECT 1 FROM users WHERE email = ?');
    $exists->execute([$email]);
    if ($exists->fetch()) json_error('Email already registered', 409);

    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    $hash = password_hash($password, PASSWORD_BCRYPT);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?,?,?,?)')
            ->execute([$id, $email, $hash, $now]);
        $pdo->prepare('INSERT INTO profiles (id, display_name, avatar_url, default_unit_system, created_at, updated_at) VALUES (?,?,?,?,?,?)')
            ->execute([$id, $displayName, '', 'imperial', $now, $now]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        json_error('Could not create account', 500);
    }

    start_session_for($id);
    json_ok(['id' => $id, 'email' => $email, 'display_name' => $displayName]);
}

if ($path === '/auth/login' && $method === 'POST') {
    $body = read_json_body();
    $email = trim(strtolower($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $stmt = db()->prepare('SELECT id, email, password_hash FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_error('Invalid email or password', 401);
    }
    start_session_for($user['id']);
    json_ok(['id' => $user['id'], 'email' => $user['email']]);
}

if ($path === '/auth/logout' && $method === 'POST') {
    destroy_current_session();
    json_ok(['ok' => true]);
}

if ($path === '/auth/session' && $method === 'GET') {
    json_ok(current_user());
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
php tests/run.php
```

Expected: all `test_auth.php` checks PASS; runner exits 0. (Restart the `php -S` server first if it was started before these files existed.)

- [ ] **Step 6: Commit**

```bash
git add api/auth.php api/routes/auth.php tests/test_auth.php
git commit -m "feat(auth): signup, login, logout, session via httpOnly cookie"
```

---

## Task 7: Ownership layer + cross-user boundary tests

**Files:**
- Create: `api/lib/ownership.php`, `tests/test_ownership.php`
- Create (temporary probe route): add a `/recipes` minimal handler block to `api/index.php`

**Context:** This is the security core. `require_owner()` confirms a row in an owner-scoped table belongs to the session user; `require_parent_owner()` confirms ownership through a parent table (for child tables). We prove the contract now with a minimal `recipes` create/list/get so the boundary test is real. The full recipes endpoints come in Plan 2; this is the security skeleton they will reuse.

- [ ] **Step 1: Write `api/lib/ownership.php`**

```php
<?php
require_once __DIR__ . '/../db.php';

// Throws 403/404 unless the row in $table with $id is owned by $userId.
function require_owner(string $table, string $id, string $userId): void {
    $allowed = ['recipes','folders','tags','collections','meal_plans',
                'grocery_lists','extraction_jobs','shared_recipes'];
    if (!in_array($table, $allowed, true)) json_error('Server error', 500);
    $stmt = db()->prepare("SELECT user_id FROM `$table` WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($row['user_id'] !== $userId) json_error('Forbidden', 403);
}

// Confirms a recipe belongs to the user (used by ingredient/instruction/tag routes).
function require_recipe_owner(string $recipeId, string $userId): void {
    require_owner('recipes', $recipeId, $userId);
}
```

- [ ] **Step 2: Add a minimal recipes probe to `api/index.php`**

Insert this block in `api/index.php` immediately before the final `json_error('Not found', 404);`:

```php
    if (str_starts_with($path, '/recipes')) {
        require __DIR__ . '/auth.php';
        require __DIR__ . '/lib/ownership.php';
        $user = require_auth();

        if ($path === '/recipes' && $method === 'GET') {
            $stmt = db()->prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC');
            $stmt->execute([$user['id']]);
            json_ok($stmt->fetchAll());
        }
        if ($path === '/recipes' && $method === 'POST') {
            $body = read_json_body();
            $id = uuid4();
            $now = gmdate('Y-m-d H:i:s');
            $stmt = db()->prepare(
                'INSERT INTO recipes (id, user_id, title, description, notes, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?)'
            );
            $stmt->execute([$id, $user['id'], $body['title'] ?? 'Untitled Recipe', '', '', $now, $now]);
            json_ok(['id' => $id]);
        }
        if (preg_match('#^/recipes/([a-f0-9-]{36})$#', $path, $m) && $method === 'GET') {
            require_owner('recipes', $m[1], $user['id']);
            $stmt = db()->prepare('SELECT * FROM recipes WHERE id = ?');
            $stmt->execute([$m[1]]);
            json_ok($stmt->fetch());
        }
        json_error('Not found', 404);
    }
```

Note: this `recipes` block is an intentionally minimal probe (only `title` is set; all other columns use their schema defaults or empty strings) so the boundary test in this task is real. Plan 2 replaces it with the full recipes CRUD. Do not invent columns beyond those in `api/schema.sql`.

- [ ] **Step 3: Write the boundary test `tests/test_ownership.php`**

```php
<?php
// Two users; each creates a recipe; neither may read the other's.
reset_cookies();
$ea = 'owner_a_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $ea, 'password' => 'secret123', 'display_name' => 'A']);
$ra = api('POST', '/recipes', ['title' => 'A secret recipe']);
$aId = $ra['json']['data']['id'] ?? null;
check('user A created a recipe', !empty($aId));

$listA = api('GET', '/recipes');
check('user A sees exactly 1 recipe', count($listA['json']['data'] ?? []) === 1);

reset_cookies();
$eb = 'owner_b_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $eb, 'password' => 'secret123', 'display_name' => 'B']);

$listB = api('GET', '/recipes');
check('user B sees 0 recipes (isolation)', count($listB['json']['data'] ?? []) === 0);

$crossGet = api('GET', "/recipes/$aId");
check('user B forbidden from A recipe (403)', $crossGet['status'] === 403);

// Unauthenticated cannot list recipes
reset_cookies();
$anon = api('GET', '/recipes');
check('anonymous cannot list recipes (401)', $anon['status'] === 401);
```

- [ ] **Step 4: Run tests to verify the security contract passes**

```bash
# The PHP built-in server reloads route files per request, so no restart is
# normally needed. If the server is not already running, start it:
#   php -S 127.0.0.1:8000 router.php >/tmp/php-server.log 2>&1 &
php tests/run.php
```

Expected: all checks PASS, including the four isolation checks; runner exits 0.

- [ ] **Step 5: Commit**

```bash
git add api/lib/ownership.php api/index.php tests/test_ownership.php
git commit -m "feat(api): ownership layer + cross-user isolation tests (RLS replacement)"
```

---

## Task 8: `.htaccess` and local Vite proxy

**Files:**
- Create: `.htaccess`, `vite.config.ts` (modify), `.env.development`

**Context:** On 20i (Apache/LiteSpeed), the `.htaccess` must (a) let real `/api/*` requests reach PHP, (b) serve real static files as-is, and (c) fall back all other paths to `index.html` so deep links like `/r/{token}` work. Locally, Vite proxies `/api` to the PHP server so the frontend (Plan 3) can talk to it during development.

- [ ] **Step 1: Write `.htaccess`**

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Let real files and the /api backend be served directly
  RewriteCond %{REQUEST_URI} ^/api/ [OR]
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # SPA fallback: everything else serves the app shell
  RewriteRule ^ index.html [L]
</IfModule>
```

- [ ] **Step 2: Add the dev proxy to `vite.config.ts`**

Replace the contents of `vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
```

- [ ] **Step 3: Add `.env.development`**

```
VITE_API_BASE=/api
```

- [ ] **Step 4: Verify the proxy path resolves (frontend build still compiles)**

```bash
npm run typecheck
```

Expected: PASS (no type errors introduced; this task only touches config).

- [ ] **Step 5: Commit**

```bash
git add .htaccess vite.config.ts .env.development
git commit -m "chore: add SPA .htaccess and local Vite proxy to PHP API"
```

---

## Self-Review Notes

- **Spec §4 (DB conversion):** Task 3 implements all 15 tables with the documented type mapping (UUID→CHAR(36), timestamptz→DATETIME, numeric→DECIMAL, jsonb→JSON, boolean→TINYINT, pg_trgm dropped). ✓
- **Spec §3 (Auth) / §5 (Auth context shape):** Task 6 implements signup/login/logout/session with httpOnly cookie + sessions table; signup creates profile (trigger replacement). ✓
- **Spec §6 (Security):** Task 7 centralises ownership and proves cross-user isolation with tests. ✓
- **Spec §9 (Structure):** File layout matches. ✓
- **Spec §10 (Testing):** Dependency-free harness (Task 5) + boundary tests (Task 7). ✓
- **Spec §12 (Git):** Task 1 connects the remote, inspects before pushing, never force-pushes. ✓
- **Deferred to Plan 2:** full recipes CRUD (the Task 7 recipes block is an intentionally minimal probe to make the security test real), and all other resource endpoints.
- **Deferred to Plan 3:** all frontend changes, build, and 20i upload.
- **Note for executor:** the Task 7 `recipes` POST block is a minimal probe (sets only `title`); it is replaced by the full recipes CRUD in Plan 2. Use only columns defined in `api/schema.sql`.
```

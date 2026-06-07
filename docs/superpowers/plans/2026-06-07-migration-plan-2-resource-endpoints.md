# Migration Plan 2: Resource Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full set of authenticated resource endpoints (recipes, folders, tags, recipe-tags, extraction jobs, grocery list, meal plans, collections, sharing, pantry, public views, seed) on top of the Plan 1 foundation, with per-parent ownership enforcement and correct JSON serialization, so the frontend (Plan 3) can talk to it 1:1.

**Architecture:** `api/index.php` becomes a thin prefix dispatcher that includes one route file per resource under `api/routes/`. All authenticated routes derive `user_id` from the session and enforce ownership through a shared `owned_or_404()` / `require_child_owner()` helper layer. A `serialize()` helper casts DB string columns to the booleans/numbers/JSON the frontend types expect. Public (anonymous) routes expose only shared recipes (no instructions) and public collections.

**Tech Stack:** PHP 8.2 (no Composer), MariaDB 10.4 (XAMPP local), PDO prepared statements. Same dependency-free HTTP test harness as Plan 1 (`php tests/run.php`).

**Builds on:** `docs/superpowers/plans/2026-06-07-migration-plan-1-backend-foundation-and-auth.md` (DONE). **Spec:** `docs/superpowers/specs/2026-06-07-supabase-to-php-mysql-migration-design.md`.

## Local environment reminders (Windows + XAMPP)
- MariaDB must be running: `C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini` (start in background if not up). Client: `/c/xampp/mysql/bin/mysql.exe -u root -h 127.0.0.1 recipebytes`.
- API dev server: `php -S 127.0.0.1:8000 router.php` (reloads route files per request — no restart needed when adding `api/routes/*.php`).
- Run tests: `php tests/run.php` (truncates all tables, includes every `tests/test_*.php`). All Plan 1 tests (15) must keep passing.
- Do NOT `git push` unless explicitly told. Commit after each task.

## Design decisions locked for this plan
- **CSRF:** the API is same-origin with a `SameSite=Lax` session cookie. Lax already blocks cross-site cookie-bearing POST/PUT/DELETE, which is sufficient CSRF protection for a same-origin SPA. **No separate CSRF token in v1.** (Revisit only if the API is ever served cross-origin.)
- **Session GC:** opportunistic — `start_session_for()` deletes expired sessions ~1% of calls (cheap, no cron needed on shared hosting).
- **JSON columns (MariaDB):** `extraction_jobs.extracted_data` has an auto `json_valid()` CHECK — always insert valid JSON (`'{}'`), never `''`.
- **Serialization:** every row returned to the client is passed through `serialize($table, $row)` so booleans/numbers/JSON match `src/lib/database.types.ts`.

---

## File Structure (created/modified in this plan)

```
api/
  index.php              MODIFY: replace inline /recipes probe with a prefix dispatcher
  lib/
    ownership.php        MODIFY: add owned_or_404(), require_child_owner()
    serialize.php        CREATE: serialize($table,$row) column-type casting
  routes/
    recipes.php          CREATE: recipes CRUD + nested children + share + resolve token
    folders.php          CREATE
    tags.php             CREATE
    recipe_tags.php      CREATE
    extraction_jobs.php  CREATE (read-only list)
    grocery.php          CREATE: /grocery-list active list + items
    meal_plans.php       CREATE
    collections.php      CREATE: collections + collection_recipes
    pantry.php           CREATE: /pantry/ingredients
    public.php           CREATE: /public/recipes/{token}  (collections deferred — no FE consumer)
  auth.php               MODIFY: add opportunistic expired-session GC
tests/
  test_folders.php  test_tags.php  test_recipes.php  test_recipe_tags.php
  test_grocery.php  test_meal_plans.php  test_collections.php
  test_sharing_public.php  test_pantry.php
```

---

## Task 1: Shared layer — serializer, ownership helpers, prefix dispatcher

**Files:**
- Create: `api/lib/serialize.php`
- Modify: `api/lib/ownership.php`, `api/index.php`, `api/auth.php`

**Context:** Plan 1 left a minimal `/recipes` probe inline in `index.php` and an ownership helper that only covers tables with a direct `user_id`. Before adding 11 route files we centralise three things: (1) a serializer so JSON types match the frontend, (2) ownership helpers including parent-derived checks for child tables, (3) a prefix dispatcher in `index.php`. The recipes probe is REMOVED from `index.php` (its behaviour is reimplemented fully in `routes/recipes.php` in Task 4). After this task the Plan 1 test suite must still pass — `test_ownership.php` exercises `/recipes`, so Task 1 and Task 4 are validated together; to keep Task 1 self-contained we temporarily keep a `/recipes` route by creating a minimal `routes/recipes.php` here and expanding it in Task 4.

- [ ] **Step 1: Create `api/lib/serialize.php`**

```php
<?php
// Casts DB string columns to the booleans/numbers/JSON the frontend expects.
// Column type maps per table; anything not listed stays a string (or null).
function serialize_row(string $table, ?array $row): ?array {
    if ($row === null) return null;

    static $bool = [
        'recipes' => ['is_favorite'],
        'grocery_lists' => ['is_active'],
        'grocery_list_items' => ['is_checked'],
        'collections' => ['is_public'],
    ];
    static $int = [
        'folders' => ['position'],
        'recipes' => ['prep_time_minutes', 'cook_time_minutes', 'total_time_minutes'],
        'ingredients' => ['position'],
        'instructions' => ['position', 'step_number', 'timer_seconds'],
        'grocery_list_items' => ['position'],
        'meal_plans' => ['position'],
        'collections' => ['position'],
    ];
    static $float = [
        'recipes' => ['yield_amount'],
        'ingredients' => ['quantity'],
        'grocery_list_items' => ['quantity'],
    ];
    static $json = [
        'extraction_jobs' => ['extracted_data'],
    ];

    foreach ($bool[$table] ?? [] as $c) {
        if (array_key_exists($c, $row) && $row[$c] !== null) $row[$c] = (bool)(int)$row[$c];
    }
    foreach ($int[$table] ?? [] as $c) {
        if (array_key_exists($c, $row) && $row[$c] !== null) $row[$c] = (int)$row[$c];
    }
    foreach ($float[$table] ?? [] as $c) {
        if (array_key_exists($c, $row) && $row[$c] !== null) $row[$c] = (float)$row[$c];
    }
    foreach ($json[$table] ?? [] as $c) {
        if (array_key_exists($c, $row) && is_string($row[$c])) $row[$c] = json_decode($row[$c], true);
    }
    return $row;
}

function serialize_rows(string $table, array $rows): array {
    return array_map(fn($r) => serialize_row($table, $r), $rows);
}
```

- [ ] **Step 2: Replace `api/lib/ownership.php` with the expanded version**

```php
<?php
require_once __DIR__ . '/../db.php';

// Owner-scoped tables that have a direct user_id column.
const OWNED_TABLES = ['recipes','folders','tags','collections','meal_plans',
                      'grocery_lists','extraction_jobs','shared_recipes'];

// Returns the row from $table with $id IF it belongs to $userId; else 404/403 (exits).
function owned_or_404(string $table, string $id, string $userId): array {
    if (!in_array($table, OWNED_TABLES, true)) json_error('Server error', 500);
    $stmt = db()->prepare("SELECT * FROM `$table` WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($row['user_id'] !== $userId) json_error('Forbidden', 403);
    return $row;
}

// Back-compat: throw 403/404 unless owned (no row returned).
function require_owner(string $table, string $id, string $userId): void {
    owned_or_404($table, $id, $userId);
}

function require_recipe_owner(string $recipeId, string $userId): void {
    owned_or_404('recipes', $recipeId, $userId);
}

// Confirms a CHILD row belongs to a parent the user owns, via the parent's user_id.
// Allowlisted child/parent tables only. Returns the child row, or 404/403.
function child_owned_or_404(string $childTable, string $childId, string $userId): array {
    // childTable => [parentForeignKeyColumn, parentTable]
    static $map = [
        'ingredients'        => ['recipe_id', 'recipes'],
        'instructions'       => ['recipe_id', 'recipes'],
        'grocery_list_items' => ['grocery_list_id', 'grocery_lists'],
        'collection_recipes' => ['collection_id', 'collections'],
    ];
    if (!isset($map[$childTable])) json_error('Server error', 500);
    [$fk, $parent] = $map[$childTable];
    $stmt = db()->prepare(
        "SELECT c.* FROM `$childTable` c
           JOIN `$parent` p ON p.id = c.`$fk`
          WHERE c.id = ? AND p.user_id = ?"
    );
    $stmt->execute([$childId, $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        // Distinguish missing vs forbidden for correct status codes.
        $exists = db()->prepare("SELECT 1 FROM `$childTable` WHERE id = ?");
        $exists->execute([$childId]);
        $found = (bool)$exists->fetch();
        json_error($found ? 'Forbidden' : 'Not found', $found ? 403 : 404);
    }
    return $row;
}
```

- [ ] **Step 3: Add opportunistic session GC to `api/auth.php`**

In `api/auth.php`, inside `start_session_for()`, immediately AFTER `$cfg = app_config();`, insert:

```php
    // Opportunistic GC of expired sessions (~1% of calls; cheap on shared hosting).
    if (random_int(1, 100) === 1) {
        db()->exec('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
    }
```

- [ ] **Step 4: Create a minimal `api/routes/recipes.php` (expanded in Task 4)**

This preserves the Plan 1 `/recipes` behaviour so `test_ownership.php` keeps passing after the dispatcher refactor.

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/recipes' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('recipes', $stmt->fetchAll()));
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
    $row = owned_or_404('recipes', $m[1], $user['id']);
    json_ok(serialize_row('recipes', $row));
}

json_error('Not found', 404);
```

- [ ] **Step 5: Replace `api/index.php` with the prefix dispatcher**

```php
<?php
require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/uuid.php';
require __DIR__ . '/db.php';

$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^.*?/api#', '', $uri);
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];

$GLOBALS['ROUTE_PATH'] = $path;
$GLOBALS['ROUTE_METHOD'] = $method;

// Map URL prefix -> route file. Longest-prefix wins via boundary matching.
$routes = [
    '/auth'            => 'auth.php',
    '/recipe-tags'     => 'recipe_tags.php',
    '/recipes'         => 'recipes.php',
    '/folders'         => 'folders.php',
    '/tags'            => 'tags.php',
    '/extraction-jobs' => 'extraction_jobs.php',
    '/grocery-list'    => 'grocery.php',
    '/meal-plans'      => 'meal_plans.php',
    '/collections'     => 'collections.php',
    '/pantry'          => 'pantry.php',
    '/public'          => 'public.php',
];

function path_matches(string $path, string $prefix): bool {
    return $path === $prefix || str_starts_with($path, $prefix . '/');
}

try {
    if ($path === '/health') {
        json_ok(['status' => 'ok']);
    }
    foreach ($routes as $prefix => $file) {
        if (path_matches($path, $prefix)) {
            require __DIR__ . '/routes/' . $file;
            json_error('Not found', 404); // route file fell through
        }
    }
    json_error('Not found', 404);
} catch (Throwable $e) {
    error_log('API error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_error('Server error', 500);
}
```

Note: `/recipe-tags` is listed BEFORE `/recipes`, and `path_matches` uses boundary matching (`=== prefix` or `prefix . '/'`), so `/recipe-tags` never matches `/recipes`.

- [ ] **Step 6: Run the Plan 1 suite — must still be green**

```bash
php tests/run.php; echo "exit=$?"
```
Expected: all 15 existing checks PASS (`test_auth.php` 9 + `test_ownership.php` 6), `exit=0`. The dispatcher + minimal recipes route reproduce Plan 1 behaviour.

- [ ] **Step 7: Commit**

```bash
git add api/lib/serialize.php api/lib/ownership.php api/auth.php api/index.php api/routes/recipes.php
git commit -m "refactor(api): prefix dispatcher, serializer, child-ownership helpers, session GC"
```

---

## Task 2: Folders + Tags (read-only lists)

**Files:**
- Create: `api/routes/folders.php`, `api/routes/tags.php`, `tests/test_folders.php`

**Context:** The UI never creates/edits/deletes folders or tags — they exist only via seeding. So each needs only an authenticated `GET` list, scoped to the user. (If folder/tag editing is added later, it gets its own plan.) Folders order by `position`; tags order by `category` then `name` (matching `useFolders`/`useTags`).

- [ ] **Step 1: Write `tests/test_folders.php`** (verifies auth + isolation + ordering; seeds rows directly via PDO)

```php
<?php
// Direct DB seed so we don't depend on other routes.
$cfg = require __DIR__ . '/../api/config.php';
$pdo = new PDO("mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset={$cfg['db_charset']}",
    $cfg['db_user'], $cfg['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

reset_cookies();
$email = 'folders_' . bin2hex(random_bytes(4)) . '@example.com';
$su = api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'F']);
$uid = $su['json']['data']['id'];
$now = gmdate('Y-m-d H:i:s');
$mk = function($name, $pos) use ($pdo, $uid, $now) {
    $id = bin2hex(random_bytes(8)) . '-0000-4000-8000-' . bin2hex(random_bytes(6));
    $pdo->prepare('INSERT INTO folders (id,user_id,parent_id,name,icon,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$id, $uid, null, $name, 'folder', $pos, $now, $now]);
};
$mk('Zeta', 1); $mk('Alpha', 0);

$r = api('GET', '/folders');
check('folders 200', $r['status'] === 200);
check('folders count 2', count($r['json']['data'] ?? []) === 2);
check('folders ordered by position', ($r['json']['data'][0]['name'] ?? '') === 'Alpha');
check('folder position is an int', ($r['json']['data'][0]['position'] ?? null) === 0);

reset_cookies();
$anon = api('GET', '/folders');
check('folders require auth (401)', $anon['status'] === 401);
```

- [ ] **Step 2: Run it, expect FAIL** (`/folders` route absent → 404s)

```bash
php tests/run.php; echo "exit=$?"
```

- [ ] **Step 3: Write `api/routes/folders.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/folders' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY position');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('folders', $stmt->fetchAll()));
}

json_error('Not found', 404);
```

- [ ] **Step 4: Write `api/routes/tags.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/tags' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY category, name');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('tags', $stmt->fetchAll()));
}

json_error('Not found', 404);
```

- [ ] **Step 5: Run tests, expect PASS** (all 5 folder checks + the 15 Plan 1 checks)

```bash
php tests/run.php; echo "exit=$?"
```
Expected: 20 checks, 0 failed, `exit=0`.

- [ ] **Step 6: Commit**

```bash
git add api/routes/folders.php api/routes/tags.php tests/test_folders.php
git commit -m "feat(api): folders and tags read-only list endpoints"
```

---

## Task 3: Recipes CRUD + nested children + sharing

**Files:**
- Modify: `api/routes/recipes.php` (replace the Task 1 minimal version with full CRUD)
- Create: `tests/test_recipes.php`

**Context:** This is the largest route. It reproduces `useRecipeCrud` + `useRecipes` + `useRecipeIngredients` + `useRecipeInstructions` + the share-create/resolve from `App.tsx`. The API owns the derivation logic the frontend used to do: `source_type` from `source_url`, `raw_text` from ingredient parts, ingredient/instruction `position`, instruction `step_number`. Children are stored via delete-then-reinsert on update (same as the Supabase code). Recipe delete relies on FK `ON DELETE CASCADE` for children.

**Payload contract (POST and the full-edit PATCH):**
```
{ title, description, cover_image_url, source_url, source_author, folder_id|null,
  prep_time_minutes, cook_time_minutes, total_time_minutes, yield_amount, yield_unit, notes,
  tagIds: string[],
  ingredients: [{ quantity, unit, name, prep_note, group_name }],   // quantity may be "" / string / number
  instructions: [{ content, timer_seconds, group_name }] }          // timer_seconds may be "" / string / number
```
A PATCH that omits `ingredients`/`instructions`/`tagIds` updates only the scalar recipe fields present (used for favorite/cooked toggles).

- [ ] **Step 1: Write `tests/test_recipes.php`**

```php
<?php
reset_cookies();
$email = 'recipes_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'R']);

$payload = [
    'title' => 'Pancakes', 'description' => 'Fluffy', 'cover_image_url' => '',
    'source_url' => 'https://x.test/p', 'source_author' => 'Chef', 'folder_id' => null,
    'prep_time_minutes' => 5, 'cook_time_minutes' => 10, 'total_time_minutes' => 15,
    'yield_amount' => 2, 'yield_unit' => 'servings', 'notes' => 'hot',
    'tagIds' => [],
    'ingredients' => [
        ['quantity' => '2', 'unit' => 'cups', 'name' => 'flour', 'prep_note' => 'sifted', 'group_name' => ''],
        ['quantity' => '', 'unit' => '', 'name' => 'salt', 'prep_note' => '', 'group_name' => ''],
    ],
    'instructions' => [
        ['content' => 'Mix', 'timer_seconds' => '', 'group_name' => ''],
        ['content' => 'Cook', 'timer_seconds' => '120', 'group_name' => ''],
    ],
];
$c = api('POST', '/recipes', $payload);
check('create recipe 200', $c['status'] === 200);
$rid = $c['json']['data']['id'] ?? null;
check('create returns id', !empty($rid));

$get = api('GET', "/recipes/$rid");
check('recipe source_type derived web', ($get['json']['data']['source_type'] ?? '') === 'web');
check('recipe is_favorite is bool false', ($get['json']['data']['is_favorite'] ?? 'x') === false);
check('recipe yield_amount is number', is_numeric($get['json']['data']['yield_amount'] ?? null) && (float)$get['json']['data']['yield_amount'] === 2.0);

$ings = api('GET', "/recipes/$rid/ingredients");
check('2 ingredients, ordered', count($ings['json']['data'] ?? []) === 2 && $ings['json']['data'][0]['name'] === 'flour');
check('ingredient quantity number-or-null', (float)$ings['json']['data'][0]['quantity'] === 2.0 && $ings['json']['data'][1]['quantity'] === null);
check('ingredient raw_text composed', str_contains($ings['json']['data'][0]['raw_text'], 'flour'));

$steps = api('GET', "/recipes/$rid/instructions");
check('2 instructions w/ step_number', count($steps['json']['data'] ?? []) === 2 && $steps['json']['data'][1]['step_number'] === 2);
check('timer_seconds parsed', $steps['json']['data'][0]['timer_seconds'] === null && $steps['json']['data'][1]['timer_seconds'] === 120);

// Partial PATCH: favourite toggle
$fav = api('PATCH', "/recipes/$rid", ['is_favorite' => true]);
check('favorite toggle 200', $fav['status'] === 200);
$get2 = api('GET', "/recipes/$rid");
check('favorite now true', ($get2['json']['data']['is_favorite'] ?? false) === true);

// Full PATCH: change title + replace children
$payload['title'] = 'Waffles';
$payload['ingredients'] = [['quantity' => '1', 'unit' => 'cup', 'name' => 'milk', 'prep_note' => '', 'group_name' => '']];
$upd = api('PATCH', "/recipes/$rid", $payload);
check('full update 200', $upd['status'] === 200);
$ings2 = api('GET', "/recipes/$rid/ingredients");
check('children replaced (1 ingredient: milk)', count($ings2['json']['data']) === 1 && $ings2['json']['data'][0]['name'] === 'milk');

// Duplicate
$dup = api('POST', "/recipes/$rid/duplicate");
check('duplicate 200 returns id', $dup['status'] === 200 && !empty($dup['json']['data']['id']));
$list = api('GET', '/recipes');
check('now 2 recipes', count($list['json']['data']) === 2);

// Share + resolve
$share = api('POST', "/recipes/$rid/share");
$token = $share['json']['data']['token'] ?? null;
check('share returns token', !empty($token));
$resolve = api('GET', "/recipes/shared/$token");
check('resolve token -> recipe_id', ($resolve['json']['data']['recipe_id'] ?? '') === $rid);

// Delete (cascade children)
$del = api('DELETE', "/recipes/$rid");
check('delete 200', $del['status'] === 200);
$gone = api('GET', "/recipes/$rid");
check('deleted recipe 404', $gone['status'] === 404);
```

- [ ] **Step 2: Run, expect FAIL** (only the Task 1 minimal recipes route exists)

```bash
php tests/run.php; echo "exit=$?"
```

- [ ] **Step 3: Replace `api/routes/recipes.php` with the full implementation**

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();
$uid = $user['id'];

// Helpers ----------------------------------------------------------------
$num_or_null = function ($v) {
    if ($v === null) return null;
    if (is_string($v) && trim($v) === '') return null;
    return is_numeric($v) ? $v + 0 : null;
};
$insert_children = function (string $recipeId, array $body) use ($num_or_null) {
    $now = gmdate('Y-m-d H:i:s');
    foreach (($body['ingredients'] ?? []) as $i => $ing) {
        $qty = $num_or_null($ing['quantity'] ?? null);
        $raw = trim(implode(' ', array_filter([
            (string)($ing['quantity'] ?? ''), $ing['unit'] ?? '', $ing['name'] ?? '', $ing['prep_note'] ?? ''
        ], fn($s) => $s !== '')));
        db()->prepare('INSERT INTO ingredients (id,recipe_id,position,group_name,quantity,unit,name,prep_note,raw_text,created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([uuid4(), $recipeId, $i, $ing['group_name'] ?? '', $qty,
                       $ing['unit'] ?? '', $ing['name'] ?? '', $ing['prep_note'] ?? '', $raw, $now]);
    }
    foreach (($body['instructions'] ?? []) as $i => $step) {
        $timer = $num_or_null($step['timer_seconds'] ?? null);
        db()->prepare('INSERT INTO instructions (id,recipe_id,position,step_number,group_name,content,timer_seconds,created_at)
                       VALUES (?,?,?,?,?,?,?,?)')
            ->execute([uuid4(), $recipeId, $i, $i + 1, $step['group_name'] ?? '',
                       $step['content'] ?? '', $timer === null ? null : (int)$timer, $now]);
    }
    foreach (($body['tagIds'] ?? []) as $tagId) {
        db()->prepare('INSERT INTO recipe_tags (recipe_id,tag_id,created_at) VALUES (?,?,?)')
            ->execute([$recipeId, $tagId, $now]);
    }
};

// LIST -------------------------------------------------------------------
if ($path === '/recipes' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$uid]);
    json_ok(serialize_rows('recipes', $stmt->fetchAll()));
}

// CREATE -----------------------------------------------------------------
if ($path === '/recipes' && $method === 'POST') {
    $b = read_json_body();
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    $sourceType = !empty($b['source_url']) ? 'web' : 'manual';
    db()->prepare(
        'INSERT INTO recipes (id,user_id,folder_id,title,description,source_type,source_url,source_author,
            cover_image_url,yield_amount,yield_unit,prep_time_minutes,cook_time_minutes,total_time_minutes,
            notes,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $id, $uid, $b['folder_id'] ?? null, $b['title'] ?? 'Untitled Recipe', $b['description'] ?? '',
        $sourceType, $b['source_url'] ?? '', $b['source_author'] ?? '', $b['cover_image_url'] ?? '',
        $num_or_null($b['yield_amount'] ?? 1) ?? 1, $b['yield_unit'] ?? 'servings',
        (int)($b['prep_time_minutes'] ?? 0), (int)($b['cook_time_minutes'] ?? 0), (int)($b['total_time_minutes'] ?? 0),
        $b['notes'] ?? '', $now, $now,
    ]);
    $insert_children($id, $b);
    json_ok(['id' => $id]);
}

// Sub-routes on a specific recipe ----------------------------------------
if (preg_match('#^/recipes/([a-f0-9-]{36})/ingredients$#', $path, $m) && $method === 'GET') {
    owned_or_404('recipes', $m[1], $uid);
    $stmt = db()->prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position');
    $stmt->execute([$m[1]]);
    json_ok(serialize_rows('ingredients', $stmt->fetchAll()));
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/instructions$#', $path, $m) && $method === 'GET') {
    owned_or_404('recipes', $m[1], $uid);
    $stmt = db()->prepare('SELECT * FROM instructions WHERE recipe_id = ? ORDER BY position');
    $stmt->execute([$m[1]]);
    json_ok(serialize_rows('instructions', $stmt->fetchAll()));
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/share$#', $path, $m) && $method === 'POST') {
    owned_or_404('recipes', $m[1], $uid);
    $token = bin2hex(random_bytes(12));
    db()->prepare('INSERT INTO shared_recipes (id,recipe_id,user_id,token,message,created_at) VALUES (?,?,?,?,?,?)')
        ->execute([uuid4(), $m[1], $uid, $token, '', gmdate('Y-m-d H:i:s')]);
    json_ok(['token' => $token]);
}
if (preg_match('#^/recipes/shared/([a-f0-9]+)$#', $path, $m) && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT sr.recipe_id FROM shared_recipes sr JOIN recipes r ON r.id = sr.recipe_id
          WHERE sr.token = ? AND r.user_id = ?'
    );
    $stmt->execute([$m[1], $uid]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok(['recipe_id' => $row['recipe_id']]);
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/duplicate$#', $path, $m) && $method === 'POST') {
    $orig = owned_or_404('recipes', $m[1], $uid);
    $newId = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare(
        'INSERT INTO recipes (id,user_id,folder_id,title,description,source_type,source_url,source_author,
            cover_image_url,yield_amount,yield_unit,prep_time_minutes,cook_time_minutes,total_time_minutes,
            notes,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $newId, $uid, $orig['folder_id'], $orig['title'] . ' (copy)', $orig['description'], $orig['source_type'],
        $orig['source_url'], $orig['source_author'], $orig['cover_image_url'], $orig['yield_amount'], $orig['yield_unit'],
        $orig['prep_time_minutes'], $orig['cook_time_minutes'], $orig['total_time_minutes'], $orig['notes'], $now, $now,
    ]);
    // copy ingredients, instructions, tags
    foreach (['ingredients','instructions'] as $child) {
        $rows = db()->prepare("SELECT * FROM `$child` WHERE recipe_id = ? ORDER BY position");
        $rows->execute([$m[1]]);
        foreach ($rows->fetchAll() as $r) {
            if ($child === 'ingredients') {
                db()->prepare('INSERT INTO ingredients (id,recipe_id,position,group_name,quantity,unit,name,prep_note,raw_text,created_at)
                               VALUES (?,?,?,?,?,?,?,?,?,?)')
                    ->execute([uuid4(), $newId, $r['position'], $r['group_name'], $r['quantity'], $r['unit'], $r['name'], $r['prep_note'], $r['raw_text'], $now]);
            } else {
                db()->prepare('INSERT INTO instructions (id,recipe_id,position,step_number,group_name,content,timer_seconds,created_at)
                               VALUES (?,?,?,?,?,?,?,?)')
                    ->execute([uuid4(), $newId, $r['position'], $r['step_number'], $r['group_name'], $r['content'], $r['timer_seconds'], $now]);
            }
        }
    }
    $tags = db()->prepare('SELECT tag_id FROM recipe_tags WHERE recipe_id = ?');
    $tags->execute([$m[1]]);
    foreach ($tags->fetchAll() as $t) {
        db()->prepare('INSERT INTO recipe_tags (recipe_id,tag_id,created_at) VALUES (?,?,?)')
            ->execute([$newId, $t['tag_id'], $now]);
    }
    json_ok(['id' => $newId]);
}

// GET / PATCH / DELETE one recipe ----------------------------------------
if (preg_match('#^/recipes/([a-f0-9-]{36})$#', $path, $m)) {
    $row = owned_or_404('recipes', $m[1], $uid);

    if ($method === 'GET') {
        json_ok(serialize_row('recipes', $row));
    }

    if ($method === 'PATCH') {
        $b = read_json_body();
        $scalar = ['title','description','cover_image_url','source_url','source_author','folder_id',
                   'prep_time_minutes','cook_time_minutes','total_time_minutes','yield_amount','yield_unit',
                   'notes','is_favorite','last_cooked_at','status'];
        $set = []; $vals = [];
        foreach ($scalar as $col) {
            if (array_key_exists($col, $b)) {
                $val = $b[$col];
                if ($col === 'is_favorite') $val = $val ? 1 : 0;
                if (in_array($col, ['prep_time_minutes','cook_time_minutes','total_time_minutes'], true)) $val = (int)$val;
                $set[] = "`$col` = ?"; $vals[] = $val;
            }
        }
        // If source_url changed and source_type not explicitly set, recompute it.
        if (array_key_exists('source_url', $b) && !array_key_exists('source_type', $b)) {
            $set[] = '`source_type` = ?'; $vals[] = !empty($b['source_url']) ? 'web' : 'manual';
        }
        $set[] = '`updated_at` = ?'; $vals[] = gmdate('Y-m-d H:i:s');
        $vals[] = $m[1];
        db()->prepare('UPDATE recipes SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($vals);

        // Replace children only if those keys are present.
        if (array_key_exists('ingredients', $b)) {
            db()->prepare('DELETE FROM ingredients WHERE recipe_id = ?')->execute([$m[1]]);
        }
        if (array_key_exists('instructions', $b)) {
            db()->prepare('DELETE FROM instructions WHERE recipe_id = ?')->execute([$m[1]]);
        }
        if (array_key_exists('tagIds', $b)) {
            db()->prepare('DELETE FROM recipe_tags WHERE recipe_id = ?')->execute([$m[1]]);
        }
        $insert_children($m[1], [
            'ingredients'  => $b['ingredients']  ?? [],
            'instructions' => $b['instructions'] ?? [],
            'tagIds'       => $b['tagIds']       ?? [],
        ]);
        json_ok(['ok' => true]);
    }

    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM recipes WHERE id = ?')->execute([$m[1]]); // children cascade
        json_ok(['ok' => true]);
    }
}

json_error('Not found', 404);
```

Note: the PATCH `$insert_children` call is given only the keys present in `$b` (defaulting to empty arrays). Because the DELETE statements above run ONLY when the key is present, a partial PATCH (e.g. `{is_favorite:true}`) deletes nothing and re-inserts nothing (all three arrays empty → loops don't run). A full PATCH that includes `ingredients` deletes then reinserts them. Verify this interaction in testing.

- [ ] **Step 4: Run tests, expect PASS**

```bash
php tests/run.php; echo "exit=$?"
```
Expected: all `test_recipes.php` checks pass plus prior suites; `exit=0`. Pay special attention to: `children replaced (1 ingredient: milk)`, `favorite now true`, `timer_seconds parsed`, `resolve token -> recipe_id`, `deleted recipe 404`.

- [ ] **Step 5: Commit**

```bash
git add api/routes/recipes.php tests/test_recipes.php
git commit -m "feat(api): full recipes CRUD, nested children, duplicate, share + resolve"
```

---

## Task 4: Recipe-tags map + Extraction jobs (read-only)

**Files:**
- Create: `api/routes/recipe_tags.php`, `api/routes/extraction_jobs.php`
- Add tests into `tests/test_recipes.php`? No — create `tests/test_misc_reads.php`

**Context:** `useRecipeTags` fetches `[{recipe_id, tag_id}]` across ALL the user's recipes to build a map. `useExtractionJobs` fetches the inbox queue (currently always empty unless seeded). Both are user-scoped reads. recipe_tags has no `user_id`, so scope through the parent recipe.

- [ ] **Step 1: Write `tests/test_misc_reads.php`**

```php
<?php
reset_cookies();
$email = 'misc_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'M']);

// recipe-tags: empty for a fresh user
$rt = api('GET', '/recipe-tags');
check('recipe-tags 200 + array', $rt['status'] === 200 && is_array($rt['json']['data']));
check('recipe-tags empty for new user', count($rt['json']['data']) === 0);

// extraction-jobs: empty array, 200
$ej = api('GET', '/extraction-jobs');
check('extraction-jobs 200 + array', $ej['status'] === 200 && is_array($ej['json']['data']));

// both require auth
reset_cookies();
check('recipe-tags require auth (401)', api('GET', '/recipe-tags')['status'] === 401);
check('extraction-jobs require auth (401)', api('GET', '/extraction-jobs')['status'] === 401);
```

- [ ] **Step 2: Run, expect FAIL.** `php tests/run.php; echo "exit=$?"`

- [ ] **Step 3: Write `api/routes/recipe_tags.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/recipe-tags' && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT rt.recipe_id, rt.tag_id
           FROM recipe_tags rt
           JOIN recipes r ON r.id = rt.recipe_id
          WHERE r.user_id = ?'
    );
    $stmt->execute([$user['id']]);
    json_ok($stmt->fetchAll());
}

json_error('Not found', 404);
```

- [ ] **Step 4: Write `api/routes/extraction_jobs.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/extraction-jobs' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM extraction_jobs WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('extraction_jobs', $stmt->fetchAll()));
}

json_error('Not found', 404);
```

- [ ] **Step 5: Run, expect PASS.** `php tests/run.php; echo "exit=$?"` (all prior + 5 new checks, exit 0)

- [ ] **Step 6: Commit**

```bash
git add api/routes/recipe_tags.php api/routes/extraction_jobs.php tests/test_misc_reads.php
git commit -m "feat(api): recipe-tags map and extraction-jobs list endpoints"
```

---

## Task 5: Grocery list + items

**Files:**
- Create: `api/routes/grocery.php`, `tests/test_grocery.php`

**Context:** Reproduces `useGroceryList`. There is at most one active list per user (auto-created on first write). Endpoints:
- `GET /grocery-list` → `{ list: <activeList|null>, items: [...] }` (items ordered by position).
- `POST /grocery-list/items` `{name}` → add a manual item (auto-creates the active list if none).
- `POST /grocery-list/items/from-recipe` `{recipe_id}` → server reads that recipe's ingredients (ownership-checked) and appends them as items. Returns the inserted items.
- `PATCH /grocery-list/items/{id}` `{is_checked}` → toggle (ownership via parent list).
- `DELETE /grocery-list/items/{id}` → remove one.
- `POST /grocery-list/clear-checked` → delete all checked items in the active list.

- [ ] **Step 1: Write `tests/test_grocery.php`**

```php
<?php
reset_cookies();
$email = 'groc_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'G']);

// empty state
$g0 = api('GET', '/grocery-list');
check('grocery 200', $g0['status'] === 200);
check('no active list yet', $g0['json']['data']['list'] === null);
check('items empty', count($g0['json']['data']['items'] ?? []) === 0);

// add a manual item (auto-creates list)
$a = api('POST', '/grocery-list/items', ['name' => 'Milk']);
check('add item 200', $a['status'] === 200);
check('item name Milk', ($a['json']['data']['name'] ?? '') === 'Milk');
check('item is_checked bool false', ($a['json']['data']['is_checked'] ?? 'x') === false);

$g1 = api('GET', '/grocery-list');
check('active list now exists', !empty($g1['json']['data']['list']['id']));
check('1 item', count($g1['json']['data']['items']) === 1);
$itemId = $g1['json']['data']['items'][0]['id'];

// toggle checked
$t = api('PATCH', "/grocery-list/items/$itemId", ['is_checked' => true]);
check('toggle 200', $t['status'] === 200);
$g2 = api('GET', '/grocery-list');
check('item now checked', $g2['json']['data']['items'][0]['is_checked'] === true);

// add from recipe
$payload = ['title' => 'Soup', 'description' => '', 'cover_image_url' => '', 'source_url' => '',
    'source_author' => '', 'folder_id' => null, 'prep_time_minutes' => 0, 'cook_time_minutes' => 0,
    'total_time_minutes' => 0, 'yield_amount' => 1, 'yield_unit' => 'servings', 'notes' => '', 'tagIds' => [],
    'ingredients' => [['quantity' => '1', 'unit' => 'can', 'name' => 'tomatoes', 'prep_note' => '', 'group_name' => '']],
    'instructions' => []];
$rid = api('POST', '/recipes', $payload)['json']['data']['id'];
$fr = api('POST', '/grocery-list/items/from-recipe', ['recipe_id' => $rid]);
check('from-recipe 200 inserts 1', $fr['status'] === 200 && count($fr['json']['data']) === 1);
check('from-recipe item carries recipe_id', ($fr['json']['data'][0]['recipe_id'] ?? '') === $rid);

// clear checked (removes the Milk item, keeps tomatoes)
$cc = api('POST', '/grocery-list/clear-checked');
check('clear-checked 200', $cc['status'] === 200);
$g3 = api('GET', '/grocery-list');
check('only unchecked remain', count($g3['json']['data']['items']) === 1 && $g3['json']['data']['items'][0]['name'] === 'tomatoes');

// isolation: another user cannot toggle this item
reset_cookies();
api('POST', '/auth/signup', ['email' => 'groc2_' . bin2hex(random_bytes(4)) . '@example.com', 'password' => 'secret123', 'display_name' => 'G2']);
$cross = api('PATCH', "/grocery-list/items/$itemId", ['is_checked' => false]);
check('cross-user item toggle forbidden/notfound', in_array($cross['status'], [403, 404], true));
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Write `api/routes/grocery.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();
$uid = $user['id'];

function active_list(string $uid): ?array {
    $stmt = db()->prepare('SELECT * FROM grocery_lists WHERE user_id = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([$uid]);
    return $stmt->fetch() ?: null;
}
function get_or_create_active_list(string $uid): array {
    $list = active_list($uid);
    if ($list) return $list;
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare('INSERT INTO grocery_lists (id,user_id,name,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        ->execute([$id, $uid, "This week's list", 1, $now, $now]);
    return active_list($uid);
}
function list_item_count(string $listId): int {
    $s = db()->prepare('SELECT COUNT(*) c FROM grocery_list_items WHERE grocery_list_id = ?');
    $s->execute([$listId]);
    return (int)$s->fetch()['c'];
}

if ($path === '/grocery-list' && $method === 'GET') {
    $list = active_list($uid);
    $items = [];
    if ($list) {
        $s = db()->prepare('SELECT * FROM grocery_list_items WHERE grocery_list_id = ? ORDER BY position');
        $s->execute([$list['id']]);
        $items = serialize_rows('grocery_list_items', $s->fetchAll());
    }
    json_ok(['list' => serialize_row('grocery_lists', $list), 'items' => $items]);
}

if ($path === '/grocery-list/items' && $method === 'POST') {
    $b = read_json_body();
    $list = get_or_create_active_list($uid);
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare('INSERT INTO grocery_list_items (id,grocery_list_id,recipe_id,ingredient_id,name,quantity,unit,aisle,is_checked,position,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $list['id'], null, null, $b['name'] ?? '', null, '', 'other', 0, list_item_count($list['id']), $now, $now]);
    $s = db()->prepare('SELECT * FROM grocery_list_items WHERE id = ?');
    $s->execute([$id]);
    json_ok(serialize_row('grocery_list_items', $s->fetch()));
}

if ($path === '/grocery-list/items/from-recipe' && $method === 'POST') {
    $b = read_json_body();
    $recipeId = $b['recipe_id'] ?? '';
    owned_or_404('recipes', $recipeId, $uid);
    $list = get_or_create_active_list($uid);
    $start = list_item_count($list['id']);
    $ings = db()->prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position');
    $ings->execute([$recipeId]);
    $inserted = [];
    $now = gmdate('Y-m-d H:i:s');
    foreach ($ings->fetchAll() as $i => $ing) {
        $id = uuid4();
        db()->prepare('INSERT INTO grocery_list_items (id,grocery_list_id,recipe_id,ingredient_id,name,quantity,unit,aisle,is_checked,position,created_at,updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$id, $list['id'], $recipeId, $ing['id'], $ing['name'], $ing['quantity'], $ing['unit'], 'other', 0, $start + $i, $now, $now]);
        $inserted[] = $id;
    }
    if (count($inserted) === 0) { json_ok([]); }
    $in = implode(',', array_fill(0, count($inserted), '?'));
    $s = db()->prepare("SELECT * FROM grocery_list_items WHERE id IN ($in) ORDER BY position");
    $s->execute($inserted);
    json_ok(serialize_rows('grocery_list_items', $s->fetchAll()));
}

if (preg_match('#^/grocery-list/items/([a-f0-9-]{36})$#', $path, $m)) {
    child_owned_or_404('grocery_list_items', $m[1], $uid);
    if ($method === 'PATCH') {
        $b = read_json_body();
        db()->prepare('UPDATE grocery_list_items SET is_checked = ?, updated_at = ? WHERE id = ?')
            ->execute([!empty($b['is_checked']) ? 1 : 0, gmdate('Y-m-d H:i:s'), $m[1]]);
        json_ok(['ok' => true]);
    }
    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM grocery_list_items WHERE id = ?')->execute([$m[1]]);
        json_ok(['ok' => true]);
    }
}

if ($path === '/grocery-list/clear-checked' && $method === 'POST') {
    $list = active_list($uid);
    if ($list) {
        db()->prepare('DELETE FROM grocery_list_items WHERE grocery_list_id = ? AND is_checked = 1')
            ->execute([$list['id']]);
    }
    json_ok(['ok' => true]);
}

json_error('Not found', 404);
```

- [ ] **Step 4: Run, expect PASS.** All grocery checks (incl. cross-user isolation) + prior suites; exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/routes/grocery.php tests/test_grocery.php
git commit -m "feat(api): grocery list + items (add, from-recipe, toggle, clear-checked)"
```

---

## Task 6: Meal plans

**Files:**
- Create: `api/routes/meal_plans.php`, `tests/test_meal_plans.php`

**Context:** Reproduces `useMealPlan`. List is filtered by a date range (`from`/`to` query params, inclusive). Create computes `position` within the same date+meal_type slot. PATCH moves an entry (date + meal_type). All owner-scoped.

- [ ] **Step 1: Write `tests/test_meal_plans.php`**

```php
<?php
reset_cookies();
$email = 'meal_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'M']);
$rid = api('POST', '/recipes', ['title' => 'Dinner', 'description' => '', 'cover_image_url' => '', 'source_url' => '',
    'source_author' => '', 'folder_id' => null, 'prep_time_minutes' => 0, 'cook_time_minutes' => 0,
    'total_time_minutes' => 0, 'yield_amount' => 1, 'yield_unit' => 'servings', 'notes' => '',
    'tagIds' => [], 'ingredients' => [], 'instructions' => []])['json']['data']['id'];

$add = api('POST', '/meal-plans', ['recipe_id' => $rid, 'planned_date' => '2026-06-10', 'meal_type' => 'dinner']);
check('add meal 200', $add['status'] === 200);
$mpId = $add['json']['data']['id'] ?? null;
check('meal has id + position 0', !empty($mpId) && ($add['json']['data']['position'] ?? null) === 0);

$inRange = api('GET', '/meal-plans?from=2026-06-08&to=2026-06-14');
check('meal in range', count($inRange['json']['data'] ?? []) === 1);
$outRange = api('GET', '/meal-plans?from=2026-07-01&to=2026-07-07');
check('meal not in other range', count($outRange['json']['data'] ?? []) === 0);

$move = api('PATCH', "/meal-plans/$mpId", ['planned_date' => '2026-06-11', 'meal_type' => 'lunch']);
check('move meal 200', $move['status'] === 200);
$after = api('GET', '/meal-plans?from=2026-06-08&to=2026-06-14');
check('moved date/type', $after['json']['data'][0]['planned_date'] === '2026-06-11' && $after['json']['data'][0]['meal_type'] === 'lunch');

$del = api('DELETE', "/meal-plans/$mpId");
check('delete meal 200', $del['status'] === 200);

reset_cookies();
api('POST', '/auth/signup', ['email' => 'meal2_' . bin2hex(random_bytes(4)) . '@example.com', 'password' => 'secret123', 'display_name' => 'M2']);
check('cross-user meal delete forbidden/notfound', in_array(api('DELETE', "/meal-plans/$mpId")['status'], [403, 404], true));
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Write `api/routes/meal_plans.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();
$uid = $user['id'];

if ($path === '/meal-plans' && $method === 'GET') {
    $from = $_GET['from'] ?? '1970-01-01';
    $to   = $_GET['to'] ?? '2999-12-31';
    $stmt = db()->prepare('SELECT * FROM meal_plans WHERE user_id = ? AND planned_date BETWEEN ? AND ? ORDER BY position');
    $stmt->execute([$uid, $from, $to]);
    json_ok(serialize_rows('meal_plans', $stmt->fetchAll()));
}

if ($path === '/meal-plans' && $method === 'POST') {
    $b = read_json_body();
    $recipeId = $b['recipe_id'] ?? '';
    owned_or_404('recipes', $recipeId, $uid);
    $date = $b['planned_date'] ?? '';
    $type = $b['meal_type'] ?? 'dinner';
    $cnt = db()->prepare('SELECT COUNT(*) c FROM meal_plans WHERE user_id = ? AND planned_date = ? AND meal_type = ?');
    $cnt->execute([$uid, $date, $type]);
    $pos = (int)$cnt->fetch()['c'];
    $id = uuid4();
    db()->prepare('INSERT INTO meal_plans (id,user_id,recipe_id,planned_date,meal_type,position,created_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([$id, $uid, $recipeId, $date, $type, $pos, gmdate('Y-m-d H:i:s')]);
    $s = db()->prepare('SELECT * FROM meal_plans WHERE id = ?');
    $s->execute([$id]);
    json_ok(serialize_row('meal_plans', $s->fetch()));
}

if (preg_match('#^/meal-plans/([a-f0-9-]{36})$#', $path, $m)) {
    owned_or_404('meal_plans', $m[1], $uid);
    if ($method === 'PATCH') {
        $b = read_json_body();
        db()->prepare('UPDATE meal_plans SET planned_date = ?, meal_type = ? WHERE id = ?')
            ->execute([$b['planned_date'] ?? null, $b['meal_type'] ?? null, $m[1]]);
        json_ok(['ok' => true]);
    }
    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM meal_plans WHERE id = ?')->execute([$m[1]]);
        json_ok(['ok' => true]);
    }
}

json_error('Not found', 404);
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add api/routes/meal_plans.php tests/test_meal_plans.php
git commit -m "feat(api): meal plans (range list, add, move, delete)"
```

---

## Task 7: Collections + collection_recipes

**Files:**
- Create: `api/routes/collections.php`, `tests/test_collections.php`

**Context:** Reproduces `useCollections` + `useCollectionRecipes`. Collections are owner-scoped; a `share_token` (12 hex) is generated on create. `collection_recipes` ownership flows through the parent collection.

- [ ] **Step 1: Write `tests/test_collections.php`**

```php
<?php
reset_cookies();
$email = 'coll_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'C']);

$c = api('POST', '/collections', ['title' => 'Weeknight', 'description' => 'fast']);
check('create collection 200', $c['status'] === 200);
$cid = $c['json']['data']['id'] ?? null;
check('collection has id + share_token', !empty($cid) && !empty($c['json']['data']['share_token']));
check('is_public bool false', ($c['json']['data']['is_public'] ?? 'x') === false);

$list = api('GET', '/collections');
check('list has 1 collection', count($list['json']['data'] ?? []) === 1);

$upd = api('PATCH', "/collections/$cid", ['is_public' => true, 'title' => 'Weeknight Dinners']);
check('update 200', $upd['status'] === 200);
$list2 = api('GET', '/collections');
check('updated is_public true', $list2['json']['data'][0]['is_public'] === true);

// add a recipe to the collection
$rid = api('POST', '/recipes', ['title' => 'Tacos', 'description' => '', 'cover_image_url' => '', 'source_url' => '',
    'source_author' => '', 'folder_id' => null, 'prep_time_minutes' => 0, 'cook_time_minutes' => 0,
    'total_time_minutes' => 0, 'yield_amount' => 1, 'yield_unit' => 'servings', 'notes' => '',
    'tagIds' => [], 'ingredients' => [], 'instructions' => []])['json']['data']['id'];
$add = api('POST', "/collections/$cid/recipes", ['recipe_id' => $rid]);
check('add recipe to collection 200', $add['status'] === 200);
$cr = api('GET', "/collections/$cid/recipes");
check('collection has 1 recipe', count($cr['json']['data'] ?? []) === 1 && $cr['json']['data'][0]['recipe_id'] === $rid);

$rm = api('DELETE', "/collections/$cid/recipes/$rid");
check('remove recipe 200', $rm['status'] === 200);
check('collection now empty', count(api('GET', "/collections/$cid/recipes")['json']['data']) === 0);

// isolation
reset_cookies();
api('POST', '/auth/signup', ['email' => 'coll2_' . bin2hex(random_bytes(4)) . '@example.com', 'password' => 'secret123', 'display_name' => 'C2']);
check('cross-user sees 0 collections', count(api('GET', '/collections')['json']['data']) === 0);
check('cross-user cannot read collection recipes', in_array(api('GET', "/collections/$cid/recipes")['status'], [403, 404], true));
check('cross-user cannot delete collection', in_array(api('DELETE', "/collections/$cid")['status'], [403, 404], true));
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Write `api/routes/collections.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();
$uid = $user['id'];

if ($path === '/collections' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM collections WHERE user_id = ? ORDER BY position, created_at DESC');
    $stmt->execute([$uid]);
    json_ok(serialize_rows('collections', $stmt->fetchAll()));
}

if ($path === '/collections' && $method === 'POST') {
    $b = read_json_body();
    $cnt = db()->prepare('SELECT COUNT(*) c FROM collections WHERE user_id = ?');
    $cnt->execute([$uid]);
    $pos = (int)$cnt->fetch()['c'];
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare('INSERT INTO collections (id,user_id,title,description,cover_image_url,is_public,share_token,position,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $uid, $b['title'] ?? 'Untitled', $b['description'] ?? '', '', 0, bin2hex(random_bytes(6)), $pos, $now, $now]);
    $s = db()->prepare('SELECT * FROM collections WHERE id = ?');
    $s->execute([$id]);
    json_ok(serialize_row('collections', $s->fetch()));
}

// /collections/{id}/recipes ...
if (preg_match('#^/collections/([a-f0-9-]{36})/recipes/([a-f0-9-]{36})$#', $path, $m) && $method === 'DELETE') {
    owned_or_404('collections', $m[1], $uid);
    db()->prepare('DELETE FROM collection_recipes WHERE collection_id = ? AND recipe_id = ?')->execute([$m[1], $m[2]]);
    json_ok(['ok' => true]);
}
if (preg_match('#^/collections/([a-f0-9-]{36})/recipes$#', $path, $m)) {
    owned_or_404('collections', $m[1], $uid);
    if ($method === 'GET') {
        $s = db()->prepare('SELECT * FROM collection_recipes WHERE collection_id = ? ORDER BY position');
        $s->execute([$m[1]]);
        json_ok(serialize_rows('collection_recipes', $s->fetchAll()));
    }
    if ($method === 'POST') {
        $b = read_json_body();
        $cnt = db()->prepare('SELECT COUNT(*) c FROM collection_recipes WHERE collection_id = ?');
        $cnt->execute([$m[1]]);
        $pos = (int)$cnt->fetch()['c'];
        $id = uuid4();
        db()->prepare('INSERT INTO collection_recipes (id,collection_id,recipe_id,position,added_at) VALUES (?,?,?,?,?)')
            ->execute([$id, $m[1], $b['recipe_id'] ?? '', $pos, gmdate('Y-m-d H:i:s')]);
        $s = db()->prepare('SELECT * FROM collection_recipes WHERE id = ?');
        $s->execute([$id]);
        json_ok(serialize_row('collection_recipes', $s->fetch()));
    }
}

// /collections/{id}
if (preg_match('#^/collections/([a-f0-9-]{36})$#', $path, $m)) {
    owned_or_404('collections', $m[1], $uid);
    if ($method === 'PATCH') {
        $b = read_json_body();
        $cols = ['title','description','cover_image_url','is_public','position'];
        $set = []; $vals = [];
        foreach ($cols as $col) {
            if (array_key_exists($col, $b)) {
                $v = $b[$col];
                if ($col === 'is_public') $v = $v ? 1 : 0;
                if ($col === 'position') $v = (int)$v;
                $set[] = "`$col` = ?"; $vals[] = $v;
            }
        }
        $set[] = '`updated_at` = ?'; $vals[] = gmdate('Y-m-d H:i:s');
        $vals[] = $m[1];
        db()->prepare('UPDATE collections SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($vals);
        json_ok(['ok' => true]);
    }
    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM collections WHERE id = ?')->execute([$m[1]]);
        json_ok(['ok' => true]);
    }
}

json_error('Not found', 404);
```

Note: the `/collections/{id}/recipes/{recipeId}` DELETE pattern is checked BEFORE `/collections/{id}/recipes` and `/collections/{id}`, so the more specific path wins.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add api/routes/collections.php tests/test_collections.php
git commit -m "feat(api): collections + collection_recipes CRUD with ownership"
```

---

## Task 8: Pantry + Public recipe view

**Files:**
- Create: `api/routes/pantry.php`, `api/routes/public.php`, `tests/test_pantry_public.php`

**Context:** `pantry` returns `{recipe_id, name}` for all the user's ingredients (matching `PantryMatchView`, which filters to active recipes client-side). `public` resolves a share token (NO auth) and returns the recipe + ingredients + tags but **NOT instructions** (the deliberate "sign up to see steps" gate). Response shape matches `PublicRecipeView`: `{ recipe, ingredients, tags, message }`.

- [ ] **Step 1: Write `tests/test_pantry_public.php`**

```php
<?php
reset_cookies();
$email = 'pan_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'P']);
$rid = api('POST', '/recipes', ['title' => 'Stew', 'description' => 'd', 'cover_image_url' => '', 'source_url' => '',
    'source_author' => '', 'folder_id' => null, 'prep_time_minutes' => 0, 'cook_time_minutes' => 0,
    'total_time_minutes' => 0, 'yield_amount' => 1, 'yield_unit' => 'servings', 'notes' => '', 'tagIds' => [],
    'ingredients' => [['quantity' => '2', 'unit' => 'cups', 'name' => 'beef', 'prep_note' => '', 'group_name' => '']],
    'instructions' => [['content' => 'Secret step', 'timer_seconds' => '', 'group_name' => '']]])['json']['data']['id'];

// pantry
$p = api('GET', '/pantry/ingredients');
check('pantry 200 + array', $p['status'] === 200 && is_array($p['json']['data']));
check('pantry has beef for this recipe', count(array_filter($p['json']['data'], fn($i) => $i['name'] === 'beef' && $i['recipe_id'] === $rid)) === 1);
reset_cookies();
check('pantry requires auth (401)', api('GET', '/pantry/ingredients')['status'] === 401);

// share the recipe (need to be logged in as owner again)
api('POST', '/auth/login', ['email' => $email, 'password' => 'secret123']);
$token = api('POST', "/recipes/$rid/share")['json']['data']['token'];

// public view WITHOUT auth
reset_cookies();
$pub = api('GET', "/public/recipes/$token");
check('public recipe 200', $pub['status'] === 200);
check('public returns recipe title', ($pub['json']['data']['recipe']['title'] ?? '') === 'Stew');
check('public returns ingredients', count($pub['json']['data']['ingredients'] ?? []) === 1);
check('public OMITS instructions key', !isset($pub['json']['data']['instructions']));

$bad = api('GET', '/public/recipes/deadbeef');
check('unknown token 404', $bad['status'] === 404);
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Write `api/routes/pantry.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/pantry/ingredients' && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT i.recipe_id, i.name
           FROM ingredients i
           JOIN recipes r ON r.id = i.recipe_id
          WHERE r.user_id = ?'
    );
    $stmt->execute([$user['id']]);
    json_ok($stmt->fetchAll());
}

json_error('Not found', 404);
```

- [ ] **Step 4: Write `api/routes/public.php`** (NO auth — anonymous)

```php
<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

if (preg_match('#^/public/recipes/([a-f0-9]+)$#', $path, $m) && $method === 'GET') {
    $share = db()->prepare('SELECT recipe_id, message FROM shared_recipes WHERE token = ?');
    $share->execute([$m[1]]);
    $sr = $share->fetch();
    if (!$sr) json_error('Not found', 404);

    $recipeStmt = db()->prepare('SELECT * FROM recipes WHERE id = ?');
    $recipeStmt->execute([$sr['recipe_id']]);
    $recipe = $recipeStmt->fetch();
    if (!$recipe) json_error('Not found', 404);

    $ingStmt = db()->prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position');
    $ingStmt->execute([$sr['recipe_id']]);

    $tagStmt = db()->prepare(
        'SELECT t.* FROM tags t JOIN recipe_tags rt ON rt.tag_id = t.id WHERE rt.recipe_id = ?'
    );
    $tagStmt->execute([$sr['recipe_id']]);

    // NOTE: instructions are intentionally NOT returned (sign-up gate).
    json_ok([
        'recipe'      => serialize_row('recipes', $recipe),
        'ingredients' => serialize_rows('ingredients', $ingStmt->fetchAll()),
        'tags'        => serialize_rows('tags', $tagStmt->fetchAll()),
        'message'     => $sr['message'],
    ]);
}

json_error('Not found', 404);
```

- [ ] **Step 5: Run, expect PASS.** Confirm `public OMITS instructions key` passes (the gate).

- [ ] **Step 6: Commit**

```bash
git add api/routes/pantry.php api/routes/public.php tests/test_pantry_public.php
git commit -m "feat(api): pantry ingredients + public recipe view (no instructions)"
```

---

## Final review (after all tasks)

Dispatch a security-focused final reviewer over the full `api/routes/` + `api/lib/` set. Confirm:
- Every authenticated route derives `user_id` from the session; no client-supplied user_id is trusted.
- Child-table writes/reads go through `child_owned_or_404` or an `owned_or_404` parent check.
- The public route never returns instructions and only resolves real share tokens.
- No SQL string interpolation except allowlisted table names.
- Serialization produces the boolean/number/JSON types the frontend expects.

## Coverage check vs spec §7
- Folders ✓ (GET) · Tags ✓ (GET) · Recipes ✓ (full CRUD + children + duplicate) · Recipe-tags ✓ · Extraction-jobs ✓ (GET) · Grocery ✓ · Meal-plans ✓ · Collections + collection_recipes ✓ · Sharing ✓ (create + resolve) · Pantry ✓ · Public recipe ✓
- **Deferred (documented):** public *collections* endpoint (no frontend `/c/{token}` route exists) and first-login **seed** (decided in Plan 3: keep via API / port / drop).


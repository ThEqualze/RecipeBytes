# URL Recipe Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "Import a recipe from a link" modal work for web/blog URLs — a server-side endpoint extracts a recipe (schema.org JSON-LD first, Gemini Flash fallback) and pre-fills the existing editor for review.

**Architecture:** A new authenticated PHP endpoint `POST /api/import` fetches a user-supplied URL (SSRF-guarded), parses schema.org `Recipe` JSON-LD for free, falls back to Gemini Flash when absent, and returns the editor's `RecipeFormData` shape. The React `ImportModal` calls it and hands the result to the existing `RecipeEditor` (create mode) pre-filled; saving uses the existing `createRecipe` path. Pure extraction logic lives in a dependency-free lib unit-tested with fixtures; the live fetch + Gemini call are manually smoke-tested.

**Tech Stack:** PHP 8.2 (cURL, no Composer), MariaDB (unchanged), Gemini Flash REST API, Vite + React + TypeScript. Tests use the existing dependency-free PHP harness (`php tests/run.php`).

**Spec:** `docs/superpowers/specs/2026-06-08-url-recipe-import-design.md`

## Local environment reminders (Windows + XAMPP)
- MariaDB running on 127.0.0.1:3306; PHP API dev server `php -S 127.0.0.1:8000 router.php`; Vite proxies `/api`.
- Run PHP tests: `php tests/run.php` (must stay green; it truncates tables then includes every `tests/test_*.php`). Frontend gate: `npm run typecheck` + `npm run build`.
- Do NOT `git push` unless told. Commit after each task.

---

## File Structure

```
api/lib/import_extract.php   CREATE: pure extraction/mapping helpers (no I/O) — unit tested
api/routes/import.php        CREATE: POST /api/import — validate, SSRF-guard, fetch, extract, Gemini fallback
api/index.php                MODIFY: register '/import' => 'import.php' in the dispatcher
api/config.php               MODIFY (local): add gemini_api_key + gemini_model
api/config.example.php       MODIFY: add the same keys as placeholders
tests/test_import_extract.php CREATE: offline unit tests for the pure helpers
src/lib/api.ts               (unchanged — already has api.post)
src/components/ImportModal.tsx  MODIFY: real call + onImported prop + loading/error states
src/components/RecipeEditor.tsx MODIFY: optional initialForm prop seeds create-mode form
src/App.tsx                  MODIFY: hold imported draft, wire ImportModal -> editor
```

The pure helpers (`import_extract.php`) have one job — turn raw inputs (HTML string, Gemini JSON, an IP) into the editor shape or a boolean — and do no network/DB I/O, so they are fully unit-testable offline. The route (`import.php`) does the I/O and orchestration.

---

## Task 1: Pure helpers — empty form, ISO-8601 durations, SSRF IP guard

**Files:**
- Create: `api/lib/import_extract.php`
- Create: `tests/test_import_extract.php`

**Context:** Start the dependency-free lib with the three simplest pure functions. `empty_recipe_form()` returns the editor's `RecipeFormData` shape with safe defaults. `parse_iso8601_duration()` converts `PT1H30M` → minutes. `is_blocked_ip()` powers the SSRF guard. These need no network, so they're tested directly via the harness `check()`.

- [ ] **Step 1: Write `tests/test_import_extract.php`**

```php
<?php
require_once __DIR__ . '/../api/lib/import_extract.php';

// empty_recipe_form
$f = empty_recipe_form('https://example.com/r');
check('empty form has source_url', $f['source_url'] === 'https://example.com/r');
check('empty form yield defaults', $f['yield_amount'] === 1 && $f['yield_unit'] === 'servings');
check('empty form arrays', $f['ingredients'] === [] && $f['instructions'] === [] && $f['tagIds'] === []);
check('empty form folder null', $f['folder_id'] === null);

// parse_iso8601_duration
check('duration PT1H30M = 90', parse_iso8601_duration('PT1H30M') === 90);
check('duration PT45M = 45', parse_iso8601_duration('PT45M') === 45);
check('duration PT2H = 120', parse_iso8601_duration('PT2H') === 120);
check('duration P0DT0H20M = 20', parse_iso8601_duration('P0DT0H20M') === 20);
check('duration null = 0', parse_iso8601_duration(null) === 0);
check('duration junk = 0', parse_iso8601_duration('banana') === 0);

// is_blocked_ip
check('block loopback', is_blocked_ip('127.0.0.1') === true);
check('block private 10', is_blocked_ip('10.1.2.3') === true);
check('block private 192.168', is_blocked_ip('192.168.0.1') === true);
check('block metadata 169.254', is_blocked_ip('169.254.169.254') === true);
check('block ipv6 loopback', is_blocked_ip('::1') === true);
check('block non-ip', is_blocked_ip('not-an-ip') === true);
check('allow public ip', is_blocked_ip('8.8.8.8') === false);
```

- [ ] **Step 2: Run it, expect FAIL**

```bash
php tests/run.php; echo "exit=$?"
```
Expected: fatal/incmplete — functions undefined. Confirm RED.

- [ ] **Step 3: Create `api/lib/import_extract.php` with these three functions**

```php
<?php
// Pure extraction/mapping helpers for URL recipe import. NO network or DB I/O.

function empty_recipe_form(string $url): array {
    return [
        'title' => '',
        'description' => '',
        'cover_image_url' => '',
        'source_url' => $url,
        'source_author' => '',
        'folder_id' => null,
        'prep_time_minutes' => 0,
        'cook_time_minutes' => 0,
        'total_time_minutes' => 0,
        'yield_amount' => 1,
        'yield_unit' => 'servings',
        'notes' => '',
        'tagIds' => [],
        'ingredients' => [],
        'instructions' => [],
    ];
}

// ISO-8601 duration (e.g. "PT1H30M") -> whole minutes. Returns 0 on null/invalid.
function parse_iso8601_duration($d): int {
    if (!is_string($d)) return 0;
    if (!preg_match('/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/', trim($d), $m)) {
        return 0;
    }
    $days  = isset($m[1]) ? (int)$m[1] : 0;
    $hours = isset($m[2]) ? (int)$m[2] : 0;
    $mins  = isset($m[3]) ? (int)$m[3] : 0;
    $secs  = isset($m[4]) ? (int)$m[4] : 0;
    return $days * 1440 + $hours * 60 + $mins + (int)round($secs / 60);
}

// True if an IP is loopback/private/link-local/reserved (or not a valid IP).
// Used to block SSRF to internal hosts and cloud-metadata endpoints.
function is_blocked_ip(string $ip): bool {
    if (!filter_var($ip, FILTER_VALIDATE_IP)) return true;
    $public = filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    );
    return $public === false;
}
```

- [ ] **Step 4: Run it, expect PASS**

```bash
php tests/run.php; echo "exit=$?"
```
Expected: all new checks PASS plus the existing 90, `exit=0`.

- [ ] **Step 5: Commit**

```bash
git add api/lib/import_extract.php tests/test_import_extract.php
git commit -m "feat(import): pure helpers — empty form, ISO-8601 duration, SSRF IP guard"
```

---

## Task 2: JSON-LD recipe extraction → RecipeFormData

**Files:**
- Modify: `api/lib/import_extract.php`
- Modify: `tests/test_import_extract.php`

**Context:** Add the free-path extractor: find schema.org `Recipe` JSON-LD in page HTML and map it to the editor shape. Must tolerate `@graph` wrappers, `@type` as a string or array, `recipeInstructions` as strings / `HowToStep` / `HowToSection`, and `image`/`author`/`recipeYield` in their several shapes. Pure function over an HTML string — tested with a fixture.

- [ ] **Step 1: Add tests to `tests/test_import_extract.php`** (append before the end of file)

```php
// ---- JSON-LD extraction ----
$html = '<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","name":"ignore me"},
  {"@type":["Recipe","Thing"],
   "name":"Test Pancakes",
   "description":"Fluffy ones",
   "image":["https://img.test/a.jpg","https://img.test/b.jpg"],
   "author":{"@type":"Person","name":"Chef Ada"},
   "prepTime":"PT10M","cookTime":"PT20M","totalTime":"PT30M",
   "recipeYield":"4 servings",
   "recipeIngredient":["2 cups flour","1 tbsp sugar"," "],
   "recipeInstructions":[
     {"@type":"HowToStep","text":"Mix it"},
     {"@type":"HowToStep","text":"Cook it"}
   ]}
]}
</script></head><body>page</body></html>';

$r = extract_jsonld_recipe($html, 'https://blog.test/pancakes');
check('jsonld found a recipe', $r !== null);
check('jsonld title', $r['title'] === 'Test Pancakes');
check('jsonld description', $r['description'] === 'Fluffy ones');
check('jsonld image first url', $r['cover_image_url'] === 'https://img.test/a.jpg');
check('jsonld author name', $r['source_author'] === 'Chef Ada');
check('jsonld times', $r['prep_time_minutes'] === 10 && $r['cook_time_minutes'] === 20 && $r['total_time_minutes'] === 30);
check('jsonld yield split', $r['yield_amount'] === 4.0 && $r['yield_unit'] === 'servings');
check('jsonld source_url preserved', $r['source_url'] === 'https://blog.test/pancakes');
check('jsonld 2 ingredients (blank dropped)', count($r['ingredients']) === 2);
check('jsonld ingredient line in name', $r['ingredients'][0]['name'] === '2 cups flour' && $r['ingredients'][0]['quantity'] === '');
check('jsonld 2 instructions', count($r['instructions']) === 2 && $r['instructions'][1]['content'] === 'Cook it');

// instructions as plain strings + recipeYield as number
$html2 = '<script type="application/ld+json">{"@type":"Recipe","name":"Soup","recipeYield":2,"recipeInstructions":["Boil","Serve"]}</script>';
$r2 = extract_jsonld_recipe($html2, 'https://x.test/soup');
check('jsonld string instructions', count($r2['instructions']) === 2 && $r2['instructions'][0]['content'] === 'Boil');
check('jsonld numeric yield', $r2['yield_amount'] === 2.0);

// no recipe present
check('jsonld absent -> null', extract_jsonld_recipe('<html><body>nothing</body></html>', 'https://x.test') === null);
```

- [ ] **Step 2: Run, expect FAIL** (`extract_jsonld_recipe` undefined). `php tests/run.php; echo "exit=$?"`

- [ ] **Step 3: Append these functions to `api/lib/import_extract.php`**

```php
// ---- JSON-LD extraction ----

function type_is_recipe($type): bool {
    if (is_string($type)) return strcasecmp($type, 'Recipe') === 0;
    if (is_array($type)) {
        foreach ($type as $t) {
            if (is_string($t) && strcasecmp($t, 'Recipe') === 0) return true;
        }
    }
    return false;
}

function find_recipe_node(array $data): ?array {
    if (isset($data['@type']) && type_is_recipe($data['@type'])) return $data;
    if (isset($data['@graph']) && is_array($data['@graph'])) {
        foreach ($data['@graph'] as $node) {
            if (is_array($node) && isset($node['@type']) && type_is_recipe($node['@type'])) return $node;
        }
    }
    if (array_is_list($data)) {
        foreach ($data as $node) {
            if (is_array($node)) {
                $found = find_recipe_node($node);
                if ($found) return $found;
            }
        }
    }
    return null;
}

function jsonld_author($a): string {
    if (is_string($a)) return trim($a);
    if (is_array($a)) {
        if (isset($a['name']) && is_string($a['name'])) return trim($a['name']);
        if (array_is_list($a) && isset($a[0])) return jsonld_author($a[0]);
    }
    return '';
}

function jsonld_image($img): string {
    if (is_string($img)) return trim($img);
    if (is_array($img)) {
        if (isset($img['url']) && is_string($img['url'])) return trim($img['url']);
        if (array_is_list($img) && isset($img[0])) return jsonld_image($img[0]);
    }
    return '';
}

// Returns [float amount, string unit].
function jsonld_yield($y): array {
    if (is_int($y) || is_float($y)) return [(float)$y, 'servings'];
    if (is_array($y) && array_is_list($y) && isset($y[0])) $y = $y[0];
    if (is_string($y)) {
        if (preg_match('/(\d+(?:\.\d+)?)\s*(.*)$/', trim($y), $m)) {
            $unit = trim($m[2]);
            return [(float)$m[1], $unit !== '' ? $unit : 'servings'];
        }
    }
    return [1.0, 'servings'];
}

function jsonld_ingredients($ing): array {
    $out = [];
    if (is_array($ing)) {
        foreach ($ing as $line) {
            if (is_string($line) && trim($line) !== '') $out[] = trim($line);
        }
    }
    return $out;
}

function jsonld_instructions($inst): array {
    $out = [];
    if (is_string($inst)) {
        $t = trim($inst);
        if ($t !== '') $out[] = $t;
        return $out;
    }
    if (is_array($inst)) {
        foreach ($inst as $node) {
            if (is_string($node)) {
                if (trim($node) !== '') $out[] = trim($node);
            } elseif (is_array($node)) {
                $type = $node['@type'] ?? '';
                if ($type === 'HowToSection' && isset($node['itemListElement']) && is_array($node['itemListElement'])) {
                    foreach (jsonld_instructions($node['itemListElement']) as $s) $out[] = $s;
                } elseif (isset($node['text']) && is_string($node['text'])) {
                    if (trim($node['text']) !== '') $out[] = trim($node['text']);
                } elseif (isset($node['name']) && is_string($node['name'])) {
                    if (trim($node['name']) !== '') $out[] = trim($node['name']);
                }
            }
        }
    }
    return $out;
}

function map_jsonld_recipe(array $r, string $url): array {
    $form = empty_recipe_form($url);
    $form['title'] = (isset($r['name']) && is_string($r['name']) && trim($r['name']) !== '')
        ? trim($r['name']) : 'Imported Recipe';
    if (isset($r['description']) && is_string($r['description'])) $form['description'] = trim($r['description']);
    $form['source_author'] = jsonld_author($r['author'] ?? null);
    $form['cover_image_url'] = jsonld_image($r['image'] ?? null);
    $form['prep_time_minutes'] = parse_iso8601_duration($r['prepTime'] ?? null);
    $form['cook_time_minutes'] = parse_iso8601_duration($r['cookTime'] ?? null);
    $form['total_time_minutes'] = parse_iso8601_duration($r['totalTime'] ?? null);
    [$amt, $unit] = jsonld_yield($r['recipeYield'] ?? null);
    $form['yield_amount'] = $amt;
    $form['yield_unit'] = $unit;
    foreach (jsonld_ingredients($r['recipeIngredient'] ?? null) as $line) {
        $form['ingredients'][] = ['quantity' => '', 'unit' => '', 'name' => $line, 'prep_note' => '', 'group_name' => ''];
    }
    foreach (jsonld_instructions($r['recipeInstructions'] ?? null) as $content) {
        $form['instructions'][] = ['content' => $content, 'timer_seconds' => '', 'group_name' => ''];
    }
    return $form;
}

// Parse all JSON-LD blocks from HTML and return the first Recipe mapped to RecipeFormData, or null.
function extract_jsonld_recipe(string $html, string $url): ?array {
    if (!preg_match_all('#<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>#is', $html, $matches)) {
        return null;
    }
    foreach ($matches[1] as $block) {
        $data = json_decode(trim($block), true);
        if (!is_array($data)) continue;
        $recipe = find_recipe_node($data);
        if ($recipe) return map_jsonld_recipe($recipe, $url);
    }
    return null;
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
php tests/run.php; echo "exit=$?"
```
Expected: all JSON-LD checks pass plus prior; `exit=0`.

- [ ] **Step 5: Commit**

```bash
git add api/lib/import_extract.php tests/test_import_extract.php
git commit -m "feat(import): schema.org JSON-LD recipe extraction to editor shape"
```

---

## Task 3: Gemini response mapper

**Files:**
- Modify: `api/lib/import_extract.php`
- Modify: `tests/test_import_extract.php`

**Context:** The Gemini fallback returns a JSON object with our fields; `map_gemini_recipe()` normalises it into `RecipeFormData` (pure, tested with a fixture). The actual HTTP call to Gemini is added in Task 4 (not unit-tested — it's network I/O). Gemini is asked to return ingredients pre-split (`quantity/unit/name/prep_note`); the mapper tolerates missing pieces.

- [ ] **Step 1: Add tests to `tests/test_import_extract.php`**

```php
// ---- Gemini mapper ----
$gem = [
  'title' => 'Gemini Stew',
  'description' => 'Hearty',
  'source_author' => 'Some Blog',
  'cover_image_url' => 'https://img.test/stew.jpg',
  'prep_time_minutes' => 15,
  'cook_time_minutes' => 90,
  'total_time_minutes' => 105,
  'yield_amount' => 6,
  'yield_unit' => 'bowls',
  'ingredients' => [
    ['quantity' => '500', 'unit' => 'g', 'name' => 'beef', 'prep_note' => 'cubed'],
    ['name' => 'salt'],
  ],
  'instructions' => [
    ['content' => 'Brown the beef'],
    ['content' => 'Simmer'],
  ],
];
$m = map_gemini_recipe($gem, 'https://blog.test/stew');
check('gemini title', $m['title'] === 'Gemini Stew');
check('gemini source_url', $m['source_url'] === 'https://blog.test/stew');
check('gemini times', $m['cook_time_minutes'] === 90 && $m['total_time_minutes'] === 105);
check('gemini yield', $m['yield_amount'] === 6.0 && $m['yield_unit'] === 'bowls');
check('gemini ingredient split', $m['ingredients'][0]['quantity'] === '500' && $m['ingredients'][0]['name'] === 'beef' && $m['ingredients'][0]['prep_note'] === 'cubed');
check('gemini ingredient partial', $m['ingredients'][1]['name'] === 'salt' && $m['ingredients'][1]['unit'] === '');
check('gemini instructions', count($m['instructions']) === 2 && $m['instructions'][0]['content'] === 'Brown the beef');

// empty/garbage gemini object still yields a safe form
$m2 = map_gemini_recipe([], 'https://x.test');
check('gemini empty -> default title', $m2['title'] === 'Imported Recipe');
check('gemini empty -> no ingredients', $m2['ingredients'] === []);
```

- [ ] **Step 2: Run, expect FAIL** (`map_gemini_recipe` undefined). `php tests/run.php; echo "exit=$?"`

- [ ] **Step 3: Append `map_gemini_recipe` to `api/lib/import_extract.php`**

```php
// ---- Gemini fallback mapper ----

function map_gemini_recipe(array $g, string $url): array {
    $form = empty_recipe_form($url);
    $str = fn($k) => (isset($g[$k]) && is_string($g[$k])) ? trim($g[$k]) : '';
    $int = fn($k) => isset($g[$k]) && is_numeric($g[$k]) ? (int)$g[$k] : 0;

    $form['title'] = $str('title') !== '' ? $str('title') : 'Imported Recipe';
    $form['description'] = $str('description');
    $form['source_author'] = $str('source_author');
    $form['cover_image_url'] = $str('cover_image_url');
    $form['prep_time_minutes'] = $int('prep_time_minutes');
    $form['cook_time_minutes'] = $int('cook_time_minutes');
    $form['total_time_minutes'] = $int('total_time_minutes');
    if (isset($g['yield_amount']) && is_numeric($g['yield_amount'])) $form['yield_amount'] = (float)$g['yield_amount'];
    if ($str('yield_unit') !== '') $form['yield_unit'] = $str('yield_unit');

    if (isset($g['ingredients']) && is_array($g['ingredients'])) {
        foreach ($g['ingredients'] as $ing) {
            if (is_string($ing)) {
                if (trim($ing) !== '') {
                    $form['ingredients'][] = ['quantity' => '', 'unit' => '', 'name' => trim($ing), 'prep_note' => '', 'group_name' => ''];
                }
            } elseif (is_array($ing)) {
                $name = isset($ing['name']) && is_string($ing['name']) ? trim($ing['name']) : '';
                if ($name === '') continue;
                $form['ingredients'][] = [
                    'quantity' => isset($ing['quantity']) ? (string)$ing['quantity'] : '',
                    'unit' => isset($ing['unit']) && is_string($ing['unit']) ? trim($ing['unit']) : '',
                    'name' => $name,
                    'prep_note' => isset($ing['prep_note']) && is_string($ing['prep_note']) ? trim($ing['prep_note']) : '',
                    'group_name' => '',
                ];
            }
        }
    }
    if (isset($g['instructions']) && is_array($g['instructions'])) {
        foreach ($g['instructions'] as $step) {
            $content = '';
            if (is_string($step)) $content = trim($step);
            elseif (is_array($step) && isset($step['content']) && is_string($step['content'])) $content = trim($step['content']);
            if ($content !== '') {
                $form['instructions'][] = ['content' => $content, 'timer_seconds' => '', 'group_name' => ''];
            }
        }
    }
    return $form;
}
```

- [ ] **Step 4: Run, expect PASS.** `php tests/run.php; echo "exit=$?"` — all pass, `exit=0`.

- [ ] **Step 5: Commit**

```bash
git add api/lib/import_extract.php tests/test_import_extract.php
git commit -m "feat(import): Gemini response mapper to editor shape"
```

---

## Task 4: The `/api/import` endpoint (fetch, SSRF guard, orchestration)

**Files:**
- Create: `api/routes/import.php`
- Modify: `api/index.php` (register the route)
- Modify: `api/config.php` and `api/config.example.php` (Gemini keys)
- Create: `tests/test_import_endpoint.php` (offline guard tests — no external network)

**Context:** The route validates the URL, blocks SSRF (re-validating every redirect hop), fetches the page, tries JSON-LD, then Gemini. The live fetch + Gemini call are network I/O (manually smoke-tested); the automated tests cover only the deterministic guard paths (auth required, blocked/invalid URLs), which need no external network.

- [ ] **Step 1: Register the route in `api/index.php`.** In the `$routes` array, after the `'/public' => 'public.php',` line, add:

```php
    '/import'          => 'import.php',
```

- [ ] **Step 2: Add Gemini keys to `api/config.example.php`** (before the closing `];`):

```php
    // Google AI Studio (Gemini) — server-side only. Leave key empty to disable
    // the AI fallback (JSON-LD-only import still works).
    'gemini_api_key' => '',
    'gemini_model'   => 'gemini-2.0-flash',
```
And add the same two keys to your local `api/config.php` (the key can stay empty locally for now; tests don't need it).

- [ ] **Step 3: Write `tests/test_import_endpoint.php`**

```php
<?php
reset_cookies();
// unauthenticated -> 401
check('import requires auth (401)', api('POST', '/import', ['url' => 'https://example.com'])['status'] === 401);

$email = 'import_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'I']);

check('missing url -> 400', api('POST', '/import', [])['status'] === 400);
check('non-http scheme -> 400', api('POST', '/import', ['url' => 'ftp://example.com/x'])['status'] === 400);
check('loopback blocked -> 400', api('POST', '/import', ['url' => 'http://127.0.0.1/'])['status'] === 400);
check('private ip blocked -> 400', api('POST', '/import', ['url' => 'http://10.0.0.1/'])['status'] === 400);
check('metadata ip blocked -> 400', api('POST', '/import', ['url' => 'http://169.254.169.254/latest/meta-data/'])['status'] === 400);
check('garbage url -> 400', api('POST', '/import', ['url' => 'not a url'])['status'] === 400);
```

- [ ] **Step 4: Run, expect FAIL** (route absent → 404s, not the expected codes). `php tests/run.php; echo "exit=$?"`

- [ ] **Step 5: Write `api/routes/import.php`**

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/import_extract.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path !== '/import' || $method !== 'POST') {
    json_error('Not found', 404);
}

$body = read_json_body();
$url = is_string($body['url'] ?? null) ? trim($body['url']) : '';

$err = validate_public_url($url);
if ($err !== null) json_error($err, 400);

$html = safe_fetch($url, $fetchErr);
if ($html === null) json_error($fetchErr ?? 'Couldn\'t reach that page.', 502);

// Free path: schema.org JSON-LD
$form = extract_jsonld_recipe($html, $url);
if ($form !== null) json_ok($form);

// Fallback: Gemini (only if a key is configured)
$cfg = app_config();
$key = is_string($cfg['gemini_api_key'] ?? null) ? $cfg['gemini_api_key'] : '';
if ($key === '') json_error('We couldn\'t find a recipe on that page.', 422);

$model = is_string($cfg['gemini_model'] ?? null) && $cfg['gemini_model'] !== '' ? $cfg['gemini_model'] : 'gemini-2.0-flash';
$form = gemini_extract($html, $url, $key, $model, $gemErr);
if ($form === null) {
    json_error($gemErr ?? 'We couldn\'t find a recipe on that page.', $gemErr !== null ? 502 : 422);
}
json_ok($form);


// ---- I/O helpers (live here, not in the pure lib) ----

function validate_public_url(string $url): ?string {
    if ($url === '') return 'Please enter a URL.';
    $parts = parse_url($url);
    if ($parts === false || !isset($parts['scheme']) || !isset($parts['host'])) {
        return 'That doesn\'t look like a valid URL.';
    }
    if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
        return 'Only http and https URLs are supported.';
    }
    foreach (resolve_ips($parts['host']) as $ip) {
        if (is_blocked_ip($ip)) return 'That URL can\'t be imported.';
    }
    return null;
}

function resolve_ips(string $host): array {
    if (filter_var($host, FILTER_VALIDATE_IP)) return [$host];
    $ips = [];
    $v4 = @gethostbynamel($host);
    if (is_array($v4)) $ips = array_merge($ips, $v4);
    $aaaa = @dns_get_record($host, DNS_AAAA);
    if (is_array($aaaa)) {
        foreach ($aaaa as $rec) {
            if (isset($rec['ipv6'])) $ips[] = $rec['ipv6'];
        }
    }
    if (empty($ips)) $ips = ['0.0.0.0']; // unresolvable -> treat as blocked
    return $ips;
}

function safe_fetch(string $url, ?string &$error = null): ?string {
    $maxRedirects = 5;
    $maxBytes = 2 * 1024 * 1024;
    for ($i = 0; $i <= $maxRedirects; $i++) {
        if (validate_public_url($url) !== null) { $error = 'That URL can\'t be imported.'; return null; }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; RecipeBytes/1.0; +https://recipebytes.co.uk)',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_NOPROGRESS => false,
            CURLOPT_PROGRESSFUNCTION => function ($ch, $dlTotal, $dlNow) use ($maxBytes) {
                return ($dlNow > $maxBytes) ? 1 : 0;
            },
        ]);
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $redirect = curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        curl_close($ch);
        if ($resp === false) { $error = 'Couldn\'t reach that page.'; return null; }
        if ($code >= 300 && $code < 400 && is_string($redirect) && $redirect !== '') { $url = $redirect; continue; }
        if ($code >= 400) { $error = 'That page returned an error (' . $code . ').'; return null; }
        return (string)$resp;
    }
    $error = 'Too many redirects.';
    return null;
}

function gemini_extract(string $html, string $url, string $key, string $model, ?string &$error = null): ?array {
    $text = preg_replace('#<script\b[^>]*>.*?</script>#is', ' ', $html);
    $text = preg_replace('#<style\b[^>]*>.*?</style>#is', ' ', $text);
    $text = preg_replace('#<[^>]+>#', ' ', $text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = trim(preg_replace('/\s+/', ' ', $text));
    if (mb_strlen($text) > 12000) $text = mb_substr($text, 0, 12000);

    $prompt = "Extract the recipe from the following web page text. "
        . "Respond with ONLY a JSON object (no markdown fences) with keys: "
        . "title (string), description (string), source_author (string), cover_image_url (string), "
        . "prep_time_minutes (integer), cook_time_minutes (integer), total_time_minutes (integer), "
        . "yield_amount (number), yield_unit (string), "
        . "ingredients (array of objects {quantity, unit, name, prep_note}), "
        . "instructions (array of objects {content}). "
        . "If the page is not a recipe, return {\"title\":\"\"}. Page text:\n\n" . $text;

    $payload = json_encode([
        'contents' => [['parts' => [['text' => $prompt]]]],
        'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.2],
    ]);
    $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model)
        . ':generateContent?key=' . rawurlencode($key);

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code >= 400) { $error = 'AI extraction is unavailable right now.'; return null; }

    $data = json_decode($resp, true);
    $textOut = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if (!is_string($textOut) || trim($textOut) === '') { $error = 'AI extraction is unavailable right now.'; return null; }
    $recipe = json_decode($textOut, true);
    if (!is_array($recipe) || ((($recipe['title'] ?? '') === '') && empty($recipe['ingredients']))) {
        return null; // not a recipe -> caller returns 422 (error stays null)
    }
    return map_gemini_recipe($recipe, $url);
}
```

Note: named functions are hoisted in PHP, so defining the helpers after the top-level orchestration code is fine. The dispatcher loads exactly one route file per request, so these global helper names don't collide with other routes.

- [ ] **Step 6: Run, expect PASS** (guard tests now return the right codes)

```bash
php tests/run.php; echo "exit=$?"
```
Expected: all 7 import-endpoint checks pass plus prior suites; `exit=0`. (No external network is hit — every tested URL is rejected by the guard before fetch.)

- [ ] **Step 7: Commit**

```bash
git add api/routes/import.php api/index.php api/config.example.php tests/test_import_endpoint.php
git commit -m "feat(import): /api/import endpoint — SSRF-guarded fetch, JSON-LD, Gemini fallback"
```

---

## Task 5: Frontend — real import modal + editor pre-fill

**Files:**
- Modify: `src/components/ImportModal.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/RecipeEditor.tsx`

**Context:** Replace the fake submit with a real API call; pass the result to the existing create editor, pre-filled. No automated frontend tests in this project — the gate is `npm run typecheck` + `npm run build`, then manual smoke.

- [ ] **Step 1: Rewrite `src/components/ImportModal.tsx`.** Replace the file with:

```tsx
import { useState } from 'react';
import { Sparkles, X, Music2, Instagram, Facebook, Youtube, Globe, Loader2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { RecipeFormData } from './RecipeEditor';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (data: RecipeFormData) => void;
}

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    if (!url || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<RecipeFormData>('/import', { url });
      setUrl('');
      setBusy(false);
      onImported(data);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : 'Something went wrong importing that link.');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg p-7 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-md hover:bg-stone-100 flex items-center justify-center text-stone-500"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-accent-700 text-[12px] uppercase tracking-wider font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          AI extraction
        </div>
        <h2 className="font-display text-[26px] font-semibold text-stone-900 leading-tight mb-2">
          Import a recipe from a link
        </h2>
        <p className="text-[14px] text-stone-500 leading-relaxed mb-5">
          Paste a recipe blog or web page URL. We'll pull the recipe and open it in the
          editor for you to review.
        </p>

        <div className="flex items-center gap-1.5 mb-3">
          {[Music2, Instagram, Facebook, Youtube, Globe].map((Icon, i) => (
            <span
              key={i}
              className="w-8 h-8 rounded-md bg-stone-100 flex items-center justify-center text-stone-500"
            >
              <Icon className="w-4 h-4" />
            </span>
          ))}
        </div>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder="https://example.com/best-pancakes"
          className="w-full px-3.5 py-3 text-[14px] bg-stone-50 border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300 mb-3"
        />

        {error && (
          <div className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!url || busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-lg transition-colors"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? 'Extracting…' : 'Extract recipe'}
          </button>
        </div>

        <div className="mt-5 p-3 rounded-lg bg-stone-50 border border-stone-100">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-1">
            How it works
          </div>
          <ol className="text-[12px] text-stone-600 leading-relaxed list-decimal list-inside space-y-0.5">
            <li>Fetch the recipe page</li>
            <li>Read its structured recipe data (or use AI if needed)</li>
            <li>Open it pre-filled in the editor</li>
            <li>Review and save to your library</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the `initialForm` prop to `src/components/RecipeEditor.tsx`.**
   1. In `interface RecipeEditorProps`, add: `initialForm?: RecipeFormData;`
   2. Add `initialForm` to the destructured props in the `RecipeEditor({ ... })` signature.
   3. Find where the component initialises its form `useState` for **create** mode (it currently builds an empty `RecipeFormData` — using `emptyIngredient()`/`emptyInstruction()` and empty strings). Change that initial value so that when `mode === 'create' && initialForm` is provided, the state is seeded from `initialForm` (its `ingredients`/`instructions` arrays included; if `initialForm.ingredients` is empty, fall back to one `emptyIngredient()` row, and likewise one `emptyInstruction()` row, so the editor still shows a starting row). Edit mode is unchanged.

   Read the file first to match its exact state-initialisation pattern, then wire `initialForm` into it. The interface change is the contract; the seeding must preserve current create-mode behaviour when `initialForm` is undefined.

- [ ] **Step 3: Wire `src/App.tsx`.**
   1. Add state near the other editor state: `const [importedForm, setImportedForm] = useState<RecipeFormData | null>(null);`
   2. Update the `ImportModal` usage (currently `<ImportModal open={importOpen} onClose={() => setImportOpen(false)} />`) to:
      ```tsx
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(data) => {
          setImportedForm(data);
          setImportOpen(false);
          setEditorMode('create');
        }}
      />
      ```
   3. On the create-mode `RecipeEditor` (the `editorMode === 'create'` branch), pass `initialForm={importedForm ?? undefined}`.
   4. Ensure `importedForm` is cleared when the create editor closes or saves: in that branch's `onSave` (after it sets `editorMode(null)`) and `onCancel`, also call `setImportedForm(null)`.

- [ ] **Step 4: Typecheck + build**

```bash
npm run typecheck; echo "tc=$?"
npm run build; echo "build=$?"
```
Expected: both `=0`, no errors. Fix any type mismatch (e.g. ensure `RecipeFormData` is imported where used).

- [ ] **Step 5: Commit**

```bash
git add src/components/ImportModal.tsx src/components/RecipeEditor.tsx src/App.tsx
git commit -m "feat(import): real import modal calling /api/import, pre-fills the editor"
```

---

## Task 6: Deploy to 20i + live smoke (interactive — with the user)

**Files:** none (deployment)

**Context:** This is performed live with the user (they hold the 20i creds + Gemini key). It reuses the deploy zip flow from the migration. The new server files are `api/routes/import.php`, `api/lib/import_extract.php`, updated `api/index.php`, plus the rebuilt frontend bundle. The user must add their real `gemini_api_key` to the **server** `api/config.php`.

- [ ] **Step 1: Confirm full local green + build**

```bash
php tests/run.php; echo "exit=$?"      # all suites pass
npm run build; echo "build=$?"          # dist/ refreshed
```

- [ ] **Step 2: Build the deploy zip** (controller runs this PowerShell — forward-slash, BOM-free, excludes config.php/schema.sql):

```
# Same script used during the migration deploy; regenerates recipebytes-deploy.zip
# from dist/* + .htaccess + api/ (minus config.php, schema.sql).
```

- [ ] **Step 3: User uploads + extracts** `recipebytes-deploy.zip` into `public_html`, **overwriting** (preserves server `config.php`). Delete the zip after.

- [ ] **Step 4: User adds the Gemini key to the SERVER `public_html/api/config.php`** — set `'gemini_api_key' => '<their real key>'` and confirm `'gemini_model' => 'gemini-2.0-flash'`. (Edit the existing file; the BOM guard already handles any editor BOM.)

- [ ] **Step 5: Live smoke test.** On https://recipebytes.co.uk, open the import modal and paste a real recipe blog URL (one known to have JSON-LD, e.g. an AllRecipes or BBC Good Food page) → it should open the editor pre-filled → save → appears in the library. Then try a plain blog without JSON-LD to exercise the Gemini path.

---

## Self-Review Notes
- **Spec §4.2 SSRF** → Task 1 `is_blocked_ip` + Task 4 `validate_public_url`/`safe_fetch` (re-validates each redirect). ✓
- **Spec §4.4 JSON-LD** → Task 2 (`@graph`, `@type` array, `HowToStep`/`HowToSection`, image/author/yield variants). ✓
- **Spec §4.5 Gemini** → Task 3 mapper + Task 4 `gemini_extract`. ✓
- **Spec §4.6 mapping / §5 frontend** → Tasks 2–3 map to `RecipeFormData`; Task 5 wires modal→editor. ✓
- **Spec §6 errors** → Task 4 status codes (400/422/502) + modal display. ✓
- **Spec §7 config** → Task 4 Steps 1–2. ✓
- **Spec §8 testing** → Tasks 1–4 offline unit/guard tests; live fetch+Gemini = Task 6 manual smoke. ✓
- **Deferred (spec §10):** video extraction, Inbox flow, ingredient parser — not in any task, intentionally.

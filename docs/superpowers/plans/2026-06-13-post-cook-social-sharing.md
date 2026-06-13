# Post-Cook Social Sharing (Image) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add an "I cooked this" photo to a recipe and share it to social channels (mobile native share sheet incl. Instagram; desktop network buttons) with a public-on/off recipe link that shows a rich preview.

**Architecture:** New `recipes.cook_image_url` (reuses the existing `POST /api/uploads`). One idempotent share token per recipe with a revoke endpoint. A server-rendered page at `/r/{token}` (PHP) injects per-recipe Open Graph tags into the built `index.html` so pasted links preview the dish photo + title; humans still get the SPA. Frontend adds a `ShareCookDialog` on the recipe detail page using the Web Share API with a desktop fallback.

**Tech Stack:** PHP (vanilla, existing router + PDO), React + TypeScript, Vite, Tailwind, lucide-react. PHP unit tests via the existing `tests/harness.php` `check()` style; no JS test runner exists (frontend verified by `tsc`/`eslint`/manual).

---

## File Structure

- **Modify** `api/schema.sql` — add `cook_image_url` to the `recipes` table (fresh installs).
- **Create** `migrations/2026-06-13_add_cook_image_url.sql` — `ALTER TABLE` for existing DBs.
- **Modify** `api/routes/recipes.php` — add `cook_image_url` to the PATCH allowlist; make `POST /recipes/{id}/share` idempotent; add `DELETE /recipes/{id}/share`.
- **Create** `api/lib/og.php` — pure helpers: `og_absolutize_url`, `og_meta_block`, `og_render`.
- **Create** `api/og.php` — entry point for `/r/{token}`: load recipe by token, inject tags, serve shell.
- **Modify** `.htaccess` — rewrite `/r/{token}` → `api/og.php` before the SPA fallback.
- **Modify** `router.php` — dev parity: route `/r/{token}` to `api/og.php`.
- **Create** `tests/test_og.php` — unit tests for the OG helpers.
- **Modify** `tests/test_recipes.php` — integration tests for idempotent publish + revoke (run under the full DB harness).
- **Create** `src/lib/share.ts` — pure share-payload helpers.
- **Create** `src/components/ShareCookDialog.tsx` — the cook-photo + share UI.
- **Modify** `src/components/RecipeDetail.tsx` — "Share your cook" button opening the dialog.
- **Modify** `src/components/PublicRecipeView.tsx` — hero uses `cook_image_url ?? cover_image_url`.
- **Modify** `src/lib/database.types.ts` — add `cook_image_url` to the `Recipe` type.

---

## Task 1: Data model — `cook_image_url`

**Files:**
- Modify: `api/schema.sql` (recipes table)
- Create: `migrations/2026-06-13_add_cook_image_url.sql`

DDL only — no unit test. Verified by inspection + the column name matching its consumers (PATCH allowlist in Task 2, OG query in Task 4, frontend in Tasks 6–7).

- [ ] **Step 1: Add the column to the schema (fresh installs)**

In `api/schema.sql`, find the `recipes` table's `cover_image_url` line and add a sibling line immediately after it:

```sql
  cook_image_url     VARCHAR(2048) NOT NULL DEFAULT '',
```

- [ ] **Step 2: Create the migration for existing databases**

Create `migrations/2026-06-13_add_cook_image_url.sql`:

```sql
-- Add the "I cooked this" photo column to recipes.
-- Safe to run once per environment (phpMyAdmin -> SQL, or mysql CLI).
SET NAMES utf8mb4;
ALTER TABLE recipes
  ADD COLUMN cook_image_url VARCHAR(2048) NOT NULL DEFAULT '' AFTER cover_image_url;
```

- [ ] **Step 3: Commit**

```bash
git add api/schema.sql migrations/2026-06-13_add_cook_image_url.sql
git commit -m "feat(recipes): add cook_image_url column"
```

---

## Task 2: Backend — PATCH allowlist + idempotent publish + revoke

**Files:**
- Modify: `api/routes/recipes.php`
- Test: `tests/test_recipes.php` (integration; runs under `php tests/run.php` with a configured DB)

- [ ] **Step 1: Add `cook_image_url` to the PATCH allowlist**

In `api/routes/recipes.php`, the PATCH handler has a `$scalar` array (currently starts `['title','description','cover_image_url',`). Add `'cook_image_url'` right after `'cover_image_url'`:

```php
        $scalar = ['title','description','cover_image_url','cook_image_url','source_url','source_author','folder_id',
                   'prep_time_minutes','cook_time_minutes','total_time_minutes','yield_amount','yield_unit',
                   'notes','is_favorite','last_cooked_at','status'];
```

- [ ] **Step 2: Make publish idempotent and add revoke**

Replace the existing share POST block:

```php
if (preg_match('#^/recipes/([a-f0-9-]{36})/share$#', $path, $m) && $method === 'POST') {
    owned_or_404('recipes', $m[1], $uid);
    $token = bin2hex(random_bytes(12));
    db()->prepare('INSERT INTO shared_recipes (id,recipe_id,user_id,token,message,created_at) VALUES (?,?,?,?,?,?)')
        ->execute([uuid4(), $m[1], $uid, $token, '', gmdate('Y-m-d H:i:s')]);
    json_ok(['token' => $token]);
}
```

with this (idempotent publish + a DELETE to revoke):

```php
if (preg_match('#^/recipes/([a-f0-9-]{36})/share$#', $path, $m) && $method === 'POST') {
    owned_or_404('recipes', $m[1], $uid);
    // Idempotent: one canonical token per recipe — reuse if it already exists.
    $existing = db()->prepare('SELECT token FROM shared_recipes WHERE recipe_id = ? LIMIT 1');
    $existing->execute([$m[1]]);
    $row = $existing->fetch();
    if ($row) {
        json_ok(['token' => $row['token']]);
    }
    $token = bin2hex(random_bytes(12));
    db()->prepare('INSERT INTO shared_recipes (id,recipe_id,user_id,token,message,created_at) VALUES (?,?,?,?,?,?)')
        ->execute([uuid4(), $m[1], $uid, $token, '', gmdate('Y-m-d H:i:s')]);
    json_ok(['token' => $token]);
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/share$#', $path, $m) && $method === 'DELETE') {
    owned_or_404('recipes', $m[1], $uid);
    db()->prepare('DELETE FROM shared_recipes WHERE recipe_id = ?')->execute([$m[1]]);
    json_ok(['ok' => true]);
}
```

(`json_ok` calls `exit`, so the early return when a token exists is safe.)

- [ ] **Step 3: Add integration test cases**

In `tests/test_recipes.php`, find where a recipe is created and a token is available (the file already exercises `/recipes` + share). Add these checks after an authenticated recipe (`$rid`) exists (adapt the existing variable names in that file — the recipe id and the `api()` helper from `harness.php`):

```php
// --- share publish is idempotent + revoke works ---
$pub1 = api('POST', "/recipes/$rid/share");
$pub2 = api('POST', "/recipes/$rid/share");
check('share publish idempotent (same token)',
    $pub1['status'] === 200 && $pub2['status'] === 200
    && $pub1['json']['data']['token'] === $pub2['json']['data']['token']);

$tok = $pub1['json']['data']['token'];
$before = api('GET', "/public/recipes/$tok", null, false);
check('public link live while published', $before['status'] === 200);

$rev = api('DELETE', "/recipes/$rid/share");
check('revoke ok', $rev['status'] === 200);

$after = api('GET', "/public/recipes/$tok", null, false);
check('public link 404s after revoke', $after['status'] === 404);
```

- [ ] **Step 4: Lint + (if a DB is configured) run the suite**

```bash
php -l api/routes/recipes.php
```
Expected: no syntax errors. If MySQL + `api/config.php` are configured locally, also run `php tests/run.php` and confirm the new share checks PASS (this needs the full HTTP+DB harness; skip if unavailable and rely on review).

- [ ] **Step 5: Commit**

```bash
git add api/routes/recipes.php tests/test_recipes.php
git commit -m "feat(recipes): idempotent share publish + revoke + cook_image_url PATCH"
```

---

## Task 3: Backend — Open Graph helpers (pure, TDD)

**Files:**
- Create: `api/lib/og.php`
- Test: `tests/test_og.php`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_og.php`:

```php
<?php
// Pure unit tests for the Open Graph helpers (no DB, no HTTP).
require_once __DIR__ . '/../api/lib/og.php';

// --- og_absolutize_url ---
check('absolutize relative path',
    og_absolutize_url('/uploads/covers/x.jpg', 'https', 'recipebytes.test') === 'https://recipebytes.test/uploads/covers/x.jpg');
check('absolutize passthrough absolute',
    og_absolutize_url('https://cdn.test/a.jpg', 'https', 'recipebytes.test') === 'https://cdn.test/a.jpg');
check('absolutize empty stays empty',
    og_absolutize_url('', 'https', 'recipebytes.test') === '');

// --- og_meta_block ---
$block = og_meta_block(['title' => 'Steak Frites', 'description' => 'Crispy', 'image' => 'https://h/x.jpg', 'url' => 'https://h/r/abc']);
check('meta has title', strpos($block, '<title>Steak Frites</title>') !== false);
check('meta has og:image', strpos($block, '<meta property="og:image" content="https://h/x.jpg" />') !== false);
check('meta has twitter card', strpos($block, 'name="twitter:card" content="summary_large_image"') !== false);

// escaping: a malicious title must not break out of the attribute
$evil = og_meta_block(['title' => '"><script>alert(1)</script>', 'description' => '', 'image' => '', 'url' => 'https://h/r/abc']);
check('meta escapes title', strpos($evil, '<script>alert(1)</script>') === false);
check('meta omits og:image when no image', strpos($evil, 'og:image') === false);

// --- og_render ---
$tpl = "<!doctype html><html><head>\n<title>Old</title>\n"
     . "<meta property=\"og:image\" content=\"https://old/default.png\" />\n"
     . "<meta name=\"twitter:image\" content=\"https://old/default.png\" />\n"
     . "</head><body><div id=\"root\"></div></body></html>";
$out = og_render($tpl, ['title' => 'New Dish', 'description' => 'Tasty', 'image' => 'https://h/new.jpg', 'url' => 'https://h/r/abc']);
check('render injects new title', strpos($out, '<title>New Dish</title>') !== false);
check('render drops old title', strpos($out, '<title>Old</title>') === false);
check('render injects new og:image', strpos($out, 'content="https://h/new.jpg"') !== false);
check('render drops old default og:image', strpos($out, 'old/default.png') === false);
check('render keeps app root', strpos($out, '<div id="root"></div>') !== false);
```

- [ ] **Step 2: Run to verify it fails**

```bash
php -r 'require "tests/harness.php"; require "tests/test_og.php"; exit($GLOBALS["TESTS_FAILED"] > 0 ? 1 : 0);'
```
Expected: FAIL — "Call to undefined function og_absolutize_url()".

- [ ] **Step 3: Write the implementation**

Create `api/lib/og.php`:

```php
<?php
// Pure helpers for server-rendered Open Graph tags on /r/{token}. No DB/network.

// Make a possibly-relative URL absolute against scheme+host. '' stays ''.
function og_absolutize_url(string $url, string $scheme, string $host): string {
    $url = trim($url);
    if ($url === '') return '';
    if (preg_match('#^https?://#i', $url)) return $url;
    return $scheme . '://' . $host . '/' . ltrim($url, '/');
}

// Build the <title> + OG/Twitter meta block. $r: title, description, image, url.
function og_meta_block(array $r): string {
    $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $title = trim((string)($r['title'] ?? '')) !== '' ? $r['title'] : 'A recipe on RecipeBytes';
    $desc  = trim((string)($r['description'] ?? ''));
    if ($desc === '') $desc = 'See the recipe and make it yourself.';
    if (mb_strlen($desc) > 200) $desc = mb_substr($desc, 0, 197) . '...';

    $lines = [
        '<title>' . $e($title) . '</title>',
        '<meta property="og:type" content="article" />',
        '<meta property="og:title" content="' . $e($title) . '" />',
        '<meta property="og:description" content="' . $e($desc) . '" />',
        '<meta property="og:url" content="' . $e($r['url'] ?? '') . '" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        '<meta name="twitter:title" content="' . $e($title) . '" />',
        '<meta name="twitter:description" content="' . $e($desc) . '" />',
    ];
    if (trim((string)($r['image'] ?? '')) !== '') {
        $lines[] = '<meta property="og:image" content="' . $e($r['image']) . '" />';
        $lines[] = '<meta name="twitter:image" content="' . $e($r['image']) . '" />';
    }
    return implode("\n    ", $lines);
}

// Strip the template's existing <title> + og:/twitter: meta and inject the
// recipe block before </head>. Returns the modified HTML.
function og_render(string $template, array $r): string {
    $html = preg_replace('#<title>.*?</title>#is', '', $template);
    $html = preg_replace('#<meta[^>]*(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*#i', '', $html);
    $block = og_meta_block($r);
    return preg_replace('#</head>#i', "    " . $block . "\n  </head>", $html, 1);
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
php -r 'require "tests/harness.php"; require "tests/test_og.php"; exit($GLOBALS["TESTS_FAILED"] > 0 ? 1 : 0);'
```
Expected: all checks PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/lib/og.php tests/test_og.php
git commit -m "feat(og): pure Open Graph tag helpers"
```

---

## Task 4: Backend — `/r/{token}` entry + routing

**Files:**
- Create: `api/og.php`
- Modify: `.htaccess`
- Modify: `router.php`

Uses `move_uploaded_file`-free logic; verified by lint + the helper tests from Task 3 + manual.

- [ ] **Step 1: Create the entry point**

Create `api/og.php`:

```php
<?php
// Server-rendered share page for /r/{token}: outputs the SPA shell with
// per-recipe Open Graph tags so pasted links preview the dish photo + title.
// Humans still get the SPA, which boots and renders the public recipe view.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lib/og.php';

$token = (isset($_GET['token']) && is_string($_GET['token'])) ? $_GET['token'] : '';

$indexPath = dirname(__DIR__) . '/index.html';
$template = is_file($indexPath)
    ? (string)file_get_contents($indexPath)
    : '<!doctype html><html><head></head><body><div id="root"></div></body></html>';

$scheme = ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')) ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';

header('Content-Type: text/html; charset=utf-8');

$recipe = null;
if ($token !== '' && preg_match('/^[A-Za-z0-9]+$/', $token)) {
    $stmt = db()->prepare(
        'SELECT r.title, r.description, r.cook_image_url, r.cover_image_url
           FROM shared_recipes sr JOIN recipes r ON r.id = sr.recipe_id
          WHERE sr.token = ?'
    );
    $stmt->execute([$token]);
    $recipe = $stmt->fetch();
}

if (!$recipe) {
    // Unknown/revoked token: serve the plain shell; the SPA shows its own state.
    echo $template;
    exit;
}

$image = $recipe['cook_image_url'] !== '' ? $recipe['cook_image_url'] : $recipe['cover_image_url'];
echo og_render($template, [
    'title'       => $recipe['title'],
    'description' => $recipe['description'],
    'image'       => og_absolutize_url((string)$image, $scheme, $host),
    'url'         => $scheme . '://' . $host . '/r/' . $token,
]);
```

- [ ] **Step 2: Add the production rewrite**

In `.htaccess`, insert the `/r/` rule **after** the "real files / api" passthrough block and **before** the SPA fallback line, so the file becomes:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Let real files and the /api backend be served directly
  RewriteCond %{REQUEST_URI} ^/api/ [OR]
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]

  # Server-rendered Open Graph tags for shared recipe links
  RewriteRule ^r/([A-Za-z0-9]+)$ api/og.php?token=$1 [L,QSA]

  # SPA fallback: everything else serves the app shell
  RewriteRule ^ index.html [L]
</IfModule>
```

- [ ] **Step 3: Add dev parity in `router.php`**

In `router.php`, after the `/api` branch (the `if (preg_match('#^/api(/|$)#', $path)) {...}` block) and before the static-file branch, add:

```php
if (preg_match('#^/r/([A-Za-z0-9]+)$#', $path, $m)) {
    $_GET['token'] = $m[1];
    require __DIR__ . '/api/og.php';
    return true;
}
```

- [ ] **Step 4: Lint**

```bash
php -l api/og.php && php -l router.php
```
Expected: no syntax errors in either.

- [ ] **Step 5: Commit**

```bash
git add api/og.php .htaccess router.php
git commit -m "feat(og): /r/{token} server-rendered share page + routing"
```

---

## Task 5: Frontend — share-payload helpers (pure)

**Files:**
- Create: `src/lib/share.ts`

No JS test runner exists; verified by `tsc` and by use in Task 6. Keep functions pure.

- [ ] **Step 1: Create the helper**

Create `src/lib/share.ts`:

```ts
export interface ShareNetworkLinks {
  x: string;
  facebook: string;
  whatsapp: string;
  pinterest: string;
}

// Default caption for a cooked dish.
export function cookCaption(title: string): string {
  return `I made ${title} 🍳`;
}

// The URL to include in a share: the public recipe link when public is on,
// otherwise the site homepage.
export function shareUrl(publicOn: boolean, token: string | null, origin: string): string {
  return publicOn && token ? `${origin}/r/${token}` : `${origin}/`;
}

// Pre-filled share URLs for desktop networks (the image comes from the page's
// Open Graph tags, except Pinterest which takes an explicit media URL).
export function networkShareLinks(url: string, text: string, imageUrl?: string): ShareNetworkLinks {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  const media = imageUrl ? `&media=${encodeURIComponent(imageUrl)}` : '';
  return {
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${u}&description=${t}${media}`,
  };
}

// Whether the browser can share this file via the native share sheet.
export function canShareFiles(file: File): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] });
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/share.ts
git commit -m "feat(share): pure share-payload helpers"
```

---

## Task 6: Frontend — ShareCookDialog component

**Files:**
- Create: `src/components/ShareCookDialog.tsx`
- Modify: `src/lib/database.types.ts` (add `cook_image_url` to `Recipe`)

- [ ] **Step 1: Add the type field**

In `src/lib/database.types.ts`, find the `Recipe` interface/type and add (next to `cover_image_url`):

```ts
  cook_image_url: string;
```

- [ ] **Step 2: Create the dialog**

Create `src/components/ShareCookDialog.tsx`:

```tsx
import { useState, useRef } from 'react';
import { X, Upload, Loader2, Share2, Link2, Download, Check } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { cookCaption, shareUrl, networkShareLinks, canShareFiles } from '../lib/share';

interface ShareCookDialogProps {
  recipe: { id: string; title: string; description: string; cover_image_url: string; cook_image_url: string };
  onClose: () => void;
  onUpdated: () => void;
}

export function ShareCookDialog({ recipe, onClose, onUpdated }: ShareCookDialogProps) {
  const [cookUrl, setCookUrl] = useState(recipe.cook_image_url || '');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publicOn, setPublicOn] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const origin = window.location.origin;
  const caption = cookCaption(recipe.title);
  const linkUrl = shareUrl(publicOn, token, origin);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!ok.includes(file.type)) { setError('Use a JPEG, PNG, WebP, or GIF image.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be 5 MB or smaller.'); return; }
    setError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api.upload<{ url: string }>('/uploads', fd);
      await api.patch(`/recipes/${recipe.id}`, { cook_image_url: data.url });
      setCookUrl(data.url);
      setPickedFile(file);
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const togglePublic = async () => {
    setBusy(true);
    setError('');
    try {
      if (!publicOn) {
        const data = await api.post<{ token: string }>(`/recipes/${recipe.id}/share`);
        setToken(data.token);
        setPublicOn(true);
      } else {
        await api.del(`/recipes/${recipe.id}/share`);
        setToken(null);
        setPublicOn(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update sharing.');
    } finally {
      setBusy(false);
    }
  };

  // Get a File for native sharing: the just-picked file, or fetch the stored image.
  const fileForShare = async (): Promise<File | null> => {
    if (pickedFile) return pickedFile;
    if (!cookUrl) return null;
    try {
      const res = await fetch(cookUrl);
      const blob = await res.blob();
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
      return new File([blob], `dish.${ext}`, { type: blob.type });
    } catch { return null; }
  };

  const nativeShare = async () => {
    setError('');
    const file = await fileForShare();
    const text = `${caption}${publicOn && token ? ` ${linkUrl}` : ''}`;
    try {
      if (file && canShareFiles(file)) {
        await navigator.share({ files: [file], text, url: publicOn && token ? linkUrl : undefined });
      } else if (typeof navigator.share === 'function') {
        await navigator.share({ text, url: publicOn && token ? linkUrl : undefined });
      } else {
        setError('Sharing is not supported here — use the buttons below.');
      }
    } catch {
      /* user cancelled the share sheet — ignore */
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const net = networkShareLinks(linkUrl, caption, cookUrl || undefined);
  const hasPhoto = !!cookUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-stone-900">Share your cook</h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Photo */}
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-xl overflow-hidden border border-stone-200 bg-stone-100 shrink-0">
            {hasPhoto && <img src={cookUrl} alt="" className="w-full h-full object-cover" />}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading…' : hasPhoto ? 'Replace photo' : 'Add a photo'}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" onChange={onPick} className="hidden" />
        </div>

        {/* Public toggle */}
        <label className="flex items-center justify-between gap-3 py-2">
          <span className="text-[13px] text-stone-700">Make this recipe public<br /><span className="text-[12px] text-stone-400">People who open your link can view the recipe.</span></span>
          <button
            type="button"
            onClick={togglePublic}
            disabled={busy}
            className={`relative w-11 h-6 rounded-full transition-colors ${publicOn ? 'bg-emerald-500' : 'bg-stone-300'} disabled:opacity-50`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${publicOn ? 'translate-x-5' : ''}`} />
          </button>
        </label>

        {error && <p className="text-[12px] text-red-600">{error}</p>}

        {/* Primary share */}
        <button
          type="button"
          onClick={nativeShare}
          disabled={!hasPhoto && !publicOn}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[14px] font-semibold text-white bg-stone-900 rounded-xl hover:bg-stone-800 disabled:opacity-40"
        >
          <Share2 className="w-4 h-4" /> Share
        </button>

        {/* Fallback links */}
        <div className="flex flex-wrap gap-2">
          <a href={net.x} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">X</a>
          <a href={net.facebook} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">Facebook</a>
          <a href={net.whatsapp} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">WhatsApp</a>
          <a href={net.pinterest} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">Pinterest</a>
          <button type="button" onClick={copyLink} className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />} Copy link
          </button>
          {cookUrl && (
            <a href={cookUrl} download className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] border border-stone-200 rounded-lg hover:bg-stone-50">
              <Download className="w-3.5 h-3.5" /> Save image
            </a>
          )}
        </div>
        <p className="text-[11px] text-stone-400">Instagram: tap Share on your phone and pick Instagram, or save the image and post it from the app.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck && npx eslint src/components/ShareCookDialog.tsx src/lib/share.ts
```
Expected: no errors in these files. (`npm run lint` has pre-existing errors in unrelated files — ignore those.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ShareCookDialog.tsx src/lib/database.types.ts
git commit -m "feat(share): ShareCookDialog (cook photo + public toggle + share)"
```

---

## Task 7: Frontend — wire into RecipeDetail + public hero

**Files:**
- Modify: `src/components/RecipeDetail.tsx`
- Modify: `src/components/PublicRecipeView.tsx`

- [ ] **Step 1: Add the "Share your cook" entry point in RecipeDetail**

In `src/components/RecipeDetail.tsx`:

1. Add imports near the top:
```ts
import { ShareCookDialog } from './ShareCookDialog';
import { ChefHat } from 'lucide-react';
```
2. Add state near the other `useState` declarations (around the existing `shareOpen` state):
```ts
  const [cookShareOpen, setCookShareOpen] = useState(false);
```
3. Add a visible trigger button. Find the action-button row in the header (where the existing Share button lives, near `title="Share recipe"`) and add, right after that share button:
```tsx
            <button
              onClick={() => setCookShareOpen(true)}
              title="Share your cook"
              className="p-2 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <ChefHat className="w-4 h-4 text-stone-600" />
            </button>
```
4. Render the dialog. Just before the component's final closing `</…>` of the root wrapper (alongside other conditionally-rendered overlays), add:
```tsx
      {cookShareOpen && (
        <ShareCookDialog
          recipe={{
            id: recipe.id,
            title: recipe.title,
            description: recipe.description,
            cover_image_url: recipe.cover_image_url,
            cook_image_url: recipe.cook_image_url ?? '',
          }}
          onClose={() => setCookShareOpen(false)}
          onUpdated={onUpdated}
        />
      )}
```
5. This needs an `onUpdated` callback prop so the page can refresh after the cook photo saves. Add `onUpdated: () => void;` to `RecipeDetail`'s props interface, and accept it in the destructured props. (Wiring it from the parent is Step 3.)

- [ ] **Step 2: Public hero uses the cook photo**

In `src/components/PublicRecipeView.tsx`, find where the hero image renders `recipe.cover_image_url` (the `{recipe.cover_image_url ? (... <img src={recipe.cover_image_url} ...>) : ...}` block) and change the source to prefer the cook photo. Define a local just above the JSX return:
```ts
  const heroImage = recipe.cook_image_url || recipe.cover_image_url;
```
Then replace the hero's condition and `src` to use `heroImage` (both the `{heroImage ? (` guard and `src={heroImage}`), and update the gradient/overlay conditions that referenced `recipe.cover_image_url` to use `heroImage`. If the public recipe TypeScript type doesn't include `cook_image_url`, add it to that type (it's returned by `/api/public/recipes/{token}` now that the column exists).

- [ ] **Step 3: Pass `onUpdated` from the parent**

In `src/App.tsx`, find where `<RecipeDetail ... />` is rendered (it already passes `onShare`, `onAddToGrocery`, etc.). Add an `onUpdated` prop wired to the existing data-refresh function used after edits (the same refresh used by the editor save / the recipes data hook). If a single refresh function isn't in scope there, pass the recipes-refetch from the data hook (e.g. `onUpdated={refreshRecipes}` using whatever the hook exposes). Confirm the active recipe re-reads so `cook_image_url` shows after upload.

- [ ] **Step 4: Typecheck, lint, build**

```bash
npm run typecheck && npx eslint src/components/RecipeDetail.tsx src/components/PublicRecipeView.tsx && npm run build
```
Expected: no errors in the touched files; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecipeDetail.tsx src/components/PublicRecipeView.tsx src/App.tsx
git commit -m "feat(share): cook-share entry on recipe detail + public cook hero"
```

---

## Task 8: Final verification + PR

- [ ] **Step 1: Full static checks**

```bash
php -l api/lib/og.php && php -l api/og.php && php -l api/routes/recipes.php && php -l router.php
php -r 'require "tests/harness.php"; require "tests/test_og.php"; exit($GLOBALS["TESTS_FAILED"] > 0 ? 1 : 0);'
npm run typecheck && npm run build
```
Expected: all PHP lint clean; OG tests PASS (exit 0); typecheck + build succeed.

- [ ] **Step 2: Apply the migration where it's needed**

The `cook_image_url` column must exist before the feature works. Run `migrations/2026-06-13_add_cook_image_url.sql` against the dev DB (and note it for production — it must run on 20i via phpMyAdmin before/at deploy).

- [ ] **Step 3: Manual end-to-end (dev)**

With XAMPP MySQL up (+ migration applied), the PHP API (`php -S 127.0.0.1:8000 router.php`), and `npm run dev`:
1. Open a recipe → click the **Share your cook** (chef hat) button.
2. Add a photo → confirm it uploads, shows in the dialog, and persists on the recipe after refresh.
3. Toggle **Make public** ON → confirm; open `/r/{token}` in another tab (logged out) → the public view shows the cook photo hero.
4. View source of `http://127.0.0.1:8000/r/{token}` → confirm `og:image` is the absolute cook-photo URL and `<title>` is the recipe title.
5. Toggle public OFF → `/r/{token}` no longer resolves to the recipe (public route 404).
6. Desktop: confirm the X/Facebook/WhatsApp/Pinterest buttons open prefilled, Copy link works, Save image downloads.
7. (On a phone if available) confirm the **Share** button opens the native sheet with the image.

- [ ] **Step 4: Ship**

```bash
git push -u origin feat/post-cook-social-sharing
gh pr create --base main --title "feat: post-cook social sharing (image)" --body "Adds a cook photo + share flow: native share sheet (Instagram/WhatsApp/etc.) with desktop fallback, per-share public on/off, and server-rendered Open Graph link previews at /r/{token}. New recipes.cook_image_url. Requires running migrations/2026-06-13_add_cook_image_url.sql on the DB. See docs/superpowers/specs/2026-06-13-post-cook-social-sharing-design.md."
```
After merge: **run the migration on 20i** (phpMyAdmin) so `cook_image_url` exists, then smoke-test one share on the live site.

---

## Notes for the implementer

- **Run PHP unit tests in isolation:** `php -r 'require "tests/harness.php"; require "tests/test_og.php"; ...'`. The full `tests/run.php` connects to MySQL + drives the HTTP API (heavier; needs a running server). The Task 2 share integration tests live in `tests/test_recipes.php` and only run under that full harness.
- **No JS test runner** exists (only `typecheck`/`lint`/`build`); `src/lib/share.ts` is pure and verified by `tsc` + use.
- **`cook_image_url` needs no serializer change** — `serialize_row` passes unknown string columns through and the routes `SELECT *`.
- **The migration is required** before the feature works end-to-end (dev and prod).
- **`onUpdated` wiring (Task 7 Step 3):** reuse whatever recipe-refresh the app already calls after an edit; the goal is that the active recipe re-reads so the new `cook_image_url` appears.

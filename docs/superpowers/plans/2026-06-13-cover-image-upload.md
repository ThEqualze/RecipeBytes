# Cover Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload a cover image file in the recipe editor (alongside the existing paste-a-URL field), stored on the 20i filesystem and referenced by a relative URL.

**Architecture:** A new auth-gated `POST /api/uploads` endpoint validates an uploaded image (real-image sniff, ≤5 MB, JPEG/PNG/WebP/GIF), saves it under `public_html/uploads/covers/<uuid>.<ext>`, and returns `{ url }`. The frontend adds an Upload button beside the URL input that posts the file and sets `cover_image_url` to the returned relative URL. No DB schema change — `cover_image_url` already stores a string.

**Tech Stack:** PHP (vanilla, existing router + `getimagesize`), React + TypeScript, Vite, Tailwind, lucide-react.

---

## File Structure

- **Create** `api/lib/uploads.php` — pure helpers: `validate_image_upload()`, `uploads_paths()`, `ensure_uploads_dir()`, `upload_htaccess_contents()`, constants.
- **Create** `api/routes/uploads.php` — the `POST /api/uploads` route (auth, move file, return URL).
- **Modify** `api/index.php` — register `'/uploads' => 'uploads.php'` in the route map.
- **Create** `tests/test_uploads.php` — unit tests for the pure helpers.
- **Modify** `src/lib/api.ts` — add `upload<T>(path, FormData)` (refactor response handling into a shared `handle()`).
- **Modify** `src/components/RecipeEditor.tsx` — Upload button + state + handler in the cover section.
- **Modify** `vite.config.ts` — proxy `/uploads` to the dev PHP server.
- **Modify** `config.example.php` — document optional `upload_dir` / `upload_base_url` overrides.

---

## Task 1: Image validation helper

**Files:**
- Create: `api/lib/uploads.php`
- Test: `tests/test_uploads.php`

- [ ] **Step 1: Write the failing test**

Create `tests/test_uploads.php`:

```php
<?php
// Pure unit tests for the cover-image upload helpers (no DB, no HTTP).
require_once __DIR__ . '/../api/lib/uploads.php';

function _rb_fixture(string $b64): string {
    $tmp = tempnam(sys_get_temp_dir(), 'rbupl');
    file_put_contents($tmp, base64_decode($b64));
    return $tmp;
}

$FIX = [
  'png'  => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'gif'  => 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'jpeg' => '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'webp' => 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
];

// --- validate_image_upload: valid images map to the right extension ---
$png = _rb_fixture($FIX['png']);
$r = validate_image_upload(filesize($png), $png);
check('png accepted as png', $r['error'] === null && $r['ext'] === 'png');

$gif = _rb_fixture($FIX['gif']);
$r = validate_image_upload(filesize($gif), $gif);
check('gif accepted as gif', $r['error'] === null && $r['ext'] === 'gif');

$jpg = _rb_fixture($FIX['jpeg']);
$r = validate_image_upload(filesize($jpg), $jpg);
check('jpeg accepted as jpg', $r['error'] === null && $r['ext'] === 'jpg');

$webp = _rb_fixture($FIX['webp']);
$r = validate_image_upload(filesize($webp), $webp);
check('webp accepted as webp', $r['error'] === null && $r['ext'] === 'webp');

// --- validate_image_upload: rejections ---
$r = validate_image_upload(6 * 1024 * 1024, $png);
check('oversize rejected', $r['ext'] === null && $r['error'] !== null);

$r = validate_image_upload(0, $png);
check('empty rejected', $r['ext'] === null && $r['error'] !== null);

$txt = tempnam(sys_get_temp_dir(), 'rbupl');
file_put_contents($txt, 'this is plainly not an image');
$r = validate_image_upload(filesize($txt), $txt);
check('non-image rejected', $r['ext'] === null && $r['error'] !== null);

foreach ([$png, $gif, $jpg, $webp, $txt] as $f) @unlink($f);
```

- [ ] **Step 2: Run test to verify it fails**

Run from repo root:

```bash
php -r 'require "tests/harness.php"; require "tests/test_uploads.php"; exit($GLOBALS["TESTS_FAILED"] > 0 ? 1 : 0);'
```

Expected: FAIL — fatal error "Call to undefined function validate_image_upload()" (the lib doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `api/lib/uploads.php`:

```php
<?php
// Pure helpers for cover-image uploads. NO DB or network I/O.

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Allowed image types (from getimagesize) -> safe file extension.
function upload_allowed_types(): array {
    return [
        IMAGETYPE_JPEG => 'jpg',
        IMAGETYPE_PNG  => 'png',
        IMAGETYPE_WEBP => 'webp',
        IMAGETYPE_GIF  => 'gif',
    ];
}

// Validate a just-uploaded image by size and by sniffing the real bytes.
// Returns ['ext' => 'jpg', 'error' => null] on success,
// or ['ext' => null, 'error' => '<reason>'] on failure.
function validate_image_upload(int $size, string $tmpPath): array {
    if ($size <= 0) {
        return ['ext' => null, 'error' => 'The file is empty.'];
    }
    if ($size > UPLOAD_MAX_BYTES) {
        return ['ext' => null, 'error' => 'Image must be 5 MB or smaller.'];
    }
    $info = @getimagesize($tmpPath);
    if ($info === false || !isset($info[2])) {
        return ['ext' => null, 'error' => 'That file is not a valid image.'];
    }
    $allowed = upload_allowed_types();
    if (!isset($allowed[$info[2]])) {
        return ['ext' => null, 'error' => 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.'];
    }
    return ['ext' => $allowed[$info[2]], 'error' => null];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
php -r 'require "tests/harness.php"; require "tests/test_uploads.php"; exit($GLOBALS["TESTS_FAILED"] > 0 ? 1 : 0);'
```

Expected: PASS lines for all seven checks; exit code 0.

- [ ] **Step 5: Commit**

```bash
git add api/lib/uploads.php tests/test_uploads.php
git commit -m "feat(uploads): image validation helper for cover uploads"
```

---

## Task 2: Path resolution + uploads directory hardening

**Files:**
- Modify: `api/lib/uploads.php`
- Test: `tests/test_uploads.php`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_uploads.php` (before any trailing cleanup; there is none after Task 1's block, so just add at the end):

```php
// --- uploads_paths: default derivation from the API directory ---
$p = uploads_paths([], '/var/www/public_html/api');
check('paths default dir', $p['dir'] === '/var/www/public_html/uploads/covers');
check('paths default base_url', $p['base_url'] === '/uploads/covers');

// --- uploads_paths: config overrides win (trailing slashes trimmed) ---
$p = uploads_paths(['upload_dir' => '/custom/up/', 'upload_base_url' => '/media/'], '/x/api');
check('paths override dir', $p['dir'] === '/custom/up');
check('paths override base_url', $p['base_url'] === '/media');

// --- ensure_uploads_dir: creates the dir and writes a hardening .htaccess ---
$base   = sys_get_temp_dir() . '/rb_up_' . bin2hex(random_bytes(4));
$covers = $base . '/uploads/covers';
ensure_uploads_dir($covers);
check('uploads dir created', is_dir($covers));
check('hardening htaccess written', file_exists($base . '/uploads/.htaccess'));
check('htaccess denies scripts',
    strpos((string)file_get_contents($base . '/uploads/.htaccess'), 'Require all denied') !== false);

@unlink($base . '/uploads/.htaccess');
@rmdir($covers); @rmdir($base . '/uploads'); @rmdir($base);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
php -r 'require "tests/harness.php"; require "tests/test_uploads.php"; exit($GLOBALS["TESTS_FAILED"] > 0 ? 1 : 0);'
```

Expected: FAIL — "Call to undefined function uploads_paths()".

- [ ] **Step 3: Write minimal implementation**

Append to `api/lib/uploads.php`:

```php
// Resolve the filesystem dir and public URL base for cover uploads.
// Default: <web_root>/uploads/covers served at /uploads/covers, where the
// web root is the parent of the API directory (public_html/api -> public_html).
// Override via config (upload_dir / upload_base_url) for differing layouts.
function uploads_paths(array $cfg, string $apiDir): array {
    $dir = (isset($cfg['upload_dir']) && is_string($cfg['upload_dir']) && $cfg['upload_dir'] !== '')
        ? rtrim($cfg['upload_dir'], "/\\")
        : dirname($apiDir) . '/uploads/covers';
    $base = (isset($cfg['upload_base_url']) && is_string($cfg['upload_base_url']) && $cfg['upload_base_url'] !== '')
        ? rtrim($cfg['upload_base_url'], '/')
        : '/uploads/covers';
    return ['dir' => $dir, 'base_url' => $base];
}

// .htaccess written into the uploads tree so a disguised script can never be
// executed. Uses access denial (works under mod_php and PHP-FPM alike) rather
// than php_flag, which 500s under FPM.
function upload_htaccess_contents(): string {
    return "# Auto-generated by RecipeBytes. Uploaded files are data, never executable.\n"
         . "<FilesMatch \"(?i)\\.(php|phtml|php3|php4|php5|php7|phar|cgi|pl|py|sh)$\">\n"
         . "  Require all denied\n"
         . "</FilesMatch>\n"
         . "Options -ExecCGI\n"
         . "RemoveHandler .php .phtml .phar\n";
}

// Create the covers dir (recursive) if missing and drop the hardening
// .htaccess at the uploads root (parent of covers) on first use.
function ensure_uploads_dir(string $dir): void {
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $ht = dirname($dir) . '/.htaccess';
    if (!file_exists($ht)) {
        @file_put_contents($ht, upload_htaccess_contents());
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
php -r 'require "tests/harness.php"; require "tests/test_uploads.php"; exit($GLOBALS["TESTS_FAILED"] > 0 ? 1 : 0);'
```

Expected: PASS for all checks (13 total now); exit code 0.

- [ ] **Step 5: Commit**

```bash
git add api/lib/uploads.php tests/test_uploads.php
git commit -m "feat(uploads): path resolution + uploads dir hardening"
```

---

## Task 3: The POST /api/uploads route

**Files:**
- Create: `api/routes/uploads.php`
- Modify: `api/index.php` (route map, add `'/uploads' => 'uploads.php'`)

This route uses `move_uploaded_file`, which only works on real multipart uploads, so it is verified manually (Step 4) rather than by unit test.

- [ ] **Step 1: Register the route**

In `api/index.php`, add an entry to the `$routes` array (place it alphabetically near the others, e.g. after `'/tags'`):

```php
    '/uploads'         => 'uploads.php',
```

- [ ] **Step 2: Create the route file**

Create `api/routes/uploads.php`:

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/uploads.php';

$path   = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user   = require_auth();

if ($path === '/uploads' && $method === 'POST') {
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        json_error('No file was uploaded.', 400);
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        // e.g. UPLOAD_ERR_INI_SIZE when the file exceeds the server's limit.
        json_error('Upload failed — the file may be too large.', 400);
    }

    $check = validate_image_upload((int)($file['size'] ?? 0), (string)($file['tmp_name'] ?? ''));
    if ($check['error'] !== null) {
        json_error($check['error'], 400);
    }

    // dirname(__DIR__) = the API root (api/), so its parent is the web root.
    $paths = uploads_paths(app_config(), dirname(__DIR__));
    ensure_uploads_dir($paths['dir']);

    $name = uuid4() . '.' . $check['ext'];
    $dest = $paths['dir'] . '/' . $name;
    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        json_error('Could not save the uploaded file.', 500);
    }

    json_ok(['url' => $paths['base_url'] . '/' . $name]);
}
```

- [ ] **Step 3: Lint both changed files**

Run:

```bash
php -l api/routes/uploads.php && php -l api/index.php
```

Expected: "No syntax errors detected" for both.

- [ ] **Step 4: Manual verification (real upload)**

Start the dev API and DB (XAMPP MySQL running, then the PHP server as the project normally runs it — `php -S 127.0.0.1:8000` from the web root with `api/index.php` as the entry). Log in to get a session cookie, then:

```bash
# Save a tiny PNG fixture to disk
php -r 'file_put_contents("/tmp/t.png", base64_decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="));'

# Upload it (reuse the test cookie jar from harness.php after logging in)
curl -s -b /tmp/recipebytes_test_cookies.txt \
     -F 'file=@/tmp/t.png;type=image/png' \
     http://127.0.0.1:8000/api/uploads
```

Expected: `{"data":{"url":"/uploads/covers/<uuid>.png"}}`, and the file exists on disk under the resolved uploads dir with an `uploads/.htaccess` alongside.

- [ ] **Step 5: Commit**

```bash
git add api/routes/uploads.php api/index.php
git commit -m "feat(uploads): POST /api/uploads endpoint"
```

---

## Task 4: Frontend api.upload() method

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Refactor response handling and add `upload`**

Replace the body of `src/lib/api.ts` from the `request` function through the exported `api` object with this (keeps `BASE` and `ApiError` above unchanged):

```ts
async function handle<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: { data?: unknown; error?: string } | null = null;
  if (text) {
    try {
      json = JSON.parse(text) as { data?: unknown; error?: string };
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const msg = json?.error ?? (text ? text.slice(0, 200) : res.statusText);
    throw new ApiError(msg, res.status);
  }
  // A 2xx response that isn't valid JSON (e.g. a stray PHP warning printed
  // before the body) must NOT silently become `null` — throw so callers'
  // `safe()` wrappers fall back to empty state instead of crashing.
  if (json === null) {
    throw new ApiError('Malformed response from server', res.status);
  }
  return (json.data ?? null) as T;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

// Multipart upload. No Content-Type header — the browser sets the multipart
// boundary itself when given a FormData body.
async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  return handle<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: <T>(path: string, form: FormData) => upload<T>(path, form),
};
```

- [ ] **Step 2: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api): add multipart upload() client method"
```

---

## Task 5: Editor Upload button + wiring

**Files:**
- Modify: `src/components/RecipeEditor.tsx`

- [ ] **Step 1: Update imports**

Change the React import (line 1) to include `useRef`:

```ts
import { useState, useRef } from 'react';
```

Add `Upload` and `Loader2` to the lucide-react import block (top of file):

```ts
  Image as ImageIcon,
  Upload,
  Loader2,
```

Add the API import below the lucide import block:

```ts
import { api, ApiError } from '../lib/api';
```

- [ ] **Step 2: Add upload state and handler**

Just after the `coverUrl` state declaration (currently line 86, `const [coverUrl, setCoverUrl] = useState(...)`), add:

```ts
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCoverFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file later
    if (!file) return;
    const okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!okTypes.includes(file.type)) {
      setUploadError('Use a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be 5 MB or smaller.');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api.upload<{ url: string }>('/uploads', fd);
      setCoverUrl(data.url);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };
```

- [ ] **Step 3: Replace the cover-image JSX**

Replace the cover block (currently the `<div className="flex items-center gap-3">…</div>` containing the "Cover image URL" label and input, lines ~232–253) with:

```tsx
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 block">
              Cover image
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="url"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="Paste an image URL…"
                  className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-stone-200 rounded-lg placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-300"
                />
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-stone-700 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleCoverFile}
                className="hidden"
              />
              {coverUrl && (
                <div className="w-16 h-16 rounded-lg overflow-hidden border border-stone-200 shrink-0">
                  <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            {uploadError && <p className="text-[12px] text-red-600">{uploadError}</p>}
          </div>
```

- [ ] **Step 4: Typecheck and lint**

Run:

```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/RecipeEditor.tsx
git commit -m "feat(editor): upload a cover image alongside the URL field"
```

---

## Task 6: Dev serving + config docs

**Files:**
- Modify: `vite.config.ts`
- Modify: `config.example.php`

- [ ] **Step 1: Proxy /uploads in dev**

In `vite.config.ts`, extend the `server.proxy` map so uploaded images resolve to the dev PHP server:

```ts
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/uploads': 'http://127.0.0.1:8000',
    },
  },
```

- [ ] **Step 2: Document the optional config overrides**

In `config.example.php`, add these commented keys to the returned array (before the closing `];`):

```php
    // --- Cover image uploads ---------------------------------------------
    // Where uploaded cover images are written, and the public URL they map to.
    // Leave commented to auto-derive: <web_root>/uploads/covers served at
    // /uploads/covers (web root = the parent of the api/ directory). Override
    // only if your layout differs, e.g. a local dev server whose doc-root is
    // not the web root.
    // 'upload_dir'      => __DIR__ . '/../uploads/covers',
    // 'upload_base_url' => '/uploads/covers',
```

- [ ] **Step 3: Build to verify the frontend still compiles**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts config.example.php
git commit -m "chore(uploads): dev /uploads proxy + config override docs"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full static checks**

Run:

```bash
npm run typecheck && npm run lint && npm run build
php -l api/routes/uploads.php && php -l api/lib/uploads.php && php -l api/index.php
php -r 'require "tests/harness.php"; require "tests/test_uploads.php"; exit($GLOBALS["TESTS_FAILED"] > 0 ? 1 : 0);'
```

Expected: all pass; the PHP test prints PASS lines with exit code 0.

- [ ] **Step 2: Manual end-to-end (dev)**

With XAMPP MySQL up, the dev PHP API on `:8000`, and `npm run dev` running:
1. Open the recipe editor, click **Upload**, pick a local image.
2. Confirm the button shows "Uploading…", then the preview thumbnail appears and the URL field fills with `/uploads/covers/<uuid>.<ext>`.
3. Save the recipe; confirm the cover renders on the recipe card and detail view.
4. Try a >5 MB file and a `.txt` renamed to `.png` — confirm a clear inline error and no save.

- [ ] **Step 3: Ship**

Create a PR for review (this is a user-facing feature):

```bash
git push -u origin <feature-branch>
gh pr create --base main --title "feat: upload cover images" --body "Adds file upload for recipe cover images alongside the existing URL field. New POST /api/uploads endpoint (image validation, 5 MB cap, JPEG/PNG/WebP/GIF), filesystem storage under public_html/uploads/covers/. No schema change. See docs/superpowers/specs/2026-06-13-cover-image-upload-design.md."
```

Merging to `main` triggers the deploy. After deploy, smoke-test one upload on the live site (note: the server's web user must be able to create `public_html/uploads/` — if a permission error appears, create the dir once with write perms).

---

## Notes for the implementer

- **Run PHP helper tests in isolation** (the command shown) — `tests/run.php` connects to MySQL and drives the HTTP API, which is heavier and needs a running server. The `test_uploads.php` helpers are pure and run standalone via `require harness.php; require test_uploads.php`.
- **`app_config()`** lives in `api/db.php` and returns the config array; it is available in the route because `auth.php` requires `db.php`.
- **`uuid4()`** is globally available (required by `api/index.php`); the route uses it, the lib does not.
- **No schema migration** — `cover_image_url` already stores a string and every render site uses `<img src={cover_image_url}>`, so a relative URL works unchanged.

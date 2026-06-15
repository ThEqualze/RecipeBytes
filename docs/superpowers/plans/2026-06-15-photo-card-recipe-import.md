# Photo-of-Card Recipe Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user photograph a meal-plan recipe card (e.g. Gousto), upload one or more photos, and have the app read them with Gemini vision and open the extracted recipe pre-filled in the editor — with the first photo as the cover image.

**Architecture:** A new `POST /import/photo` endpoint (handled in the existing `api/routes/import.php`) accepts 1–6 image files, validates them, base64-encodes them into a Gemini `generateContent` vision request, maps the model's JSON with the existing `map_gemini_recipe()`, and saves the first photo as the cover. The frontend adds a "From photo" tab to the existing `ImportModal`. Everything else (image validation, upload storage, the recipe mapper, the multipart client, the `onImported` → editor flow) is reused as-is.

**Tech Stack:** PHP 8.2 (procedural route files), MySQL/MariaDB, React 18 + TypeScript + Vite, Tailwind, lucide-react icons, Google Gemini (`gemini-2.0-flash`).

**Spec:** `docs/superpowers/specs/2026-06-15-photo-card-recipe-import-design.md`

---

## File Structure

- `api/lib/import_extract.php` (modify) — add four **pure** helpers: `image_mime_from_type`, `gemini_image_prompt`, `build_gemini_image_payload`, `parse_gemini_recipe_json`, `normalize_uploaded_files`. No network/DB I/O → unit-testable.
- `api/routes/import.php` (modify) — add a `POST /import/photo` branch plus the I/O functions `handle_photo_import`, `gemini_extract_images`, `save_cover_from_upload`. Lives next to the existing `gemini_extract` (URL path), same I/O-vs-pure split.
- `tests/test_import_extract.php` (modify) — unit tests for the new pure helpers.
- `tests/test_import_endpoint.php` (modify) — endpoint error-branch tests (401 auth, 400 no-files).
- `src/components/ImportModal.tsx` (rewrite) — add `link`/`photo` tabs and the photo upload flow.

No changes needed to `api/index.php` (the `/import` prefix dispatcher already routes `/import/photo`), `src/lib/api.ts` (`api.upload` already exists), or `src/App.tsx` (the `onImported` handler already opens the editor).

---

## Dev environment reminder (Windows)

Local endpoint testing needs **XAMPP MariaDB** started manually and the PHP dev server running:

```bash
# 1. Start MariaDB (separate terminal, leave running):
"C:/xampp/mysql/bin/mysqld.exe" --defaults-file=C:/xampp/mysql/bin/my.ini
# 2. Start the API (separate terminal, leave running; router.php is required):
php -S 127.0.0.1:8000 router.php
```

Pure-helper unit tests need **neither** — they run standalone (see Task 1).

---

## Task 1: Backend pure helpers (image MIME, payload, response parse, file normalise)

**Files:**
- Modify: `api/lib/import_extract.php` (append a new section at end of file)
- Test: `tests/test_import_extract.php` (append at end of file)

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_import_extract.php`:

```php

// ---- Photo import: image MIME mapping ----
check('mime jpeg', image_mime_from_type(IMAGETYPE_JPEG) === 'image/jpeg');
check('mime png',  image_mime_from_type(IMAGETYPE_PNG)  === 'image/png');
check('mime webp', image_mime_from_type(IMAGETYPE_WEBP) === 'image/webp');
check('mime gif',  image_mime_from_type(IMAGETYPE_GIF)  === 'image/gif');
check('mime unsupported -> empty', image_mime_from_type(IMAGETYPE_BMP) === '');

// ---- Photo import: Gemini image payload ----
$payload = build_gemini_image_payload([
    ['mime' => 'image/jpeg', 'data_b64' => 'AAA'],
    ['mime' => 'image/png',  'data_b64' => 'BBB'],
]);
$parts = $payload['contents'][0]['parts'];
check('payload text part first', isset($parts[0]['text']) && $parts[0]['text'] !== '');
check('payload inline part per image', isset($parts[1]['inline_data']) && isset($parts[2]['inline_data']));
check('payload inline mime', $parts[1]['inline_data']['mime_type'] === 'image/jpeg');
check('payload inline data', $parts[2]['inline_data']['data'] === 'BBB');
check('payload requests json', $payload['generationConfig']['responseMimeType'] === 'application/json');

// ---- Photo import: model response parsing ----
check('parse valid recipe', is_array(parse_gemini_recipe_json('{"title":"X","ingredients":[{"name":"a"}]}')));
check('parse blank -> null', parse_gemini_recipe_json('   ') === null);
check('parse non-json -> null', parse_gemini_recipe_json('not json') === null);
check('parse not-a-recipe -> null', parse_gemini_recipe_json('{"title":""}') === null);
check('parse title-only is a recipe', is_array(parse_gemini_recipe_json('{"title":"Soup"}')));

// ---- Photo import: $_FILES normalisation ----
$multi = ['name'=>['a.jpg','b.png'],'type'=>['image/jpeg','image/png'],
          'tmp_name'=>['/tmp/a','/tmp/b'],'error'=>[0,0],'size'=>[10,20]];
$norm = normalize_uploaded_files($multi);
check('normalize multi count', count($norm) === 2);
check('normalize multi maps tmp', $norm[1]['tmp_name'] === '/tmp/b');
$single = ['name'=>'a.jpg','type'=>'image/jpeg','tmp_name'=>'/tmp/a','error'=>0,'size'=>10];
check('normalize single count', count(normalize_uploaded_files($single)) === 1);
check('normalize null -> empty', normalize_uploaded_files(null) === []);
$skip = ['name'=>['a','b'],'type'=>['',''],'tmp_name'=>['','/tmp/b'],'error'=>[4,0],'size'=>[0,5]];
check('normalize skips empty tmp', count(normalize_uploaded_files($skip)) === 1);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run from project root:

```bash
php -r "require 'tests/harness.php'; require 'tests/test_import_extract.php'; echo \"\n$TESTS_FAILED failed\n\"; exit($TESTS_FAILED>0?1:0);"
```

Expected: FAIL — `Call to undefined function image_mime_from_type()` (fatal on first new call).

- [ ] **Step 3: Implement the pure helpers**

Append to the end of `api/lib/import_extract.php`:

```php

// ---- Photo import: pure helpers (Gemini vision). NO network or DB I/O. ----

// Map a getimagesize() IMAGETYPE_* constant to a MIME type Gemini accepts.
// Returns '' for unsupported types.
function image_mime_from_type(int $imageType): string {
    switch ($imageType) {
        case IMAGETYPE_JPEG: return 'image/jpeg';
        case IMAGETYPE_PNG:  return 'image/png';
        case IMAGETYPE_WEBP: return 'image/webp';
        case IMAGETYPE_GIF:  return 'image/gif';
        default:             return '';
    }
}

// Instruction text sent to the vision model alongside the card photo(s).
function gemini_image_prompt(): string {
    return "You are reading one or more photos of a single printed meal-plan or recipe "
        . "card (for example a Gousto, HelloFresh, or supermarket recipe card). The photos "
        . "may show different sides of the same card; combine them into ONE recipe. "
        . "Respond with ONLY a JSON object (no markdown fences) with keys: "
        . "title (string), description (string), source_author (string), "
        . "prep_time_minutes (integer), cook_time_minutes (integer), total_time_minutes (integer), "
        . "yield_amount (number), yield_unit (string), "
        . "ingredients (array of objects {quantity, unit, name, prep_note}), "
        . "instructions (array of objects {content}). "
        . "Read quantities and steps exactly as printed. "
        . "If the photos are not a recipe card, return {\"title\":\"\"}.";
}

// Build the Gemini generateContent request body for image extraction.
// $images: list of ['mime' => 'image/jpeg', 'data_b64' => '<base64>'].
function build_gemini_image_payload(array $images): array {
    $parts = [['text' => gemini_image_prompt()]];
    foreach ($images as $img) {
        $parts[] = ['inline_data' => ['mime_type' => $img['mime'], 'data' => $img['data_b64']]];
    }
    return [
        'contents' => [['parts' => $parts]],
        'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.2],
    ];
}

// Parse the model's JSON text into a recipe array, or null when the text is
// blank, not JSON, or "not a recipe" (empty title AND no ingredients).
function parse_gemini_recipe_json(string $textOut): ?array {
    $t = trim($textOut);
    if ($t === '') return null;
    $recipe = json_decode($t, true);
    if (!is_array($recipe)) return null;
    if ((($recipe['title'] ?? '') === '') && empty($recipe['ingredients'])) return null;
    return $recipe;
}

// PHP packs a multi-file <input name="files[]"> as parallel arrays. Normalise
// either that shape or a single-file shape into a list of per-file maps
// ['name','type','tmp_name','error','size']. Entries with an empty tmp_name are
// dropped. Returns [] when nothing usable is present.
function normalize_uploaded_files($f): array {
    if (!is_array($f) || !isset($f['tmp_name'])) return [];
    $out = [];
    if (is_array($f['tmp_name'])) {
        $n = count($f['tmp_name']);
        for ($i = 0; $i < $n; $i++) {
            if (($f['tmp_name'][$i] ?? '') === '') continue;
            $out[] = [
                'name'     => $f['name'][$i]     ?? '',
                'type'     => $f['type'][$i]     ?? '',
                'tmp_name' => $f['tmp_name'][$i] ?? '',
                'error'    => $f['error'][$i]    ?? UPLOAD_ERR_NO_FILE,
                'size'     => $f['size'][$i]     ?? 0,
            ];
        }
    } elseif (($f['tmp_name'] ?? '') !== '') {
        $out[] = $f;
    }
    return $out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
php -r "require 'tests/harness.php'; require 'tests/test_import_extract.php'; echo \"\n$TESTS_FAILED failed\n\"; exit($TESTS_FAILED>0?1:0);"
```

Expected: PASS — `0 failed` (all existing + new checks pass).

- [ ] **Step 5: Commit**

```bash
git add api/lib/import_extract.php tests/test_import_extract.php
git commit -m "feat(import): pure helpers for photo-card recipe extraction"
```

---

## Task 2: Backend `POST /import/photo` endpoint

**Files:**
- Modify: `api/routes/import.php` (add top-of-file require + const, a branch after `require_auth()`, and three new functions in the I/O section)
- Test: `tests/test_import_endpoint.php` (append at end of file)

- [ ] **Step 1: Write the failing endpoint tests**

Append to `tests/test_import_endpoint.php`:

```php

// ---- Photo import endpoint ----
reset_cookies();
check('photo import requires auth (401)', api('POST', '/import/photo', [])['status'] === 401);

$pemail = 'photo_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $pemail, 'password' => 'secret123', 'display_name' => 'P']);
// No multipart files in this JSON request -> $_FILES is empty -> 400 (before the key check).
check('photo import no files -> 400', api('POST', '/import/photo', [])['status'] === 400);
```

- [ ] **Step 2: Run the tests to verify they fail**

Ensure MariaDB and the dev server are running (see Dev environment reminder), then:

```bash
php tests/run.php
```

Expected: FAIL on the two new checks — `/import/photo` currently falls through to `404` (the route file only handles exactly `/import`), so the `401` and `400` assertions fail. (Pre-existing checks still pass.)

- [ ] **Step 3: Add the require and const at the top of the route file**

In `api/routes/import.php`, change the top requires from:

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/import_extract.php';
```

to:

```php
<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/import_extract.php';
require_once __DIR__ . '/../lib/uploads.php';

const PHOTO_IMPORT_MAX_FILES = 6;
```

- [ ] **Step 4: Add the photo branch after auth**

In `api/routes/import.php`, find:

```php
$user = require_auth();

if ($path !== '/import' || $method !== 'POST') {
    json_error('Not found', 404);
}
```

and insert the photo branch **between** the `require_auth()` line and the `if ($path !== '/import' ...)` line, so it reads:

```php
$user = require_auth();

// Photo import: read recipe-card photo(s) with Gemini vision.
if ($path === '/import/photo' && $method === 'POST') {
    handle_photo_import();
}

if ($path !== '/import' || $method !== 'POST') {
    json_error('Not found', 404);
}
```

- [ ] **Step 5: Add the I/O functions**

Append to the end of `api/routes/import.php` (after `gemini_extract`, in the I/O-helpers section):

```php

// ---- Photo import (multipart -> Gemini vision -> RecipeFormData) ----

function handle_photo_import(): void {
    $files = normalize_uploaded_files($_FILES['files'] ?? null);
    if (count($files) === 0) json_error('No photos were uploaded.', 400);
    if (count($files) > PHOTO_IMPORT_MAX_FILES) {
        json_error('Please upload up to ' . PHOTO_IMPORT_MAX_FILES . ' photos.', 400);
    }

    $cfg = app_config();
    $key = is_string($cfg['gemini_api_key'] ?? null) ? $cfg['gemini_api_key'] : '';
    if ($key === '') json_error("Photo import needs AI extraction, which isn't set up.", 422);

    $images = [];
    foreach ($files as $f) {
        if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            json_error('Upload failed — a photo may be too large.', 400);
        }
        $tmp = (string)($f['tmp_name'] ?? '');
        $check = validate_image_upload($tmp);
        if ($check['error'] !== null) json_error($check['error'], 400);
        $info = @getimagesize($tmp);
        $mime = image_mime_from_type(is_array($info) && isset($info[2]) ? (int)$info[2] : -1);
        if ($mime === '') json_error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.', 400);
        $bytes = @file_get_contents($tmp);
        if ($bytes === false) json_error('Could not read an uploaded photo.', 400);
        $images[] = [
            'mime' => $mime,
            'data_b64' => base64_encode($bytes),
            'ext' => $check['ext'],
            'tmp' => $tmp,
        ];
    }

    $model = (is_string($cfg['gemini_model'] ?? null) && $cfg['gemini_model'] !== '')
        ? $cfg['gemini_model'] : 'gemini-2.0-flash';

    $recipe = gemini_extract_images($images, $key, $model, $gemErr);
    if ($recipe === null) {
        // $gemErr set => transport/HTTP problem (502). Null => model found no recipe (422).
        json_error($gemErr ?? "We couldn't find a recipe on that card.", $gemErr !== null ? 502 : 422);
    }

    $form = map_gemini_recipe($recipe, '');

    // Save the first photo as the cover. Non-fatal: a failure just means no cover.
    $cover = save_cover_from_upload($images[0]['tmp'], $images[0]['ext']);
    if ($cover !== null) $form['cover_image_url'] = $cover;

    json_ok($form);
}

// POST the image payload to Gemini and return the parsed recipe array, or null.
// On a transport/HTTP error sets $error (caller -> 502). When the model simply
// returns "not a recipe", returns null with $error left null (caller -> 422).
function gemini_extract_images(array $images, string $key, string $model, ?string &$error = null): ?array {
    $payload = json_encode(build_gemini_image_payload(array_map(
        fn($i) => ['mime' => $i['mime'], 'data_b64' => $i['data_b64']],
        $images
    )));
    $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model)
        . ':generateContent?key=' . rawurlencode($key);

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 45,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code >= 400) { $error = 'AI extraction is unavailable right now.'; return null; }

    $data = json_decode($resp, true);
    $textOut = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if (!is_string($textOut) || trim($textOut) === '') {
        $error = 'AI extraction is unavailable right now.';
        return null;
    }
    return parse_gemini_recipe_json($textOut);
}

// Persist a just-uploaded image as a cover and return its public URL, or null on
// any failure (caller treats null as "no cover", never an import failure).
function save_cover_from_upload(string $tmpPath, string $ext): ?string {
    // dirname(__DIR__) is the API root (api/); its parent is the web root.
    $paths = uploads_paths(app_config(), dirname(__DIR__));
    if (!ensure_uploads_dir($paths['dir'])) return null;
    $name = uuid4() . '.' . $ext;
    $dest = $paths['dir'] . '/' . $name;
    if (!move_uploaded_file($tmpPath, $dest)) return null;
    return $paths['base_url'] . '/' . $name;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
php tests/run.php
```

Expected: PASS — the two new `/import/photo` checks pass and the full suite reports `0 failed`.

- [ ] **Step 7: Commit**

```bash
git add api/routes/import.php tests/test_import_endpoint.php
git commit -m "feat(import): POST /import/photo endpoint (Gemini vision)"
```

---

## Task 3: Frontend "From photo" tab in ImportModal

**Files:**
- Rewrite: `src/components/ImportModal.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the **entire** contents of `src/components/ImportModal.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, X, Music2, Instagram, Facebook, Youtube, Globe, Loader2,
  Link2, Camera, ImagePlus,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { RecipeFormData } from './RecipeEditor';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: (data: RecipeFormData) => void;
}

type Mode = 'link' | 'photo';

const MAX_FILES = 6;
const MAX_BYTES = 5 * 1024 * 1024;

export function ImportModal({ open, onClose, onImported }: ImportModalProps) {
  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build object URLs for thumbnails; revoke them when the list changes/unmounts.
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  if (!open) return null;

  const reset = () => {
    setUrl('');
    setFiles([]);
    setError(null);
    setBusy(false);
  };

  const close = () => { reset(); setMode('link'); onClose(); };

  const switchMode = (m: Mode) => { setMode(m); setError(null); };

  const submitLink = async () => {
    if (!url || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.post<RecipeFormData>('/import', { url });
      reset();
      onImported(data);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : 'Something went wrong importing that link.');
    }
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setError(null);
    const next = [...files];
    for (const f of Array.from(incoming)) {
      if (!f.type.startsWith('image/')) { setError('Only image files are supported.'); continue; }
      if (f.size > MAX_BYTES) { setError('Each photo must be 5 MB or smaller.'); continue; }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue; // de-dupe
      if (next.length >= MAX_FILES) { setError(`You can add up to ${MAX_FILES} photos.`); break; }
      next.push(f);
    }
    setFiles(next);
    if (fileInputRef.current) fileInputRef.current.value = ''; // allow re-picking the same file
  };

  const removeFile = (i: number) => setFiles(files.filter((_, idx) => idx !== i));

  const submitPhotos = async () => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('files[]', f));
      const data = await api.upload<RecipeFormData>('/import/photo', form);
      reset();
      onImported(data);
    } catch (e) {
      setBusy(false);
      setError(e instanceof ApiError ? e.message : 'Something went wrong reading that photo.');
    }
  };

  const tabClass = (m: Mode) =>
    `flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-[13px] font-medium rounded-lg transition-colors ${
      mode === m ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
    }`;

  return (
    <div
      className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm flex items-center justify-center z-50 px-4 animate-fade-in"
      onClick={close}
    >
      <div
        className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg p-7 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-4 right-4 w-8 h-8 rounded-md hover:bg-stone-100 flex items-center justify-center text-stone-500"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-accent-700 text-[12px] uppercase tracking-wider font-semibold mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          AI extraction
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl mb-5">
          <button onClick={() => switchMode('link')} className={tabClass('link')}>
            <Link2 className="w-3.5 h-3.5" /> From link
          </button>
          <button onClick={() => switchMode('photo')} className={tabClass('photo')}>
            <Camera className="w-3.5 h-3.5" /> From photo
          </button>
        </div>

        {mode === 'link' ? (
          <>
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
              onKeyDown={(e) => { if (e.key === 'Enter') submitLink(); }}
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
                onClick={close}
                className="px-4 py-2 text-[13px] font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitLink}
                disabled={!url || busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-lg transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {busy ? 'Extracting…' : 'Extract recipe'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="font-display text-[26px] font-semibold text-stone-900 leading-tight mb-2">
              Snap a recipe card
            </h2>
            <p className="text-[14px] text-stone-500 leading-relaxed mb-5">
              Take or upload photos of a meal-plan card (e.g. Gousto). Add both sides if the
              steps are on the back. We'll read them and open the recipe in the editor.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />

            {files.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {previews.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-stone-200 bg-stone-50">
                    <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-md bg-stone-900/70 hover:bg-stone-900 text-white flex items-center justify-center"
                      aria-label="Remove photo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {i === 0 && (
                      <span className="absolute bottom-1 left-1 text-[10px] font-medium text-white bg-stone-900/70 rounded px-1.5 py-0.5">
                        Cover
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {files.length < MAX_FILES && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 px-4 py-6 mb-3 border-2 border-dashed border-stone-200 hover:border-stone-300 hover:bg-stone-50 rounded-xl text-stone-500 transition-colors"
              >
                <ImagePlus className="w-6 h-6" />
                <span className="text-[13px] font-medium">
                  {files.length === 0 ? 'Add photos' : 'Add more photos'}
                </span>
                <span className="text-[11px] text-stone-400">JPEG, PNG, WebP or GIF · up to {MAX_FILES} · 5 MB each</span>
              </button>
            )}

            {error && (
              <div className="mb-3 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={close}
                className="px-4 py-2 text-[13px] font-medium text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitPhotos}
                disabled={files.length === 0 || busy}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-lg transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {busy ? 'Reading…' : 'Read recipe'}
              </button>
            </div>
          </>
        )}

        <div className="mt-5 p-3 rounded-lg bg-stone-50 border border-stone-100">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 mb-1">
            How it works
          </div>
          <ol className="text-[12px] text-stone-600 leading-relaxed list-decimal list-inside space-y-0.5">
            {mode === 'link' ? (
              <>
                <li>Fetch the recipe page</li>
                <li>Read its structured recipe data (or use AI if needed)</li>
                <li>Open it pre-filled in the editor</li>
                <li>Review and save to your library</li>
              </>
            ) : (
              <>
                <li>Take or upload photo(s) of the card</li>
                <li>AI reads the title, ingredients and steps</li>
                <li>Open it pre-filled in the editor (first photo becomes the cover)</li>
                <li>Review and save to your library</li>
              </>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the type-check passes**

```bash
npm run typecheck
```

Expected: PASS — no TypeScript errors. (`RecipeFormData` is imported from `./RecipeEditor`; `api.upload` is typed in `src/lib/api.ts`.)

- [ ] **Step 3: Verify the build passes**

```bash
npm run build
```

Expected: PASS — Vite build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ImportModal.tsx
git commit -m "feat(import): From-photo tab in ImportModal (scan a recipe card)"
```

---

## Task 4: Full verification & docs note

**Files:**
- Modify: `api/config.example.php` (one-line doc note)

- [ ] **Step 1: Add a config note**

In `api/config.example.php`, change the Gemini comment block from:

```php
    // Google AI Studio (Gemini) — server-side only. Leave key empty to disable
    // the AI fallback (JSON-LD-only import still works).
    'gemini_api_key' => '',
```

to:

```php
    // Google AI Studio (Gemini) — server-side only. Leave key empty to disable
    // the AI fallback for URL import (JSON-LD-only import still works). A key is
    // REQUIRED for photo/recipe-card import (POST /import/photo), which has no
    // free fallback because reading a photo needs the vision model.
    'gemini_api_key' => '',
```

- [ ] **Step 2: Run the full backend test suite**

Ensure MariaDB and the dev server are running, then:

```bash
php tests/run.php
```

Expected: PASS — `0 failed` across all `test_*.php` files.

- [ ] **Step 3: Run frontend checks**

```bash
npm run lint && npm run typecheck && npm run build
```

Expected: all PASS.

- [ ] **Step 4: Manual smoke test (requires a real Gemini key in `api/config.php`)**

1. Start MariaDB + `php -S 127.0.0.1:8000 router.php`, and `npm run dev`.
2. Sign in, open the Import modal, choose **From photo**.
3. Add a photo of a Gousto card (and a second photo of the back). Confirm thumbnails show, first is labelled **Cover**, and removing a photo works.
4. Click **Read recipe**. Confirm the editor opens pre-filled with title, ingredients, and steps, and the cover image is the first photo.
5. Save and confirm the recipe appears in the library with its cover.
6. Negative: add a non-recipe photo → expect "We couldn't find a recipe on that card."

- [ ] **Step 5: Commit**

```bash
git add api/config.example.php
git commit -m "docs(config): note Gemini key is required for photo import"
```

---

## Self-Review Notes

- **Spec coverage:** endpoint (Task 2), pure helpers + tests (Task 1), tabs/photo UI (Task 3), cover-from-first-photo (Task 2 `save_cover_from_upload`), multi-photo → one recipe (Task 1 payload + Task 2 loop), all error rows from the spec table (Task 2 handler), security via reused validators (Task 2), config note (Task 4). Covered.
- **Endpoint test limitation (intentional):** the test harness `api()` helper sends `application/json`, so it cannot post real multipart files. Endpoint tests therefore cover the auth (401) and no-files (400) branches only; the no-key (422), bad-image (400), Gemini (502), and not-a-recipe (422) branches are exercised by the pure-helper unit tests plus the manual smoke test. This matches the existing `test_import_endpoint.php` style, which also only tests validation branches.
- **Type/name consistency:** `image_mime_from_type`, `build_gemini_image_payload`, `parse_gemini_recipe_json`, `normalize_uploaded_files` (Task 1) are the exact names called in Task 2. Image-record keys (`mime`, `data_b64`, `ext`, `tmp`) are consistent between `handle_photo_import` and `gemini_extract_images`. Frontend posts `files[]`; backend reads `$_FILES['files']` — consistent.

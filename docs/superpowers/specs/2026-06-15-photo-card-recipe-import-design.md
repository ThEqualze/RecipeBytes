# Import a recipe from a photo of a meal-plan card

**Date:** 2026-06-15
**Status:** Approved (design)

## Problem

Users receive physical/printed meal-plan recipe cards (e.g. Gousto). Today the only
ways to get a recipe into RecipeBytes are typing it by hand or importing from a URL.
We want a user to **photograph a card, upload it, and have the app read the card and
turn it into a recipe** ready to review and save.

## Goal

Add a "From photo" path to the existing import flow: the user attaches one or more
photos of a card, we read them with an AI vision model, extract a single combined
recipe, pre-fill the recipe editor, and use the first photo as the cover image.

## Decisions (from brainstorming)

- **AI provider:** Reuse Google Gemini (`gemini-2.0-flash`), which supports image
  input. The key is already configured server-side in `config.php`
  (`gemini_api_key`). No new provider/dependency.
- **The photo:** The first uploaded photo becomes the recipe's `cover_image_url`
  (saved via the existing cover-upload storage).
- **Entry point:** Add **tabs** to the existing `ImportModal` — "From link"
  (unchanged) and "From photo".
- **Multiple photos:** A single import accepts **1–N photos** (e.g. front + back of
  a card), sent to Gemini together and combined into **one** recipe. The first photo
  is the cover.

## Non-goals (YAGNI)

- No OCR engine of our own — Gemini vision does the reading.
- No free/offline fallback for photos (reading a photo inherently needs the vision
  model; URL import keeps its free JSON-LD path).
- No per-import "keep photo as cover?" prompt — the first photo is always the cover.
- No editing/cropping of photos in-app before upload.

## Architecture

The feature reuses the existing import + upload + editor infrastructure. The only
new capability is sending images (instead of page text) to Gemini.

Reused as-is:
- `validate_image_upload()` / `UPLOAD_MAX_BYTES` — image type-sniff + size cap
  (`api/lib/uploads.php`).
- `uploads_paths()` / `ensure_uploads_dir()` — hardened cover storage
  (`api/lib/uploads.php`).
- `map_gemini_recipe($recipe, $url)` — maps a Gemini recipe object to
  `RecipeFormData` (`api/lib/import_extract.php`).
- `api.upload<T>(path, FormData)` — multipart client (`src/lib/api.ts`).
- `onImported(data)` → opens `RecipeEditor` in create mode pre-filled
  (`src/App.tsx`).

### Backend

**Endpoint:** `POST /import/photo` — multipart form-data, field `files[]` (1–N image
files). Routed by the existing `/import` prefix dispatcher in `api/index.php`
(`path_matches` already matches `/import/...`), handled by adding a branch in
`api/routes/import.php` **before** the JSON-body read used by the URL path.

Auth: `require_auth()` (already at the top of `import.php`).

Flow:
1. Collect uploaded files from `$_FILES['files']` (normalise PHP's multi-file array
   shape). Reject if none → `400`. Cap total at **6** images → `400` if exceeded.
2. Validate each file with `validate_image_upload($tmpPath)` (type sniff + 5 MB cap).
   First failure → `400` with the helper's reason.
3. Require a Gemini key (`app_config()['gemini_api_key']`). Empty → `422`
   ("Photo import needs AI extraction, which isn't set up.").
4. For each valid file: read bytes, base64-encode, and derive the MIME type from the
   sniffed image type. Build a Gemini `generateContent` request: one text
   instruction part + one `inline_data` part per image, with
   `generationConfig.responseMimeType = "application/json"` and a low temperature.
5. Call Gemini (`gemini_extract_images()` — lives in `import.php` alongside the
   existing `gemini_extract()`, the I/O layer). Network/HTTP error → `502`. Model
   returns no recipe (empty title and no ingredients) → `422` ("We couldn't find a
   recipe on that card.").
6. Map the recipe object with `map_gemini_recipe($recipe, '')` (no source URL for a
   photo).
7. Save the **first** uploaded image to `/uploads/covers` (reuse
   `uploads_paths()` + `ensure_uploads_dir()` + `move_uploaded_file()`), set
   `cover_image_url` to its public URL. **Non-fatal:** if storage fails, log and
   return the recipe with an empty `cover_image_url` rather than failing the import.
8. `json_ok($form)` — returns `RecipeFormData`, identical shape to URL import.

**New pure helpers** (added to `api/lib/import_extract.php`, no network/DB I/O, so
they are unit-testable):
- `image_mime_from_type(int $imageType): string` — `IMAGETYPE_*` → MIME string
  (`image/jpeg`, `image/png`, `image/webp`, `image/gif`); `''` for unsupported.
- `build_gemini_image_payload(array $images): array` — given a list of
  `['mime' => ..., 'data_b64' => ...]`, return the full request body array (text
  prompt part + inline_data parts + generationConfig). The prompt instructs the
  model to read a meal-plan/recipe card photo (possibly several photos of one card),
  combine them, and return the agreed JSON keys (`title`, `description`,
  `source_author`, `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes`,
  `yield_amount`, `yield_unit`, `ingredients[]`, `instructions[]`), returning
  `{"title":""}` if the image is not a recipe card.
- `parse_gemini_recipe_json(string $textOut): ?array` — decode the model's JSON text
  into a recipe array; `null` when blank, unparseable, or "not a recipe" (empty
  title and no ingredients). Shared logic the image path uses; mirrors the inline
  parsing the text path already does.

### Frontend (`src/components/ImportModal.tsx`)

Add `mode: 'link' | 'photo'` state and a small tab switcher at the top of the modal.

- **Link tab:** existing UI and behaviour, unchanged.
- **Photo tab:**
  - A drop-zone / "Add photos" button fronting a hidden
    `<input type="file" accept="image/*" multiple>`. No `capture` attribute, so
    mobile still offers Camera *and* Photo Library and multi-select works.
  - Selected images render as thumbnails (via `URL.createObjectURL`) with a remove
    (×) control; the user can add more (appends, de-duplicates, enforces the cap).
  - Client-side guards mirror the server: `image/*` only, ≤ 5 MB each, ≤ 6 images,
    with friendly inline errors.
  - Submit builds `FormData`, appends each file as `files[]`, and calls
    `api.upload<RecipeFormData>('/import/photo', form)`. On success →
    `onImported(data)` (existing flow opens the editor pre-filled, cover included).
  - Object URLs are revoked on removal and on unmount/close to avoid leaks.
  - Reuses the modal's existing busy/error UI patterns.

### Data flow

photo(s) → FormData(`files[]`) → `POST /import/photo` → validate each image →
Gemini vision (N image parts) → `parse_gemini_recipe_json` → `map_gemini_recipe` →
`{ RecipeFormData, cover_image_url }` → `onImported` → `RecipeEditor` (create,
pre-filled) → user reviews & saves via the existing recipe-create path.

## Error handling

| Condition | Status | User-facing message |
|---|---|---|
| No files in request | 400 | "No photos were uploaded." |
| > 6 images | 400 | "Please upload up to 6 photos." |
| Invalid / oversized image | 400 | reason from `validate_image_upload` |
| No Gemini key configured | 422 | "Photo import needs AI extraction, which isn't set up." |
| Gemini unreachable / HTTP error | 502 | "AI extraction is unavailable right now." |
| Image isn't a recipe card | 422 | "We couldn't find a recipe on that card." |
| Cover-image save fails | — (non-fatal) | recipe returned with empty cover |

Client blocks submit when no images are selected.

## Security

- Auth required (`require_auth()`), same as URL import.
- Images validated by real-byte sniffing (`getimagesize` via
  `validate_image_upload`), not by client-supplied type or extension.
- Cover stored under the existing hardened uploads tree (`.htaccess` denies script
  execution) with a UUID filename.
- No URL fetching in this path → no SSRF surface (unlike the URL importer).
- Gemini key stays server-side; the browser never sees it.

## Testing

- **Unit (`tests/test_import_extract.php`, existing `check()` harness):**
  - `image_mime_from_type` for JPEG/PNG/WebP/GIF and an unsupported type.
  - `build_gemini_image_payload`: text part present, one `inline_data` part per
    image with correct MIME, `responseMimeType === 'application/json'`.
  - `parse_gemini_recipe_json`: valid recipe object; blank string → null;
    non-JSON → null; "not a recipe" (empty title, no ingredients) → null.
- **Endpoint (`tests/test_import_endpoint.php`, same style as today):** reachable
  error branches that need no live network — e.g. no-files → 400, and (with key
  unset in test config) no-key → 422.
- Full run: `php tests/run.php` stays green.
- Manual: `npm run build` + `npm run typecheck` clean; smoke-test on a real Gousto
  card photo (and a front+back pair) against a configured key.

## Files touched

- `api/routes/import.php` — add `POST /import/photo` branch + `gemini_extract_images()`.
- `api/lib/import_extract.php` — add `image_mime_from_type`,
  `build_gemini_image_payload`, `parse_gemini_recipe_json`.
- `src/components/ImportModal.tsx` — tabs + photo tab UI and submit.
- `tests/test_import_extract.php`, `tests/test_import_endpoint.php` — new cases.
- `api/config.example.php` — doc note that photo import requires the Gemini key
  (optional; key already documented).

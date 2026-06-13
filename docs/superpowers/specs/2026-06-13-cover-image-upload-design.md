# Cover Image Upload — Design

**Date:** 2026-06-13
**Status:** Approved

## Problem

The recipe editor only lets a user set a cover image by pasting an external
URL (`RecipeEditor.tsx`, "Cover image URL" field). Users want to **upload an
image file** as well, while keeping the paste-a-URL option.

## Goal

Add file upload as a second way to set `cover_image_url`, alongside the
existing URL field. Both methods set the same field; an uploaded image is
stored on the 20i filesystem and referenced by a relative URL.

## Constraints / decisions

- **Storage:** 20i filesystem under `public_html/uploads/covers/`, served as
  static files at `/uploads/covers/...`. No external service, no extra cost.
  Survives deploys (rsync runs without `--delete`; `uploads/` is not in the
  repo so it is never overwritten).
- **Accepted types:** JPEG, PNG, WebP, GIF.
- **Max size:** 5 MB.
- **Validation:** `getimagesize()` must confirm a real image; MIME determines a
  safe extension. The client-supplied filename is never trusted.
- **Filename:** random UUID + safe extension.
- **No schema change:** `cover_image_url` is already a string column; an
  uploaded image stores a relative URL (`/uploads/covers/<uuid>.<ext>`).
- **No image resizing/re-encoding** in v1 (store as-is).

## Architecture

### Backend — `POST /api/uploads`

New route file `api/routes/uploads.php`, registered in `api/index.php`'s route
map (`'/uploads' => 'uploads.php'`).

- Auth-gated via `require_auth()` — only logged-in users may upload.
- Accepts `multipart/form-data` with a single `file` field (`$_FILES['file']`).
- Pure, testable helper `validate_image_upload(int $size, string $tmpPath): array`
  living in a lib file (e.g. `api/lib/uploads.php`):
  - returns `['ext' => 'jpg', 'error' => null]` on success, or
    `['ext' => null, 'error' => '<reason>']` on failure.
  - checks: size in `(0, 5 MB]`; `getimagesize()` returns a valid result; the
    detected image type is in the allowed set; maps type → extension
    (`jpeg→jpg`, `png→png`, `webp→webp`, `gif→gif`).
- On success the route:
  1. Ensures the uploads dir exists (`ensure_uploads_dir()` — `mkdir` recursive
     if missing, and writes a hardening `.htaccess` on first creation that
     disables PHP/script execution in that directory).
  2. Moves the temp upload to `uploads/covers/<uuid>.<ext>` via
     `move_uploaded_file()`.
  3. Returns `json_ok(['url' => '/uploads/covers/<uuid>.<ext>'])`.
- On any validation failure: `json_error('<reason>', 400)`. On a PHP upload
  error (e.g. exceeded `upload_max_filesize`): `json_error(..., 400)`.

**Filesystem path resolution.** The API runs from `public_html/api`. The web
root is its parent, so the uploads directory is `dirname(api_dir)/uploads/covers`
and the public URL base is `/uploads/covers`. These are derived from the API
location with optional overrides in `config.php` (`upload_dir`,
`upload_base_url`) for environments whose layout differs (e.g. local dev).

**Hardening `.htaccess`** written into `uploads/` on creation:
- Disable the PHP engine / remove PHP handlers so an image-disguised script
  cannot be executed if it ever lands there.

### Storage & serving

- Static files at `/uploads/covers/...`, same-origin with the app and API.
- Existing render sites (`RecipeCard`, `RecipeDetail`, `PublicRecipeView`,
  collection/meal-planner thumbnails) already use `<img src={cover_image_url}>`,
  so a relative URL works with no changes.

### Frontend

- `src/lib/api.ts`: add `upload<T>(path, formData: FormData): Promise<T>` —
  same `credentials: 'include'` and response-unwrapping as `request`, but sends
  the `FormData` body with **no** `Content-Type` header (the browser sets the
  multipart boundary).
- `src/components/RecipeEditor.tsx`, cover section:
  - Keep the existing URL `<input>`.
  - Add an **Upload** button (hidden `<input type="file" accept="image/*">`).
  - On pick: client-side pre-check (type + size) for fast feedback → call
    `api.upload('/uploads', fd)` → on success `setCoverUrl(data.url)`. The
    existing preview thumbnail renders it.
  - Show an uploading state (disabled + spinner) and an inline error on failure.

## Testing

- **Backend:** unit tests for `validate_image_upload()` in the existing PHP
  test style (`tests/`), using tiny fixture files: a valid small PNG/JPEG/WebP/
  GIF (accepted, correct ext), an oversized input (rejected), a non-image /
  text file (rejected), and a zero-byte input (rejected). The `move_uploaded_file`
  path is exercised manually.
- **Frontend:** manual verification (upload an image, confirm preview + save +
  render on the recipe card/detail).

## Out of scope (v1)

- Deleting orphaned uploads (user uploads then abandons or replaces the image —
  the old file lingers). Cleanup is a separate concern, flagged not built.
- Image resizing / compression / EXIF stripping.

## Risks / notes

- **Dev environment:** Vite proxies `/api`; `/uploads` may need a dev proxy or
  symlink so uploaded files resolve locally. Confirmed during implementation;
  production is plain same-origin static serving.
- **Directory writability:** the web-server user must be able to create/write
  `public_html/uploads/`. PHP creates it on first upload; if perms block this,
  surface a clear server error.

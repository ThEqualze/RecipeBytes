# RecipeBytes: URL Recipe Import

**Date:** 2026-06-08
**Status:** Approved design, pending implementation plan
**Goal:** Make the existing "Import a recipe from a link" modal actually work for **web/blog URLs** — paste a recipe page URL, extract a structured recipe (free structured-data path, Gemini fallback), and pre-fill the existing recipe editor for the user to review and save.

---

## 1. Background & Scope

- The `ImportModal` shipped by bolt.new is a **non-functional UI mockup**: its "Extract recipe" button shows a fake "Queued…" state for ~1.1s and makes no API call or DB write. There is no extraction engine.
- **In scope:** importing from **web page / recipe-blog URLs**.
- **Out of scope:** social-media *video* extraction (TikTok/Instagram/YouTube). That requires video download + audio transcription + OCR, which 20i shared hosting cannot run; it needs an external worker/service and is deferred. The modal's video-platform icons remain as aspirational UI but the feature handles web URLs.
- **Provider:** Google **Gemini** (Gemini Flash), chosen by the user for cost. (This overrides the global default-to-Claude preference.)

## 2. Decisions (locked during brainstorming)

- **Extraction strategy:** structured-data first, Gemini fallback. Parse schema.org `Recipe` JSON-LD when present (free, fast, reliable); only call Gemini for pages that lack it.
- **Review flow:** extraction pre-fills the **existing `RecipeEditor`** (create mode); the user reviews/edits and saves through the existing `createRecipe` path. Nothing is persisted until the user clicks Save.
- **Ingredients (JSON-LD path):** each `recipeIngredient` line is placed whole into the editor's ingredient `name` field (quantity/unit/prep_note left blank). No ingredient parser is built. The Gemini path may return pre-split fields.
- **Gemini key:** the user has a Google AI Studio API key; it lives server-side in `config.php`, never exposed to the browser.

## 3. Architecture & Data Flow

```
ImportModal (paste URL)
   │  POST /api/import { url }   (authenticated, same-origin)
   ▼
PHP endpoint  api/routes/import.php
   1. Validate + SSRF-guard the URL
   2. Fetch page HTML via cURL (browser UA, capped redirects/timeout/size)
   3. Parse schema.org Recipe JSON-LD ───── found ─────┐
   4. If none: strip HTML → text → Gemini Flash ───────┤
   ▼                                                    ▼
   Map either result → RecipeFormData  (NOT saved)
   ▼
Response { data: RecipeFormData }
   ▼
App opens RecipeEditor (create mode) pre-filled with initialForm
   ▼
User reviews/tweaks → Save → existing createRecipe (POST /api/recipes)
```

Same-origin call (no CORS). The endpoint returns the editor's exact `RecipeFormData` shape; nothing is written to the DB by the import itself.

## 4. The PHP Endpoint (`POST /api/import`)

New route file `api/routes/import.php`, dispatched via the existing prefix router (`'/import' => 'import.php'`). Authenticated (`require_auth()`).

### 4.1 Input
`{ "url": "https://..." }`

### 4.2 URL validation + SSRF guard (security-critical)
- Require a well-formed absolute URL with scheme `http` or `https` only.
- Resolve the host to IP(s); **reject** if any resolved IP is in a private, loopback, link-local, or reserved range (e.g. `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`, `0.0.0.0`). This blocks pointing the fetcher at internal services or cloud-metadata endpoints.
- Reject non-standard ports if practical; cap redirects (e.g. 5) and re-validate the final URL after redirects.

### 4.3 Fetch
- cURL with a browser-like `User-Agent`, `CURLOPT_FOLLOWLOCATION` (limited), `CURLOPT_TIMEOUT` ~10s, and a max response-size cap (e.g. ~2 MB) to avoid huge downloads.
- On fetch failure/timeout → error response (see §6).

### 4.4 Structured-data extraction (free path)
- Find all `<script type="application/ld+json">` blocks; JSON-decode each (tolerating arrays and `@graph` containers).
- Locate the node whose `@type` is `Recipe` (or an array containing `Recipe`).
- Extract and normalise:
  - `name` → title
  - `description` → description
  - `image` (string, object with `url`, or array) → cover_image_url (first usable URL)
  - `author` (string or object with `name`) → source_author
  - `recipeIngredient` (array of strings) → ingredient `name` lines
  - `recipeInstructions` → instructions: accept an array of strings, or of `HowToStep` objects (`text`), or `HowToSection` containing `itemListElement`; flatten to ordered step `content` strings
  - `prepTime` / `cookTime` / `totalTime` (ISO-8601 durations, e.g. `PT1H30M`) → minutes via a duration parser
  - `recipeYield` (string/number/array) → yield_amount (leading number) + yield_unit (remaining text, default `servings`)

### 4.5 Gemini fallback
- Only if no Recipe JSON-LD was found.
- Strip the HTML to visible text (remove script/style, collapse whitespace) and truncate to a token-safe length.
- Call the Gemini Flash REST API (`generativelanguage.googleapis.com`, model from config) with a strict prompt instructing it to return **only** a JSON object matching our field shape (title, description, author, image url, times in minutes, yield amount/unit, ingredients as {quantity, unit, name, prep_note}, instructions as {content}). Use JSON-mode/response schema if available to force valid JSON.
- Parse the JSON; if Gemini returns nothing usable → "couldn't find a recipe" error.

### 4.6 Map to `RecipeFormData`
Both paths converge on the editor's shape (from `src/components/RecipeEditor.tsx`):
```
{ title, description, cover_image_url, source_url (= imported URL), source_author,
  folder_id: null, prep_time_minutes, cook_time_minutes, total_time_minutes,
  yield_amount, yield_unit, notes: '', tagIds: [],
  ingredients: [{ quantity, unit, name, prep_note, group_name: '' }],
  instructions: [{ content, timer_seconds: '', group_name: '' }] }
```
- JSON-LD ingredients: whole line in `name`; quantity/unit/prep_note empty.
- Gemini ingredients: pre-split fields when provided, else whole line in `name`.
- All numeric fields default to 0 / 1 sensibly; `source_type` is derived later by the existing `createRecipe` (it sets `web` when a source_url is present).

## 5. Frontend Changes

- **`src/components/ImportModal.tsx`**: replace the fake submit with a real call. On submit: `POST /api/import {url}` via the `api` client; show an "Extracting…" busy state; on success call a new `onImported(data: RecipeFormData)` prop and close; on error show an inline message and remain open. Add an `onImported` prop to `ImportModalProps`.
- **`src/App.tsx`**: add state `importedForm: RecipeFormData | null`. Pass `onImported={(d) => { setImportedForm(d); setImportOpen(false); setEditorMode('create'); }}` to `ImportModal`. Pass `initialForm={importedForm}` to the create-mode `RecipeEditor`. Clear `importedForm` when the editor closes/saves.
- **`src/components/RecipeEditor.tsx`**: add optional `initialForm?: RecipeFormData` to `RecipeEditorProps`; in create mode, seed the form `useState` from `initialForm` when provided (falls back to the current empty defaults). No change to edit mode or the save path.

## 6. Error Handling

The endpoint returns `{ error: <message> }` with an appropriate status; the modal surfaces the message inline:
- 400 — missing/invalid URL, or blocked by SSRF guard ("That URL can't be imported").
- 422 — fetched OK but no recipe found ("We couldn't find a recipe on that page").
- 502 — page fetch failed/timed out ("Couldn't reach that page").
- 502 — Gemini API/key error ("AI extraction is unavailable right now").
Nothing partial is ever saved; the user can edit the URL and retry.

## 7. Configuration

Add to `api/config.php` (and `api/config.example.php` as placeholders):
```php
'gemini_api_key' => '',                 // Google AI Studio key (server-side only)
'gemini_model'   => 'gemini-2.0-flash', // cheap, fast, good at structured extraction
```
If `gemini_api_key` is empty, the fallback is skipped and a page without JSON-LD yields the "couldn't find a recipe" error (graceful degradation to the free path only).

## 8. Testing

Pure, deterministic logic is unit-tested with **fixtures, no network**, in the existing dependency-free PHP harness:
- `parse_iso8601_duration('PT1H30M')` → 90, plus edge cases.
- JSON-LD extraction against a fixture HTML file containing a typical `Recipe` block (incl. `@graph` and `HowToStep` variants) → expected `RecipeFormData`.
- The Gemini-response mapper against a fixture JSON string → expected `RecipeFormData`.
- SSRF guard: unit-test that loopback/private hosts are rejected and a normal public host passes (using a pure `is_blocked_ip()` helper; no real DNS needed for the range checks).

The live fetch + real Gemini call are covered by a short **manual smoke test** (paste a real recipe URL locally with the dev server). This keeps the automated suite fast and offline, consistent with the current harness.

## 9. Risks & Mitigations

- **SSRF (highest):** strict scheme + private-IP rejection + redirect re-validation. Centralised, unit-tested guard.
- **Gemini cost/latency:** only invoked when JSON-LD is absent; Flash model; truncated input. Free path handles the common case.
- **Malformed/huge pages:** response-size cap, timeouts, tolerant JSON-LD parsing that fails to a clear error rather than crashing.
- **Key exposure:** Gemini key server-side only, never in responses or the bundle.

## 10. Out of Scope (explicit)

- Social-media video extraction (transcription/OCR) — deferred; needs an external worker.
- The `extraction_jobs` Inbox queue flow — not used; imports go straight to the editor.
- An ingredient quantity/unit parser for the JSON-LD path — lines go in whole.

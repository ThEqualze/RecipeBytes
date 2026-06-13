# Post-Cook Social Sharing (Image) — Design

**Date:** 2026-06-13
**Status:** Approved
**Scope note:** Image sharing only. **Video is out of scope** — a separate follow-up cycle that reuses sections C/D/E below.

## Problem

We want to encourage users to share recipes once they've actually cooked them.
After a user adds a photo of their finished dish, they should be able to share
that photo to social channels together with a link back to the recipe on the
site — and decide, at each share, whether the recipe is publicly viewable.

## Goals

- A "share your cook" flow on the recipe page: add a real-result photo, then
  share it to social.
- Shared **links show the dish photo + recipe title** as a rich preview wherever
  they're pasted (Facebook, X, WhatsApp, iMessage, etc.).
- **Per-share public on/off**: the user controls whether the shared recipe link
  is publicly viewable.
- **Mobile-first** (Android Chrome + iOS Safari), with a desktop fallback.

## Key constraints (why the design is shaped this way)

- **No social "post" API for normal users.** Instagram/Facebook/etc. don't let a
  web app post to a user's feed. The portable mechanism is the **Web Share API**
  (`navigator.share`), which on phones opens the **native share sheet** — where
  Instagram, WhatsApp, Messages, Threads, etc. appear as targets. Sharing image
  **files** via Web Share is supported on Android Chrome and iOS Safari 15+.
- **Instagram has no web share-link/intent** and can't be posted to from the web
  (desktop). On mobile it's reached only through the native share sheet. So:
  Instagram = covered on mobile via the sheet; desktop offers "save image + copy
  link" so the user posts from the phone app.
- **Rich link previews require server-side Open Graph tags.** The app is an SPA;
  social scrapers don't run JS, so per-recipe meta must be emitted by the server
  at the share URL. `index.html` currently has only generic placeholder OG tags.

## Decisions

- **Dish photo:** a new `cook_image_url` on the recipe, separate from
  `cover_image_url`. One latest cook photo per recipe (replaceable). Shown as the
  hero on the recipe page and the public share page.
- **Public on/off:** one canonical share token per recipe (idempotent). ON =
  ensure a token exists (link live). OFF = revoke the token (link 404s; recipe
  private). Owner-only.
- **Public OFF share:** posts the photo + a link to the site homepage (not the
  recipe). ON shares the `/r/{token}` recipe link.
- **Public page:** cook photo hero (falls back to cover image); instructions stay
  behind the existing sign-up gate.
- **Entry point:** the recipe detail page.
- **Desktop networks:** X, Facebook, WhatsApp, Pinterest, plus Copy link + Save
  image.

## Architecture

### A. Data model
- Migration: add `cook_image_url VARCHAR(2048) NOT NULL DEFAULT ''` to `recipes`.
- Serialized through the existing recipe serializer; set via the existing recipe
  update path (PATCH/PUT). Populated by the upload endpoint built previously
  (`POST /api/uploads` returns a URL; the recipe stores it in `cook_image_url`).
- The public route (`/api/public/recipes/{token}`) additionally returns
  `cook_image_url`.

### B. Public on/off (idempotent token + revoke)
- **Publish (ON):** reuse/replace `POST /recipes/{id}/share` so it is idempotent —
  if an active `shared_recipes` token exists for the recipe, return it; otherwise
  create one. (Prevents the current behavior of minting a new token every share.)
- **Revoke (OFF):** new `DELETE /recipes/{id}/share` — deletes the recipe's
  `shared_recipes` token(s); `/r/{token}` then 404s.
- Both owner-gated (the recipe must belong to the authenticated user).
- The share UI reads/sets this state via these endpoints.

### C. Open Graph link previews (server-side)
- New PHP handler (e.g. `api/routes/og.php` or a dedicated `r.php`) serving
  `/r/{token}`:
  1. Look up the token → recipe (404 page if missing/revoked).
  2. Read the built `index.html` from the web root.
  3. Replace/insert the meta block with per-recipe tags: `og:title` (recipe
     title), `og:description` (recipe description snippet), `og:image` (ABSOLUTE
     URL of `cook_image_url` ‖ `cover_image_url`), `og:url` (the canonical
     `/r/{token}` URL), `og:type=article`, `twitter:card=summary_large_image`,
     `twitter:image`.
  4. Output the modified HTML. Humans get the SPA shell (which boots and routes
     to `PublicRecipeView`); crawlers read the tags.
- **Escaping:** all recipe-derived values are HTML-attribute-escaped to prevent
  meta/markup injection.
- **Absolute image URL:** relative `/uploads/...` paths are made absolute using
  the request scheme+host (configurable override for edge cases).
- **Routing:**
  - Production (Apache): add a rewrite so `^r/([A-Za-z0-9]+)$` is handled by the
    PHP handler *before* the SPA fallback in the root `.htaccess`.
  - Dev (`router.php`): route `/r/{token}` to the same handler so previews can be
    sanity-checked locally; if the built `index.html` is absent in dev, fall back
    to serving tags only / the dev shell.
- A pure, unit-testable function does the meta injection: given the HTML template
  + a recipe-fields struct, return HTML with the correct, escaped tags.

### D. Share flow & UI (mobile-first) — recipe detail page
- A "**Share your cook**" affordance:
  1. Pick/take a photo (`<input type="file" accept="image/*" capture>` on mobile).
  2. Upload via `POST /api/uploads` → returns URL → save to `cook_image_url`
     (recipe update). Keep the picked `File` in memory for Web Share.
  3. Open the share sheet UI: **public ON/OFF toggle** (calls publish/revoke),
     optional caption (prefilled, e.g. `I made {Recipe} 🍳`), then:
     - **Mobile (primary):** a single **Share** button →
       `navigator.share({ files:[photo], text: caption, url })` where `url` is
       `/r/{token}` when public is ON, else the site homepage. Guard with
       `navigator.canShare({ files })`. This surfaces Instagram, WhatsApp,
       Messages, Threads, etc.
     - **Desktop (fallback, when Web Share/file-share unavailable):** **X /
       Facebook / WhatsApp / Pinterest** link buttons (share the `url`; the image
       comes from the OG tags), plus **Copy link** and **Save image** (so the
       user can post to Instagram from their phone).
- A small **share-payload helper** builds `{ caption, url }` and decides
  mobile-vs-desktop capability — unit-testable.

### E. Public page (`PublicRecipeView`)
- Hero image = `cook_image_url` if present, else `cover_image_url`.
- Title, ingredients, tags shown; instructions remain behind the sign-up gate
  (unchanged).

## Testing

- **Backend (PHP, existing harness):**
  - OG meta injection: correct tags present, values HTML-escaped, image URL
    absolutized, missing fields handled.
  - Publish idempotency (second publish returns the same token) and revoke
    (token removed → lookup 404s).
- **Frontend:**
  - Share-payload helper (caption/url construction; public ON vs OFF chooses
    recipe link vs homepage; capability detection).
  - Rest manual: mobile share sheet (Android + iOS), desktop fallback buttons,
    pasted-link preview on at least one network.

## Out of scope (this spec)

- **Video** (upload, storage limits, `<video>` rendering, `og:video`, video
  sharing) — separate follow-up reusing C/D/E.
- A gallery/feed of multiple cook photos (one latest photo per recipe for now).
- Auto-posting to any network (not possible for normal user accounts).

## Risks / notes

- **Crawler caching:** Facebook/others cache OG data; re-shares may show stale
  previews until their cache refreshes (acceptable; debuggable via their sharing
  debuggers).
- **iOS file-share:** `navigator.canShare({files})` must gate the file path;
  fall back to link+caption share if files aren't shareable.
- **`.htaccess` ordering:** the `/r/{token}` rewrite must precede the SPA
  fallback so the PHP handler wins.
- **Token model migration:** making publish idempotent means existing duplicate
  tokens (if any) should be tolerated — the handler resolves any valid token to
  the recipe; publish/revoke operate on the recipe's token set.

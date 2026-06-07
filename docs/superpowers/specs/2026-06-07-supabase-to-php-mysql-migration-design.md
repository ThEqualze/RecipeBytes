# RecipeBytes: Supabase → PHP + MySQL Migration

**Date:** 2026-06-07
**Status:** Approved design, pending implementation plan
**Goal:** Move RecipeBytes entirely onto the user's own 20i shared hosting — no third-party services — by replacing Supabase (Postgres + Auth + RLS + auto API) with a self-hosted PHP API and MySQL database.

---

## 1. Motivation & Constraints

- **Why migrate:** The user wants everything (app + data) hosted on their own 20i account, with no dependency on Supabase or any third party.
- **Hosting target:** 20i shared hosting — Apache/LiteSpeed, PHP, MySQL/MariaDB. No Docker, no root, no guaranteed Node runtime. PHP + MySQL is the native, always-available stack.
- **Data migration:** None required. The current Supabase project holds only throwaway test data. The new MySQL database starts empty.
- **Auth scope:** Email + password only — signup, login, logout, persistent session. No social login, no password-reset email, no email verification (matching the app's current behaviour).

## 2. Current Architecture (before)

- **Frontend:** Vite + React 18 + TypeScript + Tailwind. Builds to static files. No router package (navigation is state-based; shared links read `window.location.pathname`).
- **Backend:** Supabase Cloud — Postgres, Auth (`auth.users`), Row-Level Security, and the auto-generated PostgREST API that the browser calls directly via `@supabase/supabase-js`.
- **Supabase coupling:** 77 call sites across 6 files:
  - `src/lib/supabase.ts` (client)
  - `src/contexts/AuthContext.tsx` (auth)
  - `src/hooks/useData.ts` (the bulk of data access)
  - `src/App.tsx` (share-link create + share-token read)
  - `src/components/PublicRecipeView.tsx` (anonymous public recipe view)
  - `src/components/PantryMatchView.tsx` (ingredient scan across user's recipes)
- **13 tables:** profiles, folders, tags, recipes, ingredients, instructions, recipe_tags, extraction_jobs, grocery_lists, grocery_list_items, shared_recipes, meal_plans, collections, collection_recipes.

## 3. Target Architecture (after)

Everything on 20i, same domain (no CORS):

```
Browser ──► yoursite.com ──► /public_html
                              ├─ index.html, assets/   (built React app, static)
                              ├─ .htaccess             (SPA fallback + /api passthrough)
                              └─ /api                  (PHP backend)
                                    │
                                    ▼
                              MySQL database (on 20i)
```

The frontend calls `fetch('/api/...')` on the same origin. The PHP API enforces auth + ownership and talks to MySQL via PDO.

## 4. Database Conversion (Postgres → MySQL)

All 13 tables convert structurally unchanged. Mechanical type/idiom changes:

| Postgres | MySQL | Notes |
|---|---|---|
| `uuid` PK + `gen_random_uuid()` | `CHAR(36)`, UUID generated in PHP on insert | **Keep UUIDs** — frontend share-token regex and ID handling stay identical |
| `timestamptz` | `DATETIME` storing UTC | App sends/reads ISO strings; store/return UTC |
| `numeric` | `DECIMAL(10,2)` | quantities, yields (nullable where currently nullable) |
| `jsonb` (`extraction_jobs.extracted_data`) | `JSON` | |
| `boolean` | `TINYINT(1)` | serialise back to JSON booleans in API |
| `text NOT NULL DEFAULT ''` | `TEXT` / `VARCHAR` with app-side defaults | preserve NOT NULL + default-empty semantics |
| `pg_trgm` GIN index on `recipes.title` | **dropped** | Title search is client-side over loaded recipes; no DB dependency. (If server search is later needed, add MySQL `FULLTEXT`.) |
| `auth.users` | new `users` table | `id CHAR(36)`, `email` unique, `password_hash`, `created_at` |
| `handle_new_user()` trigger | PHP signup logic | profile row created in the signup transaction |
| `DEFAULT auth.uid()` on user_id columns | API sets `user_id` from session | never client-supplied |
| share-token defaults (`gen_random_bytes`, `gen_random_uuid` substr) | PHP `bin2hex(random_bytes(...))` | preserve token format/length used in URLs |

**Foreign keys & cascades:** preserve all `ON DELETE CASCADE` / `SET NULL` behaviour from the Postgres schema. Use InnoDB.

**Deliverable:** a single `api/schema.sql` that creates the database objects, imported once via phpMyAdmin.

### New tables (auth)
- `users` — `id CHAR(36) PK`, `email VARCHAR(255) UNIQUE NOT NULL`, `password_hash VARCHAR(255) NOT NULL`, `created_at DATETIME`.
- `sessions` — `token CHAR(64) PK`, `user_id CHAR(36) FK→users`, `created_at DATETIME`, `expires_at DATETIME`. Enables server-side revocation.

## 5. Authentication

- **Signup** (`POST /api/auth/signup`, body: email, password, display_name): validate, ensure email not taken, `password_hash()` (bcrypt), insert `users` row + `profiles` row in one transaction, then start a session.
- **Login** (`POST /api/auth/login`): `password_verify()`; on success create a `sessions` row and set the session token as an `httpOnly`, `Secure`, `SameSite=Lax` cookie.
- **Logout** (`POST /api/auth/logout`): delete the session row, clear the cookie.
- **Session** (`GET /api/auth/session`): returns the current user (`{ id, email, display_name }`) or `null` — used by `AuthContext` on page load.
- Frontend `AuthContext` keeps its existing `signUp / signIn / signOut` shape; only the internals change.

## 6. Security / Authorization Contract (critical)

Replaces Supabase RLS. **Mistakes here = data leak, so this is the most scrutinised area.**

**Core rule:** every endpoint derives `user_id` from the server-side session. The client can never request another user's data.

- **Owner-scoped tables** (recipes, folders, tags, collections, meal_plans, grocery_lists, extraction_jobs): all reads/writes constrained `WHERE user_id = <session user>`.
- **Child tables** (ingredients, instructions, recipe_tags, grocery_list_items, collection_recipes): ownership verified through the parent row, mirroring the existing RLS `EXISTS(...)` checks (e.g. an ingredient is writable only if its recipe belongs to the session user).
- **Public / anonymous endpoints** (no session required), preserving current anon policies exactly:
  - `GET /api/public/recipes/{token}` → resolves `shared_recipes.token`; returns recipe + ingredients + tags. **Excludes instructions** (intentional "sign up to see the steps" gate).
  - `GET /api/public/collections/{token}` → only collections with `is_public = true`; returns collection + its recipes.
- **All SQL via PDO prepared statements** (no injection).
- Ownership checks centralised in one helper (`requireOwner($table, $id)` / scoped query builders) so they are consistent and auditable, not duplicated per route.

## 7. API Surface

Same-origin REST under `/api`. JSON in/out. Maps 1:1 to what the hooks/components need.

**Auth:** `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`

**Folders:** `GET /folders`, `POST /folders`, `PATCH /folders/{id}`, `DELETE /folders/{id}`

**Tags:** `GET /tags`, `POST /tags`, `PATCH /tags/{id}`, `DELETE /tags/{id}`

**Recipes:**
- `GET /recipes` (list, newest first)
- `POST /recipes` (create with nested ingredients/instructions/tagIds — mirrors `createRecipe`)
- `GET /recipes/{id}`
- `PATCH /recipes/{id}` (full update incl. children — mirrors `updateRecipe`)
- `DELETE /recipes/{id}` (cascade children)
- `POST /recipes/{id}/duplicate`
- `PATCH /recipes/{id}` also covers `toggleFavorite` / `markCooked` (partial updates)
- `GET /recipes/{id}/ingredients`, `GET /recipes/{id}/instructions`

**Recipe tags:** `GET /recipe-tags` (returns `[{recipe_id, tag_id}]` for the map built in `useRecipeTags`)

**Extraction jobs:** `GET /extraction-jobs`, plus create/update/delete as used.

**Grocery list:** `GET /grocery-list` (active list + items), `POST /grocery-list/items`, `POST /grocery-list/items/from-recipe` (`addRecipeIngredients`), `PATCH /grocery-list/items/{id}` (toggle), `DELETE /grocery-list/items/{id}`, `DELETE /grocery-list/items?checked=1` (clearChecked). Auto-creates an active list when none exists (current behaviour).

**Meal plans:** `GET /meal-plans?from=YYYY-MM-DD&to=YYYY-MM-DD`, `POST /meal-plans`, `PATCH /meal-plans/{id}` (move), `DELETE /meal-plans/{id}`

**Collections:** `GET /collections`, `POST /collections`, `PATCH /collections/{id}`, `DELETE /collections/{id}`, `GET /collections/{id}/recipes`, `POST /collections/{id}/recipes`, `DELETE /collections/{id}/recipes/{recipeId}`

**Sharing:** `POST /recipes/{id}/share` (creates `shared_recipes` row, returns token → builds `/r/{token}` URL)

**Pantry match:** `GET /pantry/ingredients` (all ingredients across the user's recipes — for `PantryMatchView`)

**Public:** `GET /public/recipes/{token}`, `GET /public/collections/{token}`

**Seed:** first-login auto-seed (current `useSeedData` behaviour) ported — either a `POST /seed` endpoint guarded to run only when the user has zero recipes, or seeded inline on signup. Decision deferred to plan; behaviour preserved.

### Response convention
`{ "data": ... }` on success; `{ "error": "message" }` with appropriate HTTP status on failure (400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 500 server). Frontend `api.ts` surfaces errors; hooks already tolerate missing data.

## 8. Frontend Changes (kept minimal)

**Principle:** keep every hook and context function signature identical; swap only internals. Components are untouched.

- **New** `src/lib/api.ts`: thin `fetch` wrapper — base `/api`, `credentials: 'include'`, JSON handling, error normalisation.
- **Remove** `src/lib/supabase.ts` and the `@supabase/supabase-js` dependency.
- **Rewrite internals** of:
  - `src/contexts/AuthContext.tsx` → calls `/api/auth/*`; drops Supabase `Session`/`User` types in favour of a local `User` type (`{ id, email }`) with the same context shape.
  - `src/hooks/useData.ts` → every hook calls API endpoints; **same inputs and return shapes**.
  - `src/App.tsx` → share-create + share-token read via API.
  - `src/components/PublicRecipeView.tsx` → `/api/public/recipes/{token}`.
  - `src/components/PantryMatchView.tsx` → `/api/pantry/ingredients`.
- `src/lib/database.types.ts` stays (plain TS types). Verify it has no Supabase import; if it does, strip it.
- `.env`: `VITE_SUPABASE_*` removed. Optional `VITE_API_BASE` (defaults to `/api`); no secrets in the frontend at all.

## 9. Project Structure (PHP API)

```
/api
  index.php              front controller / router (parses method + path → handler)
  config.php             reads DB creds from a file ABOVE web root (not committed)
  db.php                 PDO connection (singleton)
  auth.php               session helpers: current_user(), require_auth()
  lib/
    response.php         json_ok() / json_error() helpers
    ownership.php        centralised owner/parent ownership checks
    uuid.php             UUID v4 generation
  routes/
    auth.php  folders.php  tags.php  recipes.php  recipe_tags.php
    extraction_jobs.php  grocery.php  meal_plans.php  collections.php
    sharing.php  pantry.php  public.php  seed.php
  schema.sql             MySQL schema (import once)
  config.example.php     committed template (no real creds)
.htaccess                SPA fallback for non-file/non-/api requests → index.html
```

DB credentials live in a PHP file **above** `public_html` (e.g. `/home/.../recipebytes-config.php`) and are `require`d by `config.php`, so they are never web-served and never committed.

## 10. Testing Strategy

- **Local dev parity:** PHP built-in server (`php -S`) + local MySQL/MariaDB; Vite dev server proxies `/api` to the PHP server. Whole stack runs locally before touching 20i.
- **Security boundary tests (must-have):** automated checks that User A cannot read or mutate User B's recipes/folders/collections/etc.; that public recipe endpoint omits instructions; that public collection endpoint refuses non-public collections.
- **Auth tests:** signup → login → session → logout; duplicate-email rejected; bad password rejected.
- **Resource smoke tests:** create/read/update/delete for each resource via curl or a small PHP test script.
- **Frontend:** manual run against local API covering each view (Library, Recipe detail/editor, Collections, Meal planner, Grocery, Pantry match, Inbox, public share link, Kitchen mode).

## 11. Deployment Runbook (20i)

1. Create a MySQL database + user in the 20i panel.
2. Import `api/schema.sql` via phpMyAdmin.
3. Place the real `config.php` credentials file above `public_html`.
4. `npm run build` → upload `dist/*` to `public_html`.
5. Upload `/api` to `public_html/api`.
6. Upload `.htaccess` to `public_html` (SPA fallback; leaves `/api` to PHP).
7. Smoke-test: load site, sign up, create a recipe, open a share link.

## 12. Git Setup

- Initialise git locally and connect to the existing remote `git@github.com:ThEqualze/RecipeBytes.git`.
- The remote may already contain commits (user said "repo already exists") — **reconcile carefully** (inspect remote, integrate rather than force-push). Pushing is outward-facing → confirm with user before the push.
- Commit frontend + `/api` + `schema.sql` + this spec. `.gitignore` keeps `.env` and the real config out; `config.example.php` is committed instead.

## 13. Risks & Mitigations

- **Authorization bugs (highest risk):** centralised ownership helper + explicit cross-user boundary tests.
- **Node unavailability on 20i:** avoided entirely by choosing PHP.
- **UUID/type mismatches:** keep UUIDs as `CHAR(36)`; convert booleans/decimals explicitly in API serialisation.
- **Existing remote conflicts:** inspect before pushing; never force-push without consent.
- **Credential exposure:** config file above web root, never committed.

## 14. Out of Scope

- Data migration from the current Supabase project (none needed).
- The Node.js AI extraction worker referenced in `extraction_jobs` comments (the table/inbox UI is kept; the background worker is not part of this migration).
- Password reset / email verification / social login.
- Server-side full-text search (client-side search retained).

## 15. Open Decisions (deferred to plan, behaviour preserved either way)

- Seed-on-first-login as a guarded `POST /seed` endpoint vs inline-on-signup.
- Exact session lifetime / sliding expiry policy.

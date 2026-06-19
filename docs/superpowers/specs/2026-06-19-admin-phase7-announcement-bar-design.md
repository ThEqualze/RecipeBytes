# Phase 7 — Global Announcement Bar (Design)

**Date:** 2026-06-19
**Status:** Approved (design)
**Branch:** `feat/admin-phase7-announcement-bar`

## Goal

A dismissible banner shown across user sessions so the operator (admin) can broadcast
notices — maintenance windows, incidents, product news. Authored from the Master Admin
Area, typed for severity, optionally linked, and schedulable. This is the last remaining
admin-area feature (Phase 6 financial analytics was dropped).

## Decisions (locked with user)

- **Severity:** typed — `info` (blue) / `warning` (amber) / `critical` (red), each with an icon.
- **Placement:** authenticated main app **and** the login page (so maintenance notices reach
  people trying to sign in). Not shown in the admin SPA or public recipe views.
- **Action link:** optional `link_label` + `link_url` rendered as an inline button.
- **Active model:** scheduled window with `is_active` + optional `starts_at`/`ends_at`. Many
  rows may exist; the single **newest currently-active** row is shown. Admin can pre-schedule.
- **Dismissal:** per-user-per-announcement via `localStorage` (`rb_announce_dismissed_<id>`).
  A new announcement (new id) re-shows automatically. No server-side dismissal tracking.

## Data model

New migration `migrations/2026-06-18_announcements.sql` (idempotent). The same `CREATE TABLE`
block is appended to `api/schema.sql` so fresh installs match.

```sql
CREATE TABLE IF NOT EXISTS announcements (
  id          CHAR(36)     NOT NULL,
  message     VARCHAR(280) NOT NULL,
  type        ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  link_label  VARCHAR(60)  NULL,
  link_url    VARCHAR(500) NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  starts_at   DATETIME     NULL,        -- NULL = active immediately
  ends_at     DATETIME     NULL,        -- NULL = no expiry
  created_by  CHAR(36)     NULL,        -- admin user id (audit)
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_active_window (is_active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**"Currently active"** (server-side, source of truth):
`is_active = 1 AND (starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())
            AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP())`.
All timestamps are stored and compared in **UTC** (`UTC_TIMESTAMP()`), matching the codebase.

## API

### Public (no auth) — new `api/routes/announcements.php`, dispatched from `api/index.php`
- `GET /announcements/active` → the single newest currently-active row as
  `{ id, message, type, link_label, link_url }`, or `null`. Read-only, no session required
  (the login page must be able to call it). Uses the standard `ob_start` /
  `clear_stray_output()` JSON path.

### Admin (`require_admin`) — added to `api/routes/admin.php`
- `GET /admin/announcements` → all rows, newest first (including inactive/expired), each with a
  computed `status`: `scheduled` (active flag on, before `starts_at`), `live` (currently
  active), `expired` (past `ends_at`), `off` (`is_active = 0`). The newest `live` row is the
  visible one; any other `live` rows are flagged `hidden_by_newer = true` for the UI hint.
- `POST /admin/announcements` → create.
- `PATCH /admin/announcements/{id}` → edit any field, including the `is_active` toggle.
- `DELETE /admin/announcements/{id}` → hard delete.

All writes are audit-logged via the existing `admin_audit_log` helper and set `created_by` /
`updated_at`. A single `validate_announcement()` helper centralises rules:
- `message` non-empty, ≤ 280 chars.
- `type` ∈ {info, warning, critical}.
- `link_url`, when present, is `http(s)://…` or a site-relative `/…` path.
- `link_label` and `link_url` are all-or-nothing (both set or both empty).
- `ends_at`, when both set, must be after `starts_at`.

The server is the sole authority on the active-window logic; the client never decides what is
live.

## Frontend

### Shared bar — `src/components/AnnouncementBar.tsx`
- Self-contained: on mount calls `api.get('/announcements/active')`, stores the result, renders
  nothing when `null` or when the id is dismissed in `localStorage`.
- Dismissal keyed `rb_announce_dismissed_<id>`; a new id re-shows.
- Typed styling: `info` → blue, `warning` → amber, `critical` → red, with lucide icons
  (`Info` / `AlertTriangle` / `AlertOctagon`). Optional link renders as an inline button/anchor
  (`target="_blank" rel="noopener noreferrer"` for absolute URLs). Dismiss "×" on the right.
- Fixed to the **top**, mirroring the existing fixed bottom impersonation bar. Stacks above the
  mobile header; content offset is measured so nothing is hidden.

### Wiring
- **Main app:** render `<AnnouncementBar />` inside `Workspace` (authenticated).
- **Login page:** render `<AnnouncementBar />` at the top of `AuthPage`.
- The component fetches its own data — no prop plumbing.

### Admin page — `src/admin/AnnouncementsPage.tsx`
- New `Nav` variant `{ kind: 'announcements' }` + sidebar button in `AdminApp.tsx`
  (lucide `Megaphone`).
- Table of all announcements with the computed `status` badge. Rows that are `live` but
  shadowed by a newer active row show a subtle **"(hidden — newer active)"** hint.
- Create/edit form: message, type select, optional link label + URL, `is_active` toggle,
  optional `starts_at` / `ends_at` datetime inputs. Delete action per row. Follows the existing
  `TiersPage` / `ModerationPage` layout conventions.

## Testing

Extend `tests/` (run via `php tests/run.php`) with announcements coverage:
- Active-window selection: immediate (null dates), scheduled (future `starts_at` excluded),
  expired (`ends_at` past excluded), `is_active = 0` excluded.
- Newest-active-wins when multiple are live.
- Public `GET /announcements/active` works **without** a session and returns `null` when none.
- Admin CRUD requires admin (non-admin → 404, consistent with the area's non-disclosure rule).
- Validation: message length, link all-or-nothing, `ends_at` after `starts_at`.

## Out of scope / deferred

- Per-user server-side dismissal (localStorage is sufficient).
- Targeting by tier/role (global broadcast only).
- Rich text / multiple simultaneous visible banners.

## Go-live

Add `migrations/2026-06-18_announcements.sql` to the live-DB migration checklist alongside the
existing pending admin migrations.

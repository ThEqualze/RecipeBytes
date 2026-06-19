# Phase 7 — Global Announcement Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin broadcast a dismissible, typed, schedulable banner to the authenticated app and the login page.

**Architecture:** New `announcements` MySQL table; a public read-only `GET /announcements/active` endpoint returning the single newest currently-active row; admin CRUD under `/admin/announcements`; a self-fetching React `AnnouncementBar` dropped into `Workspace` and `AuthPage`; an admin `AnnouncementsPage`. Server is the sole authority on which announcement is "live"; dismissal is client-side via `localStorage`.

**Tech Stack:** PHP 8.2 (PDO/MySQL, no framework), React 18 + TypeScript + Vite + Tailwind, lucide-react icons. Tests: PHP HTTP harness (`php tests/run.php`). No JS test framework exists in this repo — frontend tasks are verified with `npx tsc --noEmit` + `npm run build`, matching the established pattern.

**Spec:** `docs/superpowers/specs/2026-06-19-admin-phase7-announcement-bar-design.md`

---

## Environment setup (do once before Task 1)

The PHP HTTP tests need the local DB and API server running (see project memory `recipebytes-migration`):

1. Start XAMPP MariaDB if not running:
   `"/c/xampp/mysql/bin/mysqld.exe" --defaults-file=C:/xampp/mysql/bin/my.ini` (run in background).
2. Start the API: from repo root, `php -S 127.0.0.1:8000 router.php` (run in background).
3. Confirm: `curl -s http://127.0.0.1:8000/api/health` → `{"data":{"status":"ok"}}`.

The local test DB is `recipebytes`, user `root`, no password (per `api/config.php`). The `mysql` client is at `C:/xampp/mysql/bin/mysql.exe` (not on PATH).

---

## File Structure

- **Create** `migrations/2026-06-18_announcements.sql` — idempotent table DDL.
- **Modify** `api/schema.sql` — append the same `announcements` table so fresh installs match.
- **Modify** `tests/run.php` — add `announcements` to the truncate list.
- **Create** `api/lib/announcements.php` — `active_announcement()`, `announcement_status()`, `validate_announcement()`. One responsibility: announcement domain logic shared by the public + admin routes.
- **Create** `api/routes/announcements.php` — public `GET /announcements/active`.
- **Modify** `api/index.php` — register the `/announcements` route prefix.
- **Modify** `api/routes/admin.php` — admin CRUD block under `/admin/announcements`.
- **Create** `tests/test_announcements.php` — public + admin coverage.
- **Create** `src/components/AnnouncementBar.tsx` — self-fetching dismissible bar.
- **Modify** `src/App.tsx` — render `<AnnouncementBar />` in `Workspace`.
- **Modify** `src/components/AuthPage.tsx` — render `<AnnouncementBar />` at the top.
- **Create** `src/admin/AnnouncementsPage.tsx` — admin CRUD UI.
- **Modify** `src/admin/AdminApp.tsx` — add `announcements` nav variant + button.

---

## Task 1: Database table

**Files:**
- Create: `migrations/2026-06-18_announcements.sql`
- Modify: `api/schema.sql` (append at end)
- Modify: `tests/run.php` (truncate list)

- [ ] **Step 1: Write the migration file**

Create `migrations/2026-06-18_announcements.sql`:

```sql
-- Phase 7: global announcement bar. A typed, schedulable, dismissible banner shown
-- in the authenticated app and on the login page. The single newest currently-active
-- row is the one shown. Idempotent.

CREATE TABLE IF NOT EXISTS announcements (
  id          CHAR(36)     NOT NULL,
  message     VARCHAR(280) NOT NULL,
  type        ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  link_label  VARCHAR(60)  NULL,
  link_url    VARCHAR(500) NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  starts_at   DATETIME     NULL,
  ends_at     DATETIME     NULL,
  created_by  CHAR(36)     NULL,
  created_at  DATETIME     NOT NULL,
  updated_at  DATETIME     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_active_window (is_active, starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- [ ] **Step 2: Append the same table to `api/schema.sql`**

Append the identical `CREATE TABLE IF NOT EXISTS announcements (...)` block (without the migration comment header) to the end of `api/schema.sql`, so a fresh schema import includes it.

- [ ] **Step 3: Add `announcements` to the test truncate list**

In `tests/run.php`, add `'announcements'` to the array of tables truncated between runs (the `foreach ([...] as $t)` list around line 14). Place it after `'system_settings'`:

```php
          'ai_job_logs','admin_audit_log','password_reset_tokens','system_settings','content_reports','announcements'] as $t) {
```

- [ ] **Step 4: Apply the migration to the local test DB**

Run:
```bash
"/c/xampp/mysql/bin/mysql.exe" -u root recipebytes < migrations/2026-06-18_announcements.sql
```
Expected: no output, exit 0.

- [ ] **Step 5: Verify the table exists**

Run:
```bash
"/c/xampp/mysql/bin/mysql.exe" -u root recipebytes -e "DESCRIBE announcements;"
```
Expected: 11 columns listed (`id` … `updated_at`).

- [ ] **Step 6: Commit**

```bash
git add migrations/2026-06-18_announcements.sql api/schema.sql tests/run.php
git commit -m "feat(admin): Phase 7 — announcements table + migration"
```

---

## Task 2: Domain logic library

**Files:**
- Create: `api/lib/announcements.php`

This library is pure functions over the DB + input arrays, reused by both the public and admin routes. No HTTP concerns here.

- [ ] **Step 1: Write the library**

Create `api/lib/announcements.php`:

```php
<?php
// Phase 7: announcement domain logic shared by the public and admin routes.

require_once __DIR__ . '/../db.php';

const ANNOUNCEMENT_TYPES = ['info', 'warning', 'critical'];

// SQL fragment: a row is "currently active" when the active flag is on and now()
// falls inside its [starts_at, ends_at) window (NULL bounds = open-ended).
function announcement_active_sql(): string {
    return "is_active = 1
            AND (starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())
            AND (ends_at   IS NULL OR ends_at   >  UTC_TIMESTAMP())";
}

// The single newest currently-active announcement, in public shape, or null.
function active_announcement(): ?array {
    $row = db()->query(
        'SELECT id, message, type, link_label, link_url
           FROM announcements
          WHERE ' . announcement_active_sql() . '
          ORDER BY created_at DESC
          LIMIT 1'
    )->fetch();
    if (!$row) return null;
    return [
        'id'         => $row['id'],
        'message'    => $row['message'],
        'type'       => $row['type'],
        'link_label' => $row['link_label'],
        'link_url'   => $row['link_url'],
    ];
}

// Lifecycle label for the admin list, computed against now (UTC).
// off | scheduled | live | expired
function announcement_status(array $row, string $nowUtc): string {
    if ((int)$row['is_active'] !== 1) return 'off';
    if ($row['ends_at']   !== null && $row['ends_at']   <= $nowUtc) return 'expired';
    if ($row['starts_at'] !== null && $row['starts_at'] >  $nowUtc) return 'scheduled';
    return 'live';
}

// Validate + normalise admin input. Returns ['errors' => string[], 'fields' => array].
// fields keys: message, type, link_label, link_url, is_active, starts_at, ends_at.
function validate_announcement(array $in): array {
    $errors = [];

    $message = trim((string)($in['message'] ?? ''));
    if ($message === '')            $errors[] = 'Message is required.';
    if (mb_strlen($message) > 280)  $errors[] = 'Message must be 280 characters or fewer.';

    $type = (string)($in['type'] ?? 'info');
    if (!in_array($type, ANNOUNCEMENT_TYPES, true)) $errors[] = 'Invalid type.';

    // Link is all-or-nothing.
    $linkLabel = trim((string)($in['link_label'] ?? ''));
    $linkUrl   = trim((string)($in['link_url'] ?? ''));
    if (($linkLabel === '') !== ($linkUrl === '')) {
        $errors[] = 'A link needs both a label and a URL.';
    }
    if ($linkLabel !== '' && mb_strlen($linkLabel) > 60) {
        $errors[] = 'Link label must be 60 characters or fewer.';
    }
    if ($linkUrl !== '') {
        $okAbs = (bool)preg_match('#^https?://#i', $linkUrl);
        $okRel = str_starts_with($linkUrl, '/');
        if (!$okAbs && !$okRel) $errors[] = 'Link URL must start with http(s):// or /.';
        if (mb_strlen($linkUrl) > 500) $errors[] = 'Link URL is too long.';
    }

    $isActive = !empty($in['is_active']) ? 1 : 0;

    // Datetime windows: accept '' / null as "unset". Expect 'YYYY-MM-DD HH:MM:SS'
    // or the HTML 'YYYY-MM-DDTHH:MM' form (normalised below).
    $startsAt = announcement_norm_dt($in['starts_at'] ?? null);
    $endsAt   = announcement_norm_dt($in['ends_at'] ?? null);
    if ($startsAt === false) $errors[] = 'Invalid start time.';
    if ($endsAt   === false) $errors[] = 'Invalid end time.';
    if (is_string($startsAt) && is_string($endsAt) && $endsAt <= $startsAt) {
        $errors[] = 'End time must be after start time.';
    }

    return [
        'errors' => $errors,
        'fields' => [
            'message'    => $message,
            'type'       => $type,
            'link_label' => $linkLabel === '' ? null : $linkLabel,
            'link_url'   => $linkUrl === '' ? null : $linkUrl,
            'is_active'  => $isActive,
            'starts_at'  => $startsAt === false ? null : $startsAt,
            'ends_at'    => $endsAt === false ? null : $endsAt,
        ],
    ];
}

// Normalise a datetime input to 'YYYY-MM-DD HH:MM:SS' (UTC, as sent) or null when
// unset. Returns false when present but unparseable.
function announcement_norm_dt($v) {
    if ($v === null || $v === '') return null;
    if (!is_string($v)) return false;
    $v = str_replace('T', ' ', trim($v));
    $ts = strtotime($v);
    if ($ts === false) return false;
    return gmdate('Y-m-d H:i:s', $ts);
}
```

- [ ] **Step 2: Lint the file**

Run:
```bash
php -l api/lib/announcements.php
```
Expected: `No syntax errors detected in api/lib/announcements.php`.

- [ ] **Step 3: Commit**

```bash
git add api/lib/announcements.php
git commit -m "feat(admin): Phase 7 — announcement domain logic helpers"
```

---

## Task 3: Public endpoint

**Files:**
- Create: `api/routes/announcements.php`
- Modify: `api/index.php` (route table)
- Test: `tests/test_announcements.php`

- [ ] **Step 1: Write the failing test (public read)**

Create `tests/test_announcements.php`:

```php
<?php
// Phase 7: global announcement bar — public read + admin CRUD.

$acfg = require __DIR__ . '/../api/config.php';
$apdo = new PDO(
    "mysql:host={$acfg['db_host']};dbname={$acfg['db_name']};charset={$acfg['db_charset']}",
    $acfg['db_user'], $acfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

// Helper: insert an announcement directly, return its id.
function ann_insert(PDO $pdo, array $f): string {
    $id = bin2hex(random_bytes(8)) . '-ann';
    $pdo->prepare(
        'INSERT INTO announcements
           (id, message, type, link_label, link_url, is_active, starts_at, ends_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?, UTC_TIMESTAMP(), UTC_TIMESTAMP())'
    )->execute([
        $id, $f['message'], $f['type'] ?? 'info', $f['link_label'] ?? null, $f['link_url'] ?? null,
        $f['is_active'] ?? 1, $f['starts_at'] ?? null, $f['ends_at'] ?? null,
    ]);
    return $id;
}

// --- Public endpoint, no session ---
reset_cookies();
$apdo->exec('DELETE FROM announcements');

check('active feed empty -> null', api('GET', '/announcements/active', null, false)['json']['data'] === null);

ann_insert($apdo, ['message' => 'Immediate notice', 'type' => 'warning']);
$r = api('GET', '/announcements/active', null, false);
check('active feed returns row without session', $r['status'] === 200 && $r['json']['data']['message'] === 'Immediate notice');
check('active feed exposes type', $r['json']['data']['type'] === 'warning');

// Inactive / scheduled / expired excluded.
$apdo->exec('DELETE FROM announcements');
ann_insert($apdo, ['message' => 'Off', 'is_active' => 0]);
ann_insert($apdo, ['message' => 'Future', 'starts_at' => gmdate('Y-m-d H:i:s', time() + 86400)]);
ann_insert($apdo, ['message' => 'Past', 'ends_at' => gmdate('Y-m-d H:i:s', time() - 86400)]);
check('inactive/scheduled/expired all excluded -> null', api('GET', '/announcements/active', null, false)['json']['data'] === null);

// Newest active wins.
$apdo->exec('DELETE FROM announcements');
ann_insert($apdo, ['message' => 'Older']);
sleep(1);
ann_insert($apdo, ['message' => 'Newer']);
check('newest active wins', api('GET', '/announcements/active', null, false)['json']['data']['message'] === 'Newer');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
php tests/run.php 2>&1 | grep -A8 test_announcements
```
Expected: FAILs (route not found → `data` is not null/missing), because the endpoint does not exist yet.

- [ ] **Step 3: Write the public route**

Create `api/routes/announcements.php`:

```php
<?php
// Phase 7: public, read-only announcement feed. No auth — the login page must be
// able to read it. Returns the single newest currently-active announcement or null.

require_once __DIR__ . '/../lib/announcements.php';

$path   = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

if ($path === '/announcements/active' && $method === 'GET') {
    json_ok(active_announcement());
}
```

- [ ] **Step 4: Register the route prefix**

In `api/index.php`, add to the `$routes` array (before `/admin` is fine; prefixes are distinct):

```php
    '/announcements'   => 'announcements.php',
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
php tests/run.php 2>&1 | grep -A8 test_announcements
```
Expected: all `test_announcements` checks so far PASS.

- [ ] **Step 6: Commit**

```bash
git add api/routes/announcements.php api/index.php tests/test_announcements.php
git commit -m "feat(admin): Phase 7 — public /announcements/active endpoint"
```

---

## Task 4: Admin CRUD

**Files:**
- Modify: `api/routes/admin.php` (add an announcements block)
- Test: `tests/test_announcements.php` (append admin coverage)

- [ ] **Step 1: Append the failing admin tests**

Append to `tests/test_announcements.php`:

```php
// --- Admin CRUD ---
reset_cookies();
$apdo->exec('DELETE FROM announcements');

// Non-admin is 404 (non-disclosure), consistent with the rest of /admin.
$nonAdmin = 'annuser_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $nonAdmin, 'password' => 'secret123', 'display_name' => 'U']);
check('non-admin list -> 404', api('GET', '/admin/announcements')['status'] === 404);

// Promote a fresh admin.
reset_cookies();
$annAdmin = 'annadmin_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $annAdmin, 'password' => 'secret123', 'display_name' => 'A']);
$apdo->prepare('UPDATE users SET is_admin = 1 WHERE email = ?')->execute([$annAdmin]);

// Create.
$c = api('POST', '/admin/announcements', ['message' => 'Hello world', 'type' => 'info']);
check('admin create -> 200', $c['status'] === 200);
$annId = $c['json']['data']['id'];
check('created row id returned', is_string($annId) && $annId !== '');
check('create audited', (int)$apdo->query("SELECT COUNT(*) FROM admin_audit_log WHERE action = 'create_announcement'")->fetchColumn() >= 1);

// Validation: empty message rejected.
check('empty message -> 422', api('POST', '/admin/announcements', ['message' => '   '])['status'] === 422);
// Validation: link needs both parts.
check('half a link -> 422', api('POST', '/admin/announcements', ['message' => 'x', 'link_url' => 'https://a.com'])['status'] === 422);
// Validation: ends before starts.
check('ends before starts -> 422', api('POST', '/admin/announcements', [
    'message' => 'x', 'starts_at' => '2026-07-02 10:00:00', 'ends_at' => '2026-07-01 10:00:00',
])['status'] === 422);

// List shows it as live.
$list = api('GET', '/admin/announcements');
check('list -> 200', $list['status'] === 200);
$found = null;
foreach ($list['json']['data']['announcements'] as $a) { if ($a['id'] === $annId) $found = $a; }
check('created appears in list as live', $found !== null && $found['status'] === 'live');
check('live row not hidden', $found['hidden_by_newer'] === false);

// A newer live row shadows the older one.
$c2 = api('POST', '/admin/announcements', ['message' => 'Newer one', 'type' => 'info']);
$annId2 = $c2['json']['data']['id'];
$list2 = api('GET', '/admin/announcements');
$old = null; $new = null;
foreach ($list2['json']['data']['announcements'] as $a) {
    if ($a['id'] === $annId)  $old = $a;
    if ($a['id'] === $annId2) $new = $a;
}
check('older live row flagged hidden_by_newer', $old['hidden_by_newer'] === true);
check('newest live row not hidden', $new['hidden_by_newer'] === false);

// Patch: toggle the old one off.
check('patch off -> 200', api('PATCH', "/admin/announcements/$annId", ['message' => 'Hello world', 'is_active' => 0])['status'] === 200);
check('patched row now off', $apdo->query("SELECT is_active FROM announcements WHERE id = " . $apdo->quote($annId))->fetchColumn() == 0);
check('patch audited', (int)$apdo->query("SELECT COUNT(*) FROM admin_audit_log WHERE action = 'update_announcement'")->fetchColumn() >= 1);

// Delete.
check('delete -> 200', api('DELETE', "/admin/announcements/$annId2")['status'] === 200);
check('row gone', (int)$apdo->query("SELECT COUNT(*) FROM announcements WHERE id = " . $apdo->quote($annId2))->fetchColumn() === 0);
check('delete audited', (int)$apdo->query("SELECT COUNT(*) FROM admin_audit_log WHERE action = 'delete_announcement'")->fetchColumn() >= 1);
```

- [ ] **Step 2: Run to verify the admin tests fail**

Run:
```bash
php tests/run.php 2>&1 | grep -A30 test_announcements
```
Expected: the admin checks FAIL (create → 404, list → 404, etc.) because the admin block does not exist. (Non-admin 404 may already pass — that's fine.)

- [ ] **Step 3: Add the admin announcements block to `admin.php`**

In `api/routes/admin.php`, add `require_once __DIR__ . '/../lib/announcements.php';` near the top with the other requires. Then add this block (after the existing `/admin/me` / `/admin/overview` handlers, before the final fall-through):

```php
// ---- Announcement bar (Phase 7) ----
if (($seg[1] ?? '') === 'announcements') {
    $pdo = db();

    // GET /admin/announcements — full list with computed status + hidden_by_newer.
    if (!isset($seg[2]) && $method === 'GET') {
        $now  = gmdate('Y-m-d H:i:s');
        $rows = $pdo->query(
            'SELECT id, message, type, link_label, link_url, is_active, starts_at, ends_at, created_at, updated_at
               FROM announcements ORDER BY created_at DESC'
        )->fetchAll();
        // Newest currently-live id (if any) is the visible one; other live rows are shadowed.
        $visibleLiveId = null;
        foreach ($rows as $r) {
            if (announcement_status($r, $now) === 'live') { $visibleLiveId = $r['id']; break; }
        }
        $out = [];
        foreach ($rows as $r) {
            $status = announcement_status($r, $now);
            $out[] = [
                'id'              => $r['id'],
                'message'         => $r['message'],
                'type'            => $r['type'],
                'link_label'      => $r['link_label'],
                'link_url'        => $r['link_url'],
                'is_active'       => (int)$r['is_active'] === 1,
                'starts_at'       => $r['starts_at'],
                'ends_at'         => $r['ends_at'],
                'created_at'      => $r['created_at'],
                'status'          => $status,
                'hidden_by_newer' => $status === 'live' && $r['id'] !== $visibleLiveId,
            ];
        }
        json_ok(['announcements' => $out]);
    }

    // POST /admin/announcements — create.
    if (!isset($seg[2]) && $method === 'POST') {
        $v = validate_announcement(read_json_body());
        if ($v['errors']) json_error(implode(' ', $v['errors']), 422);
        $f  = $v['fields'];
        $id = uuid4();
        $pdo->prepare(
            'INSERT INTO announcements
               (id, message, type, link_label, link_url, is_active, starts_at, ends_at, created_by, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?, UTC_TIMESTAMP(), UTC_TIMESTAMP())'
        )->execute([
            $id, $f['message'], $f['type'], $f['link_label'], $f['link_url'],
            $f['is_active'], $f['starts_at'], $f['ends_at'], $admin['id'],
        ]);
        admin_audit($admin['id'], 'create_announcement', 'announcement', $id, ['type' => $f['type']]);
        json_ok(['id' => $id]);
    }

    // PATCH /admin/announcements/{id} — full update.
    if (isset($seg[2]) && $method === 'PATCH') {
        $id     = $seg[2];
        $exists = $pdo->prepare('SELECT id FROM announcements WHERE id = ?');
        $exists->execute([$id]);
        if (!$exists->fetchColumn()) json_error('Not found', 404);

        $v = validate_announcement(read_json_body());
        if ($v['errors']) json_error(implode(' ', $v['errors']), 422);
        $f = $v['fields'];
        $pdo->prepare(
            'UPDATE announcements
                SET message = ?, type = ?, link_label = ?, link_url = ?,
                    is_active = ?, starts_at = ?, ends_at = ?, updated_at = UTC_TIMESTAMP()
              WHERE id = ?'
        )->execute([
            $f['message'], $f['type'], $f['link_label'], $f['link_url'],
            $f['is_active'], $f['starts_at'], $f['ends_at'], $id,
        ]);
        admin_audit($admin['id'], 'update_announcement', 'announcement', $id, ['is_active' => $f['is_active']]);
        json_ok(['id' => $id]);
    }

    // DELETE /admin/announcements/{id}.
    if (isset($seg[2]) && $method === 'DELETE') {
        $id = $seg[2];
        $pdo->prepare('DELETE FROM announcements WHERE id = ?')->execute([$id]);
        admin_audit($admin['id'], 'delete_announcement', 'announcement', $id);
        json_ok(['deleted' => true]);
    }

    json_error('Not found', 404);
}
```

- [ ] **Step 4: Run the full announcements test to verify it passes**

Run:
```bash
php tests/run.php 2>&1 | grep -A30 test_announcements
```
Expected: every `test_announcements` check PASSES.

- [ ] **Step 5: Run the whole suite to confirm no regressions**

Run:
```bash
php tests/run.php 2>&1 | tail -3
```
Expected: `Ran <N> checks, 0 failed` (N is the prior count plus the new announcement checks).

- [ ] **Step 6: Commit**

```bash
git add api/routes/admin.php tests/test_announcements.php
git commit -m "feat(admin): Phase 7 — admin announcement CRUD + tests"
```

---

## Task 5: Frontend announcement bar

**Files:**
- Create: `src/components/AnnouncementBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AuthPage.tsx`

No JS test harness exists; verify with typecheck + build (Step 4/5).

- [ ] **Step 1: Write the `AnnouncementBar` component**

Create `src/components/AnnouncementBar.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Info, AlertTriangle, AlertOctagon, X } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'critical';
  link_label: string | null;
  link_url: string | null;
}

const STYLES: Record<Announcement['type'], { bar: string; Icon: typeof Info }> = {
  info:     { bar: 'bg-blue-600 text-white',  Icon: Info },
  warning:  { bar: 'bg-amber-500 text-stone-900', Icon: AlertTriangle },
  critical: { bar: 'bg-red-600 text-white',   Icon: AlertOctagon },
};

const dismissKey = (id: string) => `rb_announce_dismissed_${id}`;

export function AnnouncementBar() {
  const [ann, setAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<Announcement | null>('/announcements/active')
      .then((a) => {
        if (!alive || !a) return;
        if (localStorage.getItem(dismissKey(a.id))) return;
        setAnn(a);
      })
      .catch(() => { /* a banner is non-critical; stay silent on failure */ });
    return () => { alive = false; };
  }, []);

  if (!ann) return null;

  const { bar, Icon } = STYLES[ann.type];
  const dismiss = () => {
    try { localStorage.setItem(dismissKey(ann.id), '1'); } catch { /* ignore quota */ }
    setAnn(null);
  };
  const absolute = !!ann.link_url && /^https?:\/\//i.test(ann.link_url);

  return (
    <div className={`relative z-[70] flex items-center gap-3 px-4 py-2 text-[13px] font-medium shadow-sm ${bar}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">{ann.message}</span>
      {ann.link_url && ann.link_label && (
        <a
          href={ann.link_url}
          target={absolute ? '_blank' : undefined}
          rel={absolute ? 'noopener noreferrer' : undefined}
          className="shrink-0 underline underline-offset-2 hover:opacity-80"
        >
          {ann.link_label}
        </a>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded hover:bg-black/10"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

Note: the bar renders in normal flow (not `fixed`), so it pushes content down rather than overlapping — it is placed as the first child of a flex-column wrapper in Steps 2–3.

- [ ] **Step 2: Render the bar in `Workspace` (`src/App.tsx`)**

Add the import near the other component imports at the top of `src/App.tsx`:

```tsx
import { AnnouncementBar } from './components/AnnouncementBar';
```

In `Workspace`, the outer element is currently:

```tsx
    <div className="flex h-screen w-screen overflow-hidden bg-stone-50 text-stone-900">
```

Wrap it so the bar sits above the app row. Replace that opening `<div ...>` and its matching closing `</div>` (the last line of the `return`, line ~507) with a flex-column wrapper:

```tsx
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <AnnouncementBar />
      <div className="flex flex-1 min-h-0 w-screen overflow-hidden bg-stone-50 text-stone-900">
        {/* ...existing Workspace children unchanged... */}
      </div>
    </div>
```

Concretely: insert `<div className="flex flex-col h-screen w-screen overflow-hidden">` + `<AnnouncementBar />` before the existing `<div className="flex h-screen ...">`, change that existing div's classes from `h-screen w-screen` to `flex-1 min-h-0 w-screen` (it keeps `flex overflow-hidden bg-stone-50 text-stone-900`), and add the extra closing `</div>` at the end of the return.

- [ ] **Step 3: Render the bar on the login page (`src/components/AuthPage.tsx`)**

Read `src/components/AuthPage.tsx` first to find its outermost returned element. Add the import:

```tsx
import { AnnouncementBar } from './AnnouncementBar';
```

Wrap the outermost element in a flex column with the bar on top:

```tsx
  return (
    <div className="flex flex-col min-h-screen">
      <AnnouncementBar />
      {/* existing AuthPage root element unchanged, as the next child */}
    </div>
  );
```

If the existing root already sets `min-h-screen`/`h-screen`, leave it — the wrapper's `min-h-screen` plus the child's own height work together; the bar simply occupies its natural height at the top.

- [ ] **Step 4: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors introduced by the new files (pre-existing errors, if any, are unchanged — compare against a clean baseline run).

- [ ] **Step 5: Build**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/AnnouncementBar.tsx src/App.tsx src/components/AuthPage.tsx
git commit -m "feat(admin): Phase 7 — announcement bar in app + login page"
```

---

## Task 6: Admin announcements page

**Files:**
- Create: `src/admin/AnnouncementsPage.tsx`
- Modify: `src/admin/AdminApp.tsx`

- [ ] **Step 1: Write the `AnnouncementsPage`**

Create `src/admin/AnnouncementsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { Loader2, Megaphone, Plus, Trash2 } from 'lucide-react';

type AnnType = 'info' | 'warning' | 'critical';
type Status = 'off' | 'scheduled' | 'live' | 'expired';

interface Ann {
  id: string;
  message: string;
  type: AnnType;
  link_label: string | null;
  link_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  status: Status;
  hidden_by_newer: boolean;
}

interface FormState {
  message: string;
  type: AnnType;
  link_label: string;
  link_url: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

const EMPTY: FormState = {
  message: '', type: 'info', link_label: '', link_url: '', is_active: true, starts_at: '', ends_at: '',
};

const STATUS_BADGE: Record<Status, string> = {
  live:      'bg-green-100 text-green-700',
  scheduled: 'bg-blue-100 text-blue-700',
  expired:   'bg-stone-100 text-stone-500',
  off:       'bg-stone-100 text-stone-500',
};

export function AnnouncementsPage() {
  const [items, setItems] = useState<Ann[] | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    api.get<{ announcements: Ann[] }>('/admin/announcements')
      .then((r) => setItems(r.announcements))
      .catch(() => setItems([]));
  };
  useEffect(load, []);

  const startEdit = (a: Ann) => {
    setEditId(a.id);
    setForm({
      message: a.message,
      type: a.type,
      link_label: a.link_label ?? '',
      link_url: a.link_url ?? '',
      is_active: a.is_active,
      starts_at: a.starts_at ? a.starts_at.replace(' ', 'T').slice(0, 16) : '',
      ends_at: a.ends_at ? a.ends_at.replace(' ', 'T').slice(0, 16) : '',
    });
  };

  const reset = () => { setEditId(null); setForm(EMPTY); setErr(null); };

  const save = async () => {
    setBusy(true); setErr(null);
    const body = {
      message: form.message,
      type: form.type,
      link_label: form.link_label,
      link_url: form.link_url,
      is_active: form.is_active,
      starts_at: form.starts_at,
      ends_at: form.ends_at,
    };
    try {
      if (editId) await api.patch(`/admin/announcements/${editId}`, body);
      else await api.post('/admin/announcements', body);
      reset();
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true); setErr(null);
    try { await api.del(`/admin/announcements/${id}`); if (editId === id) reset(); load(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Delete failed.'); }
    finally { setBusy(false); }
  };

  const field = 'w-full text-[13px] border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300';

  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <h1 className="font-display text-[26px] font-semibold text-stone-900 mb-2 flex items-center gap-2">
        <Megaphone className="w-6 h-6 text-accent-700" /> Announcements
      </h1>
      <p className="text-[13px] text-stone-500 mb-6">The single newest <strong>live</strong> announcement is shown to users. Dismissals are per-person.</p>

      {err && <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>}

      {/* Editor */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-8 space-y-3">
        <div className="text-[14px] font-semibold text-stone-800">{editId ? 'Edit announcement' : 'New announcement'}</div>
        <textarea className={field} rows={2} maxLength={280} placeholder="Message (max 280 chars)"
          value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select className={field} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AnnType })}>
            <option value="info">Info (blue)</option>
            <option value="warning">Warning (amber)</option>
            <option value="critical">Critical (red)</option>
          </select>
          <input className={field} placeholder="Link label (optional)" value={form.link_label}
            onChange={(e) => setForm({ ...form, link_label: e.target.value })} />
          <input className={field} placeholder="Link URL (https://… or /path)" value={form.link_url}
            onChange={(e) => setForm({ ...form, link_url: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[12px] text-stone-500">Starts (optional, UTC)
            <input type="datetime-local" className={field} value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          </label>
          <label className="text-[12px] text-stone-500">Ends (optional, UTC)
            <input type="datetime-local" className={field} value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-stone-700">
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          Active
        </label>
        <div className="flex items-center gap-2 pt-1">
          <button disabled={busy} onClick={save}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg px-3.5 py-2 disabled:opacity-50">
            <Plus className="w-4 h-4" /> {editId ? 'Save changes' : 'Create'}
          </button>
          {editId && <button onClick={reset} className="text-[13px] font-medium text-stone-600 hover:text-stone-900 px-2 py-2">Cancel</button>}
        </div>
      </div>

      {/* List */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        {!items ? <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div> :
          items.length === 0 ? <div className="px-4 py-6 text-center text-stone-400 text-[13px]">No announcements yet.</div> : (
            <table className="w-full text-[13px]">
              <thead className="bg-stone-50 text-stone-500"><tr>
                <th className="text-left font-medium px-4 py-2.5">Message</th>
                <th className="text-left font-medium px-4 py-2.5">Type</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t border-stone-100">
                    <td className="px-4 py-2.5 text-stone-800 max-w-md truncate">{a.message}</td>
                    <td className="px-4 py-2.5 text-stone-600 capitalize">{a.type}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[a.status]}`}>{a.status}</span>
                      {a.hidden_by_newer && <span className="ml-2 text-[11px] text-stone-400">(hidden — newer active)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(a)} className="text-[12px] font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded px-2.5 py-1 mr-2">Edit</button>
                      <button disabled={busy} onClick={() => remove(a.id)} aria-label="Delete" className="inline-flex items-center text-[12px] font-medium text-red-600 hover:bg-red-50 rounded px-2 py-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify `api` has `patch` and `del` methods**

Run:
```bash
grep -nE "patch|del\b|delete" src/lib/api.ts
```
Expected: methods named `patch` and `del` exist. If the delete method is named differently (e.g. `delete`), adjust the two `api.del(...)` calls in Step 1 to match. If `patch` is absent, use `api.put` if present, otherwise add a `patch` method mirroring the existing `post` implementation in `src/lib/api.ts`.

- [ ] **Step 3: Wire the nav in `AdminApp.tsx`**

In `src/admin/AdminApp.tsx`:

1. Add the import:
```tsx
import { AnnouncementsPage } from './AnnouncementsPage';
```
2. Add `Megaphone` to the existing lucide import line:
```tsx
import { LayoutDashboard, Users as UsersIcon, CreditCard, Cpu, ShieldAlert, Megaphone, LogOut, Loader2 } from 'lucide-react';
```
3. Extend the `Nav` type with the new variant:
```tsx
type Nav = { kind: 'overview' } | { kind: 'users' } | { kind: 'user'; id: string } | { kind: 'tiers' } | { kind: 'ai' } | { kind: 'moderation' } | { kind: 'announcements' };
```
4. Add a sidebar button after the Moderation button:
```tsx
          <button className={navItem(nav.kind === 'announcements')} onClick={() => setNav({ kind: 'announcements' })}>
            <Megaphone className="w-4 h-4" /> Announcements
          </button>
```
5. Add the page to the `<main>` switch after the moderation line:
```tsx
        {nav.kind === 'announcements' && <AnnouncementsPage />}
```

- [ ] **Step 4: Typecheck**

Run:
```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Build**

Run:
```bash
npm run build
```
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/admin/AnnouncementsPage.tsx src/admin/AdminApp.tsx
git commit -m "feat(admin): Phase 7 — admin announcements management page"
```

---

## Task 7: Full verification + go-live note

- [ ] **Step 1: Run the entire PHP test suite**

Ensure the API server + DB are running, then:
```bash
php tests/run.php 2>&1 | tail -3
```
Expected: `Ran <N> checks, 0 failed`.

- [ ] **Step 2: Final typecheck + build**

Run:
```bash
npx tsc --noEmit && npm run build
```
Expected: both succeed.

- [ ] **Step 3: Manual smoke (optional but recommended)**

With the dev server (`npm run dev`) and PHP API running: as an admin, create an `info` announcement → confirm the blue bar appears in the app and on the login page (after sign-out), the "Learn more" link works, dismiss persists across reload, and a newer announcement re-shows. In the admin list, create two live announcements and confirm the older shows "(hidden — newer active)".

- [ ] **Step 4: Update the go-live checklist**

The live DB needs the new migration. Note for the operator (do not run against prod yourself): apply `migrations/2026-06-18_announcements.sql` to the live 20i DB alongside the other pending admin migrations.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin feat/admin-phase7-announcement-bar
gh pr create --title "feat(admin): Phase 7 — global announcement bar" --body "$(cat <<'EOF'
## Summary
- New `announcements` table (typed, schedulable, optional link) + idempotent migration
- Public `GET /announcements/active` (no auth) returns the single newest live announcement
- Admin CRUD under `/admin/announcements` with validation + audit logging
- Self-fetching `AnnouncementBar` in the app and on the login page; per-user localStorage dismissal
- Admin `AnnouncementsPage` with status badges + "hidden — newer active" hint

## Testing
- `php tests/run.php` — all checks pass (incl. new `test_announcements.php`)
- `npx tsc --noEmit` + `npm run build` clean

## Go-live
- Apply `migrations/2026-06-18_announcements.sql` to the live DB.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review notes

- **Spec coverage:** table (T1) ✓, public endpoint reachable without session (T3) ✓, admin CRUD + validation + audit (T4) ✓, typed styling + optional link + dismissal (T5) ✓, admin page + status + hidden hint (T6) ✓, tests across active-window/newest-wins/no-session/non-admin/validation (T3–T4) ✓, go-live note (T7) ✓.
- **Active-window authority:** only the server computes "live" (`active_announcement()` / `announcement_status()`); the client renders whatever the feed returns.
- **Type consistency:** `validate_announcement()` returns `['errors','fields']`; `announcement_status($row,$nowUtc)` is called with `gmdate('Y-m-d H:i:s')` in the admin list; `hidden_by_newer` is produced server-side and consumed by `AnnouncementsPage`. Frontend `Ann`/`FormState` field names match the API JSON keys.
- **API client:** verified — `src/lib/api.ts` exposes `get` / `post` / `patch` / `del`, exactly as used in Tasks 5–6. Task 6 Step 2's fallback is a belt-and-braces check only.

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
         VALUES (?,?,?,?,?,?,?,?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))'
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
// Deleting a row that no longer exists 404s (mirrors PATCH).
check('delete missing -> 404', api('DELETE', "/admin/announcements/$annId2")['status'] === 404);

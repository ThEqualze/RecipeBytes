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

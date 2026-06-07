<?php
// Direct DB seed so we don't depend on other routes.
$cfg = require __DIR__ . '/../api/config.php';
$pdo = new PDO("mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset={$cfg['db_charset']}",
    $cfg['db_user'], $cfg['db_pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

reset_cookies();
$email = 'folders_' . bin2hex(random_bytes(4)) . '@example.com';
$su = api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'F']);
$uid = $su['json']['data']['id'];
$now = gmdate('Y-m-d H:i:s');
$mk = function($name, $pos) use ($pdo, $uid, $now) {
    $id = bin2hex(random_bytes(8)) . '-0000-4000-8000-' . bin2hex(random_bytes(6));
    $pdo->prepare('INSERT INTO folders (id,user_id,parent_id,name,icon,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$id, $uid, null, $name, 'folder', $pos, $now, $now]);
};
$mk('Zeta', 1); $mk('Alpha', 0);

$r = api('GET', '/folders');
check('folders 200', $r['status'] === 200);
check('folders count 2', count($r['json']['data'] ?? []) === 2);
check('folders ordered by position', ($r['json']['data'][0]['name'] ?? '') === 'Alpha');
check('folder position is an int', ($r['json']['data'][0]['position'] ?? null) === 0);

reset_cookies();
$anon = api('GET', '/folders');
check('folders require auth (401)', $anon['status'] === 401);

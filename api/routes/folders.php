<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/serialize.php';
require_once __DIR__ . '/../lib/ownership.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/folders' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY position');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('folders', $stmt->fetchAll()));
}

if ($path === '/folders' && $method === 'POST') {
    $b = read_json_body();
    $name = (isset($b['name']) && is_string($b['name']) && trim($b['name']) !== '') ? trim($b['name']) : 'Untitled';
    $parent = !empty($b['parent_id']) ? $b['parent_id'] : null;
    if ($parent !== null) owned_or_404('folders', $parent, $user['id']);

    // Append after the last sibling (folders are listed by position).
    $posStmt = db()->prepare('SELECT COALESCE(MAX(position) + 1, 0) AS p FROM folders WHERE user_id = ? AND parent_id <=> ?');
    $posStmt->execute([$user['id'], $parent]);
    $position = (int) $posStmt->fetch()['p'];

    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare('INSERT INTO folders (id,user_id,parent_id,name,icon,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$id, $user['id'], $parent, $name, 'folder', $position, $now, $now]);

    $stmt = db()->prepare('SELECT * FROM folders WHERE id = ?');
    $stmt->execute([$id]);
    json_ok(serialize_row('folders', $stmt->fetch()));
}

json_error('Not found', 404);

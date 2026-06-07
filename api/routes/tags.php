<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/tags' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY category, name');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('tags', $stmt->fetchAll()));
}

json_error('Not found', 404);

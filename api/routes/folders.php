<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/folders' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM folders WHERE user_id = ? ORDER BY position');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('folders', $stmt->fetchAll()));
}

json_error('Not found', 404);

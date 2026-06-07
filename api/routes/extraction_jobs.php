<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/extraction-jobs' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM extraction_jobs WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('extraction_jobs', $stmt->fetchAll()));
}

json_error('Not found', 404);

<?php
require_once __DIR__ . '/../auth.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/recipe-tags' && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT rt.recipe_id, rt.tag_id
           FROM recipe_tags rt
           JOIN recipes r ON r.id = rt.recipe_id
          WHERE r.user_id = ?'
    );
    $stmt->execute([$user['id']]);
    json_ok($stmt->fetchAll());
}

json_error('Not found', 404);

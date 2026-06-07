<?php
require_once __DIR__ . '/../auth.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/pantry/ingredients' && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT i.recipe_id, i.name
           FROM ingredients i
           JOIN recipes r ON r.id = i.recipe_id
          WHERE r.user_id = ?'
    );
    $stmt->execute([$user['id']]);
    json_ok($stmt->fetchAll());
}

json_error('Not found', 404);

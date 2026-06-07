<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path === '/recipes' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$user['id']]);
    json_ok(serialize_rows('recipes', $stmt->fetchAll()));
}

if ($path === '/recipes' && $method === 'POST') {
    $body = read_json_body();
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    $stmt = db()->prepare(
        'INSERT INTO recipes (id, user_id, title, description, notes, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?)'
    );
    $stmt->execute([$id, $user['id'], $body['title'] ?? 'Untitled Recipe', '', '', $now, $now]);
    json_ok(['id' => $id]);
}

if (preg_match('#^/recipes/([a-f0-9-]{36})$#', $path, $m) && $method === 'GET') {
    $row = owned_or_404('recipes', $m[1], $user['id']);
    json_ok(serialize_row('recipes', $row));
}

json_error('Not found', 404);

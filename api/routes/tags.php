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

if ($path === '/tags' && $method === 'POST') {
    $b = read_json_body();
    $name = (isset($b['name']) && is_string($b['name'])) ? trim($b['name']) : '';
    if ($name === '') json_error('Tag name is required', 400);
    $color = (isset($b['color']) && is_string($b['color']) && $b['color'] !== '') ? $b['color'] : '#64748b';
    $category = (isset($b['category']) && is_string($b['category']) && $b['category'] !== '') ? $b['category'] : 'custom';
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    try {
        db()->prepare('INSERT INTO tags (id,user_id,name,color,category,created_at) VALUES (?,?,?,?,?,?)')
            ->execute([$id, $user['id'], $name, $color, $category, $now]);
    } catch (PDOException $e) {
        // Unique (user_id, name) violation.
        json_error('A tag with that name already exists', 409);
    }
    $stmt = db()->prepare('SELECT * FROM tags WHERE id = ?');
    $stmt->execute([$id]);
    json_ok(serialize_row('tags', $stmt->fetch()));
}

json_error('Not found', 404);

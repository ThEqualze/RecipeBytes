<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();
$uid = $user['id'];

if ($path === '/collections' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM collections WHERE user_id = ? ORDER BY position, created_at DESC');
    $stmt->execute([$uid]);
    json_ok(serialize_rows('collections', $stmt->fetchAll()));
}

if ($path === '/collections' && $method === 'POST') {
    $b = read_json_body();
    $cnt = db()->prepare('SELECT COUNT(*) c FROM collections WHERE user_id = ?');
    $cnt->execute([$uid]);
    $pos = (int)$cnt->fetch()['c'];
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare('INSERT INTO collections (id,user_id,title,description,cover_image_url,is_public,share_token,position,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $uid, $b['title'] ?? 'Untitled', $b['description'] ?? '', '', 0, bin2hex(random_bytes(6)), $pos, $now, $now]);
    $s = db()->prepare('SELECT * FROM collections WHERE id = ?');
    $s->execute([$id]);
    json_ok(serialize_row('collections', $s->fetch()));
}

// /collections/{id}/recipes ...
if (preg_match('#^/collections/([a-f0-9-]{36})/recipes/([a-f0-9-]{36})$#', $path, $m) && $method === 'DELETE') {
    owned_or_404('collections', $m[1], $uid);
    db()->prepare('DELETE FROM collection_recipes WHERE collection_id = ? AND recipe_id = ?')->execute([$m[1], $m[2]]);
    json_ok(['ok' => true]);
}
if (preg_match('#^/collections/([a-f0-9-]{36})/recipes$#', $path, $m)) {
    owned_or_404('collections', $m[1], $uid);
    if ($method === 'GET') {
        $s = db()->prepare('SELECT * FROM collection_recipes WHERE collection_id = ? ORDER BY position');
        $s->execute([$m[1]]);
        json_ok(serialize_rows('collection_recipes', $s->fetchAll()));
    }
    if ($method === 'POST') {
        $b = read_json_body();
        owned_or_404('recipes', $b['recipe_id'] ?? '', $uid);
        $cnt = db()->prepare('SELECT COUNT(*) c FROM collection_recipes WHERE collection_id = ?');
        $cnt->execute([$m[1]]);
        $pos = (int)$cnt->fetch()['c'];
        $id = uuid4();
        db()->prepare('INSERT INTO collection_recipes (id,collection_id,recipe_id,position,added_at) VALUES (?,?,?,?,?)')
            ->execute([$id, $m[1], $b['recipe_id'] ?? '', $pos, gmdate('Y-m-d H:i:s')]);
        $s = db()->prepare('SELECT * FROM collection_recipes WHERE id = ?');
        $s->execute([$id]);
        json_ok(serialize_row('collection_recipes', $s->fetch()));
    }
}

// /collections/{id}
if (preg_match('#^/collections/([a-f0-9-]{36})$#', $path, $m)) {
    owned_or_404('collections', $m[1], $uid);
    if ($method === 'PATCH') {
        $b = read_json_body();
        $cols = ['title','description','cover_image_url','is_public','position'];
        $set = []; $vals = [];
        foreach ($cols as $col) {
            if (array_key_exists($col, $b)) {
                $v = $b[$col];
                if ($col === 'is_public') $v = $v ? 1 : 0;
                if ($col === 'position') $v = (int)$v;
                $set[] = "`$col` = ?"; $vals[] = $v;
            }
        }
        $set[] = '`updated_at` = ?'; $vals[] = gmdate('Y-m-d H:i:s');
        $vals[] = $m[1];
        db()->prepare('UPDATE collections SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($vals);
        json_ok(['ok' => true]);
    }
    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM collections WHERE id = ?')->execute([$m[1]]);
        json_ok(['ok' => true]);
    }
}

json_error('Not found', 404);

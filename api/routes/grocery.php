<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();
$uid = $user['id'];

function active_list(string $uid): ?array {
    $stmt = db()->prepare('SELECT * FROM grocery_lists WHERE user_id = ? AND is_active = 1 LIMIT 1');
    $stmt->execute([$uid]);
    return $stmt->fetch() ?: null;
}
function get_or_create_active_list(string $uid): array {
    $list = active_list($uid);
    if ($list) return $list;
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare('INSERT INTO grocery_lists (id,user_id,name,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        ->execute([$id, $uid, "This week's list", 1, $now, $now]);
    return active_list($uid);
}
function list_item_count(string $listId): int {
    $s = db()->prepare('SELECT COUNT(*) c FROM grocery_list_items WHERE grocery_list_id = ?');
    $s->execute([$listId]);
    return (int)$s->fetch()['c'];
}

if ($path === '/grocery-list' && $method === 'GET') {
    $list = active_list($uid);
    $items = [];
    if ($list) {
        $s = db()->prepare('SELECT * FROM grocery_list_items WHERE grocery_list_id = ? ORDER BY position');
        $s->execute([$list['id']]);
        $items = serialize_rows('grocery_list_items', $s->fetchAll());
    }
    json_ok(['list' => serialize_row('grocery_lists', $list), 'items' => $items]);
}

if ($path === '/grocery-list/items' && $method === 'POST') {
    $b = read_json_body();
    $list = get_or_create_active_list($uid);
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare('INSERT INTO grocery_list_items (id,grocery_list_id,recipe_id,ingredient_id,name,quantity,unit,aisle,is_checked,position,created_at,updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $list['id'], null, null, $b['name'] ?? '', null, '', 'other', 0, list_item_count($list['id']), $now, $now]);
    $s = db()->prepare('SELECT * FROM grocery_list_items WHERE id = ?');
    $s->execute([$id]);
    json_ok(serialize_row('grocery_list_items', $s->fetch()));
}

if ($path === '/grocery-list/items/from-recipe' && $method === 'POST') {
    $b = read_json_body();
    $recipeId = $b['recipe_id'] ?? '';
    owned_or_404('recipes', $recipeId, $uid);
    $list = get_or_create_active_list($uid);
    $start = list_item_count($list['id']);
    $ings = db()->prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position');
    $ings->execute([$recipeId]);
    $inserted = [];
    $now = gmdate('Y-m-d H:i:s');
    foreach ($ings->fetchAll() as $i => $ing) {
        $id = uuid4();
        db()->prepare('INSERT INTO grocery_list_items (id,grocery_list_id,recipe_id,ingredient_id,name,quantity,unit,aisle,is_checked,position,created_at,updated_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([$id, $list['id'], $recipeId, $ing['id'], $ing['name'], $ing['quantity'], $ing['unit'], 'other', 0, $start + $i, $now, $now]);
        $inserted[] = $id;
    }
    if (count($inserted) === 0) { json_ok([]); }
    $in = implode(',', array_fill(0, count($inserted), '?'));
    $s = db()->prepare("SELECT * FROM grocery_list_items WHERE id IN ($in) ORDER BY position");
    $s->execute($inserted);
    json_ok(serialize_rows('grocery_list_items', $s->fetchAll()));
}

if (preg_match('#^/grocery-list/items/([a-f0-9-]{36})$#', $path, $m)) {
    child_owned_or_404('grocery_list_items', $m[1], $uid);
    if ($method === 'PATCH') {
        $b = read_json_body();
        db()->prepare('UPDATE grocery_list_items SET is_checked = ?, updated_at = ? WHERE id = ?')
            ->execute([!empty($b['is_checked']) ? 1 : 0, gmdate('Y-m-d H:i:s'), $m[1]]);
        json_ok(['ok' => true]);
    }
    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM grocery_list_items WHERE id = ?')->execute([$m[1]]);
        json_ok(['ok' => true]);
    }
}

if ($path === '/grocery-list/clear-checked' && $method === 'POST') {
    $list = active_list($uid);
    if ($list) {
        db()->prepare('DELETE FROM grocery_list_items WHERE grocery_list_id = ? AND is_checked = 1')
            ->execute([$list['id']]);
    }
    json_ok(['ok' => true]);
}

json_error('Not found', 404);

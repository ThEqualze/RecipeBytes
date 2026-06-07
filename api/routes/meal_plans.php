<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();
$uid = $user['id'];

if ($path === '/meal-plans' && $method === 'GET') {
    $from = $_GET['from'] ?? '1970-01-01';
    $to   = $_GET['to'] ?? '2999-12-31';
    $stmt = db()->prepare('SELECT * FROM meal_plans WHERE user_id = ? AND planned_date BETWEEN ? AND ? ORDER BY position');
    $stmt->execute([$uid, $from, $to]);
    json_ok(serialize_rows('meal_plans', $stmt->fetchAll()));
}

if ($path === '/meal-plans' && $method === 'POST') {
    $b = read_json_body();
    $recipeId = $b['recipe_id'] ?? '';
    owned_or_404('recipes', $recipeId, $uid);
    $date = $b['planned_date'] ?? '';
    $type = $b['meal_type'] ?? 'dinner';
    $cnt = db()->prepare('SELECT COUNT(*) c FROM meal_plans WHERE user_id = ? AND planned_date = ? AND meal_type = ?');
    $cnt->execute([$uid, $date, $type]);
    $pos = (int)$cnt->fetch()['c'];
    $id = uuid4();
    db()->prepare('INSERT INTO meal_plans (id,user_id,recipe_id,planned_date,meal_type,position,created_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([$id, $uid, $recipeId, $date, $type, $pos, gmdate('Y-m-d H:i:s')]);
    $s = db()->prepare('SELECT * FROM meal_plans WHERE id = ?');
    $s->execute([$id]);
    json_ok(serialize_row('meal_plans', $s->fetch()));
}

if (preg_match('#^/meal-plans/([a-f0-9-]{36})$#', $path, $m)) {
    owned_or_404('meal_plans', $m[1], $uid);
    if ($method === 'PATCH') {
        $b = read_json_body();
        db()->prepare('UPDATE meal_plans SET planned_date = ?, meal_type = ? WHERE id = ?')
            ->execute([$b['planned_date'] ?? null, $b['meal_type'] ?? null, $m[1]]);
        json_ok(['ok' => true]);
    }
    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM meal_plans WHERE id = ?')->execute([$m[1]]);
        json_ok(['ok' => true]);
    }
}

json_error('Not found', 404);

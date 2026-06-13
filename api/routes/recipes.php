<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/ownership.php';
require_once __DIR__ . '/../lib/serialize.php';
require_once __DIR__ . '/../lib/import_extract.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();
$uid = $user['id'];

// Helpers ----------------------------------------------------------------
$num_or_null = function ($v) {
    if ($v === null) return null;
    if (is_string($v) && trim($v) === '') return null;
    return is_numeric($v) ? $v + 0 : null;
};
$insert_children = function (string $recipeId, array $body) use ($num_or_null, $uid) {
    $now = gmdate('Y-m-d H:i:s');
    foreach (($body['ingredients'] ?? []) as $i => $ing) {
        $qty = parse_quantity($ing['quantity'] ?? null); // accepts "½", "1 ½", "1/2" -> decimal
        $raw = trim(implode(' ', array_filter([
            (string)($ing['quantity'] ?? ''), $ing['unit'] ?? '', $ing['name'] ?? '', $ing['prep_note'] ?? ''
        ], fn($s) => $s !== '')));
        db()->prepare('INSERT INTO ingredients (id,recipe_id,position,group_name,quantity,unit,name,prep_note,raw_text,created_at)
                       VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([uuid4(), $recipeId, $i, $ing['group_name'] ?? '', $qty,
                       $ing['unit'] ?? '', $ing['name'] ?? '', $ing['prep_note'] ?? '', $raw, $now]);
    }
    foreach (($body['instructions'] ?? []) as $i => $step) {
        $timer = $num_or_null($step['timer_seconds'] ?? null);
        db()->prepare('INSERT INTO instructions (id,recipe_id,position,step_number,group_name,content,timer_seconds,created_at)
                       VALUES (?,?,?,?,?,?,?,?)')
            ->execute([uuid4(), $recipeId, $i, $i + 1, $step['group_name'] ?? '',
                       $step['content'] ?? '', $timer === null ? null : (int)$timer, $now]);
    }
    foreach (($body['tagIds'] ?? []) as $tagId) {
        owned_or_404('tags', $tagId, $uid);
        db()->prepare('INSERT INTO recipe_tags (recipe_id,tag_id,created_at) VALUES (?,?,?)')
            ->execute([$recipeId, $tagId, $now]);
    }
};

// LIST -------------------------------------------------------------------
if ($path === '/recipes' && $method === 'GET') {
    $stmt = db()->prepare('SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at DESC');
    $stmt->execute([$uid]);
    json_ok(serialize_rows('recipes', $stmt->fetchAll()));
}

// CREATE -----------------------------------------------------------------
if ($path === '/recipes' && $method === 'POST') {
    $b = read_json_body();
    if (!empty($b['folder_id'])) owned_or_404('folders', $b['folder_id'], $uid);
    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    $sourceType = !empty($b['source_url']) ? 'web' : 'manual';
    db()->prepare(
        'INSERT INTO recipes (id,user_id,folder_id,title,description,source_type,source_url,source_author,
            cover_image_url,yield_amount,yield_unit,prep_time_minutes,cook_time_minutes,total_time_minutes,
            notes,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $id, $uid, $b['folder_id'] ?? null, $b['title'] ?? 'Untitled Recipe', $b['description'] ?? '',
        $sourceType, $b['source_url'] ?? '', $b['source_author'] ?? '', $b['cover_image_url'] ?? '',
        $num_or_null($b['yield_amount'] ?? 1) ?? 1, $b['yield_unit'] ?? 'servings',
        (int)($b['prep_time_minutes'] ?? 0), (int)($b['cook_time_minutes'] ?? 0), (int)($b['total_time_minutes'] ?? 0),
        $b['notes'] ?? '', $now, $now,
    ]);
    $insert_children($id, $b);
    json_ok(['id' => $id]);
}

// Sub-routes on a specific recipe ----------------------------------------
if (preg_match('#^/recipes/([a-f0-9-]{36})/ingredients$#', $path, $m) && $method === 'GET') {
    owned_or_404('recipes', $m[1], $uid);
    $stmt = db()->prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position');
    $stmt->execute([$m[1]]);
    json_ok(serialize_rows('ingredients', $stmt->fetchAll()));
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/instructions$#', $path, $m) && $method === 'GET') {
    owned_or_404('recipes', $m[1], $uid);
    $stmt = db()->prepare('SELECT * FROM instructions WHERE recipe_id = ? ORDER BY position');
    $stmt->execute([$m[1]]);
    json_ok(serialize_rows('instructions', $stmt->fetchAll()));
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/share$#', $path, $m) && $method === 'GET') {
    owned_or_404('recipes', $m[1], $uid);
    $stmt = db()->prepare('SELECT token FROM shared_recipes WHERE recipe_id = ? ORDER BY created_at ASC, id ASC LIMIT 1');
    $stmt->execute([$m[1]]);
    $row = $stmt->fetch();
    json_ok(['token' => $row ? $row['token'] : null]);
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/share$#', $path, $m) && $method === 'POST') {
    owned_or_404('recipes', $m[1], $uid);
    // Reuse this recipe's existing share token if it has one. Best-effort: there
    // is no DB uniqueness on recipe_id and legacy rows may have several, so pick
    // the oldest deterministically rather than minting a new token each time.
    $existing = db()->prepare('SELECT token FROM shared_recipes WHERE recipe_id = ? ORDER BY created_at ASC, id ASC LIMIT 1');
    $existing->execute([$m[1]]);
    $row = $existing->fetch();
    if ($row) {
        json_ok(['token' => $row['token']]);
    }
    $token = bin2hex(random_bytes(12));
    db()->prepare('INSERT INTO shared_recipes (id,recipe_id,user_id,token,message,created_at) VALUES (?,?,?,?,?,?)')
        ->execute([uuid4(), $m[1], $uid, $token, '', gmdate('Y-m-d H:i:s')]);
    json_ok(['token' => $token]);
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/share$#', $path, $m) && $method === 'DELETE') {
    owned_or_404('recipes', $m[1], $uid);
    db()->prepare('DELETE FROM shared_recipes WHERE recipe_id = ?')->execute([$m[1]]);
    json_ok(['ok' => true]);
}
if (preg_match('#^/recipes/shared/([a-f0-9]+)$#', $path, $m) && $method === 'GET') {
    $stmt = db()->prepare(
        'SELECT sr.recipe_id FROM shared_recipes sr JOIN recipes r ON r.id = sr.recipe_id
          WHERE sr.token = ? AND r.user_id = ?'
    );
    $stmt->execute([$m[1], $uid]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    json_ok(['recipe_id' => $row['recipe_id']]);
}
if (preg_match('#^/recipes/([a-f0-9-]{36})/duplicate$#', $path, $m) && $method === 'POST') {
    $orig = owned_or_404('recipes', $m[1], $uid);
    $newId = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    db()->prepare(
        'INSERT INTO recipes (id,user_id,folder_id,title,description,source_type,source_url,source_author,
            cover_image_url,yield_amount,yield_unit,prep_time_minutes,cook_time_minutes,total_time_minutes,
            notes,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )->execute([
        $newId, $uid, $orig['folder_id'], $orig['title'] . ' (copy)', $orig['description'], $orig['source_type'],
        $orig['source_url'], $orig['source_author'], $orig['cover_image_url'], $orig['yield_amount'], $orig['yield_unit'],
        $orig['prep_time_minutes'], $orig['cook_time_minutes'], $orig['total_time_minutes'], $orig['notes'], $now, $now,
    ]);
    // copy ingredients, instructions, tags
    foreach (['ingredients','instructions'] as $child) {
        $rows = db()->prepare("SELECT * FROM `$child` WHERE recipe_id = ? ORDER BY position");
        $rows->execute([$m[1]]);
        foreach ($rows->fetchAll() as $r) {
            if ($child === 'ingredients') {
                db()->prepare('INSERT INTO ingredients (id,recipe_id,position,group_name,quantity,unit,name,prep_note,raw_text,created_at)
                               VALUES (?,?,?,?,?,?,?,?,?,?)')
                    ->execute([uuid4(), $newId, $r['position'], $r['group_name'], $r['quantity'], $r['unit'], $r['name'], $r['prep_note'], $r['raw_text'], $now]);
            } else {
                db()->prepare('INSERT INTO instructions (id,recipe_id,position,step_number,group_name,content,timer_seconds,created_at)
                               VALUES (?,?,?,?,?,?,?,?)')
                    ->execute([uuid4(), $newId, $r['position'], $r['step_number'], $r['group_name'], $r['content'], $r['timer_seconds'], $now]);
            }
        }
    }
    $tags = db()->prepare('SELECT tag_id FROM recipe_tags WHERE recipe_id = ?');
    $tags->execute([$m[1]]);
    foreach ($tags->fetchAll() as $t) {
        db()->prepare('INSERT INTO recipe_tags (recipe_id,tag_id,created_at) VALUES (?,?,?)')
            ->execute([$newId, $t['tag_id'], $now]);
    }
    json_ok(['id' => $newId]);
}

// GET / PATCH / DELETE one recipe ----------------------------------------
if (preg_match('#^/recipes/([a-f0-9-]{36})$#', $path, $m)) {
    $row = owned_or_404('recipes', $m[1], $uid);

    if ($method === 'GET') {
        json_ok(serialize_row('recipes', $row));
    }

    if ($method === 'PATCH') {
        $b = read_json_body();
        if (!empty($b['folder_id'])) owned_or_404('folders', $b['folder_id'], $uid);
        $scalar = ['title','description','cover_image_url','cook_image_url','source_url','source_author','folder_id',
                   'prep_time_minutes','cook_time_minutes','total_time_minutes','yield_amount','yield_unit',
                   'notes','is_favorite','last_cooked_at','status'];
        $set = []; $vals = [];
        foreach ($scalar as $col) {
            if (array_key_exists($col, $b)) {
                $val = $b[$col];
                if ($col === 'is_favorite') $val = $val ? 1 : 0;
                if (in_array($col, ['prep_time_minutes','cook_time_minutes','total_time_minutes'], true)) $val = (int)$val;
                $set[] = "`$col` = ?"; $vals[] = $val;
            }
        }
        // If source_url changed and source_type not explicitly set, recompute it.
        if (array_key_exists('source_url', $b) && !array_key_exists('source_type', $b)) {
            $set[] = '`source_type` = ?'; $vals[] = !empty($b['source_url']) ? 'web' : 'manual';
        }
        $set[] = '`updated_at` = ?'; $vals[] = gmdate('Y-m-d H:i:s');
        $vals[] = $m[1];
        db()->prepare('UPDATE recipes SET ' . implode(', ', $set) . ' WHERE id = ?')->execute($vals);

        // Replace children only if those keys are present.
        if (array_key_exists('ingredients', $b)) {
            db()->prepare('DELETE FROM ingredients WHERE recipe_id = ?')->execute([$m[1]]);
        }
        if (array_key_exists('instructions', $b)) {
            db()->prepare('DELETE FROM instructions WHERE recipe_id = ?')->execute([$m[1]]);
        }
        if (array_key_exists('tagIds', $b)) {
            db()->prepare('DELETE FROM recipe_tags WHERE recipe_id = ?')->execute([$m[1]]);
        }
        $insert_children($m[1], [
            'ingredients'  => $b['ingredients']  ?? [],
            'instructions' => $b['instructions'] ?? [],
            'tagIds'       => $b['tagIds']       ?? [],
        ]);
        json_ok(['ok' => true]);
    }

    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM recipes WHERE id = ?')->execute([$m[1]]); // children cascade
        json_ok(['ok' => true]);
    }
}

json_error('Not found', 404);

<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

// Report a public recipe link (external viewers, no auth). Increments the
// share's flag count and files a moderation report.
if (preg_match('#^/public/recipes/([a-f0-9]+)/report$#', $path, $m) && $method === 'POST') {
    $share = db()->prepare('SELECT id FROM shared_recipes WHERE token = ?');
    $share->execute([$m[1]]);
    $sr = $share->fetch();
    if ($sr) {
        $body = read_json_body();
        $reason = is_string($body['reason'] ?? null) ? mb_substr(trim($body['reason']), 0, 512) : '';
        $ip = isset($_SERVER['REMOTE_ADDR']) ? substr((string)$_SERVER['REMOTE_ADDR'], 0, 64) : null;
        db()->prepare('UPDATE shared_recipes SET flagged_count = flagged_count + 1 WHERE id = ?')->execute([$sr['id']]);
        db()->prepare(
            'INSERT INTO content_reports (id, shared_recipe_id, token, reason, reporter_ip, status, created_at)
             VALUES (?,?,?,?,?,?,UTC_TIMESTAMP())'
        )->execute([uuid4(), $sr['id'], $m[1], $reason, $ip, 'open']);
    }
    json_ok(['ok' => true]); // generic — don't reveal whether the link exists
}

if (preg_match('#^/public/recipes/([a-f0-9]+)$#', $path, $m) && $method === 'GET') {
    // Revoked (taken-down) links resolve as not found.
    $share = db()->prepare('SELECT recipe_id, message FROM shared_recipes WHERE token = ? AND is_active = 1');
    $share->execute([$m[1]]);
    $sr = $share->fetch();
    if (!$sr) json_error('Not found', 404);

    $recipeStmt = db()->prepare('SELECT * FROM recipes WHERE id = ?');
    $recipeStmt->execute([$sr['recipe_id']]);
    $recipe = $recipeStmt->fetch();
    if (!$recipe) json_error('Not found', 404);

    $ingStmt = db()->prepare('SELECT * FROM ingredients WHERE recipe_id = ? ORDER BY position');
    $ingStmt->execute([$sr['recipe_id']]);

    $tagStmt = db()->prepare(
        'SELECT t.* FROM tags t JOIN recipe_tags rt ON rt.tag_id = t.id WHERE rt.recipe_id = ?'
    );
    $tagStmt->execute([$sr['recipe_id']]);

    // NOTE: instructions are intentionally NOT returned (sign-up gate).
    json_ok([
        'recipe'      => serialize_row('recipes', $recipe),
        'ingredients' => serialize_rows('ingredients', $ingStmt->fetchAll()),
        'tags'        => serialize_rows('tags', $tagStmt->fetchAll()),
        'message'     => $sr['message'],
    ]);
}

json_error('Not found', 404);

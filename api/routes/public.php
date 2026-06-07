<?php
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../lib/serialize.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

if (preg_match('#^/public/recipes/([a-f0-9]+)$#', $path, $m) && $method === 'GET') {
    $share = db()->prepare('SELECT recipe_id, message FROM shared_recipes WHERE token = ?');
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

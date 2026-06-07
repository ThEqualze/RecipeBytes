<?php
require_once __DIR__ . '/../db.php';

// Throws 403/404 unless the row in $table with $id is owned by $userId.
function require_owner(string $table, string $id, string $userId): void {
    $allowed = ['recipes','folders','tags','collections','meal_plans',
                'grocery_lists','extraction_jobs','shared_recipes'];
    if (!in_array($table, $allowed, true)) json_error('Server error', 500);
    $stmt = db()->prepare("SELECT user_id FROM `$table` WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($row['user_id'] !== $userId) json_error('Forbidden', 403);
}

// Confirms a recipe belongs to the user (used by ingredient/instruction/tag routes).
function require_recipe_owner(string $recipeId, string $userId): void {
    require_owner('recipes', $recipeId, $userId);
}

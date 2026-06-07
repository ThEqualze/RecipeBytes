<?php
require_once __DIR__ . '/../db.php';

// Owner-scoped tables that have a direct user_id column.
const OWNED_TABLES = ['recipes','folders','tags','collections','meal_plans',
                      'grocery_lists','extraction_jobs','shared_recipes'];

// Returns the row from $table with $id IF it belongs to $userId; else 404/403 (exits).
function owned_or_404(string $table, string $id, string $userId): array {
    if (!in_array($table, OWNED_TABLES, true)) json_error('Server error', 500);
    $stmt = db()->prepare("SELECT * FROM `$table` WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    if ($row['user_id'] !== $userId) json_error('Forbidden', 403);
    return $row;
}

// Back-compat: throw 403/404 unless owned (no row returned).
function require_owner(string $table, string $id, string $userId): void {
    owned_or_404($table, $id, $userId);
}

function require_recipe_owner(string $recipeId, string $userId): void {
    owned_or_404('recipes', $recipeId, $userId);
}

// Confirms a CHILD row belongs to a parent the user owns, via the parent's user_id.
// Allowlisted child/parent tables only. Returns the child row, or 404/403.
function child_owned_or_404(string $childTable, string $childId, string $userId): array {
    // childTable => [parentForeignKeyColumn, parentTable]
    static $map = [
        'ingredients'        => ['recipe_id', 'recipes'],
        'instructions'       => ['recipe_id', 'recipes'],
        'grocery_list_items' => ['grocery_list_id', 'grocery_lists'],
        'collection_recipes' => ['collection_id', 'collections'],
    ];
    if (!isset($map[$childTable])) json_error('Server error', 500);
    [$fk, $parent] = $map[$childTable];
    $stmt = db()->prepare(
        "SELECT c.* FROM `$childTable` c
           JOIN `$parent` p ON p.id = c.`$fk`
          WHERE c.id = ? AND p.user_id = ?"
    );
    $stmt->execute([$childId, $userId]);
    $row = $stmt->fetch();
    if (!$row) {
        // Distinguish missing vs forbidden for correct status codes.
        $exists = db()->prepare("SELECT 1 FROM `$childTable` WHERE id = ?");
        $exists->execute([$childId]);
        $found = (bool)$exists->fetch();
        json_error($found ? 'Forbidden' : 'Not found', $found ? 403 : 404);
    }
    return $row;
}

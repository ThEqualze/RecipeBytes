<?php
// Casts DB string columns to the booleans/numbers/JSON the frontend expects.
// Column type maps per table; anything not listed stays a string (or null).
function serialize_row(string $table, ?array $row): ?array {
    if ($row === null) return null;

    static $bool = [
        'recipes' => ['is_favorite'],
        'grocery_lists' => ['is_active'],
        'grocery_list_items' => ['is_checked'],
        'collections' => ['is_public'],
    ];
    static $int = [
        'folders' => ['position'],
        'recipes' => ['prep_time_minutes', 'cook_time_minutes', 'total_time_minutes'],
        'ingredients' => ['position'],
        'instructions' => ['position', 'step_number', 'timer_seconds'],
        'grocery_list_items' => ['position'],
        'meal_plans' => ['position'],
        'collections' => ['position'],
    ];
    static $float = [
        'recipes' => ['yield_amount'],
        'ingredients' => ['quantity'],
        'grocery_list_items' => ['quantity'],
    ];
    static $json = [
        'extraction_jobs' => ['extracted_data'],
    ];

    foreach ($bool[$table] ?? [] as $c) {
        if (array_key_exists($c, $row) && $row[$c] !== null) $row[$c] = (bool)(int)$row[$c];
    }
    foreach ($int[$table] ?? [] as $c) {
        if (array_key_exists($c, $row) && $row[$c] !== null) $row[$c] = (int)$row[$c];
    }
    foreach ($float[$table] ?? [] as $c) {
        if (array_key_exists($c, $row) && $row[$c] !== null) $row[$c] = (float)$row[$c];
    }
    foreach ($json[$table] ?? [] as $c) {
        if (array_key_exists($c, $row) && is_string($row[$c])) $row[$c] = json_decode($row[$c], true);
    }
    return $row;
}

function serialize_rows(string $table, array $rows): array {
    return array_map(fn($r) => serialize_row($table, $r), $rows);
}

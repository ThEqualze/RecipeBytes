<?php
// Never let PHP warnings/notices print into the response body — that would
// corrupt the JSON. Errors are still logged (see the catch in this file).
ini_set('display_errors', '0');

// Buffer all output so that a stray BOM/whitespace in any included file
// (e.g. a config.php saved with a BOM by a web editor) can be discarded
// before we emit JSON. index.php itself must stay BOM-free for this to work.
ob_start();

require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/uuid.php';
require __DIR__ . '/db.php';

$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^.*?/api#', '', $uri);
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];

$GLOBALS['ROUTE_PATH'] = $path;
$GLOBALS['ROUTE_METHOD'] = $method;

// Map URL prefix -> route file. Longest-prefix wins via boundary matching.
$routes = [
    '/auth'            => 'auth.php',
    '/recipe-tags'     => 'recipe_tags.php',
    '/recipes'         => 'recipes.php',
    '/folders'         => 'folders.php',
    '/tags'            => 'tags.php',
    '/extraction-jobs' => 'extraction_jobs.php',
    '/grocery-list'    => 'grocery.php',
    '/meal-plans'      => 'meal_plans.php',
    '/collections'     => 'collections.php',
    '/pantry'          => 'pantry.php',
    '/public'          => 'public.php',
    '/import'          => 'import.php',
    '/uploads'         => 'uploads.php',
    '/usage'           => 'usage.php',
    '/admin'           => 'admin.php',
    '/announcements'   => 'announcements.php',
];

function path_matches(string $path, string $prefix): bool {
    return $path === $prefix || str_starts_with($path, $prefix . '/');
}

try {
    if ($path === '/health') {
        json_ok(['status' => 'ok']);
    }
    foreach ($routes as $prefix => $file) {
        if (path_matches($path, $prefix)) {
            require __DIR__ . '/routes/' . $file;
            json_error('Not found', 404); // route file fell through
        }
    }
    json_error('Not found', 404);
} catch (Throwable $e) {
    error_log('API error: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_error('Server error', 500);
}

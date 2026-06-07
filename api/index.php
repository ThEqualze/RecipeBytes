<?php
require __DIR__ . '/lib/response.php';
require __DIR__ . '/lib/uuid.php';
require __DIR__ . '/db.php';

// Path after the /api prefix, e.g. "/auth/login"
$uri  = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = preg_replace('#^.*/api#', '', $uri);
$path = '/' . trim($path, '/');
$method = $_SERVER['REQUEST_METHOD'];

// Expose to route files
$GLOBALS['ROUTE_PATH'] = $path;
$GLOBALS['ROUTE_METHOD'] = $method;

try {
    if ($path === '/health') {
        json_ok(['status' => 'ok']);
    }

    if (str_starts_with($path, '/auth')) {
        require __DIR__ . '/routes/auth.php';
        json_error('Not found', 404);
    }

    json_error('Not found', 404);
} catch (Throwable $e) {
    json_error('Server error', 500);
}

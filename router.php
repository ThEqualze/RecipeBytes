<?php
// Local dev front controller for: php -S 127.0.0.1:8000 router.php
// Production does NOT use this file (Apache .htaccess handles routing).
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (preg_match('#^/api(/|$)#', $path)) {
    require __DIR__ . '/api/index.php';
    return true;
}

// Serve an existing static file as-is
$file = __DIR__ . $path;
if ($path !== '/' && is_file($file)) {
    return false;
}

// SPA fallback (only meaningful once the frontend is built into ./index.html)
if (is_file(__DIR__ . '/index.html')) {
    require __DIR__ . '/index.html';
    return true;
}
return false;

<?php
// Current user's monthly import usage + limits (drives the in-app usage/near-limit UI).

require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/subscriptions.php';

$path   = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user   = require_auth();

if ($path === '/usage' && $method === 'GET') {
    json_ok([
        'url'   => usage_status($user['id'], 'url'),
        'image' => usage_status($user['id'], 'image'),
    ]);
}

json_error('Not found', 404);

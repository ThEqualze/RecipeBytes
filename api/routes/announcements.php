<?php
// Phase 7: public, read-only announcement feed. No auth — the login page must be
// able to read it. Returns the single newest currently-active announcement or null.

require_once __DIR__ . '/../lib/announcements.php';

$path   = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

if ($path === '/announcements/active' && $method === 'GET') {
    json_ok(active_announcement());
}

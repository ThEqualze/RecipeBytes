<?php
// Admin area API. Every endpoint is gated by require_admin(), which 404s and logs
// a security alert for any non-admin / unauthenticated / suspended / impersonating
// request before any admin logic runs. Phase 1 ships the secure shell + an overview;
// later phases add the user, tier, AI, moderation, and announcement endpoints.

require_once __DIR__ . '/../lib/admin_auth.php';

$path   = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

$admin = require_admin(); // 404 + audit for anyone who is not a live, active admin

if ($path === '/admin/me' && $method === 'GET') {
    json_ok([
        'id'           => $admin['id'],
        'email'        => $admin['email'],
        'display_name' => $admin['display_name'] ?? '',
        'is_admin'     => true,
    ]);
}

if ($path === '/admin/overview' && $method === 'GET') {
    $pdo = db();
    $userCount   = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $adminCount  = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_admin = 1')->fetchColumn();
    $recipeCount = (int)$pdo->query("SELECT COUNT(*) FROM recipes WHERE status = 'active'")->fetchColumn();
    $tiers = $pdo->query(
        'SELECT id, tier_name, monthly_cost, is_default, position
           FROM subscription_tiers ORDER BY position, tier_name'
    )->fetchAll();

    json_ok([
        'admin'  => ['id' => $admin['id'], 'email' => $admin['email'], 'display_name' => $admin['display_name'] ?? ''],
        'counts' => ['users' => $userCount, 'admins' => $adminCount, 'active_recipes' => $recipeCount],
        'tiers'  => $tiers,
    ]);
}

json_error('Not found', 404);

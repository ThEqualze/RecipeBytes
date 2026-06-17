<?php
// Admin area API. Every endpoint is gated by require_admin(), which 404s and logs
// a security alert for any non-admin / unauthenticated / suspended / impersonating
// request before any admin logic runs.

require_once __DIR__ . '/../lib/admin_auth.php';
require_once __DIR__ . '/../lib/subscriptions.php';

$path   = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

$admin = require_admin(); // 404 + audit for anyone who is not a live, active admin

$seg = explode('/', trim($path, '/')); // ['admin', ...]

// ---- GET /admin/me ----
if ($path === '/admin/me' && $method === 'GET') {
    json_ok([
        'id'           => $admin['id'],
        'email'        => $admin['email'],
        'display_name' => $admin['display_name'] ?? '',
        'is_admin'     => true,
    ]);
}

// ---- GET /admin/overview ----
if ($path === '/admin/overview' && $method === 'GET') {
    $pdo = db();
    $userCount   = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $adminCount  = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE is_admin = 1')->fetchColumn();
    $suspended   = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE suspended_at IS NOT NULL')->fetchColumn();
    $recipeCount = (int)$pdo->query("SELECT COUNT(*) FROM recipes WHERE status = 'active'")->fetchColumn();
    $tiers = $pdo->query(
        'SELECT id, tier_name, monthly_cost, is_default, position FROM subscription_tiers ORDER BY position, tier_name'
    )->fetchAll();
    json_ok([
        'admin'  => ['id' => $admin['id'], 'email' => $admin['email'], 'display_name' => $admin['display_name'] ?? ''],
        'counts' => ['users' => $userCount, 'admins' => $adminCount, 'suspended' => $suspended, 'active_recipes' => $recipeCount],
        'tiers'  => $tiers,
    ]);
}

// ---- GET /admin/users  (directory: ?q=&suspended=0|1&page=) ----
if ($path === '/admin/users' && $method === 'GET') {
    $pdo = db();
    $q = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = 25;
    $offset = ($page - 1) * $perPage;

    $where = [];
    $params = [];
    if ($q !== '') {
        $where[] = '(u.email LIKE ? OR p.display_name LIKE ?)';
        $like = '%' . $q . '%';
        $params[] = $like;
        $params[] = $like;
    }
    if (isset($_GET['suspended']) && $_GET['suspended'] !== '') {
        $where[] = (int)$_GET['suspended'] === 1 ? 'u.suspended_at IS NOT NULL' : 'u.suspended_at IS NULL';
    }
    $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $countStmt = $pdo->prepare("SELECT COUNT(*) FROM users u LEFT JOIN profiles p ON p.id = u.id $whereSql");
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $sql = "SELECT u.id, u.email, u.is_admin, u.suspended_at, u.created_at,
                   p.display_name,
                   t.tier_name,
                   (SELECT COUNT(*) FROM recipes r WHERE r.user_id = u.id AND r.status = 'active') AS recipe_count
              FROM users u
              LEFT JOIN profiles p ON p.id = u.id
              LEFT JOIN user_subscriptions us ON us.user_id = u.id
              LEFT JOIN subscription_tiers t ON t.id = us.tier_id
              $whereSql
             ORDER BY u.created_at DESC
             LIMIT $perPage OFFSET $offset";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = array_map(function ($r) {
        return [
            'id'           => $r['id'],
            'email'        => $r['email'],
            'display_name' => $r['display_name'] ?? '',
            'is_admin'     => (int)$r['is_admin'] === 1,
            'suspended'    => $r['suspended_at'] !== null,
            'created_at'   => $r['created_at'],
            'tier_name'    => $r['tier_name'] ?? null,
            'recipe_count' => (int)$r['recipe_count'],
        ];
    }, $stmt->fetchAll());

    json_ok(['users' => $rows, 'total' => $total, 'page' => $page, 'per_page' => $perPage]);
}

// ---- /admin/users/{id} and sub-actions ----
if (($seg[1] ?? '') === 'users' && isset($seg[2]) && $seg[2] !== '') {
    $userId = $seg[2];
    $action = $seg[3] ?? '';

    $target = admin_user_or_404($userId);

    // GET /admin/users/{id} — dossier
    if ($action === '' && $method === 'GET') {
        $pdo = db();
        ensure_user_subscription($userId);
        $sub = $pdo->prepare(
            'SELECT us.status, us.current_period_start, us.current_period_end, us.stripe_customer_id,
                    t.id AS tier_id, t.tier_name, t.monthly_cost,
                    t.max_recipes, t.max_url_imports, t.max_image_scans,
                    t.multi_device_enabled, t.kitchen_mode_enabled, t.planner_enabled,
                    t.shopping_list_enabled, t.pantry_match_enabled
               FROM user_subscriptions us JOIN subscription_tiers t ON t.id = us.tier_id
              WHERE us.user_id = ?'
        );
        $sub->execute([$userId]);
        $subscription = $sub->fetch() ?: null;

        $usage = get_or_create_usage($userId);
        $rc = $pdo->prepare("SELECT COUNT(*) FROM recipes WHERE user_id = ? AND status = 'active'");
        $rc->execute([$userId]);
        $recipeCount = (int)$rc->fetchColumn();

        $aj = $pdo->prepare("SELECT job_type, status, COUNT(*) c FROM ai_job_logs WHERE user_id = ? GROUP BY job_type, status");
        $aj->execute([$userId]);
        $aiAgg = $aj->fetchAll();

        json_ok([
            'user' => [
                'id'           => $target['id'],
                'email'        => $target['email'],
                'display_name' => $target['display_name'] ?? '',
                'is_admin'     => (int)$target['is_admin'] === 1,
                'suspended'    => $target['suspended_at'] !== null,
                'suspended_at' => $target['suspended_at'],
                'created_at'   => $target['created_at'],
            ],
            'subscription' => $subscription ? [
                'tier_id'              => $subscription['tier_id'],
                'tier_name'            => $subscription['tier_name'],
                'status'               => $subscription['status'],
                'monthly_cost'         => (float)$subscription['monthly_cost'],
                'current_period_start' => $subscription['current_period_start'],
                'current_period_end'   => $subscription['current_period_end'],
                'limits' => [
                    'max_recipes'     => $subscription['max_recipes'] !== null ? (int)$subscription['max_recipes'] : null,
                    'max_url_imports' => $subscription['max_url_imports'] !== null ? (int)$subscription['max_url_imports'] : null,
                    'max_image_scans' => $subscription['max_image_scans'] !== null ? (int)$subscription['max_image_scans'] : null,
                ],
                'features' => [
                    'multi_device'  => (int)$subscription['multi_device_enabled'] === 1,
                    'kitchen_mode'  => (int)$subscription['kitchen_mode_enabled'] === 1,
                    'planner'       => (int)$subscription['planner_enabled'] === 1,
                    'shopping_list' => (int)$subscription['shopping_list_enabled'] === 1,
                    'pantry_match'  => (int)$subscription['pantry_match_enabled'] === 1,
                ],
            ] : null,
            'usage' => [
                'period_start'      => $usage['period_start'],
                'reset_date'        => $usage['reset_date'],
                'url_imports_count' => (int)$usage['url_imports_count'],
                'image_scans_count' => (int)$usage['image_scans_count'],
            ],
            'stats' => [
                'recipe_count' => $recipeCount,
                'ai_jobs'      => array_map(fn($r) => [
                    'job_type' => $r['job_type'], 'status' => $r['status'], 'count' => (int)$r['c'],
                ], $aiAgg),
            ],
        ]);
    }

    // POST /admin/users/{id}/suspend  {suspend: bool}
    if ($action === 'suspend' && $method === 'POST') {
        $body = read_json_body();
        $suspend = (bool)($body['suspend'] ?? true);
        if ($userId === $admin['id'] && $suspend) {
            json_error('You cannot suspend your own account.', 400);
        }
        if ($suspend) {
            db()->prepare('UPDATE users SET suspended_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$userId]);
            // Force logout: invalidate all of the target's sessions.
            db()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
        } else {
            db()->prepare('UPDATE users SET suspended_at = NULL WHERE id = ?')->execute([$userId]);
        }
        admin_audit($admin['id'], $suspend ? 'suspend_user' : 'unsuspend_user', 'user', $userId);
        json_ok(['suspended' => $suspend]);
    }

    // POST /admin/users/{id}/subscription  {tier_id, status?, current_period_end?}
    if ($action === 'subscription' && $method === 'POST') {
        $body = read_json_body();
        $tierId = is_string($body['tier_id'] ?? null) ? $body['tier_id'] : '';
        $status = is_string($body['status'] ?? null) && $body['status'] !== '' ? $body['status'] : 'active';
        $periodEnd = (isset($body['current_period_end']) && is_string($body['current_period_end']) && $body['current_period_end'] !== '')
            ? $body['current_period_end'] : null;

        // Validate to avoid silently corrupting the DATETIME / status on non-strict MySQL.
        $allowedStatus = ['active', 'canceled', 'past_due', 'gifted', 'trialing'];
        if (!in_array($status, $allowedStatus, true)) json_error('Invalid subscription status.', 400);
        if ($periodEnd !== null && !preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/', $periodEnd)) {
            json_error('Invalid period end. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.', 400);
        }

        $tier = db()->prepare('SELECT id, tier_name FROM subscription_tiers WHERE id = ?');
        $tier->execute([$tierId]);
        $tierRow = $tier->fetch();
        if (!$tierRow) json_error('Unknown tier.', 400);

        ensure_user_subscription($userId);
        db()->prepare(
            'UPDATE user_subscriptions
                SET tier_id = ?, status = ?, current_period_end = ?, updated_at = UTC_TIMESTAMP()
              WHERE user_id = ?'
        )->execute([$tierId, $status, $periodEnd, $userId]);
        admin_audit($admin['id'], 'override_subscription', 'user', $userId,
            ['tier' => $tierRow['tier_name'], 'status' => $status, 'period_end' => $periodEnd]);
        json_ok(['tier_id' => $tierId, 'status' => $status, 'current_period_end' => $periodEnd]);
    }

    // POST /admin/users/{id}/usage-reset — reset current month's counters to 0
    if ($action === 'usage-reset' && $method === 'POST') {
        get_or_create_usage($userId);
        db()->prepare(
            "UPDATE usage_ledger SET url_imports_count = 0, image_scans_count = 0, updated_at = UTC_TIMESTAMP()
              WHERE user_id = ? AND period_start = ?"
        )->execute([$userId, gmdate('Y-m-01')]);
        admin_audit($admin['id'], 'reset_usage', 'user', $userId);
        json_ok(['url_imports_count' => 0, 'image_scans_count' => 0]);
    }
}

json_error('Not found', 404);


// ---- helpers (defined after dispatch; PHP hoists function declarations) ----

function admin_user_or_404(string $userId): array {
    $stmt = db()->prepare(
        'SELECT u.id, u.email, u.is_admin, u.suspended_at, u.created_at, p.display_name
           FROM users u LEFT JOIN profiles p ON p.id = u.id
          WHERE u.id = ?'
    );
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Not found', 404);
    return $row;
}

<?php
// Admin area API. Every endpoint is gated by require_admin(), which 404s and logs
// a security alert for any non-admin / unauthenticated / suspended / impersonating
// request before any admin logic runs.

require_once __DIR__ . '/../lib/admin_auth.php';
require_once __DIR__ . '/../lib/subscriptions.php';
require_once __DIR__ . '/../lib/settings.php';

const AI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-flash-latest', 'gemini-2.0-flash-lite', 'gemini-3-flash-preview'];

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

// ---- AI cost & performance monitor + model switcher ----
if (($seg[1] ?? '') === 'ai') {
    $sub = $seg[2] ?? '';
    $pdo = db();

    if ($sub === 'stats' && $method === 'GET') {
        $days = max(1, min(365, (int)($_GET['days'] ?? 30)));
        $totals = $pdo->query(
            "SELECT COUNT(*) jobs,
                    SUM(status='success') ok,
                    SUM(status='failed') failed,
                    COALESCE(SUM(tokens_used),0) tokens,
                    COALESCE(SUM(cost),0) cost
               FROM ai_job_logs"
        )->fetch();
        $byType = $pdo->query(
            "SELECT job_type, COUNT(*) jobs, COALESCE(SUM(tokens_used),0) tokens, COALESCE(SUM(cost),0) cost
               FROM ai_job_logs GROUP BY job_type"
        )->fetchAll();
        $dailyStmt = $pdo->prepare(
            "SELECT DATE(created_at) d, COUNT(*) jobs, COALESCE(SUM(tokens_used),0) tokens, COALESCE(SUM(cost),0) cost
               FROM ai_job_logs WHERE created_at >= (UTC_TIMESTAMP() - INTERVAL ? DAY)
              GROUP BY DATE(created_at) ORDER BY d"
        );
        $dailyStmt->execute([$days]);
        $leaders = $pdo->query(
            "SELECT a.user_id, u.email, COUNT(*) jobs, COALESCE(SUM(a.tokens_used),0) tokens, COALESCE(SUM(a.cost),0) cost
               FROM ai_job_logs a LEFT JOIN users u ON u.id = a.user_id
              GROUP BY a.user_id, u.email ORDER BY tokens DESC LIMIT 10"
        )->fetchAll();

        json_ok([
            'totals' => [
                'jobs' => (int)$totals['jobs'], 'success' => (int)$totals['ok'], 'failed' => (int)$totals['failed'],
                'tokens' => (int)$totals['tokens'], 'cost' => (float)$totals['cost'],
            ],
            'by_type' => array_map(fn($r) => ['job_type' => $r['job_type'], 'jobs' => (int)$r['jobs'], 'tokens' => (int)$r['tokens'], 'cost' => (float)$r['cost']], $byType),
            'daily' => array_map(fn($r) => ['date' => $r['d'], 'jobs' => (int)$r['jobs'], 'tokens' => (int)$r['tokens'], 'cost' => (float)$r['cost']], $dailyStmt->fetchAll()),
            'leaderboard' => array_map(fn($r) => ['user_id' => $r['user_id'], 'email' => $r['email'] ?? '(deleted user)', 'jobs' => (int)$r['jobs'], 'tokens' => (int)$r['tokens'], 'cost' => (float)$r['cost']], $leaders),
        ]);
    }

    if ($sub === 'failures' && $method === 'GET') {
        $page = max(1, (int)($_GET['page'] ?? 1));
        $per = 25; $off = ($page - 1) * $per;
        $total = (int)$pdo->query("SELECT COUNT(*) FROM ai_job_logs WHERE status = 'failed'")->fetchColumn();
        $rows = $pdo->query(
            "SELECT a.id, a.user_id, u.email, a.job_type, a.model, a.error_message, a.created_at
               FROM ai_job_logs a LEFT JOIN users u ON u.id = a.user_id
              WHERE a.status = 'failed' ORDER BY a.created_at DESC LIMIT $per OFFSET $off"
        )->fetchAll();
        json_ok([
            'failures' => array_map(fn($r) => [
                'id' => $r['id'], 'email' => $r['email'] ?? '(deleted user)', 'job_type' => $r['job_type'],
                'model' => $r['model'], 'error_message' => $r['error_message'], 'created_at' => $r['created_at'],
            ], $rows),
            'total' => $total, 'page' => $page, 'per_page' => $per,
        ]);
    }

    if ($sub === 'model' && $method === 'GET') {
        json_ok(['model' => active_ai_model(app_config()), 'available' => AI_MODELS]);
    }

    if ($sub === 'model' && $method === 'POST') {
        $body = read_json_body();
        $model = is_string($body['model'] ?? null) ? trim($body['model']) : '';
        if ($model === '' || mb_strlen($model) > 64 || !preg_match('/^[A-Za-z0-9.\-]+$/', $model)) {
            json_error('Invalid model identifier.', 400);
        }
        set_setting('gemini_model', $model);
        admin_audit($admin['id'], 'set_ai_model', 'setting', 'gemini_model', ['model' => $model]);
        json_ok(['model' => $model]);
    }
}

// ---- Public link manager + takedown ----
if (($seg[1] ?? '') === 'shares') {
    $pdo = db();
    if (!isset($seg[2]) && $method === 'GET') {
        $page = max(1, (int)($_GET['page'] ?? 1)); $per = 25; $off = ($page - 1) * $per;
        $total = (int)$pdo->query('SELECT COUNT(*) FROM shared_recipes')->fetchColumn();
        $rows = $pdo->query(
            "SELECT s.id, s.token, s.is_active, s.flagged_count, s.created_at, r.title, u.email
               FROM shared_recipes s
               LEFT JOIN recipes r ON r.id = s.recipe_id
               LEFT JOIN users u ON u.id = s.user_id
              ORDER BY s.flagged_count DESC, s.created_at DESC LIMIT $per OFFSET $off"
        )->fetchAll();
        json_ok([
            'shares' => array_map(fn($r) => [
                'id' => $r['id'], 'token' => $r['token'], 'title' => $r['title'] ?? '(deleted recipe)',
                'owner' => $r['email'] ?? '(deleted user)', 'is_active' => (int)$r['is_active'] === 1,
                'flagged_count' => (int)$r['flagged_count'], 'created_at' => $r['created_at'],
            ], $rows),
            'total' => $total, 'page' => $page, 'per_page' => $per,
        ]);
    }
    if (isset($seg[2]) && $seg[2] !== '' && $method === 'POST') {
        $shareId = $seg[2]; $action = $seg[3] ?? '';
        $exists = $pdo->prepare('SELECT id FROM shared_recipes WHERE id = ?'); $exists->execute([$shareId]);
        if (!$exists->fetch()) json_error('Not found', 404);
        if ($action === 'revoke') {
            $pdo->prepare('UPDATE shared_recipes SET is_active = 0, revoked_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$shareId]);
            admin_audit($admin['id'], 'revoke_share', 'share', $shareId);
            json_ok(['is_active' => false]);
        }
        if ($action === 'restore') {
            $pdo->prepare('UPDATE shared_recipes SET is_active = 1, revoked_at = NULL WHERE id = ?')->execute([$shareId]);
            admin_audit($admin['id'], 'restore_share', 'share', $shareId);
            json_ok(['is_active' => true]);
        }
    }
}

// ---- Reported content queue ----
if (($seg[1] ?? '') === 'reports') {
    $pdo = db();
    if (!isset($seg[2]) && $method === 'GET') {
        $status = (isset($_GET['status']) && $_GET['status'] === 'resolved') ? 'resolved' : 'open';
        $rows = $pdo->prepare(
            "SELECT c.id, c.token, c.reason, c.status, c.created_at, c.shared_recipe_id,
                    r.title, s.is_active, s.flagged_count
               FROM content_reports c
               LEFT JOIN shared_recipes s ON s.id = c.shared_recipe_id
               LEFT JOIN recipes r ON r.id = s.recipe_id
              WHERE c.status = ? ORDER BY c.created_at DESC LIMIT 100"
        );
        $rows->execute([$status]);
        json_ok(['reports' => array_map(fn($r) => [
            'id' => $r['id'], 'share_id' => $r['shared_recipe_id'], 'token' => $r['token'],
            'title' => $r['title'] ?? '(deleted recipe)', 'reason' => $r['reason'], 'status' => $r['status'],
            'created_at' => $r['created_at'], 'share_active' => $r['is_active'] === null ? null : ((int)$r['is_active'] === 1),
            'flagged_count' => $r['flagged_count'] === null ? null : (int)$r['flagged_count'],
        ], $rows->fetchAll())]);
    }
    if (isset($seg[2]) && $seg[2] !== '' && ($seg[3] ?? '') === 'resolve' && $method === 'POST') {
        $rep = $pdo->prepare('SELECT id FROM content_reports WHERE id = ?'); $rep->execute([$seg[2]]);
        if (!$rep->fetch()) json_error('Not found', 404);
        $pdo->prepare("UPDATE content_reports SET status = 'resolved', resolved_at = UTC_TIMESTAMP() WHERE id = ?")->execute([$seg[2]]);
        admin_audit($admin['id'], 'resolve_report', 'report', $seg[2]);
        json_ok(['status' => 'resolved']);
    }
}

// ---- Tiers (Dynamic Tier & Paywall Manager) ----
if (($seg[1] ?? '') === 'tiers') {
    // GET /admin/tiers — full tier definitions
    if (!isset($seg[2]) && $method === 'GET') {
        json_ok(['tiers' => array_map('serialize_tier', db()->query(
            'SELECT * FROM subscription_tiers ORDER BY position, tier_name'
        )->fetchAll())]);
    }

    // POST /admin/tiers — create
    if (!isset($seg[2]) && $method === 'POST') {
        $in = read_tier_input(read_json_body());
        if ($in['error'] !== null) json_error($in['error'], 400);
        $f = $in['fields'];
        if (tier_name_taken($f['tier_name'], null)) json_error('A tier with that name already exists.', 409);
        $id = uuid4();
        db()->prepare(
            'INSERT INTO subscription_tiers
               (id, tier_name, monthly_cost, max_recipes, max_url_imports, max_image_scans,
                multi_device_enabled, kitchen_mode_enabled, planner_enabled, shopping_list_enabled,
                pantry_match_enabled, is_default, position, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())'
        )->execute([
            $id, $f['tier_name'], $f['monthly_cost'], $f['max_recipes'], $f['max_url_imports'], $f['max_image_scans'],
            $f['multi_device_enabled'], $f['kitchen_mode_enabled'], $f['planner_enabled'], $f['shopping_list_enabled'],
            $f['pantry_match_enabled'], $f['is_default'], $f['position'],
        ]);
        if ($f['is_default']) enforce_single_default($id);
        admin_audit($admin['id'], 'create_tier', 'tier', $id, ['name' => $f['tier_name']]);
        json_ok(['id' => $id]);
    }

    // /admin/tiers/{id}
    if (isset($seg[2]) && $seg[2] !== '') {
        $tierId = $seg[2];
        $action = $seg[3] ?? '';
        $tier = db()->prepare('SELECT * FROM subscription_tiers WHERE id = ?');
        $tier->execute([$tierId]);
        $existing = $tier->fetch();
        if (!$existing) json_error('Not found', 404);

        // POST /admin/tiers/{id} — update
        if ($action === '' && $method === 'POST') {
            $in = read_tier_input(read_json_body());
            if ($in['error'] !== null) json_error($in['error'], 400);
            $f = $in['fields'];
            if (tier_name_taken($f['tier_name'], $tierId)) json_error('A tier with that name already exists.', 409);
            db()->prepare(
                'UPDATE subscription_tiers SET
                   tier_name = ?, monthly_cost = ?, max_recipes = ?, max_url_imports = ?, max_image_scans = ?,
                   multi_device_enabled = ?, kitchen_mode_enabled = ?, planner_enabled = ?, shopping_list_enabled = ?,
                   pantry_match_enabled = ?, is_default = ?, position = ?, updated_at = UTC_TIMESTAMP()
                 WHERE id = ?'
            )->execute([
                $f['tier_name'], $f['monthly_cost'], $f['max_recipes'], $f['max_url_imports'], $f['max_image_scans'],
                $f['multi_device_enabled'], $f['kitchen_mode_enabled'], $f['planner_enabled'], $f['shopping_list_enabled'],
                $f['pantry_match_enabled'], $f['is_default'], $f['position'], $tierId,
            ]);
            if ($f['is_default']) enforce_single_default($tierId);
            admin_audit($admin['id'], 'update_tier', 'tier', $tierId, ['name' => $f['tier_name']]);
            json_ok(['id' => $tierId]);
        }

        // POST /admin/tiers/{id}/delete
        if ($action === 'delete' && $method === 'POST') {
            if ((int)$existing['is_default'] === 1) json_error('Cannot delete the default tier. Make another tier the default first.', 400);
            $inUse = db()->prepare('SELECT COUNT(*) FROM user_subscriptions WHERE tier_id = ?');
            $inUse->execute([$tierId]);
            if ((int)$inUse->fetchColumn() > 0) json_error('This tier has users assigned. Move them to another tier first.', 400);
            db()->prepare('DELETE FROM subscription_tiers WHERE id = ?')->execute([$tierId]);
            admin_audit($admin['id'], 'delete_tier', 'tier', $tierId, ['name' => $existing['tier_name']]);
            json_ok(['deleted' => true]);
        }
    }
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

    // POST /admin/users/{id}/reset-password — email the user a reset link.
    if ($action === 'reset-password' && $method === 'POST') {
        require_once __DIR__ . '/../lib/password_reset.php';
        $token = create_password_reset($userId);
        $sent = send_password_reset_email($target['email'], $token, $mailErr);
        admin_audit($admin['id'], 'send_password_reset', 'user', $userId, ['sent' => $sent]);
        json_ok(['sent' => $sent]);
    }

    // POST /admin/users/{id}/impersonate — start a "Login As" session for support.
    if ($action === 'impersonate' && $method === 'POST') {
        if ($userId === $admin['id']) json_error('You cannot impersonate yourself.', 400);
        if ((int)$target['is_admin'] === 1) json_error('You cannot impersonate another admin.', 400);
        $adminToken = $_COOKIE[SESSION_COOKIE] ?? '';
        if ($adminToken === '') json_error('Session error.', 400);
        start_impersonation_session($userId, $adminToken, $admin['id']);
        admin_audit($admin['id'], 'impersonate_start', 'user', $userId, ['email' => $target['email']]);
        json_ok(['redirect' => '/']);
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

// Cast a raw subscription_tiers row to typed JSON (limits null|int, features bool).
function serialize_tier(array $t): array {
    $ni = fn($v) => $v === null ? null : (int)$v;
    return [
        'id'                    => $t['id'],
        'tier_name'             => $t['tier_name'],
        'monthly_cost'          => (float)$t['monthly_cost'],
        'max_recipes'           => $ni($t['max_recipes']),
        'max_url_imports'       => $ni($t['max_url_imports']),
        'max_image_scans'       => $ni($t['max_image_scans']),
        'multi_device_enabled'  => (int)$t['multi_device_enabled'] === 1,
        'kitchen_mode_enabled'  => (int)$t['kitchen_mode_enabled'] === 1,
        'planner_enabled'       => (int)$t['planner_enabled'] === 1,
        'shopping_list_enabled' => (int)$t['shopping_list_enabled'] === 1,
        'pantry_match_enabled'  => (int)$t['pantry_match_enabled'] === 1,
        'is_default'            => (int)$t['is_default'] === 1,
        'position'              => (int)$t['position'],
    ];
}

// Validate + normalize a tier create/update payload. max_* blank/null = unlimited.
// Returns ['fields'=>array|null, 'error'=>string|null].
function read_tier_input(array $b): array {
    $name = is_string($b['tier_name'] ?? null) ? trim($b['tier_name']) : '';
    if ($name === '' || mb_strlen($name) > 64) {
        return ['fields' => null, 'error' => 'Tier name is required (max 64 characters).'];
    }
    $cost = $b['monthly_cost'] ?? 0;
    if (!is_numeric($cost) || (float)$cost < 0) {
        return ['fields' => null, 'error' => 'Monthly cost must be a non-negative number.'];
    }
    $err = false;
    $nint = function ($v) use (&$err) {
        if ($v === null || $v === '') return null;            // unlimited
        if (!is_numeric($v) || (int)$v < 0) { $err = true; return null; }
        return (int)$v;
    };
    $maxRecipes = $nint($b['max_recipes'] ?? null);
    $maxUrl     = $nint($b['max_url_imports'] ?? null);
    $maxImg     = $nint($b['max_image_scans'] ?? null);
    if ($err) {
        return ['fields' => null, 'error' => 'Limits must be blank (unlimited) or a non-negative whole number.'];
    }
    $bool = fn($k) => !empty($b[$k]) ? 1 : 0;
    return ['error' => null, 'fields' => [
        'tier_name'             => $name,
        'monthly_cost'          => (float)$cost,
        'max_recipes'           => $maxRecipes,
        'max_url_imports'       => $maxUrl,
        'max_image_scans'       => $maxImg,
        'multi_device_enabled'  => $bool('multi_device_enabled'),
        'kitchen_mode_enabled'  => $bool('kitchen_mode_enabled'),
        'planner_enabled'       => $bool('planner_enabled'),
        'shopping_list_enabled' => $bool('shopping_list_enabled'),
        'pantry_match_enabled'  => $bool('pantry_match_enabled'),
        'is_default'            => $bool('is_default'),
        'position'              => isset($b['position']) && is_numeric($b['position']) ? (int)$b['position'] : 0,
    ]];
}

function tier_name_taken(string $name, ?string $excludeId): bool {
    if ($excludeId === null) {
        $s = db()->prepare('SELECT COUNT(*) FROM subscription_tiers WHERE tier_name = ?');
        $s->execute([$name]);
    } else {
        $s = db()->prepare('SELECT COUNT(*) FROM subscription_tiers WHERE tier_name = ? AND id != ?');
        $s->execute([$name, $excludeId]);
    }
    return (int)$s->fetchColumn() > 0;
}

// Ensure exactly one default tier: clear the flag on all others.
function enforce_single_default(string $keepId): void {
    db()->prepare('UPDATE subscription_tiers SET is_default = 0 WHERE id != ?')->execute([$keepId]);
}

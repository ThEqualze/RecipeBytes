<?php
// Subscription + usage helpers shared by the admin area and (later) the
// import metering hook. NULL on a tier's max_* column means "unlimited".

require_once __DIR__ . '/../db.php';

// The tier assigned to users with no explicit subscription (the default/free tier).
function default_tier_id(): ?string {
    $id = db()->query(
        'SELECT id FROM subscription_tiers WHERE is_default = 1 ORDER BY position LIMIT 1'
    )->fetchColumn();
    if (!$id) {
        $id = db()->query('SELECT id FROM subscription_tiers ORDER BY position LIMIT 1')->fetchColumn();
    }
    return $id ? (string)$id : null;
}

// Ensure a user has a subscription row (creating one on the default tier if not),
// and return it. Returns null only if no tiers exist at all.
function ensure_user_subscription(string $userId): ?array {
    $stmt = db()->prepare('SELECT * FROM user_subscriptions WHERE user_id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if ($row) return $row;

    $tierId = default_tier_id();
    if ($tierId === null) return null;
    db()->prepare(
        'INSERT IGNORE INTO user_subscriptions (id, user_id, tier_id, status, created_at, updated_at)
         VALUES (?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())'
    )->execute([uuid4(), $userId, $tierId, 'active']);
    $stmt->execute([$userId]);
    return $stmt->fetch() ?: null;
}

// Get (creating if needed) the current UTC-month usage ledger row for a user.
function get_or_create_usage(string $userId): array {
    $periodStart = gmdate('Y-m-01');
    $resetDate   = gmdate('Y-m-01', strtotime('first day of next month', strtotime($periodStart . ' 00:00:00 UTC')));

    $stmt = db()->prepare('SELECT * FROM usage_ledger WHERE user_id = ? AND period_start = ?');
    $stmt->execute([$userId, $periodStart]);
    $row = $stmt->fetch();
    if ($row) return $row;

    db()->prepare(
        'INSERT IGNORE INTO usage_ledger
           (id, user_id, period_start, url_imports_count, image_scans_count, reset_date, created_at, updated_at)
         VALUES (?,?,?,0,0,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())'
    )->execute([uuid4(), $userId, $periodStart, $resetDate]);
    $stmt->execute([$userId, $periodStart]);
    $row = $stmt->fetch();
    return $row ?: [
        'url_imports_count' => 0, 'image_scans_count' => 0,
        'period_start' => $periodStart, 'reset_date' => $resetDate,
    ];
}

// ---- Metering (NULL limit = unlimited) ----

function usage_column(string $jobType): string {
    return $jobType === 'image' ? 'image_scans_count' : 'url_imports_count';
}

// The user's monthly limit for a job type ('url'|'image'); null = unlimited.
function usage_limit_for(string $userId, string $jobType): ?int {
    $sub = ensure_user_subscription($userId);
    if (!$sub) return null;
    $col = $jobType === 'image' ? 'max_image_scans' : 'max_url_imports';
    $stmt = db()->prepare("SELECT $col AS lim FROM subscription_tiers WHERE id = ?");
    $stmt->execute([$sub['tier_id']]);
    $v = $stmt->fetchColumn();
    return ($v === null || $v === false) ? null : (int)$v;
}

function usage_count_for(string $userId, string $jobType): int {
    $u = get_or_create_usage($userId);
    return (int)$u[usage_column($jobType)];
}

// Returns ['allowed'=>bool,'used'=>int,'limit'=>?int,'remaining'=>?int,'pct'=>?int].
// NULL-safe: an unlimited tier is always allowed.
function usage_status(string $userId, string $jobType): array {
    $limit = usage_limit_for($userId, $jobType);
    $used  = usage_count_for($userId, $jobType);
    if ($limit === null) {
        return ['allowed' => true, 'used' => $used, 'limit' => null, 'remaining' => null, 'pct' => null];
    }
    $remaining = max(0, $limit - $used);
    $pct = $limit > 0 ? (int)floor($used * 100 / $limit) : 100;
    return ['allowed' => $used < $limit, 'used' => $used, 'limit' => $limit, 'remaining' => $remaining, 'pct' => $pct];
}

// Increment a counter after a successful import. Returns the new count and whether
// this import crossed the 80% threshold or reached the limit (for alerts/emails).
function record_usage(string $userId, string $jobType): array {
    get_or_create_usage($userId);
    $col = usage_column($jobType);
    db()->prepare(
        "UPDATE usage_ledger SET $col = $col + 1, updated_at = UTC_TIMESTAMP()
          WHERE user_id = ? AND period_start = ?"
    )->execute([$userId, gmdate('Y-m-01')]);

    $limit = usage_limit_for($userId, $jobType);
    $used  = usage_count_for($userId, $jobType);
    $crossed80 = false;
    $reachedLimit = false;
    if ($limit !== null && $limit > 0) {
        $threshold = (int)ceil($limit * 0.8);
        $crossed80 = (($used - 1) < $threshold && $used >= $threshold && $used < $limit);
        // Fire the limit email only on the import that crosses the cap, not repeatedly.
        $reachedLimit = (($used - 1) < $limit && $used >= $limit);
    }
    return ['used' => $used, 'limit' => $limit, 'crossed_80' => $crossed80, 'reached_limit' => $reachedLimit];
}

// Log one AI extraction attempt.
function log_ai_job(?string $userId, string $jobType, string $status, int $tokens, float $cost, string $model, ?string $error = null): void {
    db()->prepare(
        'INSERT INTO ai_job_logs (id, user_id, job_type, status, tokens_used, cost, model, error_message, created_at)
         VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP())'
    )->execute([uuid4(), $userId, $jobType, $status, $tokens, $cost, $model, $error]);
}

// Estimate cost from token count using a configurable per-1k rate (default 0).
function ai_cost(int $tokens): float {
    $cfg = app_config();
    $rate = isset($cfg['ai_cost_per_1k_tokens']) ? (float)$cfg['ai_cost_per_1k_tokens'] : 0.0;
    return round($tokens / 1000 * $rate, 6);
}

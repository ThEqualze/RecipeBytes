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

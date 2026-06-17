<?php
// Phase 3a: usage metering + paywall (402) + the /usage surface.

$ucfg = require __DIR__ . '/../api/config.php';
$updo = new PDO(
    "mysql:host={$ucfg['db_host']};dbname={$ucfg['db_name']};charset={$ucfg['db_charset']}",
    $ucfg['db_user'], $ucfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

reset_cookies();
check('usage requires auth (401)', api('GET', '/usage')['status'] === 401);

$email = 'usage_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'U']);
$uid = $updo->query("SELECT id FROM users WHERE email = " . $updo->quote($email))->fetchColumn();

// New user lazily gets the default (Free) tier: 10 URL imports, 5 image scans.
$u = api('GET', '/usage');
check('usage -> 200', $u['status'] === 200);
check('free url limit = 10', ($u['json']['data']['url']['limit'] ?? null) === 10);
check('free image limit = 5', ($u['json']['data']['image']['limit'] ?? null) === 5);
check('url allowed at 0 used', ($u['json']['data']['url']['allowed'] ?? false) === true);

// At the limit, an import is blocked with 402 BEFORE any fetch/AI call.
$updo->prepare("UPDATE usage_ledger SET url_imports_count = 10 WHERE user_id = ? AND period_start = ?")
     ->execute([$uid, gmdate('Y-m-01')]);
check('url not allowed at limit', ($u2 = api('GET', '/usage'))['json']['data']['url']['allowed'] === false);
check('url pct at/over 100', ($u2['json']['data']['url']['pct'] ?? 0) >= 100);
check('over-limit import blocked -> 402', api('POST', '/import', ['url' => 'https://example.com/recipe'])['status'] === 402);

// Back under the limit -> allowed again.
$updo->prepare("UPDATE usage_ledger SET url_imports_count = 3 WHERE user_id = ? AND period_start = ?")
     ->execute([$uid, gmdate('Y-m-01')]);
check('url allowed under limit', (api('GET', '/usage')['json']['data']['url']['allowed'] ?? false) === true);
check('url remaining = 7', (api('GET', '/usage')['json']['data']['url']['remaining'] ?? null) === 7);

<?php
// Admin Phase 1: RBAC isolation, non-disclosure (404 not 401/403), audit logging.

// Direct DB handle (mirrors run.php) for promoting a user to admin and asserting
// audit rows — there is intentionally no API to grant admin.
$acfg = require __DIR__ . '/../api/config.php';
$apdo = new PDO(
    "mysql:host={$acfg['db_host']};dbname={$acfg['db_name']};charset={$acfg['db_charset']}",
    $acfg['db_user'], $acfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

// 1. Unauthenticated admin access is a 404 (does not reveal the admin surface).
reset_cookies();
check('admin overview unauth -> 404', api('GET', '/admin/overview')['status'] === 404);
check('admin me unauth -> 404', api('GET', '/admin/me')['status'] === 404);

// 2. A normal (non-admin) authenticated user also gets 404.
$email = 'admintest_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'AdminTest']);
check('admin overview non-admin -> 404', api('GET', '/admin/overview')['status'] === 404);

// 3. Unauthorized attempts are recorded as security alerts.
$alerts = (int)$apdo->query(
    "SELECT COUNT(*) FROM admin_audit_log WHERE action = 'unauthorized_admin_access'"
)->fetchColumn();
check('unauthorized attempts are audited', $alerts >= 3);

// 4. Promote the SAME session's user to admin -> the live flag grants access.
$apdo->prepare('UPDATE users SET is_admin = 1 WHERE email = ?')->execute([$email]);
$ov = api('GET', '/admin/overview');
check('admin overview admin -> 200', $ov['status'] === 200);
check('overview returns user count', isset($ov['json']['data']['counts']['users']) && $ov['json']['data']['counts']['users'] >= 1);
check('overview returns seeded tiers', !empty($ov['json']['data']['tiers']));
check('admin me admin -> 200', api('GET', '/admin/me')['status'] === 200);

// 5. A suspended admin is locked out (404), even with a valid admin session.
$apdo->prepare('UPDATE users SET suspended_at = UTC_TIMESTAMP() WHERE email = ?')->execute([$email]);
check('suspended admin -> 404', api('GET', '/admin/overview')['status'] === 404);
$apdo->prepare('UPDATE users SET suspended_at = NULL WHERE email = ?')->execute([$email]);

// 6. Unknown /admin sub-path (as admin) -> 404 fall-through.
check('unknown admin path -> 404', api('GET', '/admin/does-not-exist')['status'] === 404);

// ===== Phase 2a: User & Subscription Command Center =====
// (the cookie is still the promoted admin's session)

$adminId = $apdo->query("SELECT id FROM users WHERE email = " . $apdo->quote($email))->fetchColumn();

// A second target user, created directly so the admin session cookie is preserved.
$btarget = 'btarget_' . bin2hex(random_bytes(4)) . '@example.com';
$apdo->prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (UUID(), ?, ?, UTC_TIMESTAMP())')
     ->execute([$btarget, 'x']);
$bId = $apdo->query("SELECT id FROM users WHERE email = " . $apdo->quote($btarget))->fetchColumn();

// Directory
$dir = api('GET', '/admin/users');
check('users directory -> 200', $dir['status'] === 200);
check('directory returns total + rows', isset($dir['json']['data']['total']) && is_array($dir['json']['data']['users']));
$search = api('GET', '/admin/users?q=' . urlencode($btarget));
check('directory search finds target', $search['status'] === 200 && $search['json']['data']['total'] >= 1);

// Dossier (lazily creates a default subscription + usage row)
$dossier = api('GET', '/admin/users/' . $bId);
check('dossier -> 200', $dossier['status'] === 200);
check('dossier has default (Free) subscription', ($dossier['json']['data']['subscription']['tier_name'] ?? '') === 'Free');
check('dossier has usage block', isset($dossier['json']['data']['usage']['url_imports_count']));

// Dossier for a non-existent user -> 404
check('dossier unknown user -> 404', api('GET', '/admin/users/00000000-0000-0000-0000-000000000000')['status'] === 404);

// Suspend the target
$susp = api('POST', '/admin/users/' . $bId . '/suspend', ['suspend' => true]);
check('suspend target -> 200', $susp['status'] === 200);
$bSusp = $apdo->query("SELECT suspended_at FROM users WHERE id = " . $apdo->quote($bId))->fetchColumn();
check('target is suspended in db', $bSusp !== null);
$unsusp = api('POST', '/admin/users/' . $bId . '/suspend', ['suspend' => false]);
check('unsuspend target -> 200', $unsusp['status'] === 200);

// Cannot suspend your own admin account
check('cannot suspend self -> 400', api('POST', '/admin/users/' . $adminId . '/suspend', ['suspend' => true])['status'] === 400);

// Manual subscription override -> Pro
$proId = $apdo->query("SELECT id FROM subscription_tiers WHERE tier_name = 'Pro'")->fetchColumn();
$ov = api('POST', '/admin/users/' . $bId . '/subscription', ['tier_id' => $proId, 'status' => 'gifted']);
check('subscription override -> 200', $ov['status'] === 200);
$bTier = $apdo->query("SELECT tier_id FROM user_subscriptions WHERE user_id = " . $apdo->quote($bId))->fetchColumn();
check('target now on Pro tier', $bTier === $proId);
check('override unknown tier -> 400', api('POST', '/admin/users/' . $bId . '/subscription', ['tier_id' => 'nope'])['status'] === 400);
check('override bad status -> 400', api('POST', '/admin/users/' . $bId . '/subscription', ['tier_id' => $proId, 'status' => 'haxx'])['status'] === 400);
check('override bad period_end -> 400', api('POST', '/admin/users/' . $bId . '/subscription', ['tier_id' => $proId, 'current_period_end' => 'banana'])['status'] === 400);
check('override valid period_end -> 200', api('POST', '/admin/users/' . $bId . '/subscription', ['tier_id' => $proId, 'current_period_end' => '2027-01-01 00:00:00'])['status'] === 200);

// Usage reset
$apdo->prepare("UPDATE usage_ledger SET url_imports_count = 7 WHERE user_id = ?")->execute([$bId]);
check('usage reset -> 200', api('POST', '/admin/users/' . $bId . '/usage-reset', [])['status'] === 200);
$cnt = (int)$apdo->query("SELECT url_imports_count FROM usage_ledger WHERE user_id = " . $apdo->quote($bId))->fetchColumn();
check('usage counter reset to 0', $cnt === 0);

// Admin actions are audited
$acts = (int)$apdo->query("SELECT COUNT(*) FROM admin_audit_log WHERE action IN ('suspend_user','override_subscription','reset_usage')")->fetchColumn();
check('admin actions are audited', $acts >= 3);

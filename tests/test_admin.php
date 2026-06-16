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

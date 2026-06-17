<?php
// Phase 5: public-link manager + takedown + reported-content queue.

$mcfg = require __DIR__ . '/../api/config.php';
$mpdo = new PDO(
    "mysql:host={$mcfg['db_host']};dbname={$mcfg['db_name']};charset={$mcfg['db_charset']}",
    $mcfg['db_user'], $mcfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

// A normal user creates a recipe + share.
reset_cookies();
$owner = 'modowner_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $owner, 'password' => 'secret123', 'display_name' => 'O']);
$ownerId = $mpdo->query("SELECT id FROM users WHERE email = " . $mpdo->quote($owner))->fetchColumn();
$recipeId = api('POST', '/recipes', ['title' => 'Shared dish'])['json']['data']['id'];
$token = api('POST', "/recipes/$recipeId/share")['json']['data']['token'];

// Public can view it; then report it.
check('public view live link -> 200', api('GET', "/public/recipes/$token")['status'] === 200);
check('public report -> 200', api('POST', "/public/recipes/$token/report", ['reason' => 'spam'])['status'] === 200);
$shareId = $mpdo->query("SELECT id FROM shared_recipes WHERE token = " . $mpdo->quote($token))->fetchColumn();
check('report incremented flag count', (int)$mpdo->query("SELECT flagged_count FROM shared_recipes WHERE id = " . $mpdo->quote($shareId))->fetchColumn() === 1);
check('report row filed', (int)$mpdo->query("SELECT COUNT(*) FROM content_reports WHERE shared_recipe_id = " . $mpdo->quote($shareId))->fetchColumn() === 1);

// Admin moderation.
reset_cookies();
$admin = 'modadmin_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $admin, 'password' => 'secret123', 'display_name' => 'M']);
$mpdo->prepare('UPDATE users SET is_admin = 1 WHERE email = ?')->execute([$admin]);

check('shares list non-admin gate works (admin) -> 200', api('GET', '/admin/shares')['status'] === 200);
check('reports queue -> 200', ($rep = api('GET', '/admin/reports'))['status'] === 200);
check('open report visible to admin', count($rep['json']['data']['reports']) >= 1);
$reportId = $rep['json']['data']['reports'][0]['id'];

// Take down the link -> public view now 404.
check('revoke share -> 200', api('POST', "/admin/shares/$shareId/revoke")['status'] === 200);
check('revoked link public view -> 404', api('GET', "/public/recipes/$token")['status'] === 404);
check('revoke audited', (int)$mpdo->query("SELECT COUNT(*) FROM admin_audit_log WHERE action = 'revoke_share'")->fetchColumn() >= 1);

// Restore -> public view live again.
check('restore share -> 200', api('POST', "/admin/shares/$shareId/restore")['status'] === 200);
check('restored link public view -> 200', api('GET', "/public/recipes/$token")['status'] === 200);

// Resolve the report.
check('resolve report -> 200', api('POST', "/admin/reports/$reportId/resolve")['status'] === 200);
check('report resolved in db', $mpdo->query("SELECT status FROM content_reports WHERE id = " . $mpdo->quote($reportId))->fetchColumn() === 'resolved');
check('open queue now empty', count(api('GET', '/admin/reports')['json']['data']['reports']) === 0);

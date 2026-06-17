<?php
// Phase 3b: Dynamic Tier & Paywall Manager — CRUD, validation, single-default,
// delete guards. Self-contained: creates its own admin and test tier, and
// restores the Free tier exactly so later tests (test_usage) still see Free=10/5.

$tcfg = require __DIR__ . '/../api/config.php';
$tpdo = new PDO(
    "mysql:host={$tcfg['db_host']};dbname={$tcfg['db_name']};charset={$tcfg['db_charset']}",
    $tcfg['db_user'], $tcfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

reset_cookies();
$email = 'tieradmin_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'T']);
$tpdo->prepare('UPDATE users SET is_admin = 1 WHERE email = ?')->execute([$email]);

// List
$list = api('GET', '/admin/tiers');
check('tiers list -> 200', $list['status'] === 200);
check('tiers include seeded Free + Pro', count($list['json']['data']['tiers']) >= 2);

// Create (blank max_image_scans => unlimited/null)
$tname = 'Test' . bin2hex(random_bytes(3));
$cr = api('POST', '/admin/tiers', [
    'tier_name' => $tname, 'monthly_cost' => 9.99,
    'max_url_imports' => 50, 'max_image_scans' => '', 'max_recipes' => 100,
    'kitchen_mode_enabled' => true, 'pantry_match_enabled' => false,
]);
check('create tier -> 200', $cr['status'] === 200);
$newId = $cr['json']['data']['id'] ?? '';
check('create returns id', $newId !== '');

$find = function ($id) { foreach (api('GET', '/admin/tiers')['json']['data']['tiers'] as $t) { if ($t['id'] === $id) return $t; } return null; };
$mk = $find($newId);
check('new tier url limit = 50', $mk && $mk['max_url_imports'] === 50);
check('new tier image scans unlimited (null)', $mk && $mk['max_image_scans'] === null);

// Duplicate name -> 409
check('duplicate name -> 409', api('POST', '/admin/tiers', ['tier_name' => $tname, 'monthly_cost' => 1])['status'] === 409);

// Update
$up = api('POST', '/admin/tiers/' . $newId, ['tier_name' => $tname, 'monthly_cost' => 19.99, 'max_url_imports' => 100]);
check('update tier -> 200', $up['status'] === 200);
check('cost updated', (float)$tpdo->query("SELECT monthly_cost FROM subscription_tiers WHERE id = " . $tpdo->quote($newId))->fetchColumn() === 19.99);

// Validation: negative limit -> 400
check('negative limit -> 400', api('POST', '/admin/tiers/' . $newId, ['tier_name' => $tname, 'max_url_imports' => -5])['status'] === 400);

// Single-default enforcement
api('POST', '/admin/tiers/' . $newId, ['tier_name' => $tname, 'is_default' => true]);
check('exactly one default tier', (int)$tpdo->query("SELECT COUNT(*) FROM subscription_tiers WHERE is_default = 1")->fetchColumn() === 1);
check('new tier is the default', (int)$tpdo->query("SELECT is_default FROM subscription_tiers WHERE id = " . $tpdo->quote($newId))->fetchColumn() === 1);

// Cannot delete the default tier
check('delete default -> 400', api('POST', '/admin/tiers/' . $newId . '/delete', [])['status'] === 400);

// Restore Free EXACTLY (seeded values) as the default so test_usage still sees 10/5.
$freeId = $tpdo->query("SELECT id FROM subscription_tiers WHERE tier_name = 'Free'")->fetchColumn();
api('POST', '/admin/tiers/' . $freeId, [
    'tier_name' => 'Free', 'monthly_cost' => 0,
    'max_recipes' => 25, 'max_url_imports' => 10, 'max_image_scans' => 5,
    'multi_device_enabled' => false, 'kitchen_mode_enabled' => true, 'planner_enabled' => true,
    'shopping_list_enabled' => true, 'pantry_match_enabled' => false, 'is_default' => true, 'position' => 0,
]);
$free = $find($freeId);
check('Free restored as default', $free && $free['is_default'] === true);
check('Free url limit back to 10', $free && $free['max_url_imports'] === 10);
check('Free image limit back to 5', $free && $free['max_image_scans'] === 5);

// Now the test tier is not default and unused -> deletable.
check('delete test tier -> 200', api('POST', '/admin/tiers/' . $newId . '/delete', [])['status'] === 200);
check('tier actions audited', (int)$tpdo->query("SELECT COUNT(*) FROM admin_audit_log WHERE action IN ('create_tier','update_tier','delete_tier')")->fetchColumn() >= 3);

<?php
// Phase 4: AI cost monitor + global model switcher.

$acfg = require __DIR__ . '/../api/config.php';
$apdo = new PDO(
    "mysql:host={$acfg['db_host']};dbname={$acfg['db_name']};charset={$acfg['db_charset']}",
    $acfg['db_user'], $acfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

reset_cookies();
$email = 'aiadmin_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'AI']);
$adminId = $apdo->query("SELECT id FROM users WHERE email = " . $apdo->quote($email))->fetchColumn();
$apdo->prepare('UPDATE users SET is_admin = 1 WHERE email = ?')->execute([$email]);

// Seed a couple of AI job rows (1 success, 1 failed) for this admin.
$apdo->prepare("INSERT INTO ai_job_logs (id,user_id,job_type,status,tokens_used,cost,model,created_at) VALUES (UUID(),?,?,?,?,?,?,UTC_TIMESTAMP())")
     ->execute([$adminId, 'url', 'success', 1200, 0.0, 'gemini-2.5-flash']);
$apdo->prepare("INSERT INTO ai_job_logs (id,user_id,job_type,status,tokens_used,cost,model,error_message,created_at) VALUES (UUID(),?,?,?,?,?,?,?,UTC_TIMESTAMP())")
     ->execute([$adminId, 'image', 'failed', 0, 0.0, 'gemini-2.5-flash', 'AI extraction is unavailable right now.']);

// Non-admin gate (use a fresh non-admin session)
reset_cookies();
api('POST', '/auth/signup', ['email' => 'aiuser_' . bin2hex(random_bytes(4)) . '@example.com', 'password' => 'secret123', 'display_name' => 'X']);
check('ai stats non-admin -> 404', api('GET', '/admin/ai/stats')['status'] === 404);

// Back to the admin
reset_cookies();
api('POST', '/auth/login', ['email' => $email, 'password' => 'secret123']);

$stats = api('GET', '/admin/ai/stats');
check('ai stats -> 200', $stats['status'] === 200);
check('stats totals jobs >= 2', ($stats['json']['data']['totals']['jobs'] ?? 0) >= 2);
check('stats tokens >= 1200', ($stats['json']['data']['totals']['tokens'] ?? 0) >= 1200);
check('stats has leaderboard', is_array($stats['json']['data']['leaderboard'] ?? null));

$fail = api('GET', '/admin/ai/failures');
check('ai failures -> 200', $fail['status'] === 200);
check('failures include the seeded error', $fail['json']['data']['total'] >= 1);

// Model switcher
$m = api('GET', '/admin/ai/model');
check('get model -> 200', $m['status'] === 200);
check('model lists available options', !empty($m['json']['data']['available']));
check('invalid model rejected -> 400', api('POST', '/admin/ai/model', ['model' => 'bad model!!'])['status'] === 400);
check('set model -> 200', api('POST', '/admin/ai/model', ['model' => 'gemini-2.5-pro'])['status'] === 200);
check('model persisted', $apdo->query("SELECT setting_value FROM system_settings WHERE setting_key = 'gemini_model'")->fetchColumn() === 'gemini-2.5-pro');
check('get model reflects override', (api('GET', '/admin/ai/model')['json']['data']['model'] ?? '') === 'gemini-2.5-pro');
check('model change audited', (int)$apdo->query("SELECT COUNT(*) FROM admin_audit_log WHERE action = 'set_ai_model'")->fetchColumn() >= 1);

// Reset the override so other tests see the default model.
$apdo->exec("DELETE FROM system_settings WHERE setting_key = 'gemini_model'");

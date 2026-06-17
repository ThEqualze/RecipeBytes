<?php
require_once __DIR__ . '/../auth.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];

if ($path === '/auth/signup' && $method === 'POST') {
    $body = read_json_body();
    $email = trim(strtolower($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $displayName = trim($body['display_name'] ?? '');
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Valid email required', 400);
    if (strlen($password) < 6) json_error('Password must be at least 6 characters', 400);

    $exists = db()->prepare('SELECT 1 FROM users WHERE email = ?');
    $exists->execute([$email]);
    if ($exists->fetch()) json_error('Email already registered', 409);

    $id = uuid4();
    $now = gmdate('Y-m-d H:i:s');
    $hash = password_hash($password, PASSWORD_BCRYPT);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $pdo->prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?,?,?,?)')
            ->execute([$id, $email, $hash, $now]);
        $pdo->prepare('INSERT INTO profiles (id, display_name, avatar_url, default_unit_system, created_at, updated_at) VALUES (?,?,?,?,?,?)')
            ->execute([$id, $displayName, '', 'imperial', $now, $now]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        json_error('Could not create account', 500);
    }

    start_session_for($id);
    json_ok(['id' => $id, 'email' => $email, 'display_name' => $displayName]);
}

if ($path === '/auth/login' && $method === 'POST') {
    $body = read_json_body();
    $email = trim(strtolower($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    $stmt = db()->prepare('SELECT id, email, password_hash, suspended_at FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_error('Invalid email or password', 401);
    }
    if ($user['suspended_at'] !== null) {
        json_error('This account has been suspended.', 403);
    }
    start_session_for($user['id']);
    json_ok(['id' => $user['id'], 'email' => $user['email']]);
}

if ($path === '/auth/exit-impersonation' && $method === 'POST') {
    require_once __DIR__ . '/../lib/admin_auth.php';
    $r = exit_impersonation();
    if (!$r['ok']) json_error('Not impersonating.', 400);
    admin_audit($r['admin_id'] ?? null, 'impersonate_end', 'user', $r['target_id'] ?? null,
        ['restored' => $r['restored']]);
    json_ok(['redirect' => '/admin', 'restored' => $r['restored']]);
}

if ($path === '/auth/logout' && $method === 'POST') {
    destroy_current_session();
    json_ok(['ok' => true]);
}

if ($path === '/auth/forgot-password' && $method === 'POST') {
    require_once __DIR__ . '/../lib/password_reset.php';
    $body = read_json_body();
    $email = trim(strtolower($body['email'] ?? ''));
    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $stmt = db()->prepare('SELECT id, email, suspended_at FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $u = $stmt->fetch();
        if ($u && $u['suspended_at'] === null) {
            $token = create_password_reset($u['id']);
            send_password_reset_email($u['email'], $token);
        }
    }
    // Always succeed — never reveal whether an account exists.
    json_ok(['ok' => true]);
}

if ($path === '/auth/reset-password' && $method === 'POST') {
    require_once __DIR__ . '/../lib/password_reset.php';
    $body = read_json_body();
    $token = (string)($body['token'] ?? '');
    $password = (string)($body['password'] ?? '');
    if (strlen($password) < 6) json_error('Password must be at least 6 characters', 400);
    $row = lookup_password_reset($token);
    if (!$row) json_error('Invalid or expired reset link.', 400);

    $hash = password_hash($password, PASSWORD_BCRYPT);
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $row['user_id']]);
    mark_reset_used($row['id']);
    // Security: kill all sessions and any other outstanding reset tokens for this user.
    db()->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$row['user_id']]);
    db()->prepare('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL')
        ->execute([$row['user_id']]);
    json_ok(['ok' => true]);
}

if ($path === '/auth/session' && $method === 'GET') {
    $u = current_user();
    if ($u === null) json_ok(null);
    json_ok([
        'id'            => $u['id'],
        'email'         => $u['email'],
        'display_name'  => $u['display_name'] ?? '',
        'impersonating' => ($u['impersonated_by'] ?? null) !== null,
    ]);
}

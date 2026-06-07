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
    $stmt = db()->prepare('SELECT id, email, password_hash FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();
    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_error('Invalid email or password', 401);
    }
    start_session_for($user['id']);
    json_ok(['id' => $user['id'], 'email' => $user['email']]);
}

if ($path === '/auth/logout' && $method === 'POST') {
    destroy_current_session();
    json_ok(['ok' => true]);
}

if ($path === '/auth/session' && $method === 'GET') {
    json_ok(current_user());
}

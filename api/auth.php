<?php
require_once __DIR__ . '/db.php';

const SESSION_COOKIE = 'rb_session';

function start_session_for(string $userId): string {
    $cfg = app_config();
    $token = bin2hex(random_bytes(32)); // 64 hex chars
    $now = gmdate('Y-m-d H:i:s');
    $exp = gmdate('Y-m-d H:i:s', time() + (int)$cfg['session_ttl']);
    $stmt = db()->prepare(
        'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)'
    );
    $stmt->execute([$token, $userId, $now, $exp]);
    setcookie(SESSION_COOKIE, $token, [
        'expires'  => time() + (int)$cfg['session_ttl'],
        'path'     => '/',
        'httponly' => true,
        'secure'   => (bool)$cfg['cookie_secure'],
        'samesite' => 'Lax',
    ]);
    return $token;
}

function destroy_current_session(): void {
    $token = $_COOKIE[SESSION_COOKIE] ?? null;
    if ($token) {
        db()->prepare('DELETE FROM sessions WHERE token = ?')->execute([$token]);
    }
    setcookie(SESSION_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);
}

function current_user(): ?array {
    $token = $_COOKIE[SESSION_COOKIE] ?? null;
    if (!$token) return null;
    $stmt = db()->prepare(
        'SELECT u.id, u.email, p.display_name
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN profiles p ON p.id = u.id
          WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP()'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function require_auth(): array {
    $u = current_user();
    if (!$u) json_error('Unauthorized', 401);
    return $u;
}

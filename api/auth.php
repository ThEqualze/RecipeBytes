<?php
require_once __DIR__ . '/db.php';

const SESSION_COOKIE = 'rb_session';
const RETURN_COOKIE = 'rb_admin_return';   // stores the admin's token during impersonation
const IMPERSONATION_TTL = 1800;            // 30 minutes

function start_session_for(string $userId): string {
    $cfg = app_config();
    // Opportunistic GC of expired sessions (~1% of calls; cheap on shared hosting).
    if (random_int(1, 100) === 1) {
        db()->exec('DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()');
    }
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
        'SELECT u.id, u.email, p.display_name, s.impersonated_by
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN profiles p ON p.id = u.id
          WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP()'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// Create a short-lived session for $targetId on behalf of admin $adminId, make the
// browser that session (rb_session), and stash the admin's own token in a separate
// httpOnly cookie so exit_impersonation() can restore it. The admin's session row is
// left intact. Never exposes or uses the target's password.
function start_impersonation_session(string $targetId, string $adminToken, string $adminId): string {
    $cfg = app_config();
    $token = bin2hex(random_bytes(32));
    $now = gmdate('Y-m-d H:i:s');
    $exp = gmdate('Y-m-d H:i:s', time() + IMPERSONATION_TTL);
    db()->prepare(
        'INSERT INTO sessions (token, user_id, impersonated_by, created_at, expires_at) VALUES (?,?,?,?,?)'
    )->execute([$token, $targetId, $adminId, $now, $exp]);
    $opts = [
        'expires'  => time() + IMPERSONATION_TTL,
        'path'     => '/',
        'httponly' => true,
        'secure'   => (bool)$cfg['cookie_secure'],
        'samesite' => 'Lax',
    ];
    setcookie(SESSION_COOKIE, $token, $opts);   // become the target
    setcookie(RETURN_COOKIE, $adminToken, $opts); // remember the way back
    return $token;
}

// End the current impersonation session and restore the admin session. Returns
// ['ok'=>bool, 'admin_id'=>?string, 'target_id'=>?string, 'restored'=>bool].
function exit_impersonation(): array {
    $impToken   = $_COOKIE[SESSION_COOKIE] ?? '';
    $adminToken = $_COOKIE[RETURN_COOKIE] ?? '';
    if ($impToken === '' || $adminToken === '') return ['ok' => false];

    $stmt = db()->prepare(
        'SELECT user_id, impersonated_by FROM sessions WHERE token = ? AND expires_at > UTC_TIMESTAMP()'
    );
    $stmt->execute([$impToken]);
    $imp = $stmt->fetch();
    if (!$imp || ($imp['impersonated_by'] ?? null) === null) return ['ok' => false];

    // The return token must still map to a live, active admin session.
    $astmt = db()->prepare(
        'SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP() AND u.is_admin = 1 AND u.suspended_at IS NULL'
    );
    $astmt->execute([$adminToken]);
    $adminId = $astmt->fetchColumn();

    // End the impersonation session no matter what, and clear the return cookie.
    db()->prepare('DELETE FROM sessions WHERE token = ?')->execute([$impToken]);
    setcookie(RETURN_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);

    $cfg = app_config();
    // The return token must resolve to the SAME admin who started this impersonation
    // (not merely some live admin) — otherwise fail safe to logged out.
    if ($adminId === false || $adminId === null || (string)$adminId !== (string)($imp['impersonated_by'] ?? '')) {
        setcookie(SESSION_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);
        return ['ok' => true, 'admin_id' => null, 'target_id' => $imp['user_id'], 'restored' => false];
    }
    setcookie(SESSION_COOKIE, $adminToken, [
        'expires'  => time() + (int)$cfg['session_ttl'],
        'path'     => '/',
        'httponly' => true,
        'secure'   => (bool)$cfg['cookie_secure'],
        'samesite' => 'Lax',
    ]);
    return ['ok' => true, 'admin_id' => (string)$adminId, 'target_id' => $imp['user_id'], 'restored' => true];
}

function require_auth(): array {
    $u = current_user();
    if (!$u) json_error('Unauthorized', 401);
    return $u;
}

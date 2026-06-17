<?php
// Admin RBAC + audit logging. Gates every /admin endpoint.
//
// Security model: non-admins (including unauthenticated and suspended users) get
// a 404 — never a 401/403 — so the existence of the admin surface is not revealed.
// Every unauthorized attempt is recorded in admin_audit_log as a security alert.

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth.php';

// Resolve the current session's user including admin + suspension status.
// Kept separate from auth.php's current_user() so the standard auth path is
// untouched and the admin check always reads the live is_admin flag.
function current_admin(): ?array {
    $token = $_COOKIE[SESSION_COOKIE] ?? null;
    if (!$token) return null;
    $stmt = db()->prepare(
        'SELECT u.id, u.email, u.is_admin, u.suspended_at, s.impersonated_by, p.display_name
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN profiles p ON p.id = u.id
          WHERE s.token = ? AND s.expires_at > UTC_TIMESTAMP()'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// Best-effort client IP for audit entries.
function client_ip(): ?string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    return is_string($ip) && $ip !== '' ? substr($ip, 0, 64) : null;
}

// Append an entry to the admin audit log. Never throws — auditing must not break
// the request it is recording.
function admin_audit(
    ?string $adminId,
    string $action,
    ?string $targetType = null,
    ?string $targetId = null,
    $detail = null
): void {
    try {
        $d = ($detail === null || is_string($detail)) ? $detail : json_encode($detail);
        db()->prepare(
            'INSERT INTO admin_audit_log
               (id, admin_user_id, action, target_type, target_id, detail, ip, created_at)
             VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP())'
        )->execute([uuid4(), $adminId, $action, $targetType, $targetId, $d, client_ip()]);
    } catch (Throwable $e) {
        error_log('admin_audit failed: ' . $e->getMessage());
    }
}

// Gate for every /admin route and endpoint. Returns the admin user row on success.
// On failure: logs a security alert and terminates the request with a 404 that
// does not disclose the admin surface. An impersonation session (impersonated_by
// set) can never reach admin tooling, even if the impersonated account is an admin.
function require_admin(): array {
    $u = current_admin();
    $isAdmin = $u && (int)$u['is_admin'] === 1
        && $u['suspended_at'] === null
        && ($u['impersonated_by'] ?? null) === null;

    if (!$isAdmin) {
        admin_audit(
            $u['id'] ?? null,
            'unauthorized_admin_access',
            'path',
            $GLOBALS['ROUTE_PATH'] ?? null,
            [
                'method' => $GLOBALS['ROUTE_METHOD'] ?? null,
                'authenticated' => $u !== null,
                'suspended' => isset($u['suspended_at']) && $u['suspended_at'] !== null,
                'impersonated' => isset($u['impersonated_by']) && $u['impersonated_by'] !== null,
            ]
        );
        json_error('Not found', 404);
    }
    return $u;
}

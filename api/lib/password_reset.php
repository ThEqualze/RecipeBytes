<?php
// Password reset tokens: create (store only a sha256 hash), validate, consume,
// and email the reset link.

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/mailer.php';

const PASSWORD_RESET_TTL = 3600; // 1 hour

// Create a reset token for a user; store its hash; return the RAW token.
function create_password_reset(string $userId): string {
    $token = bin2hex(random_bytes(32));
    $hash  = hash('sha256', $token);
    $exp   = gmdate('Y-m-d H:i:s', time() + PASSWORD_RESET_TTL);
    db()->prepare(
        'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?,?,?,?,UTC_TIMESTAMP())'
    )->execute([uuid4(), $userId, $hash, $exp]);
    return $token;
}

// Return ['id'=>tokenRowId, 'user_id'=>...] for a valid, unused, unexpired token, else null.
function lookup_password_reset(string $token): ?array {
    if ($token === '') return null;
    $hash = hash('sha256', $token);
    $stmt = db()->prepare(
        'SELECT id, user_id FROM password_reset_tokens
          WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()'
    );
    $stmt->execute([$hash]);
    return $stmt->fetch() ?: null;
}

function mark_reset_used(string $tokenRowId): void {
    db()->prepare('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ?')->execute([$tokenRowId]);
}

// Compose + send the reset email. Returns true if sent (or logged in dev).
function send_password_reset_email(string $toEmail, string $rawToken, ?string &$error = null): bool {
    $link = app_base_url() . '/reset?token=' . urlencode($rawToken);
    $safe = htmlspecialchars($link, ENT_QUOTES);
    $subject = 'Reset your RecipeBytes password';
    $html = "<p>We received a request to reset your RecipeBytes password.</p>"
          . "<p><a href=\"$safe\">Choose a new password</a>. This link expires in 1 hour.</p>"
          . "<p>If you didn't request this, you can safely ignore this email.</p>";
    $text = "Reset your RecipeBytes password:\n$link\n\n"
          . "This link expires in 1 hour. If you didn't request this, ignore this email.";
    return send_mail($toEmail, $subject, $html, $text, $error);
}

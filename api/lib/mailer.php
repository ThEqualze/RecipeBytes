<?php
// Minimal dependency-free mailer. Uses SMTP when smtp_host is configured;
// otherwise writes the message to the PHP error log (safe no-op for dev/CI).

require_once __DIR__ . '/../db.php';

// Public base URL for links in emails (no trailing slash). Falls back to the
// incoming request's scheme+host when app_base_url isn't configured.
function app_base_url(): string {
    $cfg = app_config();
    $u = is_string($cfg['app_base_url'] ?? null) ? rtrim($cfg['app_base_url'], '/') : '';
    if ($u !== '') return $u; // configured value is authoritative

    // SECURITY: never trust the client-supplied Host header to build reset links in
    // production (host-header injection => attacker-controlled reset URL => account
    // takeover). Only fall back to the request host for local development; otherwise
    // fail closed to a host-less relative link and require app_base_url to be set.
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if (preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host)) {
        return 'http://' . $host;
    }
    error_log('app_base_url is not configured; refusing to trust Host header "' . $host . '". Set app_base_url in config.php.');
    return '';
}

// Send an email. Returns true on success. Never throws.
function send_mail(string $toEmail, string $subject, string $htmlBody, string $textBody, ?string &$error = null): bool {
    // Defense-in-depth: never let an unvalidated/CRLF-bearing address reach SMTP
    // (RCPT/header injection), regardless of caller.
    if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $toEmail)) {
        $error = 'Invalid recipient address.';
        return false;
    }
    $cfg = app_config();
    $host = is_string($cfg['smtp_host'] ?? null) ? trim($cfg['smtp_host']) : '';
    if ($host === '') {
        // Dev/no-SMTP: log instead of sending so flows still work locally/in CI.
        error_log("MAIL (log transport) to=$toEmail subject=" . $subject);
        return true;
    }
    try {
        return smtp_send($cfg, $toEmail, $subject, $htmlBody, $textBody, $error);
    } catch (Throwable $e) {
        $error = 'Mailer error: ' . $e->getMessage();
        error_log($error);
        return false;
    }
}

// Speak just enough SMTP (EHLO, optional STARTTLS, AUTH LOGIN, MAIL/RCPT/DATA).
function smtp_send(array $cfg, string $to, string $subject, string $html, string $text, ?string &$error = null): bool {
    $host   = (string)$cfg['smtp_host'];
    $port   = (int)($cfg['smtp_port'] ?? 587);
    $secure = (string)($cfg['smtp_secure'] ?? 'tls');
    $user   = (string)($cfg['smtp_user'] ?? '');
    $pass   = (string)($cfg['smtp_pass'] ?? '');
    $from   = (string)($cfg['mail_from'] ?? 'no-reply@localhost');
    $fromName = (string)($cfg['mail_from_name'] ?? 'RecipeBytes');

    $transport = ($secure === 'ssl') ? "ssl://$host" : $host;
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true]]);
    $fp = @stream_socket_client("$transport:$port", $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) { $error = "SMTP connect failed: $errstr"; return false; }
    stream_set_timeout($fp, 15);

    $read = function () use ($fp): string {
        $data = '';
        while (($line = fgets($fp, 515)) !== false) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break; // last line of a multiline reply
        }
        return $data;
    };
    $cmd = function (string $c) use ($fp, $read): string { fwrite($fp, $c . "\r\n"); return $read(); };
    $expect = function (string $resp, string $code) use (&$error): bool {
        if (strncmp($resp, $code, 3) !== 0) { $error = 'SMTP unexpected reply: ' . trim($resp); return false; }
        return true;
    };

    if (!$expect($read(), '220')) { fclose($fp); return false; }
    $ehloHost = $_SERVER['SERVER_NAME'] ?? 'localhost';
    if (!$expect($cmd("EHLO $ehloHost"), '250')) { fclose($fp); return false; }

    if ($secure === 'tls') {
        if (!$expect($cmd('STARTTLS'), '220')) { fclose($fp); return false; }
        if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            $error = 'STARTTLS negotiation failed'; fclose($fp); return false;
        }
        if (!$expect($cmd("EHLO $ehloHost"), '250')) { fclose($fp); return false; }
    }

    if ($user !== '') {
        if (!$expect($cmd('AUTH LOGIN'), '334')) { fclose($fp); return false; }
        if (!$expect($cmd(base64_encode($user)), '334')) { fclose($fp); return false; }
        if (!$expect($cmd(base64_encode($pass)), '235')) { fclose($fp); return false; }
    }

    if (!$expect($cmd("MAIL FROM:<$from>"), '250')) { fclose($fp); return false; }
    if (!$expect($cmd("RCPT TO:<$to>"), '250')) { fclose($fp); return false; }
    if (!$expect($cmd('DATA'), '354')) { fclose($fp); return false; }

    $boundary = 'rb_' . bin2hex(random_bytes(8));
    $headers =
        'From: ' . mime_name($fromName) . " <$from>\r\n" .
        "To: <$to>\r\n" .
        'Subject: ' . mime_encode($subject) . "\r\n" .
        "MIME-Version: 1.0\r\n" .
        "Content-Type: multipart/alternative; boundary=\"$boundary\"\r\n";
    $body =
        "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" . dot_stuff($text) . "\r\n" .
        "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n" . dot_stuff($html) . "\r\n" .
        "--$boundary--\r\n";
    fwrite($fp, $headers . "\r\n" . $body . "\r\n.\r\n");
    if (!$expect($read(), '250')) { fclose($fp); return false; }

    $cmd('QUIT');
    fclose($fp);
    return true;
}

// Escape a leading "." on any line per SMTP dot-stuffing.
function dot_stuff(string $s): string {
    return preg_replace('/^\./m', '..', str_replace("\r\n", "\n", $s));
}
function mime_encode(string $s): string {
    return '=?UTF-8?B?' . base64_encode($s) . '?=';
}
function mime_name(string $s): string {
    return preg_match('/[^\x20-\x7e]/', $s) ? mime_encode($s) : $s;
}

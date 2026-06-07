<?php
// Copy to api/config.php (gitignored) on each environment, OR point this to a
// file ABOVE the web root. Real credentials must never be committed.
return [
    'db_host' => '127.0.0.1',
    'db_name' => 'recipebytes',
    'db_user' => 'root',
    'db_pass' => '',
    'db_charset' => 'utf8mb4',
    // Session cookie lifetime in seconds (24 hours)
    'session_ttl' => 60 * 60 * 24,
    // Set true in production (HTTPS) so the cookie is Secure
    'cookie_secure' => false,
];

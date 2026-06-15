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
    // Google AI Studio (Gemini) — server-side only. Leave key empty to disable
    // the AI fallback for URL import (JSON-LD-only import still works). A key is
    // REQUIRED for photo/recipe-card import (POST /import/photo), which has no
    // free fallback because reading a photo needs the vision model.
    'gemini_api_key' => '',
    'gemini_model'   => 'gemini-2.5-flash',
    // --- Cover image uploads ---------------------------------------------
    // Where uploaded cover images are written, and the public URL they map to.
    // Leave commented to auto-derive: <web_root>/uploads/covers served at
    // /uploads/covers (web root = the parent of the api/ directory). Override
    // only if your layout differs, e.g. a local dev server whose doc-root is
    // not the web root.
    // 'upload_dir'      => __DIR__ . '/../uploads/covers',
    // 'upload_base_url' => '/uploads/covers',
];

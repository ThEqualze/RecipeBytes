<?php
// Pure unit tests for the cover-image upload helpers (no DB, no HTTP).
require_once __DIR__ . '/../api/lib/uploads.php';

function _rb_fixture(string $b64): string {
    $tmp = tempnam(sys_get_temp_dir(), 'rbupl');
    file_put_contents($tmp, base64_decode($b64));
    return $tmp;
}

$FIX = [
  'png'  => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'gif'  => 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'jpeg' => '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==',
  'webp' => 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
  'bmp'  => 'Qk06AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAAAATCwAAEwsAAAAAAAAAAAAAAAD/AA==',
];

// --- validate_image_upload: valid supported images map to the right extension ---
$png = _rb_fixture($FIX['png']);
check('png accepted as png', (function () use ($png) { $r = validate_image_upload($png); return $r['error'] === null && $r['ext'] === 'png'; })());

$gif = _rb_fixture($FIX['gif']);
check('gif accepted as gif', (function () use ($gif) { $r = validate_image_upload($gif); return $r['error'] === null && $r['ext'] === 'gif'; })());

$jpg = _rb_fixture($FIX['jpeg']);
check('jpeg accepted as jpg', (function () use ($jpg) { $r = validate_image_upload($jpg); return $r['error'] === null && $r['ext'] === 'jpg'; })());

$webp = _rb_fixture($FIX['webp']);
check('webp accepted as webp', (function () use ($webp) { $r = validate_image_upload($webp); return $r['error'] === null && $r['ext'] === 'webp'; })());

// --- rejections ---
// Oversize: a real >5MB file (size check fires before the image sniff).
$big = tempnam(sys_get_temp_dir(), 'rbupl');
file_put_contents($big, str_repeat("\0", 6 * 1024 * 1024));
check('oversize rejected', (function () use ($big) { $r = validate_image_upload($big); return $r['ext'] === null && $r['error'] !== null; })());

// Empty: tempnam() yields a real 0-byte file.
$empty = tempnam(sys_get_temp_dir(), 'rbupl');
check('empty rejected', (function () use ($empty) { $r = validate_image_upload($empty); return $r['ext'] === null && $r['error'] !== null; })());

// Non-image: plain text.
$txt = tempnam(sys_get_temp_dir(), 'rbupl');
file_put_contents($txt, 'this is plainly not an image');
check('non-image rejected', (function () use ($txt) { $r = validate_image_upload($txt); return $r['ext'] === null && $r['error'] !== null; })());

// Valid image but unsupported type: a real 1x1 BMP (getimagesize type 6).
$bmp = _rb_fixture($FIX['bmp']);
check('unsupported type (bmp) rejected', (function () use ($bmp) { $r = validate_image_upload($bmp); return $r['ext'] === null && $r['error'] !== null; })());

foreach ([$png, $gif, $jpg, $webp, $big, $empty, $txt, $bmp] as $f) @unlink($f);

// --- uploads_paths: default derivation from the API directory ---
$p = uploads_paths([], '/var/www/public_html/api');
check('paths default dir', $p['dir'] === '/var/www/public_html/uploads/covers');
check('paths default base_url', $p['base_url'] === '/uploads/covers');

// --- uploads_paths: config overrides win (trailing slashes trimmed) ---
$p = uploads_paths(['upload_dir' => '/custom/up/', 'upload_base_url' => '/media/'], '/x/api');
check('paths override dir', $p['dir'] === '/custom/up');
check('paths override base_url', $p['base_url'] === '/media');

$p = uploads_paths(['upload_base_url' => '/media\\'], '/x/api');
check('paths override base_url trims backslash', $p['base_url'] === '/media');

// --- ensure_uploads_dir: creates the dir and writes a hardening .htaccess ---
$base   = sys_get_temp_dir() . '/rb_up_' . bin2hex(random_bytes(4));
$covers = $base . '/uploads/covers';
ensure_uploads_dir($covers);
check('uploads dir created', is_dir($covers));
check('hardening htaccess written', file_exists($base . '/uploads/.htaccess'));
check('htaccess denies scripts',
    strpos((string)file_get_contents($base . '/uploads/.htaccess'), 'Require all denied') !== false);

// idempotent + never truncates a pre-existing .htaccess
file_put_contents($base . '/uploads/.htaccess', 'SENTINEL');
check('ensure_uploads_dir idempotent returns true', ensure_uploads_dir($covers) === true);
check('existing htaccess preserved', file_get_contents($base . '/uploads/.htaccess') === 'SENTINEL');

@unlink($base . '/uploads/.htaccess');
@rmdir($covers); @rmdir($base . '/uploads'); @rmdir($base);

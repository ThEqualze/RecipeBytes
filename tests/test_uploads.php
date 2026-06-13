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

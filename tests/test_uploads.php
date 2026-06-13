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
];

// --- validate_image_upload: valid images map to the right extension ---
$png = _rb_fixture($FIX['png']);
$r = validate_image_upload(filesize($png), $png);
check('png accepted as png', $r['error'] === null && $r['ext'] === 'png');

$gif = _rb_fixture($FIX['gif']);
$r = validate_image_upload(filesize($gif), $gif);
check('gif accepted as gif', $r['error'] === null && $r['ext'] === 'gif');

$jpg = _rb_fixture($FIX['jpeg']);
$r = validate_image_upload(filesize($jpg), $jpg);
check('jpeg accepted as jpg', $r['error'] === null && $r['ext'] === 'jpg');

$webp = _rb_fixture($FIX['webp']);
$r = validate_image_upload(filesize($webp), $webp);
check('webp accepted as webp', $r['error'] === null && $r['ext'] === 'webp');

// --- validate_image_upload: rejections ---
$r = validate_image_upload(6 * 1024 * 1024, $png);
check('oversize rejected', $r['ext'] === null && $r['error'] !== null);

$r = validate_image_upload(0, $png);
check('empty rejected', $r['ext'] === null && $r['error'] !== null);

$txt = tempnam(sys_get_temp_dir(), 'rbupl');
file_put_contents($txt, 'this is plainly not an image');
$r = validate_image_upload(filesize($txt), $txt);
check('non-image rejected', $r['ext'] === null && $r['error'] !== null);

foreach ([$png, $gif, $jpg, $webp, $txt] as $f) @unlink($f);

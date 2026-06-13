<?php
// Pure unit tests for the Open Graph helpers (no DB, no HTTP).
require_once __DIR__ . '/../api/lib/og.php';

// --- og_absolutize_url ---
check('absolutize relative path',
    og_absolutize_url('/uploads/covers/x.jpg', 'https', 'recipebytes.test') === 'https://recipebytes.test/uploads/covers/x.jpg');
check('absolutize passthrough absolute',
    og_absolutize_url('https://cdn.test/a.jpg', 'https', 'recipebytes.test') === 'https://cdn.test/a.jpg');
check('absolutize empty stays empty',
    og_absolutize_url('', 'https', 'recipebytes.test') === '');

// --- og_meta_block ---
$block = og_meta_block(['title' => 'Steak Frites', 'description' => 'Crispy', 'image' => 'https://h/x.jpg', 'url' => 'https://h/r/abc']);
check('meta has title', strpos($block, '<title>Steak Frites</title>') !== false);
check('meta has og:image', strpos($block, '<meta property="og:image" content="https://h/x.jpg" />') !== false);
check('meta has twitter card', strpos($block, 'name="twitter:card" content="summary_large_image"') !== false);

// escaping: a malicious title must not break out of the attribute
$evil = og_meta_block(['title' => '"><script>alert(1)</script>', 'description' => '', 'image' => '', 'url' => 'https://h/r/abc']);
check('meta escapes title', strpos($evil, '<script>alert(1)</script>') === false);
check('meta omits og:image when no image', strpos($evil, 'og:image') === false);

// --- og_render ---
$tpl = "<!doctype html><html><head>\n<title>Old</title>\n"
     . "<meta property=\"og:image\" content=\"https://old/default.png\" />\n"
     . "<meta name=\"twitter:image\" content=\"https://old/default.png\" />\n"
     . "</head><body><div id=\"root\"></div></body></html>";
$out = og_render($tpl, ['title' => 'New Dish', 'description' => 'Tasty', 'image' => 'https://h/new.jpg', 'url' => 'https://h/r/abc']);
check('render injects new title', strpos($out, '<title>New Dish</title>') !== false);
check('render drops old title', strpos($out, '<title>Old</title>') === false);
check('render injects new og:image', strpos($out, 'content="https://h/new.jpg"') !== false);
check('render drops old default og:image', strpos($out, 'old/default.png') === false);
check('render keeps app root', strpos($out, '<div id="root"></div>') !== false);

<?php
// Server-rendered share page for /r/{token}: outputs the SPA shell with
// per-recipe Open Graph tags so pasted links preview the dish photo + title.
// Humans still get the SPA, which boots and renders the public recipe view.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lib/og.php';

$token = (isset($_GET['token']) && is_string($_GET['token'])) ? $_GET['token'] : '';

$indexPath = dirname(__DIR__) . '/index.html';
$template = is_file($indexPath)
    ? (string)file_get_contents($indexPath)
    : '<!doctype html><html><head></head><body><div id="root"></div></body></html>';

$scheme = ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')) ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';

header('Content-Type: text/html; charset=utf-8');

$recipe = null;
if ($token !== '' && preg_match('/^[A-Za-z0-9]+$/', $token)) {
    try {
        $stmt = db()->prepare(
            'SELECT r.title, r.description, r.cook_image_url, r.cover_image_url
               FROM shared_recipes sr JOIN recipes r ON r.id = sr.recipe_id
              WHERE sr.token = ?'
        );
        $stmt->execute([$token]);
        $recipe = $stmt->fetch();
    } catch (\Throwable $e) {
        // DB hiccup on a public share link: degrade to the plain SPA shell.
        $recipe = null;
    }
}

if (!$recipe) {
    // Unknown/revoked token: serve the plain shell; the SPA shows its own state.
    echo $template;
    exit;
}

$image = !empty($recipe['cook_image_url']) ? $recipe['cook_image_url'] : ($recipe['cover_image_url'] ?? '');
echo og_render($template, [
    'title'       => $recipe['title'],
    'description' => $recipe['description'],
    'image'       => og_absolutize_url((string)$image, $scheme, $host),
    'url'         => $scheme . '://' . $host . '/r/' . $token,
]);

<?php
// Pure helpers for server-rendered Open Graph tags on /r/{token}. No DB/network.

// Make a possibly-relative URL absolute against scheme+host. '' stays ''.
function og_absolutize_url(string $url, string $scheme, string $host): string {
    $url = trim($url);
    if ($url === '') return '';
    if (preg_match('#^https?://#i', $url)) return $url;
    return $scheme . '://' . $host . '/' . ltrim($url, '/');
}

// Build the <title> + OG/Twitter meta block. $r: title, description, image, url.
function og_meta_block(array $r): string {
    $e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
    $title = trim((string)($r['title'] ?? '')) !== '' ? $r['title'] : 'A recipe on RecipeBytes';
    $desc  = trim((string)($r['description'] ?? ''));
    if ($desc === '') $desc = 'See the recipe and make it yourself.';
    if (mb_strlen($desc) > 200) $desc = mb_substr($desc, 0, 197) . '...';

    $lines = [
        '<title>' . $e($title) . '</title>',
        '<meta property="og:type" content="article" />',
        '<meta property="og:title" content="' . $e($title) . '" />',
        '<meta property="og:description" content="' . $e($desc) . '" />',
        '<meta property="og:url" content="' . $e($r['url'] ?? '') . '" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        '<meta name="twitter:title" content="' . $e($title) . '" />',
        '<meta name="twitter:description" content="' . $e($desc) . '" />',
    ];
    if (trim((string)($r['image'] ?? '')) !== '') {
        $lines[] = '<meta property="og:image" content="' . $e($r['image']) . '" />';
        $lines[] = '<meta name="twitter:image" content="' . $e($r['image']) . '" />';
    }
    return implode("\n    ", $lines);
}

// Strip the template's existing <title> + og:/twitter: meta and inject the
// recipe block before </head>. Returns the modified HTML.
function og_render(string $template, array $r): string {
    $html = preg_replace('#<title>.*?</title>#is', '', $template);
    $html = preg_replace('#<meta[^>]*(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>\s*#i', '', $html);
    $block = og_meta_block($r);
    return preg_replace('#</head>#i', "    " . $block . "\n  </head>", $html, 1);
}

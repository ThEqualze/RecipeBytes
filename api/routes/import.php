<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/import_extract.php';

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

if ($path !== '/import' || $method !== 'POST') {
    json_error('Not found', 404);
}

$body = read_json_body();
$url = is_string($body['url'] ?? null) ? trim($body['url']) : '';

$err = validate_public_url($url);
if ($err !== null) json_error($err, 400);

$html = safe_fetch($url, $fetchErr);
if ($html === null) json_error($fetchErr ?? 'Couldn\'t reach that page.', 502);

// Free path: schema.org JSON-LD
$form = extract_jsonld_recipe($html, $url);
if ($form !== null) json_ok($form);

// Fallback: Gemini (only if a key is configured)
$cfg = app_config();
$key = is_string($cfg['gemini_api_key'] ?? null) ? $cfg['gemini_api_key'] : '';
if ($key === '') json_error('We couldn\'t find a recipe on that page.', 422);

$model = is_string($cfg['gemini_model'] ?? null) && $cfg['gemini_model'] !== '' ? $cfg['gemini_model'] : 'gemini-2.0-flash';
$form = gemini_extract($html, $url, $key, $model, $gemErr);
if ($form === null) {
    json_error($gemErr ?? 'We couldn\'t find a recipe on that page.', $gemErr !== null ? 502 : 422);
}
json_ok($form);


// ---- I/O helpers (live here, not in the pure lib) ----

function validate_public_url(string $url): ?string {
    if ($url === '') return 'Please enter a URL.';
    $parts = parse_url($url);
    if ($parts === false || !isset($parts['scheme']) || !isset($parts['host'])) {
        return 'That doesn\'t look like a valid URL.';
    }
    if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) {
        return 'Only http and https URLs are supported.';
    }
    foreach (resolve_ips($parts['host']) as $ip) {
        if (is_blocked_ip($ip)) return 'That URL can\'t be imported.';
    }
    return null;
}

function resolve_ips(string $host): array {
    if (filter_var($host, FILTER_VALIDATE_IP)) return [$host];
    $ips = [];
    $v4 = @gethostbynamel($host);
    if (is_array($v4)) $ips = array_merge($ips, $v4);
    $aaaa = @dns_get_record($host, DNS_AAAA);
    if (is_array($aaaa)) {
        foreach ($aaaa as $rec) {
            if (isset($rec['ipv6'])) $ips[] = $rec['ipv6'];
        }
    }
    if (empty($ips)) $ips = ['0.0.0.0']; // unresolvable -> treat as blocked
    return $ips;
}

function safe_fetch(string $url, ?string &$error = null): ?string {
    $maxRedirects = 5;
    $maxBytes = 2 * 1024 * 1024;
    for ($i = 0; $i <= $maxRedirects; $i++) {
        if (validate_public_url($url) !== null) { $error = 'That URL can\'t be imported.'; return null; }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; RecipeBytes/1.0; +https://recipebytes.co.uk)',
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_NOPROGRESS => false,
            CURLOPT_PROGRESSFUNCTION => function ($ch, $dlTotal, $dlNow) use ($maxBytes) {
                return ($dlNow > $maxBytes) ? 1 : 0;
            },
        ]);
        $resp = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $redirect = curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        curl_close($ch);
        if ($resp === false) { $error = 'Couldn\'t reach that page.'; return null; }
        if ($code >= 300 && $code < 400 && is_string($redirect) && $redirect !== '') { $url = $redirect; continue; }
        if ($code >= 400) { $error = 'That page returned an error (' . $code . ').'; return null; }
        return (string)$resp;
    }
    $error = 'Too many redirects.';
    return null;
}

function gemini_extract(string $html, string $url, string $key, string $model, ?string &$error = null): ?array {
    $text = preg_replace('#<script\b[^>]*>.*?</script>#is', ' ', $html);
    $text = preg_replace('#<style\b[^>]*>.*?</style>#is', ' ', $text);
    $text = preg_replace('#<[^>]+>#', ' ', $text);
    $text = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = trim(preg_replace('/\s+/', ' ', $text));
    if (mb_strlen($text) > 12000) $text = mb_substr($text, 0, 12000);

    $prompt = "Extract the recipe from the following web page text. "
        . "Respond with ONLY a JSON object (no markdown fences) with keys: "
        . "title (string), description (string), source_author (string), cover_image_url (string), "
        . "prep_time_minutes (integer), cook_time_minutes (integer), total_time_minutes (integer), "
        . "yield_amount (number), yield_unit (string), "
        . "ingredients (array of objects {quantity, unit, name, prep_note}), "
        . "instructions (array of objects {content}). "
        . "If the page is not a recipe, return {\"title\":\"\"}. Page text:\n\n" . $text;

    $payload = json_encode([
        'contents' => [['parts' => [['text' => $prompt]]]],
        'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.2],
    ]);
    $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model)
        . ':generateContent?key=' . rawurlencode($key);

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code >= 400) { $error = 'AI extraction is unavailable right now.'; return null; }

    $data = json_decode($resp, true);
    $textOut = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if (!is_string($textOut) || trim($textOut) === '') { $error = 'AI extraction is unavailable right now.'; return null; }
    $recipe = json_decode($textOut, true);
    if (!is_array($recipe) || ((($recipe['title'] ?? '') === '') && empty($recipe['ingredients']))) {
        return null; // not a recipe -> caller returns 422 (error stays null)
    }
    return map_gemini_recipe($recipe, $url);
}

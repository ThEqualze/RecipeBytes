<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/import_extract.php';
require_once __DIR__ . '/../lib/uploads.php';
require_once __DIR__ . '/../lib/subscriptions.php';
require_once __DIR__ . '/../lib/usage_notify.php';
require_once __DIR__ . '/../lib/settings.php';

const PHOTO_IMPORT_MAX_FILES = 6;

$path = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user = require_auth();

// Photo import: read recipe-card photo(s) with Gemini vision.
if ($path === '/import/photo' && $method === 'POST') {
    handle_photo_import($user);
    exit;
}

if ($path !== '/import' || $method !== 'POST') {
    json_error('Not found', 404);
}

$body = read_json_body();
$url = is_string($body['url'] ?? null) ? trim($body['url']) : '';

$err = validate_public_url($url);
if ($err !== null) json_error($err, 400);

// Metering: block before any work if the user is at/over their monthly URL limit.
$us = usage_status($user['id'], 'url');
if (!$us['allowed']) {
    json_error("You've reached your monthly URL import limit ({$us['limit']}). Upgrade to Pro for unlimited imports.", 402);
}

$html = safe_fetch($url, $fetchErr);
if ($html === null) json_error($fetchErr ?? 'Couldn\'t reach that page.', 502);

// Free path: schema.org JSON-LD
$form = extract_jsonld_recipe($html, $url);
if ($form !== null) {
    meter_success($user, 'url', 'URL imports');
    json_ok($form);
}

// Fallback: Gemini (only if a key is configured)
$cfg = app_config();
$key = is_string($cfg['gemini_api_key'] ?? null) ? $cfg['gemini_api_key'] : '';
if ($key === '') json_error('We couldn\'t find a recipe on that page.', 422);

$model = active_ai_model($cfg);
$tokens = 0;
$form = gemini_extract($html, $url, $key, $model, $gemErr, $tokens);
if ($form === null) {
    log_ai_job($user['id'], 'url', 'failed', 0, 0.0, $model, $gemErr ?? 'no recipe found');
    json_error($gemErr ?? 'We couldn\'t find a recipe on that page.', $gemErr !== null ? 502 : 422);
}
log_ai_job($user['id'], 'url', 'success', $tokens, ai_cost($tokens), $model);
meter_success($user, 'url', 'URL imports');
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
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language: en-GB,en;q=0.9',
            ],
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

// ---- Photo import (multipart -> Gemini vision -> RecipeFormData) ----

function handle_photo_import(array $user): void {
    $files = normalize_uploaded_files($_FILES['files'] ?? null);
    if (count($files) === 0) json_error('No photos were uploaded.', 400);
    if (count($files) > PHOTO_IMPORT_MAX_FILES) {
        json_error('Please upload up to ' . PHOTO_IMPORT_MAX_FILES . ' photos.', 400);
    }

    // Metering: block before reading/encoding files or calling the model.
    $us = usage_status($user['id'], 'image');
    if (!$us['allowed']) {
        json_error("You've reached your monthly image scan limit ({$us['limit']}). Upgrade to Pro for unlimited imports.", 402);
    }

    $images = [];
    foreach ($files as $f) {
        if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            json_error('Upload failed — the file may be too large.', 400);
        }
        $tmp = (string)($f['tmp_name'] ?? '');
        $check = validate_image_upload($tmp);
        if ($check['error'] !== null) json_error($check['error'], 400);
        $mime = image_mime_from_type((int)$check['type']);
        if ($mime === '') json_error('Unsupported image type. Use JPEG, PNG, WebP, or GIF.', 400);
        $bytes = @file_get_contents($tmp);
        if ($bytes === false) json_error('Could not read an uploaded photo.', 400);
        $images[] = ['mime' => $mime, 'data_b64' => base64_encode($bytes)];
    }

    $cfg = app_config();
    $key = is_string($cfg['gemini_api_key'] ?? null) ? $cfg['gemini_api_key'] : '';
    if ($key === '') json_error("Photo import needs AI extraction, which isn't set up.", 422);

    $model = active_ai_model($cfg);

    $gemErr = null;
    $tokens = 0;
    $recipe = gemini_extract_images($images, $key, $model, $gemErr, $tokens);
    if ($recipe === null) {
        log_ai_job($user['id'], 'image', 'failed', 0, 0.0, $model, $gemErr ?? 'no recipe found');
        // $gemErr set => transport/HTTP problem (502). Null => model found no recipe (422).
        json_error($gemErr ?? "We couldn't find a recipe on that card.", $gemErr !== null ? 502 : 422);
    }
    log_ai_job($user['id'], 'image', 'success', $tokens, ai_cost($tokens), $model);

    // The card photo is not used as the cover — a snapshot of a card makes a poor
    // cover image. cover_image_url is left empty; the user adds their own cover in
    // the editor (the editor's cover-upload button stays available).
    $form = map_gemini_recipe($recipe, '');
    meter_success($user, 'image', 'image scans');
    json_ok($form);
}

// Record a successful import against the user's monthly usage and fire threshold
// alert emails (80% warning, 100% limit reached) when crossed.
function meter_success(array $user, string $jobType, string $label): void {
    $r = record_usage($user['id'], $jobType);
    if ($r['reached_limit']) {
        send_limit_reached_email($user['email'], $label, (int)$r['limit']);
    } elseif ($r['crossed_80']) {
        send_usage_warning_email($user['email'], $label, (int)$r['used'], (int)$r['limit']);
    }
}

// POST the image payload to Gemini and return the parsed recipe array, or null.
// On a transport/HTTP error sets $error (caller -> 502). When the model simply
// returns "not a recipe", returns null with $error left null (caller -> 422).
function gemini_extract_images(array $images, string $key, string $model, ?string &$error = null, int &$tokens = 0): ?array {
    $payload = json_encode(build_gemini_image_payload(array_map(
        fn($i) => ['mime' => $i['mime'], 'data_b64' => $i['data_b64']],
        $images
    )));
    if ($payload === false) { $error = 'Could not prepare the images for extraction.'; return null; }
    $endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model)
        . ':generateContent?key=' . rawurlencode($key);

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code >= 400) { $error = 'AI extraction is unavailable right now.'; return null; }

    $data = json_decode($resp, true);
    $tokens = (int)($data['usageMetadata']['totalTokenCount'] ?? 0);
    $textOut = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if (!is_string($textOut) || trim($textOut) === '') {
        $error = 'AI extraction is unavailable right now.';
        return null;
    }
    return parse_gemini_recipe_json($textOut);
}

function gemini_extract(string $html, string $url, string $key, string $model, ?string &$error = null, int &$tokens = 0): ?array {
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
    $tokens = (int)($data['usageMetadata']['totalTokenCount'] ?? 0);
    $textOut = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
    if (!is_string($textOut) || trim($textOut) === '') { $error = 'AI extraction is unavailable right now.'; return null; }
    $recipe = json_decode($textOut, true);
    if (!is_array($recipe) || ((($recipe['title'] ?? '') === '') && empty($recipe['ingredients']))) {
        return null; // not a recipe -> caller returns 422 (error stays null)
    }
    return map_gemini_recipe($recipe, $url);
}

<?php
// Pure extraction/mapping helpers for URL recipe import. NO network or DB I/O.

function empty_recipe_form(string $url): array {
    return [
        'title' => '',
        'description' => '',
        'cover_image_url' => '',
        'source_url' => $url,
        'source_author' => '',
        'folder_id' => null,
        'prep_time_minutes' => 0,
        'cook_time_minutes' => 0,
        'total_time_minutes' => 0,
        'yield_amount' => 1,
        'yield_unit' => 'servings',
        'notes' => '',
        'tagIds' => [],
        'ingredients' => [],
        'instructions' => [],
    ];
}

// ISO-8601 duration (e.g. "PT1H30M") -> whole minutes. Returns 0 on null/invalid.
function parse_iso8601_duration($d): int {
    if (!is_string($d)) return 0;
    if (!preg_match('/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/', trim($d), $m)) {
        return 0;
    }
    $days  = isset($m[1]) ? (int)$m[1] : 0;
    $hours = isset($m[2]) ? (int)$m[2] : 0;
    $mins  = isset($m[3]) ? (int)$m[3] : 0;
    $secs  = isset($m[4]) ? (int)$m[4] : 0;
    return $days * 1440 + $hours * 60 + $mins + (int)round($secs / 60);
}

// True if an IP is loopback/private/link-local/reserved (or not a valid IP).
// Used to block SSRF to internal hosts and cloud-metadata endpoints.
function is_blocked_ip(string $ip): bool {
    if (!filter_var($ip, FILTER_VALIDATE_IP)) return true;
    $public = filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    );
    return $public === false;
}

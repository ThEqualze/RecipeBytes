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

// ---- JSON-LD extraction ----

function type_is_recipe($type): bool {
    if (is_string($type)) return strcasecmp($type, 'Recipe') === 0;
    if (is_array($type)) {
        foreach ($type as $t) {
            if (is_string($t) && strcasecmp($t, 'Recipe') === 0) return true;
        }
    }
    return false;
}

function find_recipe_node(array $data): ?array {
    if (isset($data['@type']) && type_is_recipe($data['@type'])) return $data;
    if (isset($data['@graph']) && is_array($data['@graph'])) {
        foreach ($data['@graph'] as $node) {
            if (is_array($node) && isset($node['@type']) && type_is_recipe($node['@type'])) return $node;
        }
    }
    if (array_is_list($data)) {
        foreach ($data as $node) {
            if (is_array($node)) {
                $found = find_recipe_node($node);
                if ($found) return $found;
            }
        }
    }
    return null;
}

function jsonld_author($a): string {
    if (is_string($a)) return trim($a);
    if (is_array($a)) {
        if (isset($a['name']) && is_string($a['name'])) return trim($a['name']);
        if (array_is_list($a) && isset($a[0])) return jsonld_author($a[0]);
    }
    return '';
}

function jsonld_image($img): string {
    if (is_string($img)) return trim($img);
    if (is_array($img)) {
        if (isset($img['url']) && is_string($img['url'])) return trim($img['url']);
        if (array_is_list($img) && isset($img[0])) return jsonld_image($img[0]);
    }
    return '';
}

// Returns [float amount, string unit].
function jsonld_yield($y): array {
    if (is_int($y) || is_float($y)) return [(float)$y, 'servings'];
    if (is_array($y) && array_is_list($y) && isset($y[0])) $y = $y[0];
    if (is_string($y)) {
        if (preg_match('/(\d+(?:\.\d+)?)\s*(.*)$/', trim($y), $m)) {
            $unit = trim($m[2]);
            return [(float)$m[1], $unit !== '' ? $unit : 'servings'];
        }
    }
    return [1.0, 'servings'];
}

function jsonld_ingredients($ing): array {
    $out = [];
    if (is_array($ing)) {
        foreach ($ing as $line) {
            if (is_string($line) && trim($line) !== '') $out[] = trim($line);
        }
    }
    return $out;
}

function jsonld_instructions($inst): array {
    $out = [];
    if (is_string($inst)) {
        $t = trim($inst);
        if ($t !== '') $out[] = $t;
        return $out;
    }
    if (is_array($inst)) {
        foreach ($inst as $node) {
            if (is_string($node)) {
                if (trim($node) !== '') $out[] = trim($node);
            } elseif (is_array($node)) {
                $type = $node['@type'] ?? '';
                if ($type === 'HowToSection' && isset($node['itemListElement']) && is_array($node['itemListElement'])) {
                    foreach (jsonld_instructions($node['itemListElement']) as $s) $out[] = $s;
                } elseif (isset($node['text']) && is_string($node['text'])) {
                    if (trim($node['text']) !== '') $out[] = trim($node['text']);
                } elseif (isset($node['name']) && is_string($node['name'])) {
                    if (trim($node['name']) !== '') $out[] = trim($node['name']);
                }
            }
        }
    }
    return $out;
}

function map_jsonld_recipe(array $r, string $url): array {
    $form = empty_recipe_form($url);
    $form['title'] = (isset($r['name']) && is_string($r['name']) && trim($r['name']) !== '')
        ? trim($r['name']) : 'Imported Recipe';
    if (isset($r['description']) && is_string($r['description'])) $form['description'] = trim($r['description']);
    $form['source_author'] = jsonld_author($r['author'] ?? null);
    $form['cover_image_url'] = jsonld_image($r['image'] ?? null);
    $form['prep_time_minutes'] = parse_iso8601_duration($r['prepTime'] ?? null);
    $form['cook_time_minutes'] = parse_iso8601_duration($r['cookTime'] ?? null);
    $form['total_time_minutes'] = parse_iso8601_duration($r['totalTime'] ?? null);
    [$amt, $unit] = jsonld_yield($r['recipeYield'] ?? null);
    $form['yield_amount'] = $amt;
    $form['yield_unit'] = $unit;
    foreach (jsonld_ingredients($r['recipeIngredient'] ?? null) as $line) {
        $form['ingredients'][] = ['quantity' => '', 'unit' => '', 'name' => $line, 'prep_note' => '', 'group_name' => ''];
    }
    foreach (jsonld_instructions($r['recipeInstructions'] ?? null) as $content) {
        $form['instructions'][] = ['content' => $content, 'timer_seconds' => '', 'group_name' => ''];
    }
    return $form;
}

// Parse all JSON-LD blocks from HTML and return the first Recipe mapped to RecipeFormData, or null.
function extract_jsonld_recipe(string $html, string $url): ?array {
    if (!preg_match_all('#<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>#is', $html, $matches)) {
        return null;
    }
    foreach ($matches[1] as $block) {
        $data = json_decode(trim($block), true);
        if (!is_array($data)) continue;
        $recipe = find_recipe_node($data);
        if ($recipe) return map_jsonld_recipe($recipe, $url);
    }
    return null;
}

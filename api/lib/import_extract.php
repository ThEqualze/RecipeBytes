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

// Convert a free-text quantity ("½", "1 ½", "1/2", "1 1/2", "4", "1.5") to a
// float for the DECIMAL quantity column. Returns null for blank, ranges, or
// anything unparseable — callers store NULL rather than guess a wrong number.
function parse_quantity($v): ?float {
    if (is_int($v) || is_float($v)) return (float)$v;
    if (!is_string($v)) return null;
    $s = trim($v);
    if ($s === '') return null;
    // Ranges ("1-2", "1 to 2") are ambiguous -> null.
    if (preg_match('/\d\s*(?:-|–|to)\s*\d/u', $s)) return null;
    // Plain integer or decimal.
    if (preg_match('/^\d+(?:\.\d+)?$/', $s)) return (float)$s;
    $uni = ['½'=>0.5,'⅓'=>1/3,'⅔'=>2/3,'¼'=>0.25,'¾'=>0.75,'⅕'=>0.2,'⅖'=>0.4,'⅗'=>0.6,
            '⅘'=>0.8,'⅙'=>1/6,'⅚'=>5/6,'⅛'=>0.125,'⅜'=>0.375,'⅝'=>0.625,'⅞'=>0.875,
            '⅐'=>1/7,'⅑'=>1/9,'⅒'=>0.1];
    // Bare or mixed unicode fraction: "½", "1 ½".
    if (preg_match('/^(\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒])$/u', $s, $m)) {
        $whole = $m[1] !== '' ? (float)$m[1] : 0.0;
        return $whole + $uni[$m[2]];
    }
    // Bare or mixed ascii fraction: "1/2", "1 1/2".
    if (preg_match('#^(?:(\d+)\s+)?(\d+)\s*/\s*(\d+)$#', $s, $m)) {
        $den = (float)$m[3];
        if ($den == 0.0) return null;
        $whole = ($m[1] ?? '') !== '' ? (float)$m[1] : 0.0;
        return $whole + (float)$m[2] / $den;
    }
    return null;
}

// Split a free-text ingredient line ("½ teaspoon black pepper (for steak)")
// into {quantity, unit, name, prep_note}. Lossless on quantity: keeps the
// source's textual form (fractions, unicode glyphs, ranges) since the editor's
// Qty field is free text. Conservative — only strips a unit it recognises.
function parse_ingredient_line(string $line): array {
    $out = ['quantity' => '', 'unit' => '', 'name' => '', 'prep_note' => '', 'group_name' => ''];
    $s = trim($line);
    // Strip a leading list bullet ("- ", "* ", "• ").
    $s = preg_replace('/^[-*•·]\s+/u', '', $s);

    // Pull a trailing parenthetical into prep_note: "... (chopped)".
    if (preg_match('/^(.*?)\s*\(([^()]*)\)\s*$/u', $s, $pm)) {
        $s = trim($pm[1]);
        $out['prep_note'] = trim($pm[2]);
    }

    // Leading quantity: digits / decimals / ASCII fractions / unicode fractions,
    // optionally a mixed-or-range second piece ("1 ½", "1-2", "1 to 2").
    $num = '(?:\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒])';
    if (preg_match('/^(' . $num . '(?:\s*(?:-|–|to)\s*' . $num . '|\s+' . $num . ')?)\s*/u', $s, $qm)) {
        $out['quantity'] = trim($qm[1]);
        $s = trim(substr($s, strlen($qm[0])));
    }

    // Optional unit immediately after the quantity (or leading, e.g. "Pinch of salt").
    $units = 'teaspoons?|tsp|tablespoons?|tbsp|tbs|cups?|ounces?|oz|pounds?|lbs?'
        . '|grams?|g|kilograms?|kg|milliliters?|millilitres?|ml|liters?|litres?|l'
        . '|pinch(?:es)?|cloves?|cans?|packages?|pkgs?|sticks?|slices?|dash(?:es)?'
        . '|quarts?|qt|pints?|pt|gallons?|gal|handfuls?|sprigs?|bunch(?:es)?';
    if (preg_match('/^(' . $units . ')\b\.?\s*/ui', $s, $um)) {
        $out['unit'] = $um[1];
        $s = trim(substr($s, strlen($um[0])));
        // Drop a connecting "of" ("Pinch of salt", "2 cloves of garlic").
        $s = preg_replace('/^of\s+/ui', '', $s);
    }

    $out['name'] = trim($s);
    // Degenerate parse (no name survived): fall back to the raw line as the name.
    if ($out['name'] === '') {
        $out = ['quantity' => '', 'unit' => '', 'name' => trim(preg_replace('/^[-*•·]\s+/u', '', $line)), 'prep_note' => '', 'group_name' => ''];
    }
    return $out;
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
        $form['ingredients'][] = parse_ingredient_line($line);
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

// ---- Gemini fallback mapper ----

function map_gemini_recipe(array $g, string $url): array {
    $form = empty_recipe_form($url);
    $str = fn($k) => (isset($g[$k]) && is_string($g[$k])) ? trim($g[$k]) : '';
    $int = fn($k) => isset($g[$k]) && is_numeric($g[$k]) ? (int)$g[$k] : 0;

    $form['title'] = $str('title') !== '' ? $str('title') : 'Imported Recipe';
    $form['description'] = $str('description');
    $form['source_author'] = $str('source_author');
    $form['cover_image_url'] = $str('cover_image_url');
    $form['prep_time_minutes'] = $int('prep_time_minutes');
    $form['cook_time_minutes'] = $int('cook_time_minutes');
    $form['total_time_minutes'] = $int('total_time_minutes');
    if (isset($g['yield_amount']) && is_numeric($g['yield_amount'])) $form['yield_amount'] = (float)$g['yield_amount'];
    if ($str('yield_unit') !== '') $form['yield_unit'] = $str('yield_unit');

    if (isset($g['ingredients']) && is_array($g['ingredients'])) {
        foreach ($g['ingredients'] as $ing) {
            if (is_string($ing)) {
                if (trim($ing) !== '') {
                    $form['ingredients'][] = parse_ingredient_line($ing);
                }
            } elseif (is_array($ing)) {
                $name = isset($ing['name']) && is_string($ing['name']) ? trim($ing['name']) : '';
                if ($name === '') continue;
                $form['ingredients'][] = [
                    'quantity' => isset($ing['quantity']) ? (string)$ing['quantity'] : '',
                    'unit' => isset($ing['unit']) && is_string($ing['unit']) ? trim($ing['unit']) : '',
                    'name' => $name,
                    'prep_note' => isset($ing['prep_note']) && is_string($ing['prep_note']) ? trim($ing['prep_note']) : '',
                    'group_name' => '',
                ];
            }
        }
    }
    if (isset($g['instructions']) && is_array($g['instructions'])) {
        foreach ($g['instructions'] as $step) {
            $content = '';
            if (is_string($step)) $content = trim($step);
            elseif (is_array($step) && isset($step['content']) && is_string($step['content'])) $content = trim($step['content']);
            if ($content !== '') {
                $form['instructions'][] = ['content' => $content, 'timer_seconds' => '', 'group_name' => ''];
            }
        }
    }
    return $form;
}

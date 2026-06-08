<?php
require_once __DIR__ . '/../api/lib/import_extract.php';

// empty_recipe_form
$f = empty_recipe_form('https://example.com/r');
check('empty form has source_url', $f['source_url'] === 'https://example.com/r');
check('empty form yield defaults', $f['yield_amount'] === 1 && $f['yield_unit'] === 'servings');
check('empty form arrays', $f['ingredients'] === [] && $f['instructions'] === [] && $f['tagIds'] === []);
check('empty form folder null', $f['folder_id'] === null);

// parse_iso8601_duration
check('duration PT1H30M = 90', parse_iso8601_duration('PT1H30M') === 90);
check('duration PT45M = 45', parse_iso8601_duration('PT45M') === 45);
check('duration PT2H = 120', parse_iso8601_duration('PT2H') === 120);
check('duration P0DT0H20M = 20', parse_iso8601_duration('P0DT0H20M') === 20);
check('duration null = 0', parse_iso8601_duration(null) === 0);
check('duration junk = 0', parse_iso8601_duration('banana') === 0);

// is_blocked_ip
check('block loopback', is_blocked_ip('127.0.0.1') === true);
check('block private 10', is_blocked_ip('10.1.2.3') === true);
check('block private 192.168', is_blocked_ip('192.168.0.1') === true);
check('block metadata 169.254', is_blocked_ip('169.254.169.254') === true);
check('block ipv6 loopback', is_blocked_ip('::1') === true);
check('block non-ip', is_blocked_ip('not-an-ip') === true);
check('allow public ip', is_blocked_ip('8.8.8.8') === false);

// ---- JSON-LD extraction ----
$html = '<html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
  {"@type":"WebPage","name":"ignore me"},
  {"@type":["Recipe","Thing"],
   "name":"Test Pancakes",
   "description":"Fluffy ones",
   "image":["https://img.test/a.jpg","https://img.test/b.jpg"],
   "author":{"@type":"Person","name":"Chef Ada"},
   "prepTime":"PT10M","cookTime":"PT20M","totalTime":"PT30M",
   "recipeYield":"4 servings",
   "recipeIngredient":["2 cups flour","1 tbsp sugar"," "],
   "recipeInstructions":[
     {"@type":"HowToStep","text":"Mix it"},
     {"@type":"HowToStep","text":"Cook it"}
   ]}
]}
</script></head><body>page</body></html>';

$r = extract_jsonld_recipe($html, 'https://blog.test/pancakes');
check('jsonld found a recipe', $r !== null);
check('jsonld title', $r['title'] === 'Test Pancakes');
check('jsonld description', $r['description'] === 'Fluffy ones');
check('jsonld image first url', $r['cover_image_url'] === 'https://img.test/a.jpg');
check('jsonld author name', $r['source_author'] === 'Chef Ada');
check('jsonld times', $r['prep_time_minutes'] === 10 && $r['cook_time_minutes'] === 20 && $r['total_time_minutes'] === 30);
check('jsonld yield split', $r['yield_amount'] === 4.0 && $r['yield_unit'] === 'servings');
check('jsonld source_url preserved', $r['source_url'] === 'https://blog.test/pancakes');
check('jsonld 2 ingredients (blank dropped)', count($r['ingredients']) === 2);
check('jsonld ingredient line in name', $r['ingredients'][0]['name'] === '2 cups flour' && $r['ingredients'][0]['quantity'] === '');
check('jsonld 2 instructions', count($r['instructions']) === 2 && $r['instructions'][1]['content'] === 'Cook it');

// instructions as plain strings + recipeYield as number
$html2 = '<script type="application/ld+json">{"@type":"Recipe","name":"Soup","recipeYield":2,"recipeInstructions":["Boil","Serve"]}</script>';
$r2 = extract_jsonld_recipe($html2, 'https://x.test/soup');
check('jsonld string instructions', count($r2['instructions']) === 2 && $r2['instructions'][0]['content'] === 'Boil');
check('jsonld numeric yield', $r2['yield_amount'] === 2.0);

// no recipe present
check('jsonld absent -> null', extract_jsonld_recipe('<html><body>nothing</body></html>', 'https://x.test') === null);

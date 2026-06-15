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
check('jsonld ingredient parsed qty/unit/name',
    $r['ingredients'][0]['quantity'] === '2'
    && $r['ingredients'][0]['unit'] === 'cups'
    && $r['ingredients'][0]['name'] === 'flour');
check('jsonld ingredient parsed tbsp',
    $r['ingredients'][1]['quantity'] === '1'
    && $r['ingredients'][1]['unit'] === 'tbsp'
    && $r['ingredients'][1]['name'] === 'sugar');

// ---- parse_ingredient_line (the qty/unit splitter) ----
$p = parse_ingredient_line('- ½ teaspoon black pepper (for steak)');
check('parse unicode frac + unit + prep',
    $p['quantity'] === '½' && $p['unit'] === 'teaspoon' && $p['name'] === 'black pepper' && $p['prep_note'] === 'for steak');
$p = parse_ingredient_line('4 tablespoons unsalted butter');
check('parse plural unit', $p['quantity'] === '4' && $p['unit'] === 'tablespoons' && $p['name'] === 'unsalted butter');
$p = parse_ingredient_line('2 garlic cloves (minced)');
check('parse qty, unknown-position unit stays in name',
    $p['quantity'] === '2' && $p['unit'] === '' && $p['name'] === 'garlic cloves' && $p['prep_note'] === 'minced');
$p = parse_ingredient_line('Pinch of kosher salt (for butter)');
check('parse leading unit, no qty, "of" dropped',
    $p['quantity'] === '' && $p['unit'] === 'Pinch' && $p['name'] === 'kosher salt' && $p['prep_note'] === 'for butter');
$p = parse_ingredient_line('Salt to taste');
check('parse plain text -> all in name', $p['quantity'] === '' && $p['unit'] === '' && $p['name'] === 'Salt to taste');
$p = parse_ingredient_line('1 ½ cups flour');
check('parse mixed number', $p['quantity'] === '1 ½' && $p['unit'] === 'cups' && $p['name'] === 'flour');
$p = parse_ingredient_line('500 g beef');
check('parse abbrev unit g', $p['quantity'] === '500' && $p['unit'] === 'g' && $p['name'] === 'beef');
check('jsonld 2 instructions', count($r['instructions']) === 2 && $r['instructions'][1]['content'] === 'Cook it');

// instructions as plain strings + recipeYield as number
$html2 = '<script type="application/ld+json">{"@type":"Recipe","name":"Soup","recipeYield":2,"recipeInstructions":["Boil","Serve"]}</script>';
$r2 = extract_jsonld_recipe($html2, 'https://x.test/soup');
check('jsonld string instructions', count($r2['instructions']) === 2 && $r2['instructions'][0]['content'] === 'Boil');
check('jsonld numeric yield', $r2['yield_amount'] === 2.0);

// no recipe present
check('jsonld absent -> null', extract_jsonld_recipe('<html><body>nothing</body></html>', 'https://x.test') === null);

// ---- parse_quantity (free-text qty -> decimal for the DB column) ----
check('qty blank -> null', parse_quantity('') === null);
check('qty null -> null', parse_quantity(null) === null);
check('qty integer', parse_quantity('4') === 4.0);
check('qty decimal', parse_quantity('1.5') === 1.5);
check('qty passthrough float', parse_quantity(2.5) === 2.5);
check('qty unicode half', parse_quantity('½') === 0.5);
check('qty unicode quarter', parse_quantity('¾') === 0.75);
check('qty mixed unicode', parse_quantity('1 ½') === 1.5);
check('qty ascii fraction', parse_quantity('1/2') === 0.5);
check('qty mixed ascii fraction', parse_quantity('1 1/2') === 1.5);
check('qty range -> null', parse_quantity('1-2') === null);
check('qty "1 to 2" -> null', parse_quantity('1 to 2') === null);
check('qty garbage -> null', parse_quantity('a pinch') === null);
check('qty divide by zero -> null', parse_quantity('1/0') === null);

// ---- Gemini mapper ----
$gem = [
  'title' => 'Gemini Stew',
  'description' => 'Hearty',
  'source_author' => 'Some Blog',
  'cover_image_url' => 'https://img.test/stew.jpg',
  'prep_time_minutes' => 15,
  'cook_time_minutes' => 90,
  'total_time_minutes' => 105,
  'yield_amount' => 6,
  'yield_unit' => 'bowls',
  'ingredients' => [
    ['quantity' => '500', 'unit' => 'g', 'name' => 'beef', 'prep_note' => 'cubed'],
    ['name' => 'salt'],
  ],
  'instructions' => [
    ['content' => 'Brown the beef'],
    ['content' => 'Simmer'],
  ],
];
$m = map_gemini_recipe($gem, 'https://blog.test/stew');
check('gemini title', $m['title'] === 'Gemini Stew');
check('gemini source_url', $m['source_url'] === 'https://blog.test/stew');
check('gemini times', $m['cook_time_minutes'] === 90 && $m['total_time_minutes'] === 105);
check('gemini yield', $m['yield_amount'] === 6.0 && $m['yield_unit'] === 'bowls');
check('gemini ingredient split', $m['ingredients'][0]['quantity'] === '500' && $m['ingredients'][0]['name'] === 'beef' && $m['ingredients'][0]['prep_note'] === 'cubed');
check('gemini ingredient partial', $m['ingredients'][1]['name'] === 'salt' && $m['ingredients'][1]['unit'] === '');
check('gemini instructions', count($m['instructions']) === 2 && $m['instructions'][0]['content'] === 'Brown the beef');

// empty/garbage gemini object still yields a safe form
$m2 = map_gemini_recipe([], 'https://x.test');
check('gemini empty -> default title', $m2['title'] === 'Imported Recipe');
check('gemini empty -> no ingredients', $m2['ingredients'] === []);

// ---- Photo import: image MIME mapping ----
check('mime jpeg', image_mime_from_type(IMAGETYPE_JPEG) === 'image/jpeg');
check('mime png',  image_mime_from_type(IMAGETYPE_PNG)  === 'image/png');
check('mime webp', image_mime_from_type(IMAGETYPE_WEBP) === 'image/webp');
check('mime gif',  image_mime_from_type(IMAGETYPE_GIF)  === 'image/gif');
check('mime unsupported -> empty', image_mime_from_type(IMAGETYPE_BMP) === '');

// ---- Photo import: Gemini image payload ----
$payload = build_gemini_image_payload([
    ['mime' => 'image/jpeg', 'data_b64' => 'AAA'],
    ['mime' => 'image/png',  'data_b64' => 'BBB'],
]);
$parts = $payload['contents'][0]['parts'];
check('payload text part first', isset($parts[0]['text']) && $parts[0]['text'] !== '');
check('payload inline part per image', isset($parts[1]['inline_data']) && isset($parts[2]['inline_data']));
check('payload inline mime', $parts[1]['inline_data']['mime_type'] === 'image/jpeg');
check('payload inline data', $parts[2]['inline_data']['data'] === 'BBB');
check('payload requests json', $payload['generationConfig']['responseMimeType'] === 'application/json');

// ---- Photo import: model response parsing ----
check('parse valid recipe', is_array(parse_gemini_recipe_json('{"title":"X","ingredients":[{"name":"a"}]}')));
check('parse blank -> null', parse_gemini_recipe_json('   ') === null);
check('parse non-json -> null', parse_gemini_recipe_json('not json') === null);
check('parse not-a-recipe -> null', parse_gemini_recipe_json('{"title":""}') === null);
check('parse title-only is a recipe', is_array(parse_gemini_recipe_json('{"title":"Soup"}')));

// ---- Photo import: $_FILES normalisation ----
$multi = ['name'=>['a.jpg','b.png'],'type'=>['image/jpeg','image/png'],
          'tmp_name'=>['/tmp/a','/tmp/b'],'error'=>[0,0],'size'=>[10,20]];
$norm = normalize_uploaded_files($multi);
check('normalize multi count', count($norm) === 2);
check('normalize multi maps tmp', $norm[1]['tmp_name'] === '/tmp/b');
$single = ['name'=>'a.jpg','type'=>'image/jpeg','tmp_name'=>'/tmp/a','error'=>0,'size'=>10];
check('normalize single count', count(normalize_uploaded_files($single)) === 1);
check('normalize null -> empty', normalize_uploaded_files(null) === []);
$skip = ['name'=>['a','b'],'type'=>['',''],'tmp_name'=>['','/tmp/b'],'error'=>[4,0],'size'=>[0,5]];
check('normalize skips empty tmp', count(normalize_uploaded_files($skip)) === 1);

<?php
reset_cookies();
$email = 'recipes_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'R']);

$payload = [
    'title' => 'Pancakes', 'description' => 'Fluffy', 'cover_image_url' => '',
    'source_url' => 'https://x.test/p', 'source_author' => 'Chef', 'folder_id' => null,
    'prep_time_minutes' => 5, 'cook_time_minutes' => 10, 'total_time_minutes' => 15,
    'yield_amount' => 2, 'yield_unit' => 'servings', 'notes' => 'hot',
    'tagIds' => [],
    'ingredients' => [
        ['quantity' => '2', 'unit' => 'cups', 'name' => 'flour', 'prep_note' => 'sifted', 'group_name' => ''],
        ['quantity' => '', 'unit' => '', 'name' => 'salt', 'prep_note' => '', 'group_name' => ''],
    ],
    'instructions' => [
        ['content' => 'Mix', 'timer_seconds' => '', 'group_name' => ''],
        ['content' => 'Cook', 'timer_seconds' => '120', 'group_name' => ''],
    ],
];
$c = api('POST', '/recipes', $payload);
check('create recipe 200', $c['status'] === 200);
$rid = $c['json']['data']['id'] ?? null;
check('create returns id', !empty($rid));

$get = api('GET', "/recipes/$rid");
check('recipe source_type derived web', ($get['json']['data']['source_type'] ?? '') === 'web');
check('recipe is_favorite is bool false', ($get['json']['data']['is_favorite'] ?? 'x') === false);
check('recipe yield_amount is number', is_numeric($get['json']['data']['yield_amount'] ?? null) && (float)$get['json']['data']['yield_amount'] === 2.0);

$ings = api('GET', "/recipes/$rid/ingredients");
check('2 ingredients, ordered', count($ings['json']['data'] ?? []) === 2 && $ings['json']['data'][0]['name'] === 'flour');
check('ingredient quantity number-or-null', (float)$ings['json']['data'][0]['quantity'] === 2.0 && $ings['json']['data'][1]['quantity'] === null);
check('ingredient raw_text composed', str_contains($ings['json']['data'][0]['raw_text'], 'flour'));

$steps = api('GET', "/recipes/$rid/instructions");
check('2 instructions w/ step_number', count($steps['json']['data'] ?? []) === 2 && $steps['json']['data'][1]['step_number'] === 2);
check('timer_seconds parsed', $steps['json']['data'][0]['timer_seconds'] === null && $steps['json']['data'][1]['timer_seconds'] === 120);

// Partial PATCH: favourite toggle
$fav = api('PATCH', "/recipes/$rid", ['is_favorite' => true]);
check('favorite toggle 200', $fav['status'] === 200);
$get2 = api('GET', "/recipes/$rid");
check('favorite now true', ($get2['json']['data']['is_favorite'] ?? false) === true);

// Full PATCH: change title + replace children
$payload['title'] = 'Waffles';
$payload['ingredients'] = [['quantity' => '1', 'unit' => 'cup', 'name' => 'milk', 'prep_note' => '', 'group_name' => '']];
$upd = api('PATCH', "/recipes/$rid", $payload);
check('full update 200', $upd['status'] === 200);
$ings2 = api('GET', "/recipes/$rid/ingredients");
check('children replaced (1 ingredient: milk)', count($ings2['json']['data']) === 1 && $ings2['json']['data'][0]['name'] === 'milk');

// Duplicate
$dup = api('POST', "/recipes/$rid/duplicate");
check('duplicate 200 returns id', $dup['status'] === 200 && !empty($dup['json']['data']['id']));
$list = api('GET', '/recipes');
check('now 2 recipes', count($list['json']['data']) === 2);

// Share + resolve
$share = api('POST', "/recipes/$rid/share");
$token = $share['json']['data']['token'] ?? null;
check('share returns token', !empty($token));
$resolve = api('GET', "/recipes/shared/$token");
check('resolve token -> recipe_id', ($resolve['json']['data']['recipe_id'] ?? '') === $rid);

// --- share publish is idempotent + revoke works ---
$pub1 = api('POST', "/recipes/$rid/share");
$pub2 = api('POST', "/recipes/$rid/share");
check('share publish idempotent (same token)',
    $pub1['status'] === 200 && $pub2['status'] === 200
    && $pub1['json']['data']['token'] === $pub2['json']['data']['token']);

$tok = $pub1['json']['data']['token'];
$before = api('GET', "/public/recipes/$tok", null, false);
check('public link live while published', $before['status'] === 200);

$rev = api('DELETE', "/recipes/$rid/share");
check('revoke ok', $rev['status'] === 200);

$after = api('GET', "/public/recipes/$tok", null, false);
check('public link 404s after revoke', $after['status'] === 404);

// Delete (cascade children)
$del = api('DELETE', "/recipes/$rid");
check('delete 200', $del['status'] === 200);
$gone = api('GET', "/recipes/$rid");
check('deleted recipe 404', $gone['status'] === 404);

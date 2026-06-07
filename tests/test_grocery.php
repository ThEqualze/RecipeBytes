<?php
reset_cookies();
$email = 'groc_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'G']);

// empty state
$g0 = api('GET', '/grocery-list');
check('grocery 200', $g0['status'] === 200);
check('no active list yet', $g0['json']['data']['list'] === null);
check('items empty', count($g0['json']['data']['items'] ?? []) === 0);

// add a manual item (auto-creates list)
$a = api('POST', '/grocery-list/items', ['name' => 'Milk']);
check('add item 200', $a['status'] === 200);
check('item name Milk', ($a['json']['data']['name'] ?? '') === 'Milk');
check('item is_checked bool false', ($a['json']['data']['is_checked'] ?? 'x') === false);

$g1 = api('GET', '/grocery-list');
check('active list now exists', !empty($g1['json']['data']['list']['id']));
check('1 item', count($g1['json']['data']['items']) === 1);
$itemId = $g1['json']['data']['items'][0]['id'];

// toggle checked
$t = api('PATCH', "/grocery-list/items/$itemId", ['is_checked' => true]);
check('toggle 200', $t['status'] === 200);
$g2 = api('GET', '/grocery-list');
check('item now checked', $g2['json']['data']['items'][0]['is_checked'] === true);

// add from recipe
$payload = ['title' => 'Soup', 'description' => '', 'cover_image_url' => '', 'source_url' => '',
    'source_author' => '', 'folder_id' => null, 'prep_time_minutes' => 0, 'cook_time_minutes' => 0,
    'total_time_minutes' => 0, 'yield_amount' => 1, 'yield_unit' => 'servings', 'notes' => '', 'tagIds' => [],
    'ingredients' => [['quantity' => '1', 'unit' => 'can', 'name' => 'tomatoes', 'prep_note' => '', 'group_name' => '']],
    'instructions' => []];
$rid = api('POST', '/recipes', $payload)['json']['data']['id'];
$fr = api('POST', '/grocery-list/items/from-recipe', ['recipe_id' => $rid]);
check('from-recipe 200 inserts 1', $fr['status'] === 200 && count($fr['json']['data']) === 1);
check('from-recipe item carries recipe_id', ($fr['json']['data'][0]['recipe_id'] ?? '') === $rid);

// clear checked (removes the Milk item, keeps tomatoes)
$cc = api('POST', '/grocery-list/clear-checked');
check('clear-checked 200', $cc['status'] === 200);
$g3 = api('GET', '/grocery-list');
check('only unchecked remain', count($g3['json']['data']['items']) === 1 && $g3['json']['data']['items'][0]['name'] === 'tomatoes');

// isolation: another user cannot toggle this item
reset_cookies();
api('POST', '/auth/signup', ['email' => 'groc2_' . bin2hex(random_bytes(4)) . '@example.com', 'password' => 'secret123', 'display_name' => 'G2']);
$cross = api('PATCH', "/grocery-list/items/$itemId", ['is_checked' => false]);
check('cross-user item toggle forbidden/notfound', in_array($cross['status'], [403, 404], true));

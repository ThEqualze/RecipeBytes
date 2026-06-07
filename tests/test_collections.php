<?php
reset_cookies();
$email = 'coll_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'C']);

$c = api('POST', '/collections', ['title' => 'Weeknight', 'description' => 'fast']);
check('create collection 200', $c['status'] === 200);
$cid = $c['json']['data']['id'] ?? null;
check('collection has id + share_token', !empty($cid) && !empty($c['json']['data']['share_token']));
check('is_public bool false', ($c['json']['data']['is_public'] ?? 'x') === false);

$list = api('GET', '/collections');
check('list has 1 collection', count($list['json']['data'] ?? []) === 1);

$upd = api('PATCH', "/collections/$cid", ['is_public' => true, 'title' => 'Weeknight Dinners']);
check('update 200', $upd['status'] === 200);
$list2 = api('GET', '/collections');
check('updated is_public true', $list2['json']['data'][0]['is_public'] === true);

// add a recipe to the collection
$rid = api('POST', '/recipes', ['title' => 'Tacos', 'description' => '', 'cover_image_url' => '', 'source_url' => '',
    'source_author' => '', 'folder_id' => null, 'prep_time_minutes' => 0, 'cook_time_minutes' => 0,
    'total_time_minutes' => 0, 'yield_amount' => 1, 'yield_unit' => 'servings', 'notes' => '',
    'tagIds' => [], 'ingredients' => [], 'instructions' => []])['json']['data']['id'];
$add = api('POST', "/collections/$cid/recipes", ['recipe_id' => $rid]);
check('add recipe to collection 200', $add['status'] === 200);
$cr = api('GET', "/collections/$cid/recipes");
check('collection has 1 recipe', count($cr['json']['data'] ?? []) === 1 && $cr['json']['data'][0]['recipe_id'] === $rid);

$rm = api('DELETE', "/collections/$cid/recipes/$rid");
check('remove recipe 200', $rm['status'] === 200);
check('collection now empty', count(api('GET', "/collections/$cid/recipes")['json']['data']) === 0);

// isolation
reset_cookies();
api('POST', '/auth/signup', ['email' => 'coll2_' . bin2hex(random_bytes(4)) . '@example.com', 'password' => 'secret123', 'display_name' => 'C2']);
check('cross-user sees 0 collections', count(api('GET', '/collections')['json']['data']) === 0);
check('cross-user cannot read collection recipes', in_array(api('GET', "/collections/$cid/recipes")['status'], [403, 404], true));
check('cross-user cannot delete collection', in_array(api('DELETE', "/collections/$cid")['status'], [403, 404], true));

// C2 cannot add C1's recipe to a C2 collection, and cannot add to C1's collection
$c2coll = api('POST', '/collections', ['title' => 'C2 coll', 'description' => '']);
$c2cid = $c2coll['json']['data']['id'];
$foreignAdd = api('POST', "/collections/$c2cid/recipes", ['recipe_id' => $rid]);
check('cannot add a recipe you do not own (403/404)', in_array($foreignAdd['status'], [403, 404], true));

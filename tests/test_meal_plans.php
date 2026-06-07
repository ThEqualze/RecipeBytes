<?php
reset_cookies();
$email = 'meal_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'M']);
$rid = api('POST', '/recipes', ['title' => 'Dinner', 'description' => '', 'cover_image_url' => '', 'source_url' => '',
    'source_author' => '', 'folder_id' => null, 'prep_time_minutes' => 0, 'cook_time_minutes' => 0,
    'total_time_minutes' => 0, 'yield_amount' => 1, 'yield_unit' => 'servings', 'notes' => '',
    'tagIds' => [], 'ingredients' => [], 'instructions' => []])['json']['data']['id'];

$add = api('POST', '/meal-plans', ['recipe_id' => $rid, 'planned_date' => '2026-06-10', 'meal_type' => 'dinner']);
check('add meal 200', $add['status'] === 200);
$mpId = $add['json']['data']['id'] ?? null;
check('meal has id + position 0', !empty($mpId) && ($add['json']['data']['position'] ?? null) === 0);

$inRange = api('GET', '/meal-plans?from=2026-06-08&to=2026-06-14');
check('meal in range', count($inRange['json']['data'] ?? []) === 1);
$outRange = api('GET', '/meal-plans?from=2026-07-01&to=2026-07-07');
check('meal not in other range', count($outRange['json']['data'] ?? []) === 0);

$move = api('PATCH', "/meal-plans/$mpId", ['planned_date' => '2026-06-11', 'meal_type' => 'lunch']);
check('move meal 200', $move['status'] === 200);
$after = api('GET', '/meal-plans?from=2026-06-08&to=2026-06-14');
check('moved date/type', $after['json']['data'][0]['planned_date'] === '2026-06-11' && $after['json']['data'][0]['meal_type'] === 'lunch');

$del = api('DELETE', "/meal-plans/$mpId");
check('delete meal 200', $del['status'] === 200);

reset_cookies();
api('POST', '/auth/signup', ['email' => 'meal2_' . bin2hex(random_bytes(4)) . '@example.com', 'password' => 'secret123', 'display_name' => 'M2']);
check('cross-user meal delete forbidden/notfound', in_array(api('DELETE', "/meal-plans/$mpId")['status'], [403, 404], true));

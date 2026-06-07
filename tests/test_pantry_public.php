<?php
reset_cookies();
$email = 'pan_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'P']);
$rid = api('POST', '/recipes', ['title' => 'Stew', 'description' => 'd', 'cover_image_url' => '', 'source_url' => '',
    'source_author' => '', 'folder_id' => null, 'prep_time_minutes' => 0, 'cook_time_minutes' => 0,
    'total_time_minutes' => 0, 'yield_amount' => 1, 'yield_unit' => 'servings', 'notes' => '', 'tagIds' => [],
    'ingredients' => [['quantity' => '2', 'unit' => 'cups', 'name' => 'beef', 'prep_note' => '', 'group_name' => '']],
    'instructions' => [['content' => 'Secret step', 'timer_seconds' => '', 'group_name' => '']]])['json']['data']['id'];

// pantry
$p = api('GET', '/pantry/ingredients');
check('pantry 200 + array', $p['status'] === 200 && is_array($p['json']['data']));
check('pantry has beef for this recipe', count(array_filter($p['json']['data'], fn($i) => $i['name'] === 'beef' && $i['recipe_id'] === $rid)) === 1);
reset_cookies();
check('pantry requires auth (401)', api('GET', '/pantry/ingredients')['status'] === 401);

// share the recipe (need to be logged in as owner again)
api('POST', '/auth/login', ['email' => $email, 'password' => 'secret123']);
$token = api('POST', "/recipes/$rid/share")['json']['data']['token'];

// public view WITHOUT auth
reset_cookies();
$pub = api('GET', "/public/recipes/$token");
check('public recipe 200', $pub['status'] === 200);
check('public returns recipe title', ($pub['json']['data']['recipe']['title'] ?? '') === 'Stew');
check('public returns ingredients', count($pub['json']['data']['ingredients'] ?? []) === 1);
check('public OMITS instructions key', !isset($pub['json']['data']['instructions']));

$bad = api('GET', '/public/recipes/deadbeef');
check('unknown token 404', $bad['status'] === 404);

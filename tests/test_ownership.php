<?php
// Two users; each creates a recipe; neither may read the other's.
reset_cookies();
$ea = 'owner_a_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $ea, 'password' => 'secret123', 'display_name' => 'A']);
$ra = api('POST', '/recipes', ['title' => 'A secret recipe']);
$aId = $ra['json']['data']['id'] ?? null;
check('user A created a recipe', !empty($aId));

$listA = api('GET', '/recipes');
check('user A sees exactly 1 recipe', count($listA['json']['data'] ?? []) === 1);

reset_cookies();
$eb = 'owner_b_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $eb, 'password' => 'secret123', 'display_name' => 'B']);

$listB = api('GET', '/recipes');
check('user B sees 0 recipes (isolation)', count($listB['json']['data'] ?? []) === 0);

$crossGet = api('GET', "/recipes/$aId");
check('user B forbidden from A recipe (403)', $crossGet['status'] === 403);

// Unauthenticated cannot list recipes
reset_cookies();
$anon = api('GET', '/recipes');
check('anonymous cannot list recipes (401)', $anon['status'] === 401);

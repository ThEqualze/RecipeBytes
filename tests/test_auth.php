<?php
// Signup returns the new user and sets a session
reset_cookies();
$email = 'alice_' . bin2hex(random_bytes(4)) . '@example.com';
$r = api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'Alice']);
check('signup returns 200', $r['status'] === 200);
check('signup returns user id', !empty($r['json']['data']['id']));
check('signup returns email', ($r['json']['data']['email'] ?? null) === $email);

// Session endpoint now reports the logged-in user (cookie persisted in jar)
$s = api('GET', '/auth/session');
check('session returns the user', ($s['json']['data']['email'] ?? null) === $email);

// Duplicate email rejected
$dup = api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'Alice2']);
check('duplicate email rejected 409', $dup['status'] === 409);

// Logout clears the session
$out = api('POST', '/auth/logout');
check('logout returns 200', $out['status'] === 200);
$s2 = api('GET', '/auth/session');
check('session is null after logout', array_key_exists('data', $s2['json']) && $s2['json']['data'] === null);

// Login with correct password works
reset_cookies();
$login = api('POST', '/auth/login', ['email' => $email, 'password' => 'secret123']);
check('login returns 200', $login['status'] === 200);

// Login with wrong password rejected
reset_cookies();
$bad = api('POST', '/auth/login', ['email' => $email, 'password' => 'wrong']);
check('bad password rejected 401', $bad['status'] === 401);

<?php
reset_cookies();
$email = 'misc_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'M']);

// recipe-tags: empty for a fresh user
$rt = api('GET', '/recipe-tags');
check('recipe-tags 200 + array', $rt['status'] === 200 && is_array($rt['json']['data']));
check('recipe-tags empty for new user', count($rt['json']['data']) === 0);

// extraction-jobs: empty array, 200
$ej = api('GET', '/extraction-jobs');
check('extraction-jobs 200 + array', $ej['status'] === 200 && is_array($ej['json']['data']));

// both require auth
reset_cookies();
check('recipe-tags require auth (401)', api('GET', '/recipe-tags')['status'] === 401);
check('extraction-jobs require auth (401)', api('GET', '/extraction-jobs')['status'] === 401);

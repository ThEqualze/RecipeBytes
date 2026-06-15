<?php
reset_cookies();
// unauthenticated -> 401
check('import requires auth (401)', api('POST', '/import', ['url' => 'https://example.com'])['status'] === 401);

$email = 'import_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $email, 'password' => 'secret123', 'display_name' => 'I']);

check('missing url -> 400', api('POST', '/import', [])['status'] === 400);
check('non-http scheme -> 400', api('POST', '/import', ['url' => 'ftp://example.com/x'])['status'] === 400);
check('loopback blocked -> 400', api('POST', '/import', ['url' => 'http://127.0.0.1/'])['status'] === 400);
check('private ip blocked -> 400', api('POST', '/import', ['url' => 'http://10.0.0.1/'])['status'] === 400);
check('metadata ip blocked -> 400', api('POST', '/import', ['url' => 'http://169.254.169.254/latest/meta-data/'])['status'] === 400);
check('garbage url -> 400', api('POST', '/import', ['url' => 'not a url'])['status'] === 400);

// ---- Photo import endpoint ----
reset_cookies();
check('photo import requires auth (401)', api('POST', '/import/photo', [])['status'] === 401);

$pemail = 'photo_' . bin2hex(random_bytes(4)) . '@example.com';
api('POST', '/auth/signup', ['email' => $pemail, 'password' => 'secret123', 'display_name' => 'P']);
// No multipart files in this JSON request -> $_FILES is empty -> 400 (before the key check).
check('photo import no files -> 400', api('POST', '/import/photo', [])['status'] === 400);

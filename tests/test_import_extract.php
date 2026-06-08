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

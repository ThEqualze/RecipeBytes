<?php
require __DIR__ . '/harness.php';

// Reset all data between full test runs (truncate in FK-safe order).
$cfg = require __DIR__ . '/../api/config.php';
$pdo = new PDO(
    "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']};charset={$cfg['db_charset']}",
    $cfg['db_user'], $cfg['db_pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach (['sessions','users','profiles','folders','tags','recipes','ingredients',
          'instructions','recipe_tags','extraction_jobs','grocery_lists',
          'grocery_list_items','shared_recipes','meal_plans','collections',
          'collection_recipes'] as $t) {
    $pdo->exec("TRUNCATE TABLE `$t`");
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

foreach (glob(__DIR__ . '/test_*.php') as $file) {
    echo "\n== " . basename($file) . " ==\n";
    reset_cookies();
    require $file;
}

echo "\n----------------------------\n";
echo "Ran $TESTS_RUN checks, $TESTS_FAILED failed\n";
exit($TESTS_FAILED > 0 ? 1 : 0);

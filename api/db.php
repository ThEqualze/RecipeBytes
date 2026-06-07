<?php
function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $configPath = __DIR__ . '/config.php';
    if (!file_exists($configPath)) {
        http_response_code(500);
        echo json_encode(['error' => 'Server config missing']);
        exit;
    }
    $cfg = require $configPath;
    // Charset is applied via INIT_COMMAND (SET NAMES) rather than the DSN,
    // because some hosts' MySQL client rejects `charset=` in the DSN with
    // "[2019] Unknown character set". SET NAMES is equivalent and portable.
    $dsn = "mysql:host={$cfg['db_host']};dbname={$cfg['db_name']}";
    $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES ' . $cfg['db_charset'],
    ]);
    return $pdo;
}

function app_config(): array {
    return require __DIR__ . '/config.php';
}

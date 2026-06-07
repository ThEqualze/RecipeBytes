<?php
$BASE = getenv('API_BASE') ?: 'http://127.0.0.1:8000/api';
$COOKIE_JAR = sys_get_temp_dir() . '/recipebytes_test_cookies.txt';
$TESTS_RUN = 0;
$TESTS_FAILED = 0;

function api(string $method, string $path, ?array $body = null, bool $useCookies = true): array {
    global $BASE, $COOKIE_JAR;
    $ch = curl_init($BASE . $path);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    if ($useCookies) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $COOKIE_JAR);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $COOKIE_JAR);
    }
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $code, 'json' => json_decode($resp, true)];
}

function reset_cookies(): void {
    global $COOKIE_JAR;
    if (file_exists($COOKIE_JAR)) unlink($COOKIE_JAR);
}

function check(string $label, bool $cond): void {
    global $TESTS_RUN, $TESTS_FAILED;
    $TESTS_RUN++;
    if ($cond) {
        echo "  PASS: $label\n";
    } else {
        $TESTS_FAILED++;
        echo "  FAIL: $label\n";
    }
}

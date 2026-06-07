<?php
// Discard any stray output buffered before the JSON (e.g. a UTF-8 BOM or
// whitespace accidentally added to an included file like config.php by a
// web-based editor). This keeps responses valid JSON and lets header() run.
function clear_stray_output(): void {
    while (ob_get_level() > 0 && ob_get_length() > 0) {
        ob_clean();
    }
}

function json_ok($data = null, int $status = 200): void {
    clear_stray_output();
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['data' => $data]);
    exit;
}

function json_error(string $message, int $status = 400): void {
    clear_stray_output();
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['error' => $message]);
    exit;
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

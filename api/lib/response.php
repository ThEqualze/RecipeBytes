<?php
function json_ok($data = null, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode(['data' => $data]);
    exit;
}

function json_error(string $message, int $status = 400): void {
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

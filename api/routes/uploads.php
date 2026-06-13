<?php
require_once __DIR__ . '/../auth.php';
require_once __DIR__ . '/../lib/uploads.php';

$path   = $GLOBALS['ROUTE_PATH'];
$method = $GLOBALS['ROUTE_METHOD'];
$user   = require_auth();

if ($path === '/uploads' && $method === 'POST') {
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        json_error('No file was uploaded.', 400);
    }
    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        // e.g. UPLOAD_ERR_INI_SIZE when the file exceeds the server's limit.
        json_error('Upload failed — the file may be too large.', 400);
    }

    $check = validate_image_upload((string)($file['tmp_name'] ?? ''));
    if ($check['error'] !== null) {
        json_error($check['error'], 400);
    }

    // dirname(__DIR__) is the API root (api/), whose parent is the web root.
    $paths = uploads_paths(app_config(), dirname(__DIR__));
    if (!ensure_uploads_dir($paths['dir'])) {
        json_error('Upload storage is unavailable.', 500);
    }

    $name = uuid4() . '.' . $check['ext'];
    $dest = $paths['dir'] . '/' . $name;
    if (!move_uploaded_file($file['tmp_name'], $dest)) {
        json_error('Could not save the uploaded file.', 500);
    }

    json_ok(['url' => $paths['base_url'] . '/' . $name]);
}

<?php
// Pure helpers for cover-image uploads. NO DB or network I/O.

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Allowed image types (from getimagesize) -> safe file extension.
function upload_allowed_types(): array {
    return [
        IMAGETYPE_JPEG => 'jpg',
        IMAGETYPE_PNG  => 'png',
        IMAGETYPE_WEBP => 'webp',
        IMAGETYPE_GIF  => 'gif',
    ];
}

// Validate a just-uploaded image by size and by sniffing the real bytes.
// Returns ['ext' => 'jpg', 'error' => null] on success,
// or ['ext' => null, 'error' => '<reason>'] on failure.
function validate_image_upload(int $size, string $tmpPath): array {
    if ($size <= 0) {
        return ['ext' => null, 'error' => 'The file is empty.'];
    }
    if ($size > UPLOAD_MAX_BYTES) {
        return ['ext' => null, 'error' => 'Image must be 5 MB or smaller.'];
    }
    $info = @getimagesize($tmpPath);
    if ($info === false || !isset($info[2])) {
        return ['ext' => null, 'error' => 'That file is not a valid image.'];
    }
    $allowed = upload_allowed_types();
    if (!isset($allowed[$info[2]])) {
        return ['ext' => null, 'error' => 'Unsupported image type. Use JPEG, PNG, WebP, or GIF.'];
    }
    return ['ext' => $allowed[$info[2]], 'error' => null];
}

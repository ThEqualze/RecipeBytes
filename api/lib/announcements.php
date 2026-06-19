<?php
// Phase 7: announcement domain logic shared by the public and admin routes.

require_once __DIR__ . '/../db.php';

const ANNOUNCEMENT_TYPES = ['info', 'warning', 'critical'];

// SQL fragment: a row is "currently active" when the active flag is on and now()
// falls inside its [starts_at, ends_at) window (NULL bounds = open-ended).
function announcement_active_sql(): string {
    return "is_active = 1
            AND (starts_at IS NULL OR starts_at <= UTC_TIMESTAMP())
            AND (ends_at   IS NULL OR ends_at   >  UTC_TIMESTAMP())";
}

// The single newest currently-active announcement, in public shape, or null.
function active_announcement(): ?array {
    $row = db()->query(
        'SELECT id, message, type, link_label, link_url
           FROM announcements
          WHERE ' . announcement_active_sql() . '
          ORDER BY created_at DESC
          LIMIT 1'
    )->fetch();
    if (!$row) return null;
    return [
        'id'         => $row['id'],
        'message'    => $row['message'],
        'type'       => $row['type'],
        'link_label' => $row['link_label'],
        'link_url'   => $row['link_url'],
    ];
}

// Lifecycle label for the admin list, computed against now (UTC).
// off | scheduled | live | expired
function announcement_status(array $row, string $nowUtc): string {
    if ((int)$row['is_active'] !== 1) return 'off';
    if ($row['ends_at']   !== null && $row['ends_at']   <= $nowUtc) return 'expired';
    if ($row['starts_at'] !== null && $row['starts_at'] >  $nowUtc) return 'scheduled';
    return 'live';
}

// Validate + normalise admin input. Returns ['errors' => string[], 'fields' => array].
// fields keys: message, type, link_label, link_url, is_active, starts_at, ends_at.
function validate_announcement(array $in): array {
    $errors = [];

    $message = trim((string)($in['message'] ?? ''));
    if ($message === '')            $errors[] = 'Message is required.';
    if (mb_strlen($message) > 280)  $errors[] = 'Message must be 280 characters or fewer.';

    $type = (string)($in['type'] ?? 'info');
    if (!in_array($type, ANNOUNCEMENT_TYPES, true)) $errors[] = 'Invalid type.';

    // Link is all-or-nothing.
    $linkLabel = trim((string)($in['link_label'] ?? ''));
    $linkUrl   = trim((string)($in['link_url'] ?? ''));
    if (($linkLabel === '') !== ($linkUrl === '')) {
        $errors[] = 'A link needs both a label and a URL.';
    }
    if ($linkLabel !== '' && mb_strlen($linkLabel) > 60) {
        $errors[] = 'Link label must be 60 characters or fewer.';
    }
    if ($linkUrl !== '') {
        $okAbs = (bool)preg_match('#^https?://#i', $linkUrl);
        $okRel = str_starts_with($linkUrl, '/');
        if (!$okAbs && !$okRel) $errors[] = 'Link URL must start with http(s):// or /.';
        if (mb_strlen($linkUrl) > 500) $errors[] = 'Link URL is too long.';
    }

    $isActive = !empty($in['is_active']) ? 1 : 0;

    // Datetime windows: accept '' / null as "unset". Expect 'YYYY-MM-DD HH:MM:SS'
    // or the HTML 'YYYY-MM-DDTHH:MM' form (normalised below).
    $startsAt = announcement_norm_dt($in['starts_at'] ?? null);
    $endsAt   = announcement_norm_dt($in['ends_at'] ?? null);
    if ($startsAt === false) $errors[] = 'Invalid start time.';
    if ($endsAt   === false) $errors[] = 'Invalid end time.';
    if (is_string($startsAt) && is_string($endsAt) && $endsAt <= $startsAt) {
        $errors[] = 'End time must be after start time.';
    }

    return [
        'errors' => $errors,
        'fields' => [
            'message'    => $message,
            'type'       => $type,
            'link_label' => $linkLabel === '' ? null : $linkLabel,
            'link_url'   => $linkUrl === '' ? null : $linkUrl,
            'is_active'  => $isActive,
            'starts_at'  => $startsAt === false ? null : $startsAt,
            'ends_at'    => $endsAt === false ? null : $endsAt,
        ],
    ];
}

// Normalise a datetime input to 'YYYY-MM-DD HH:MM:SS' (UTC, as sent) or null when
// unset. Returns false when present but unparseable.
function announcement_norm_dt($v) {
    if ($v === null || $v === '') return null;
    if (!is_string($v)) return false;
    $v = str_replace('T', ' ', trim($v));
    $ts = strtotime($v);
    if ($ts === false) return false;
    return gmdate('Y-m-d H:i:s', $ts);
}

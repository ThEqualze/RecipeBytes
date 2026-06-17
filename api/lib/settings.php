<?php
// Global key/value settings, overriding config.php where set (e.g. the active AI model).

require_once __DIR__ . '/../db.php';

function get_setting(string $key, ?string $default = null): ?string {
    $stmt = db()->prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?');
    $stmt->execute([$key]);
    $v = $stmt->fetchColumn();
    return ($v === false || $v === null) ? $default : (string)$v;
}

function set_setting(string $key, string $value): void {
    db()->prepare(
        'INSERT INTO system_settings (setting_key, setting_value, updated_at)
         VALUES (?,?,UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = UTC_TIMESTAMP()'
    )->execute([$key, $value]);
}

// The active AI model: admin override (system_settings) > config > built-in default.
function active_ai_model(array $cfg): string {
    $cfgModel = (is_string($cfg['gemini_model'] ?? null) && $cfg['gemini_model'] !== '') ? $cfg['gemini_model'] : 'gemini-2.5-flash';
    return get_setting('gemini_model', $cfgModel) ?: $cfgModel;
}

<?php
// Usage-threshold notification emails (80% warning, 100% limit reached).

require_once __DIR__ . '/mailer.php';

function send_usage_warning_email(string $email, string $jobLabel, int $used, int $limit): void {
    $subject = "You're nearing your RecipeBytes $jobLabel limit";
    $url = app_base_url();
    $cta = $url !== '' ? "<p><a href=\"" . htmlspecialchars($url, ENT_QUOTES) . "\">Upgrade to Pro</a> for unlimited.</p>" : '';
    $html = "<p>Heads up — you've used <strong>$used of $limit</strong> $jobLabel this month.</p>$cta";
    $text = "You've used $used of $limit $jobLabel this month. Upgrade to Pro for unlimited." . ($url ? " $url" : '');
    send_mail($email, $subject, $html, $text);
}

function send_limit_reached_email(string $email, string $jobLabel, int $limit): void {
    $subject = "You've reached your RecipeBytes $jobLabel limit";
    $url = app_base_url();
    $cta = $url !== '' ? "<p><a href=\"" . htmlspecialchars($url, ENT_QUOTES) . "\">Upgrade to Pro</a> for unlimited imports.</p>" : '';
    $html = "<p>You've used all <strong>$limit</strong> $jobLabel for this month.</p>$cta";
    $text = "You've used all $limit $jobLabel this month. Upgrade to Pro for unlimited imports." . ($url ? " $url" : '');
    send_mail($email, $subject, $html, $text);
}

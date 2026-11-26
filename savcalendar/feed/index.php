<?php
/**
 * SavCalendar — the feed: a calendar as an .ics file for Google Calendar, Outlook, Apple Calendar, Thunderbird… which
 * subscribe to it and read it again by themselves (each at its own pace: Apple and Thunderbird every hour or so, Outlook
 * every few hours, Google up to once a day). No account: the private link is the key, and it can be changed (the old
 * one stops working at once).
 *   feed/<token>.ics   one calendar of one's own, or "everything" (all own calendars and what comes from SavSchedules)
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require dirname(__DIR__, 2) . '/savschedules/lib/sched.php';
require __DIR__ . '/../lib/ics.php';
require __DIR__ . '/../lib/cal.php';

header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

function gone(int $code, string $text): void
{
    http_response_code($code);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo $text, "\n";
    exit;
}

if (!credentials()) gone(503, 'Not installed');
$token = (string)($_GET['t'] ?? '');
if (!preg_match('/^[a-f0-9]{32}$/', $token)) gone(404, 'Not found');
if (too_many_attempts('feed_miss', 30, 10)) gone(429, 'Too many requests');

$cal = q('SELECT c.*, u.status ustatus FROM ' . t('cal_calendars') . ' c JOIN ' . t('users') . ' u ON u.id = c.user_id WHERE c.feed_token = ?', [$token])->fetch();
$all = $cal ? null : q('SELECT u.*, p.user_id, p.prefs FROM ' . t('cal_profiles') . ' p JOIN ' . t('users') . ' u ON u.id = p.user_id WHERE p.feed_token = ?', [$token])->fetch(); // p.prefs wins over the prefs of SavSchedules
if (!$cal && !$all) {
    record_attempt('feed_miss');
    gone(404, 'Not found');
}
if (($cal['ustatus'] ?? $all['status']) !== 'active') gone(404, 'Not found');

if ($cal) {
    if ($cal['kind'] !== 'local') gone(404, 'Not found');
    $name = $cal['name'];
    $tz = $cal['tz'];
    $rows = feed_rows([(int)$cal['id']]);
} else {
    $u = $all;
    $u['id'] = (int)$all['user_id'];
    $prefs = profile_prefs($all);
    $tz = valid_tz($prefs['tz'] ?? '', 'UTC');
    $name = 'SavCalendar · ' . $all['name'];
    $ids = array_map(fn($c) => (int)$c['id'], array_filter(calendars_of($u['id']), fn($c) => $c['kind'] === 'local'));
    $rows = array_merge(feed_rows($ids), ($prefs['schedules'] ?? true) !== false ? schedule_rows($u) : []);
}

$body = ics_write($name, $tz, $rows);
$etag = '"' . substr(hash('sha256', $body), 0, 32) . '"';
header('ETag: ' . $etag);
header('Cache-Control: private, max-age=900');
if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}
header('Content-Type: text/calendar; charset=utf-8');
header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9 _.-]+/', '', $name ?: 'calendar') . '.ics"');
echo $body;

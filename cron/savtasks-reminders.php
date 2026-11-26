<?php
/**
 * SavTasks — reminders by email: see README.md. Run by savoffice-checks.php every 30 minutes (or more often: a reminder leaves at the first run
 * after its time, so with 30 minutes it is at most half an hour late). Every task not done whose reminder time has come gets one email (the reminders of one account that
 * fall in the same run go together). A reminder older than 2 days is not sent any more (the server was off): it is only
 * marked as gone. Accounts that switched the emails off in the settings, not confirmed or blocked, get nothing.
 *
 * URL:          https://www.illerom.eu/cron/savtasks-reminders.php?key=SECRET_KEY
 * Command line: php savtasks-reminders.php (no key needed)
 */

declare(strict_types=1);

require __DIR__ . '/../savtasks/lib/bootstrap.php';
require __DIR__ . '/../savschedules/lib/sched.php';
require __DIR__ . '/../savtasks/lib/tasks.php';

header('Content-Type: application/json');
header('X-Robots-Tag: noindex, nofollow');

function finish_on_task_reminders(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_PRETTY_PRINT) . "\n";
    exit($status === 200 ? 0 : 1);
}

if (PHP_SAPI !== 'cli') {
    $cron = is_file(__DIR__ . '/credentials.php') ? require __DIR__ . '/credentials.php' : [];
    $secret = (string)($cron['cron_key'] ?? '');
    if (strlen($secret) < 32) finish_on_task_reminders(503, ['error' => 'cron_key is not configured']);
    if (!hash_equals($secret, (string)($_GET['key'] ?? ''))) finish_on_task_reminders(403, ['error' => 'forbidden']);
}

/** "Tue 1 Dec, 09:30" / "mar 1 dic, 09:30" of a due day (and time) in the language of the account. */
function task_when(?string $day, ?string $time, string $lang): string
{
    if (!$day) return '';
    $w = ['en' => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'it' => ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']][$lang] ?? null;
    $m = ['en' => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'it' => ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']][$lang] ?? null;
    $ts = strtotime($day . ' 12:00:00 UTC');
    $s = $w[(int)gmdate('N', $ts) - 1] . ' ' . gmdate('j', $ts) . ' ' . $m[(int)gmdate('n', $ts) - 1] . (gmdate('Y', $ts) !== gmdate('Y') ? ' ' . gmdate('Y', $ts) : '');
    return $s . ($time ? ', ' . substr($time, 0, 5) : '');
}

function send_task_reminders(): array
{
    $now = now_utc();
    $rows = q('SELECT i.*, l.name list_name, u.id uid, u.name uname, u.email, u.ui_lang, u.status, u.email_verified_at, p.prefs
        FROM ' . t('task_items') . ' i JOIN ' . t('task_lists') . ' l ON l.id = i.list_id JOIN ' . t('users') . ' u ON u.id = l.user_id
        LEFT JOIN ' . t('task_profiles') . ' p ON p.user_id = u.id
        WHERE i.remind_at IS NOT NULL AND i.remind_at <= ? AND i.reminded_at IS NULL AND i.done_at IS NULL ORDER BY u.id, i.remind_at LIMIT 2000', [$now])->fetchAll();
    $by = [];
    $old = gmdate('Y-m-d H:i:s', time() - 2 * 86400);
    $skipped = 0;
    foreach ($rows as $r) {
        $prefs = json_decode((string)($r['prefs'] ?? ''), true) ?: [];
        $send = $r['remind_at'] >= $old && $r['status'] === 'active' && !empty($r['email_verified_at']) && ($prefs['mailReminders'] ?? true) !== false;
        q('UPDATE ' . t('task_items') . ' SET reminded_at = ? WHERE id = ?', [$now, $r['id']]);
        if (!$send) { $skipped++; continue; }
        $by[(int)$r['uid']] ??= ['user' => ['id' => $r['uid'], 'name' => $r['uname'], 'email' => $r['email']], 'lang' => $r['ui_lang'] === 'it' ? 'it' : 'en', 'tz' => valid_tz($prefs['tz'] ?? '', 'UTC'), 'items' => []];
        $lang = $by[(int)$r['uid']]['lang'];
        try {
            $today = (new DateTime('now', new DateTimeZone($r['tz'] ?: 'UTC')))->format('Y-m-d');
        } catch (Throwable $e) {
            $today = gmdate('Y-m-d');
        }
        $overdue = $r['due_date'] && ($r['due_at'] ? $r['due_at'] < $now : $r['due_date'] < $today);
        $by[(int)$r['uid']]['items'][] = ['title' => $r['title'], 'list' => $r['list_name'], 'when' => task_when($r['due_date'], $r['due_time'], $lang), 'overdue' => $overdue, 'url' => app_url() . '#/t/' . $r['tid']];
    }
    $messages = [];
    foreach ($by as $x) $messages[] = reminder_message($x['user'], $x['lang'], array_slice($x['items'], 0, 30));
    $sent = 0;
    if ($messages && mail_settings()) {
        foreach (smtp_send_all(mail_settings(), $messages, null, 150) as $i => $res) {
            if ($res['ok']) $sent++;
            else error_log('SavTasks reminder #' . $i . ' not sent: ' . $res['error']);
        }
    } elseif ($messages && config_value('debug', false)) {
        foreach ($messages as $m) error_log('SavTasks reminder (no SMTP) to ' . $m['to'] . ': ' . $m['subject']);
    }
    return ['accounts' => count($messages), 'sent' => $sent, 'skipped' => $skipped];
}

try {
    if (!credentials()) throw new RuntimeException('savschedules/credentials.php not found');
    finish_on_task_reminders(200, ['ok' => true] + send_task_reminders());
} catch (Throwable $e) {
    error_log('SavTasks reminders failed: ' . $e->getMessage());
    finish_on_task_reminders(500, ['ok' => false, 'error' => 'failed: ' . ($e instanceof PDOException ? 'SQLSTATE ' . $e->getCode() : 'see the log')]);
}

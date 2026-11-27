<?php
/**
 * SavTasks — the time tracked (table task_time, see schema.php).
 *
 * The timer: one at most per account, kept on the server with the moment it started (running = 1, start_at), so it goes
 * on across reloads and devices; starting one stops the one before. Spans written by hand: a day and from–to (UTC
 * moments) or only a length. A span belongs to a task (and so to the list the task is in now) or only to a list; a list
 * is the project or the client, with an optional hourly rate (task_lists.rate). The reports are made by the app from the
 * spans of the days asked (tasks.time.list), with the rates of the lists.
 */

declare(strict_types=1);

/** The spans with what they belong to: the task (its title as it is now) and its list, or the list of their own. */
function time_select(): string
{
    return 'SELECT e.*, i.tid, i.title AS task_title, COALESCE(il.lid, l.lid) AS list_lid FROM ' . t('task_time') . ' e'
        . ' LEFT JOIN ' . t('task_items') . ' i ON i.id = e.task_id LEFT JOIN ' . t('task_lists') . ' il ON il.id = i.list_id'
        . ' LEFT JOIN ' . t('task_lists') . ' l ON l.id = e.list_id';
}

/** A span as the app sees it (the title of a deleted task is the one it had). */
function out_time(array $e): array
{
    return [
        'id' => $e['eid'], 'task' => $e['tid'] ?: null, 'list' => $e['list_lid'] ?: null,
        'title' => (string)($e['task_title'] ?? '') !== '' ? $e['task_title'] : $e['title'], 'note' => $e['note'],
        'day' => $e['day'], 'start' => iso($e['start_at']), 'end' => iso($e['end_at']),
        'seconds' => (int)$e['seconds'], 'running' => (bool)$e['running'], 'billable' => (bool)$e['billable'], 'tz' => $e['tz'],
    ];
}

function time_of(array $u, $eid): ?array
{
    $eid = valid_code($eid);
    if ($eid === '') return null;
    $e = q(time_select() . ' WHERE e.eid = ? AND e.user_id = ?', [$eid, $u['id']])->fetch();
    return $e ?: null;
}

function time_row(int $id): ?array
{
    $e = q(time_select() . ' WHERE e.id = ?', [$id])->fetch();
    return $e ?: null;
}

/** The timer of the account, or null. */
function running_time(array $u): ?array
{
    $e = q(time_select() . ' WHERE e.user_id = ? AND e.running = 1 ORDER BY e.id DESC LIMIT 1', [$u['id']])->fetch();
    return $e ?: null;
}

/** Inside a transaction: holds the profile of the account, so two devices never start two timers at once. */
function lock_account(array $u): void
{
    profile($u);
    q('SELECT user_id FROM ' . t('task_profiles') . ' WHERE user_id = ? FOR UPDATE', [$u['id']]);
}

/** The day of a UTC moment in a zone. */
function utc_day(string $utc, string $tz): string
{
    $d = new DateTime($utc, new DateTimeZone('UTC'));
    $d->setTimezone(new DateTimeZone($tz));
    return $d->format('Y-m-d');
}

/** Stops the timer of the account (with lock_account): the span keeps its length; less than a second goes. Its id, or null. */
function stop_running(array $u): ?int
{
    $now = now_utc();
    $last = null;
    foreach (q('SELECT id, start_at FROM ' . t('task_time') . ' WHERE user_id = ? AND running = 1', [$u['id']])->fetchAll() as $r) {
        $sec = strtotime($now . ' UTC') - strtotime($r['start_at'] . ' UTC');
        if ($sec < 1) {
            q('DELETE FROM ' . t('task_time') . ' WHERE id = ?', [$r['id']]);
            continue;
        }
        q('UPDATE ' . t('task_time') . ' SET running = 0, end_at = ?, seconds = ?, updated_at = ? WHERE id = ?', [$now, $sec, $now, $r['id']]);
        $last = (int)$r['id'];
    }
    return $last;
}

/** What a span belongs to, from what the app sent: [task or null, list or null] (a task brings its list). */
function time_target(array $u, array $b): array
{
    if (!empty($b['task'])) {
        $x = task_of($u, $b['task']);
        if (!$x) fail('not_found', 404);
        return [$x, list_row((int)$x['list_id'])];
    }
    if (!empty($b['list'])) {
        $l = list_of($u, $b['list']);
        if (!$l) fail('not_found', 404);
        return [null, $l];
    }
    return [null, null];
}

function time_count(array $u): int
{
    return (int)q('SELECT COUNT(*) FROM ' . t('task_time') . ' WHERE user_id = ?', [$u['id']])->fetchColumn();
}

/** The seconds tracked on each task, all time (the timer that runs left out): {tid: seconds} */
function time_totals(array $u): array
{
    $out = [];
    $rows = q('SELECT i.tid, SUM(e.seconds) AS s FROM ' . t('task_time') . ' e JOIN ' . t('task_items') . ' i ON i.id = e.task_id WHERE e.user_id = ? AND e.running = 0 GROUP BY i.tid', [$u['id']])->fetchAll();
    foreach ($rows as $r) $out[$r['tid']] = (int)$r['s'];
    return $out;
}

/** An hourly rate sent by the app: a number from 0 (none) up, two decimals; null or '' for none. */
function clean_rate($v): ?string
{
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) fail('bad_rate', 422);
    $n = round((float)$v, 2);
    if ($n < 0 || $n > 99999999) fail('bad_rate', 422);
    return $n > 0 ? number_format($n, 2, '.', '') : null;
}

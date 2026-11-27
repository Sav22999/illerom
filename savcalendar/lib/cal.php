<?php
/**
 * SavCalendar — calendars, events, subscriptions, the feed, and what comes from SavSchedules, SavNewsletters and SavTasks.
 *
 * Who may change what: the events of one's own calendars (kind local). The events of a subscription are a copy of the
 * calendar somewhere else (read again every few hours) and the items of SavSchedules are the polls and the slots
 * themselves: both are read-only here, and the app says why and where they can be changed.
 */

declare(strict_types=1);

const CAL_COLORS = ['#c93a2f', '#e0532f', '#c27a06', '#0f8a63', '#0b8494', '#1f56d1', '#6a2cf0', '#c2307a', '#4a5875', '#7a5c3e'];
const SUB_REFRESH_MINUTES = 180;       // a subscription is read again after this long (when somebody looks at it)
const SCH_COLORS = ['blue' => '#1f56d1', 'violet' => '#6a2cf0', 'green' => '#0f8a63', 'coral' => '#e0532f', 'amber' => '#c27a06', 'pink' => '#c2307a', 'teal' => '#0b8494', 'slate' => '#4a5875'];

function new_code(string $table, string $col): string
{
    $abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    do {
        $p = '';
        for ($i = 0; $i < 10; $i++) $p .= $abc[random_int(0, strlen($abc) - 1)];
    } while (q('SELECT 1 FROM ' . t($table) . " WHERE $col = ?", [$p])->fetchColumn());
    return $p;
}

function valid_code($v): string
{
    return is_string($v) && preg_match('/^[a-z0-9]{10}$/', $v) ? $v : '';
}

function valid_color($v, string $default = ''): string
{
    return is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtolower($v) : $default;
}

function valid_tz($v, string $default = 'UTC'): string
{
    return is_string($v) && in_array($v, timezone_identifiers_list(), true) ? $v : $default;
}

// ------------------------------------------------------------------ profile

/** The settings of the calendar of an account (created the first time): its own calendar comes with it. */
function profile(array $u, string $tz = 'UTC'): array
{
    $p = q('SELECT * FROM ' . t('cal_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('cal_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], json_out(['tz' => valid_tz($tz)]), now_utc()]);
        if (!q('SELECT 1 FROM ' . t('cal_calendars') . ' WHERE user_id = ?', [$u['id']])->fetchColumn()) {
            q('INSERT INTO ' . t('cal_calendars') . ' (cid, user_id, kind, name, color, tz, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
                [new_code('cal_calendars', 'cid'), $u['id'], 'local', $u['ui_lang'] === 'it' ? 'Personale' : 'Personal', CAL_COLORS[0], valid_tz($tz), 0, now_utc(), now_utc()]);
        }
        $p = q('SELECT * FROM ' . t('cal_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    return $p;
}

function profile_prefs(array $p): array
{
    $x = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($x) ? $x : [];
}

// ------------------------------------------------------------------ calendars

function calendars_of(int $uid): array
{
    return q('SELECT * FROM ' . t('cal_calendars') . ' WHERE user_id = ? ORDER BY kind, position, id', [$uid])->fetchAll();
}

function calendar_of(array $u, $cid): ?array
{
    $cid = valid_code($cid);
    if ($cid === '') return null;
    $c = q('SELECT * FROM ' . t('cal_calendars') . ' WHERE cid = ? AND user_id = ?', [$cid, $u['id']])->fetch();
    return $c ?: null;
}

function feed_url(string $token): string
{
    return app_url() . 'feed/' . $token . '.ics';
}

function out_calendar(array $c): array
{
    $n = (int)q('SELECT COUNT(*) FROM ' . t('cal_events') . ' WHERE calendar_id = ?', [$c['id']])->fetchColumn();
    return [
        'id' => $c['cid'], 'kind' => $c['kind'], 'name' => $c['name'], 'color' => $c['color'], 'descr' => $c['descr'], 'tz' => $c['tz'],
        'visible' => (bool)$c['visible'], 'events' => $n,
        'url' => $c['kind'] === 'sub' ? $c['url'] : null,
        'refreshed' => iso($c['refreshed_at']), 'error' => $c['fetch_error'] ?: null,
        'feed' => $c['feed_token'] ? feed_url($c['feed_token']) : null,
        'readOnly' => $c['kind'] === 'sub',
    ];
}

// ------------------------------------------------------------------ events

/** An event as the app sees it. */
function out_event(array $e, array $c): array
{
    return [
        'id' => $e['eid'], 'cal' => $c['cid'], 'uid' => $e['uid'], 'title' => $e['title'], 'descr' => (string)$e['descr'], 'place' => $e['place'], 'url' => $e['url'],
        'allDay' => (bool)$e['all_day'],
        'start' => $e['all_day'] ? substr($e['starts_at'], 0, 10) : iso($e['starts_at']),
        'end' => $e['all_day'] ? substr($e['ends_at'], 0, 10) : iso($e['ends_at']),
        'tz' => $e['tz'], 'rrule' => $e['rrule'], 'exdates' => json_decode((string)($e['exdates'] ?? '[]'), true) ?: [],
        'recurId' => $e['recur_id'] ? ($e['all_day'] ? substr($e['recur_id'], 0, 10) : iso($e['recur_id'])) : null,
        'status' => $e['status'], 'busy' => (bool)$e['busy'], 'color' => $e['color'] ?: null,
        'readOnly' => $c['kind'] === 'sub', 'why' => $c['kind'] === 'sub' ? 'sub' : null,
        'updated' => iso($e['updated_at']),
    ];
}

/**
 * The events of some calendars that may touch [from, to): single events in the range, repetitions that start before
 * its end and do not end before its start, and the changed occurrences whose original time is in the range.
 */
function events_between(array $cals, string $from, string $to): array
{
    if (!$cals) return [];
    $byId = [];
    foreach ($cals as $c) $byId[(int)$c['id']] = $c;
    $in = implode(',', array_keys($byId));
    $rows = q('SELECT * FROM ' . t('cal_events') . " WHERE calendar_id IN ($in) AND (
            (rrule = '' AND starts_at < ? AND ends_at > ?) OR (rrule = '' AND starts_at = ends_at AND starts_at >= ? AND starts_at < ?)
            OR (rrule <> '' AND starts_at < ? AND (rrule_until IS NULL OR rrule_until >= ?))
            OR (recur_id IS NOT NULL AND recur_id < ? AND recur_id >= ?)
        ) ORDER BY starts_at LIMIT 8000", [$to, $from, $from, $to, $to, $from, $to, gmdate('Y-m-d H:i:s', strtotime($from . ' UTC') - 86400 * 2)])->fetchAll();
    return array_map(fn($e) => out_event($e, $byId[(int)$e['calendar_id']]), $rows);
}

/** A row of cal_events from what the app sends (null when the times are not valid). */
function clean_event(array $b, string $defTz): ?array
{
    $all = !empty($b['allDay']);
    $tz = valid_tz($b['tz'] ?? '', $defTz);
    if ($all) {
        $a = is_string($b['start'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $b['start']) ? $b['start'] : null;
        $z = is_string($b['end'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $b['end']) ? $b['end'] : null;
        if (!$a || !strtotime($a)) return null;
        if (!$z || $z <= $a) $z = gmdate('Y-m-d', strtotime($a . ' UTC') + 86400);
        $start = $a . ' 00:00:00';
        $end = $z . ' 00:00:00';
    } else {
        $start = utc_time($b['start'] ?? null);
        $end = utc_time($b['end'] ?? null);
        if (!$start) return null;
        if (!$end || $end < $start) $end = $start;
    }
    if (strtotime($end) - strtotime($start) > 366 * 86400) return null;
    $rrule = clean_rrule((string)($b['rrule'] ?? ''));
    $ex = [];
    foreach ((array)($b['exdates'] ?? []) as $x) {
        if (!is_string($x)) continue;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $x)) $ex[] = $x;
        elseif ($t = utc_time($x)) $ex[] = gmdate('Y-m-d\TH:i:s\Z', strtotime($t . ' UTC'));
        if (count($ex) >= 500) break;
    }
    $url = s($b, 'url', 500);
    return [
        'title' => s($b, 'title', 255), 'descr' => multiline($b, 'descr', 8000), 'place' => s($b, 'place', 255),
        'url' => preg_match('~^https?://~i', $url) ? $url : '',
        'all_day' => $all ? 1 : 0, 'starts_at' => $start, 'ends_at' => $end, 'tz' => $tz,
        'rrule' => $rrule, 'rrule_until' => $rrule ? rrule_until($rrule, $tz) : null, 'exdates' => array_values(array_unique($ex)),
        'status' => in_array($b['status'] ?? '', ['tentative', 'cancelled'], true) ? $b['status'] : 'confirmed',
        'busy' => array_key_exists('busy', $b) ? (!empty($b['busy']) ? 1 : 0) : 1,
        'color' => valid_color($b['color'] ?? ''),
    ];
}

function insert_event(int $calId, array $e, string $uid, ?string $recurId = null): string
{
    $eid = new_code('cal_events', 'eid');
    q('INSERT INTO ' . t('cal_events') . ' (eid, calendar_id, uid, recur_id, title, descr, place, url, all_day, starts_at, ends_at, tz, rrule, rrule_until, exdates, status, busy, color, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$eid, $calId, $uid, $recurId, $e['title'], $e['descr'], $e['place'], $e['url'], $e['all_day'], $e['starts_at'], $e['ends_at'], $e['tz'],
        $e['rrule'], $e['rrule'] ? ($e['rrule_until'] ?? rrule_until($e['rrule'], $e['tz'])) : null, json_out($e['exdates'] ?? []), $e['status'], $e['busy'], $e['color'] ?? '', now_utc(), now_utc()]);
    return $eid;
}

function update_event(int $id, array $e): void
{
    q('UPDATE ' . t('cal_events') . ' SET title = ?, descr = ?, place = ?, url = ?, all_day = ?, starts_at = ?, ends_at = ?, tz = ?, rrule = ?, rrule_until = ?, exdates = ?, status = ?, busy = ?, color = ?, updated_at = ? WHERE id = ?',
        [$e['title'], $e['descr'], $e['place'], $e['url'], $e['all_day'], $e['starts_at'], $e['ends_at'], $e['tz'], $e['rrule'], $e['rrule'] ? ($e['rrule_until'] ?? rrule_until($e['rrule'], $e['tz'])) : null,
            json_out($e['exdates'] ?? []), $e['status'], $e['busy'], $e['color'] ?? '', now_utc(), $id]);
}

function new_uid(): string
{
    return bin2hex(random_bytes(12)) . '@savcalendar';
}

/**
 * Events of a file into a calendar of one's own. An event with a UID that the calendar already has is updated (the same
 * file imported twice does not double it). Returns [added, updated].
 */
function import_events(array $cal, array $events): array
{
    $added = $updated = 0;
    $left = MAX_EVENTS - (int)q('SELECT COUNT(*) FROM ' . t('cal_events') . ' WHERE calendar_id = ?', [$cal['id']])->fetchColumn();
    foreach ($events as $e) {
        $e['rrule_until'] = $e['rrule'] ? rrule_until($e['rrule'], $e['tz']) : null;
        $have = q('SELECT id FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ? AND ' . ($e['recur_id'] ? 'recur_id = ?' : 'recur_id IS NULL'), array_merge([$cal['id'], $e['uid']], $e['recur_id'] ? [$e['recur_id']] : []))->fetchColumn();
        if ($have) {
            update_event((int)$have, $e);
            $updated++;
        } elseif ($left-- > 0) {
            insert_event((int)$cal['id'], $e, $e['uid'], $e['recur_id']);
            $added++;
        }
    }
    return [$added, $updated];
}

/** A subscription read again: its events are replaced by the ones of the file (in one transaction). */
function refresh_subscription(array $c, bool $force = false): array
{
    $r = fetch_calendar($c['url'], $force ? '' : $c['etag'], $force ? '' : $c['last_modified']);
    if (!$r['ok']) {
        q('UPDATE ' . t('cal_calendars') . ' SET refreshed_at = ?, fetch_error = ? WHERE id = ?', [now_utc(), $r['error'], $c['id']]);
        return ['ok' => false, 'error' => $r['error']];
    }
    if (!empty($r['same'])) {
        q('UPDATE ' . t('cal_calendars') . " SET refreshed_at = ?, fetch_error = '' WHERE id = ?", [now_utc(), $c['id']]);
        return ['ok' => true];
    }
    try {
        $ics = ics_parse($r['body'], $c['tz']);
    } catch (Throwable $e) {
        q('UPDATE ' . t('cal_calendars') . ' SET refreshed_at = ?, fetch_error = ? WHERE id = ?', [now_utc(), 'sub_not_ics', $c['id']]);
        return ['ok' => false, 'error' => 'sub_not_ics'];
    }
    db()->beginTransaction();
    q('DELETE FROM ' . t('cal_events') . ' WHERE calendar_id = ?', [$c['id']]);
    foreach ($ics['events'] as $e) {
        $e['rrule_until'] = $e['rrule'] ? rrule_until($e['rrule'], $e['tz']) : null;
        insert_event((int)$c['id'], $e, $e['uid'], $e['recur_id']);
    }
    q('UPDATE ' . t('cal_calendars') . " SET refreshed_at = ?, fetch_error = '', etag = ?, last_modified = ?, tz = ? WHERE id = ?", [now_utc(), $r['etag'], $r['modified'], valid_tz($ics['tz'], $c['tz']), $c['id']]);
    db()->commit();
    return ['ok' => true, 'name' => $ics['name'], 'count' => count($ics['events'])];
}

/** The subscriptions of an account not read for a while are read again (at most two per request, so it stays quick). */
function refresh_due(int $uid): void
{
    $due = q('SELECT * FROM ' . t('cal_calendars') . " WHERE user_id = ? AND kind = 'sub' AND (refreshed_at IS NULL OR refreshed_at < ?) ORDER BY refreshed_at LIMIT 2",
        [$uid, gmdate('Y-m-d H:i:s', time() - SUB_REFRESH_MINUTES * 60)])->fetchAll();
    foreach ($due as $c) {
        try {
            refresh_subscription($c);
        } catch (Throwable $e) {
            if (db()->inTransaction()) db()->rollBack();
            error_log('SavCalendar refresh: ' . $e->getMessage());
        }
    }
}

// ------------------------------------------------------------------ SavSchedules

/**
 * What SavSchedules puts in the calendar of an account, in [from, to):
 *   own polls: the date chosen (final) or, while they are open, the dates proposed (proposal) when $proposals;
 *   own sheets of slots: every slot, with how many places are taken (slot);
 *   answers given with the account: the places taken (booked) and the date chosen for a poll answered (gfinal), or the
 *   dates said yes to while it is open (voted) when $proposals.
 * Every item is read-only here: `why` says the reason, `link` opens it in SavSchedules.
 */
function schedule_items(array $u, string $from, string $to, bool $proposals): array
{
    $sch = rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savschedules/';
    $dayFrom = substr($from, 0, 10);
    $dayTo = substr($to, 0, 10);
    $range = '((o.day IS NOT NULL AND o.day >= ? AND o.day <= ?) OR (o.starts_at < ? AND COALESCE(o.ends_at, o.starts_at) >= ?))';
    $args = [$dayFrom, $dayTo, $to, gmdate('Y-m-d H:i:s', strtotime($from . ' UTC') - 3600)];
    $out = [];
    $item = function (array $s, array $o, string $why, array $extra = []) use (&$out, $sch) {
        $set = settings_of($s);
        $day = $o['day'];
        $end = $day ? gmdate('Y-m-d', strtotime($day . ' UTC') + 86400) : iso($o['ends_at'] ?: gmdate('Y-m-d H:i:s', strtotime($o['starts_at'] . ' UTC') + 3600));
        $owner = in_array($why, ['final', 'proposal', 'slot'], true);
        $out[] = array_merge([
            'id' => 'sch-' . $s['pid'] . '-' . $o['id'], 'source' => 'schedules', 'pid' => $s['pid'], 'kind' => $s['kind'],
            'title' => $s['title'] . ($o['label'] !== '' ? ' · ' . $o['label'] : ''), 'place' => $s['place'], 'descr' => (string)$s['descr'],
            'allDay' => (bool)$day, 'start' => $day ?: iso($o['starts_at']), 'end' => $end, 'tz' => $set['tz'],
            'color' => SCH_COLORS[$set['color']] ?? SCH_COLORS['blue'], 'readOnly' => true, 'why' => $why,
            'status' => in_array($why, ['proposal', 'voted'], true) ? 'tentative' : 'confirmed', 'busy' => !in_array($why, ['proposal', 'slot'], true),
            'link' => $sch . ($owner ? '#/r/' : '#/s/') . $s['pid'],
            'closed' => is_closed($s),
        ], $extra);
    };
    // own schedules
    $rows = q('SELECT s.*, o.id oid, o.starts_at, o.ends_at, o.day, o.label, o.capacity,
            (SELECT COUNT(*) FROM ' . t('choices') . ' c WHERE c.option_id = o.id AND c.value = 2) yes
        FROM ' . t('schedules') . ' s JOIN ' . t('options') . ' o ON o.schedule_id = s.id
        WHERE s.owner_id = ? AND s.deleted_at IS NULL AND s.status <> \'suspended\' AND ' . $range . ' ORDER BY o.starts_at, o.day LIMIT 3000', array_merge([$u['id']], $args))->fetchAll();
    foreach ($rows as $r) {
        $o = ['id' => $r['oid'], 'starts_at' => $r['starts_at'], 'ends_at' => $r['ends_at'], 'day' => $r['day'], 'label' => $r['label']];
        if ($r['kind'] === 'slots') $item($r, $o, 'slot', ['taken' => (int)$r['yes'], 'capacity' => (int)$r['capacity'], 'busy' => (int)$r['yes'] > 0]);
        elseif ($r['final_option_id'] !== null) { if ((int)$r['final_option_id'] === (int)$r['oid']) $item($r, $o, 'final', ['yes' => (int)$r['yes']]); }
        elseif ($proposals && !is_closed($r)) $item($r, $o, 'proposal', ['yes' => (int)$r['yes']]);
    }
    // answers given with this account (to the schedules of other people)
    $rows = q('SELECT s.*, own.name owner_name, o.id oid, o.starts_at, o.ends_at, o.day, o.label, c.value
        FROM ' . t('responses') . ' r JOIN ' . t('schedules') . ' s ON s.id = r.schedule_id JOIN ' . t('users') . ' own ON own.id = s.owner_id
        JOIN ' . t('options') . ' o ON o.schedule_id = s.id LEFT JOIN ' . t('choices') . ' c ON c.response_id = r.id AND c.option_id = o.id
        WHERE r.user_id = ? AND s.owner_id <> ? AND s.deleted_at IS NULL AND s.status <> \'suspended\' AND ' . $range . ' LIMIT 3000', array_merge([$u['id'], $u['id']], $args))->fetchAll();
    foreach ($rows as $r) {
        $o = ['id' => $r['oid'], 'starts_at' => $r['starts_at'], 'ends_at' => $r['ends_at'], 'day' => $r['day'], 'label' => $r['label']];
        $v = (int)($r['value'] ?? 0);
        if ($r['kind'] === 'slots') { if ($v === 2) $item($r, $o, 'booked', ['owner' => $r['owner_name']]); }
        elseif ($r['final_option_id'] !== null) { if ((int)$r['final_option_id'] === (int)$r['oid']) $item($r, $o, 'gfinal', ['owner' => $r['owner_name'], 'mine' => $v]); }
        elseif ($proposals && $v > 0 && !is_closed($r)) $item($r, $o, 'voted', ['owner' => $r['owner_name'], 'mine' => $v]);
    }
    return $out;
}

// ------------------------------------------------------------------ SavNewsletters

/**
 * The newsletters of the groups the account belongs to in SavNewsletters (its own database: savnewsletters/lib/calendar.php
 * reads it and answers [] when it cannot). Only for a confirmed address: otherwise anyone could register the address of
 * somebody else and see their newsletters. Read-only, never in the feed (unsent newsletters are internal to the group).
 */
function newsletter_items(array $u, string $from, string $to, array $prefs): array
{
    if (($prefs['newsletters'] ?? true) === false || empty($u['email_verified_at'])) return [];
    $f = dirname(__DIR__, 2) . '/savnewsletters/lib/calendar.php';
    if (!is_file($f)) return [];
    try {
        require_once $f;
        if (!function_exists('savnewsletters_calendar_items')) return [];
        $items = savnewsletters_calendar_items((string)$u['email'], $from, $to, rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savnewsletters/');
        return is_array($items) ? array_values(array_filter($items, 'is_array')) : [];
    } catch (Throwable $e) {
        error_log('SavCalendar newsletters: ' . $e->getMessage());
        return [];
    }
}

// ------------------------------------------------------------------ SavTasks

/**
 * The tasks of the account in SavTasks (the same database: its tables sch_task_*) that touch [from, to): a whole day, 30
 * minutes from its time, or every day from its start day to its due day. Done ones too (done: true). Read-only here, never in the feed: a task is something to
 * do, not a time when one is busy. The app ticks them through the API of SavTasks itself (same session). [] when SavTasks
 * never ran on this database.
 */
function task_items(array $u, string $from, string $to, array $prefs): array
{
    if (($prefs['tasks'] ?? true) === false) return [];
    $tasks = rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savtasks/';
    try {
        // i.*: start_date exists from version 2 of SavTasks on (a database not migrated yet still answers)
        $rows = q('SELECT i.*, l.name list_name, l.color FROM ' . t('task_items') . ' i
            JOIN ' . t('task_lists') . ' l ON l.id = i.list_id WHERE l.user_id = ? AND l.archived = 0 AND i.due_date IS NOT NULL AND i.due_date >= ? AND i.due_date <= ? ORDER BY i.due_date, i.due_time LIMIT 3000',
            [$u['id'], gmdate('Y-m-d', strtotime($from . ' UTC') - 86400), gmdate('Y-m-d', strtotime($to . ' UTC') + 400 * 86400)])->fetchAll();
    } catch (PDOException $e) {
        return [];
    }
    $out = [];
    foreach ($rows as $r) {
        if ($r['done_at'] !== null && ($prefs['tasksDone'] ?? true) === false) continue;
        $start = $r['start_date'] ?? null;
        $lastDay = gmdate('Y-m-d', strtotime($to . ' UTC') + 86400);
        if (($start ?? $r['due_date']) > $lastDay) continue; // starts after the range
        $timed = !$start && $r['due_time'] !== null && $r['due_at'] !== null; // a task over several days is shown as whole days
        $out[] = [
            'id' => 'task-' . $r['tid'], 'source' => 'tasks', 'tid' => $r['tid'], 'title' => $r['title'], 'descr' => (string)$r['notes'], 'place' => '', 'list' => $r['list_name'],
            'allDay' => !$timed, 'start' => $timed ? iso($r['due_at']) : ($start ?? $r['due_date']), 'end' => $timed ? iso(gmdate('Y-m-d H:i:s', strtotime($r['due_at'] . ' UTC') + 1800)) : gmdate('Y-m-d', strtotime($r['due_date'] . ' UTC') + 86400),
            'tz' => $r['tz'], 'color' => $r['color'], 'readOnly' => true, 'why' => $r['done_at'] ? 'task_done' : 'task', 'done' => $r['done_at'] !== null, 'priority' => (int)$r['priority'], 'repeats' => $r['rrule'] !== '',
            'status' => 'confirmed', 'busy' => false, 'link' => $tasks . '#/t/' . $r['tid'],
        ];
    }
    return $out;
}

// ------------------------------------------------------------------ SavForms

/**
 * The deadlines of the forms of the account in SavForms (the same database: its table sch_form_forms) in [from, to): 30
 * minutes from the moment the form closes, in the colour of the form. Only forms whose owner keeps the deadline in the
 * calendar (in_calendar) and not archived. Read-only here, never in the feed. [] when SavForms never ran on this database.
 */
function form_items(array $u, string $from, string $to, array $prefs): array
{
    if (($prefs['forms'] ?? true) === false) return [];
    $forms = rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savforms/';
    try {
        $rows = q('SELECT fid, title, descr, closes_at, tz, theme, accepting, responses FROM ' . t('form_forms') . '
            WHERE user_id = ? AND in_calendar = 1 AND archived = 0 AND closes_at IS NOT NULL AND closes_at >= ? AND closes_at < ? ORDER BY closes_at LIMIT 1000', [$u['id'], $from, $to])->fetchAll();
    } catch (PDOException $e) {
        return [];
    }
    $out = [];
    foreach ($rows as $r) {
        $theme = json_decode((string)$r['theme'], true) ?: [];
        $color = is_string($theme['color'] ?? null) && preg_match('/^#[0-9a-f]{6}$/i', $theme['color']) ? $theme['color'] : '#86329e';
        $out[] = [
            'id' => 'form-' . $r['fid'], 'source' => 'forms', 'fid' => $r['fid'], 'title' => $r['title'] !== '' ? $r['title'] : '…', 'descr' => mb_substr((string)$r['descr'], 0, 500), 'place' => '',
            'allDay' => false, 'start' => iso($r['closes_at']), 'end' => iso(gmdate('Y-m-d H:i:s', strtotime($r['closes_at'] . ' UTC') + 1800)), 'tz' => $r['tz'], 'color' => $color,
            'readOnly' => true, 'why' => 'form', 'answers' => (int)$r['responses'], 'accepting' => (bool)$r['accepting'], 'status' => 'confirmed', 'busy' => false, 'link' => $forms . '#/r/' . $r['fid'],
        ];
    }
    return $out;
}

// ------------------------------------------------------------------ SavContacts

/**
 * The birthdays of the contacts of the account in SavContacts (the same database: its table sch_con_contacts) in
 * [from, to): whole days, every year, with the age they turn when the year of birth is known (a 29 February falls on the
 * 28th in the other years). Read-only here, never in the feed. [] when SavContacts never ran on this database.
 */
function birthday_items(array $u, string $from, string $to, array $prefs): array
{
    if (($prefs['birthdays'] ?? true) === false) return [];
    $contacts = rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savcontacts/';
    try {
        $rows = q('SELECT cid, prefix, first, middle, last, suffix, nickname, company, birthday FROM ' . t('con_contacts') . " WHERE user_id = ? AND deleted_at IS NULL AND birthday <> '' LIMIT 20000", [$u['id']])->fetchAll();
    } catch (PDOException $e) {
        return [];
    }
    $f = strtotime(substr($from, 0, 10) . ' UTC');
    $l = strtotime(substr($to, 0, 10) . ' UTC');
    $out = [];
    for ($y = (int)gmdate('Y', $f); $y <= (int)gmdate('Y', $l); $y++) {
        foreach ($rows as $r) {
            $b = (string)$r['birthday'];
            $m = (int)substr($b, -5, 2);
            $d = (int)substr($b, -2);
            if ($m < 1 || $m > 12 || $d < 1) continue;
            if (!checkdate($m, $d, $y)) $d = 28;
            $day = sprintf('%04d-%02d-%02d', $y, $m, $d);
            $t = strtotime($day . ' UTC');
            if ($t < $f || $t > $l) continue;
            $name = trim(preg_replace('/\s+/u', ' ', implode(' ', [$r['prefix'], $r['first'], $r['middle'], $r['last'], $r['suffix']])) ?? '') ?: ($r['nickname'] ?: $r['company']);
            $born = $b[0] === '-' ? null : (int)substr($b, 0, 4);
            $out[] = [
                'id' => 'bday-' . $r['cid'] . '-' . $y, 'source' => 'birthdays', 'cid' => $r['cid'], 'title' => $name, 'name' => $name, 'age' => $born ? $y - $born : null, 'descr' => '', 'place' => '',
                'allDay' => true, 'start' => $day, 'end' => gmdate('Y-m-d', $t + 86400), 'color' => '#4338ca', 'readOnly' => true, 'why' => 'birthday',
                'status' => 'confirmed', 'busy' => false, 'link' => $contacts . '#/c/' . $r['cid'],
            ];
        }
    }
    return $out;
}

/** For the feed: the same items as rows of cal_events (only what keeps one busy: dates chosen, places taken). */
function schedule_rows(array $u): array
{
    $items = schedule_items($u, gmdate('Y-m-d H:i:s', time() - 400 * 86400), gmdate('Y-m-d H:i:s', time() + 3 * 366 * 86400), false);
    $rows = [];
    foreach ($items as $i) {
        if ($i['why'] === 'slot' && empty($i['taken'])) continue;
        $all = $i['allDay'];
        $rows[] = [
            'uid' => $i['id'] . '@savschedules', 'title' => $i['title'] . ($i['why'] === 'slot' ? ' (' . $i['taken'] . '/' . $i['capacity'] . ')' : ''),
            'descr' => $i['descr'], 'place' => $i['place'], 'url' => '', 'link' => $i['link'], 'all_day' => $all ? 1 : 0,
            'starts_at' => $all ? $i['start'] . ' 00:00:00' : gmdate('Y-m-d H:i:s', strtotime($i['start'])),
            'ends_at' => $all ? $i['end'] . ' 00:00:00' : gmdate('Y-m-d H:i:s', strtotime($i['end'])),
            'tz' => $i['tz'], 'rrule' => '', 'exdates' => [], 'recur_id' => null, 'status' => 'confirmed', 'busy' => 1,
        ];
    }
    return $rows;
}

/** Rows of cal_events ready for ics_write(). */
function feed_rows(array $calIds): array
{
    if (!$calIds) return [];
    // the cancelled occurrences go too (STATUS:CANCELLED): they take that occurrence away in the other calendar
    $rows = q('SELECT * FROM ' . t('cal_events') . ' WHERE calendar_id IN (' . implode(',', array_map('intval', $calIds)) . ') ORDER BY recur_id IS NOT NULL, starts_at LIMIT 20000')->fetchAll();
    foreach ($rows as &$r) $r['exdates'] = json_decode((string)($r['exdates'] ?? '[]'), true) ?: [];
    return $rows;
}

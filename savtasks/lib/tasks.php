<?php
/**
 * SavTasks — lists, tasks, repetitions, and what goes to and comes from SavCalendar and SavSchedules.
 *
 * Every list belongs to one account; every task belongs to one list. A list is shown as a list, as a board (kanban) or as
 * a Gantt chart (each task a bar from its start day to its due day; a task with only a due day is a milestone):
 * the columns of a board are kept with the list, and a task knows its column (col). A column may be marked "done": a
 * task moved there is ticked, and a task ticked elsewhere goes there.
 *
 * Due: a day (due_date) with an optional wall-clock time (due_time) in a time zone (tz): to-dos live on the clock of the
 * place where they are done. due_at is the same moment in UTC (only with a time), for the calendar; remind_at is the
 * moment of the reminder in UTC, chosen by the app (the email leaves from cron/savtasks-reminders.php).
 *
 * The other apps of the same account:
 *   SavCalendar  shows the tasks with a due day (savcalendar/lib/cal.php reads these tables); a task can become an event
 *                there (task_to_event), and the task remembers it (cal_eid)
 *   SavSchedules a task can become a date poll there (the dates chosen in SavTasks), and the task remembers it (sch_pid):
 *                once its owner chooses the date, the task shows it. The polls waiting for a decision and the places
 *                booked are listed by schedule_todos(), read-only
 */

declare(strict_types=1);

const LIST_COLORS = ['#0b7a87', '#1f56d1', '#6a2cf0', '#c2307a', '#c93a2f', '#e0532f', '#c27a06', '#0f8a63', '#4a5875', '#7a5c3e'];
const LIST_ICONS = ['', 'list-checks', 'square-kanban', 'chart-gantt', 'grid-2x2', 'calendar-days', 'repeat', 'flame', 'table', 'briefcase', 'house', 'shopping-cart', 'book-open', 'heart', 'plane', 'graduation-cap', 'dumbbell', 'lightbulb', 'users', 'star', 'flag', 'inbox'];
const SCH_COLORS = ['blue' => '#1f56d1', 'violet' => '#6a2cf0', 'green' => '#0f8a63', 'coral' => '#e0532f', 'amber' => '#c27a06', 'pink' => '#c2307a', 'teal' => '#0b8494', 'slate' => '#4a5875'];
const MAX_CHECKLIST = 100;
const MAX_TAGS = 12;

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

function valid_day($v): ?string
{
    return is_string($v) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]) && (int)$m[1] >= 2000 && (int)$m[1] <= 2100 ? $v : null;
}

function valid_clock($v): ?string
{
    return is_string($v) && preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:00)?$/', $v, $m) ? $m[1] . ':' . $m[2] . ':00' : null;
}

/** The UTC moment of a wall clock in a zone, or null. */
function wall_to_utc(string $day, string $time, string $tz): ?string
{
    try {
        $d = new DateTime($day . ' ' . $time, new DateTimeZone($tz));
        $d->setTimezone(new DateTimeZone('UTC'));
        return $d->format('Y-m-d H:i:s');
    } catch (Throwable $e) {
        return null;
    }
}

// ------------------------------------------------------------------ profile

/** The settings of an account in SavTasks (created the first time): its inbox comes with it. */
function profile(array $u, string $tz = 'UTC'): array
{
    $p = q('SELECT * FROM ' . t('task_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('task_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], json_out(['tz' => valid_tz($tz)]), now_utc()]);
        $p = q('SELECT * FROM ' . t('task_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    if (!q('SELECT 1 FROM ' . t('task_lists') . ' WHERE user_id = ? AND inbox = 1', [$u['id']])->fetchColumn()) {
        $it = ($u['ui_lang'] ?? '') === 'it';
        q('INSERT INTO ' . t('task_lists') . ' (lid, user_id, name, color, icon, view, columns, inbox, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            [new_code('task_lists', 'lid'), $u['id'], $it ? 'In arrivo' : 'Inbox', LIST_COLORS[0], 'inbox', 'list', json_out(default_columns($it ? 'it' : 'en')), 1, 0, now_utc(), now_utc()]);
    }
    return $p;
}

function profile_prefs(array $p): array
{
    $x = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($x) ? $x : [];
}

// ------------------------------------------------------------------ lists

function default_columns(string $lang): array
{
    $it = $lang === 'it';
    return [['id' => 'todo', 'name' => $it ? 'Da fare' : 'To do', 'done' => false], ['id' => 'doing', 'name' => $it ? 'In corso' : 'Doing', 'done' => false], ['id' => 'done', 'name' => $it ? 'Fatto' : 'Done', 'done' => true]];
}

/** Columns sent by the app: [{id?, name, done?}], at least one, at most MAX_COLUMNS; ids are kept or made. */
function clean_columns($in, string $lang): array
{
    if (!is_array($in)) return default_columns($lang);
    $out = [];
    $seen = [];
    foreach ($in as $c) {
        if (!is_array($c) || count($out) >= MAX_COLUMNS) continue;
        $name = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($c['name'] ?? '')) ?? ''), 0, 40);
        if ($name === '') continue;
        $id = is_string($c['id'] ?? null) && preg_match('/^[a-z0-9]{1,12}$/', $c['id']) && !isset($seen[$c['id']]) ? $c['id'] : substr(bin2hex(random_bytes(4)), 0, 8);
        $seen[$id] = true;
        $out[] = ['id' => $id, 'name' => $name, 'done' => !empty($c['done'])];
    }
    return $out ?: default_columns($lang);
}

function columns_of(array $l): array
{
    $c = json_decode((string)($l['columns'] ?? ''), true);
    return is_array($c) && $c ? $c : default_columns('en');
}

/** The first column (where new tasks go) and the column of done tasks (the first one marked done, or none). */
function first_col(array $l): string
{
    foreach (columns_of($l) as $c) if (empty($c['done'])) return $c['id'];
    return columns_of($l)[0]['id'];
}

function done_col(array $l): string
{
    foreach (columns_of($l) as $c) if (!empty($c['done'])) return $c['id'];
    return '';
}

function lists_of(int $uid): array
{
    return q('SELECT * FROM ' . t('task_lists') . ' WHERE user_id = ? ORDER BY inbox DESC, archived, position, id', [$uid])->fetchAll();
}

function list_of(array $u, $lid): ?array
{
    $lid = valid_code($lid);
    if ($lid === '') return null;
    $l = q('SELECT * FROM ' . t('task_lists') . ' WHERE lid = ? AND user_id = ?', [$lid, $u['id']])->fetch();
    return $l ?: null;
}

function inbox_of(array $u): array
{
    profile($u);
    return q('SELECT * FROM ' . t('task_lists') . ' WHERE user_id = ? AND inbox = 1 ORDER BY id LIMIT 1', [$u['id']])->fetch();
}

function out_list(array $l): array
{
    return [
        'id' => $l['lid'], 'name' => $l['name'], 'color' => $l['color'], 'icon' => $l['icon'], 'view' => $l['view'],
        'columns' => columns_of($l), 'inbox' => (bool)$l['inbox'], 'archived' => (bool)$l['archived'],
        'rate' => isset($l['rate']) && $l['rate'] !== null ? (float)$l['rate'] : null,
    ];
}

// ------------------------------------------------------------------ tasks

/** A task as the app sees it. */
function out_task(array $x, array $l): array
{
    return [
        'id' => $x['tid'], 'list' => $l['lid'], 'title' => $x['title'], 'notes' => (string)$x['notes'],
        'checklist' => json_decode((string)($x['checklist'] ?? '[]'), true) ?: [],
        'tags' => $x['tags'] !== '' ? (json_decode($x['tags'], true) ?: []) : [],
        'priority' => (int)$x['priority'], 'starred' => (bool)$x['starred'], 'col' => $x['col'] ?: first_col($l), 'position' => (int)$x['position'],
        'start' => $x['start_date'] ?? null, 'due' => $x['due_date'], 'time' => $x['due_time'] ? substr($x['due_time'], 0, 5) : null, 'dueAt' => iso($x['due_at']), 'tz' => $x['tz'],
        'remind' => iso($x['remind_at']), 'reminded' => iso($x['reminded_at']), 'rrule' => $x['rrule'], 'log' => json_decode((string)($x['log'] ?? '[]'), true) ?: [],
        'done' => iso($x['done_at']), 'calEvent' => $x['cal_eid'] ?: null, 'schedule' => $x['sch_pid'] ?: null,
        'created' => iso($x['created_at']), 'updated' => iso($x['updated_at']),
    ];
}

/** Only what the repetitions of SavTasks know: every n days, weeks (some days), months or years. */
function clean_task_rrule(string $r): string
{
    $r = strtoupper(trim($r));
    if ($r === '' || !preg_match('/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;INTERVAL=([1-9]\d?))?(;BYDAY=((MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU)){0,6}))?$/', $r, $m)) return '';
    if (!empty($m[5]) && $m[1] !== 'WEEKLY') return 'FREQ=' . $m[1] . (!empty($m[3]) ? ';INTERVAL=' . $m[3] : '');
    return $r;
}

/** The day after $day on which a repetition falls (from the due day, never in the past when $fromToday). */
function next_due(string $rrule, string $day, bool $fromToday = true, string $tz = 'UTC'): ?string
{
    if (!preg_match('/FREQ=(\w+)/', $rrule, $f)) return null;
    $n = preg_match('/INTERVAL=(\d+)/', $rrule, $i) ? max(1, (int)$i[1]) : 1;
    $days = preg_match('/BYDAY=([A-Z,]+)/', $rrule, $b) ? array_map(fn($d) => array_search($d, ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'], true) + 1, explode(',', $b[1])) : [];
    try {
        $today = (new DateTime('now', new DateTimeZone($tz)))->format('Y-m-d');
    } catch (Throwable $e) {
        $today = gmdate('Y-m-d');
    }
    $d = new DateTime($day . ' 12:00:00', new DateTimeZone('UTC'));
    $orig = (int)$d->format('j');
    for ($guard = 0; $guard < 1500; $guard++) {
        if ($f[1] === 'WEEKLY' && $days) {
            // the next chosen weekday; after Sunday the week jumps by the interval
            $d->modify('+1 day');
            if ((int)$d->format('N') === 1 && $n > 1) $d->modify('+' . (7 * ($n - 1)) . ' days');
            if (!in_array((int)$d->format('N'), $days, true)) continue;
        } elseif ($f[1] === 'DAILY') $d->modify("+$n days");
        elseif ($f[1] === 'WEEKLY') $d->modify('+' . (7 * $n) . ' days');
        elseif ($f[1] === 'MONTHLY' || $f[1] === 'YEARLY') {
            // the same day of the month (the last one when the month is shorter)
            $y = (int)$d->format('Y');
            $m = (int)$d->format('n') + ($f[1] === 'MONTHLY' ? $n : 12 * $n);
            $y += intdiv($m - 1, 12);
            $m = ($m - 1) % 12 + 1;
            $last = (int)(new DateTime(sprintf('%04d-%02d-01', $y, $m)))->format('t');
            $d = new DateTime(sprintf('%04d-%02d-%02d 12:00:00', $y, $m, min($orig, $last)), new DateTimeZone('UTC'));
        } else return null;
        $k = $d->format('Y-m-d');
        if (!$fromToday || $k > $today) return $k;
    }
    return null;
}

/**
 * A row of task_items from what the app sends. $old: the task as it is (only the fields sent change). The due moment
 * and the reminder are worked out here; a reminder in the past (of a task not done) is dropped.
 */
function clean_task(array $b, array $l, string $defTz, ?array $old = null): array
{
    $has = fn(string $k) => array_key_exists($k, $b);
    $x = $old ?: ['title' => '', 'notes' => '', 'checklist' => '[]', 'tags' => '', 'priority' => 0, 'starred' => 0, 'col' => first_col($l), 'start_date' => null, 'due_date' => null, 'due_time' => null, 'tz' => $defTz, 'remind_at' => null, 'reminded_at' => null, 'rrule' => ''];
    if ($has('title')) $x['title'] = s($b, 'title', 255);
    if ($has('notes')) $x['notes'] = multiline($b, 'notes', 10000);
    if ($has('checklist')) {
        $cl = [];
        foreach (array_slice(is_array($b['checklist']) ? $b['checklist'] : [], 0, MAX_CHECKLIST) as $c) {
            if (!is_array($c)) continue;
            $tx = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($c['t'] ?? '')) ?? ''), 0, 200);
            if ($tx !== '') $cl[] = ['t' => $tx, 'd' => !empty($c['d'])];
        }
        $x['checklist'] = json_out($cl);
    }
    if ($has('tags')) {
        $tg = [];
        foreach (array_slice(is_array($b['tags']) ? $b['tags'] : [], 0, MAX_TAGS) as $g) {
            $g = mb_strtolower(mb_substr(trim(preg_replace('/[\x00-\x1F\x7F#,]/u', '', (string)$g) ?? ''), 0, 30));
            if ($g !== '' && !in_array($g, $tg, true)) $tg[] = $g;
        }
        $x['tags'] = $tg ? json_out($tg) : '';
    }
    if ($has('priority')) $x['priority'] = max(0, min(3, (int)$b['priority']));
    if ($has('starred')) $x['starred'] = !empty($b['starred']) ? 1 : 0;
    if ($has('col')) {
        $ids = array_column(columns_of($l), 'id');
        $x['col'] = in_array($b['col'], $ids, true) ? $b['col'] : ($x['col'] && in_array($x['col'], $ids, true) ? $x['col'] : first_col($l));
    }
    if ($has('tz')) $x['tz'] = valid_tz($b['tz'], $x['tz'] ?: $defTz);
    if ($has('due')) {
        $x['due_date'] = valid_day($b['due']);
        if (!$x['due_date']) $x['due_time'] = null;
    }
    if ($has('time')) $x['due_time'] = $x['due_date'] ? valid_clock($b['time']) : null;
    // the start day: never after the due day (a start alone becomes the due day too); no due day, no start
    if ($has('start')) $x['start_date'] = valid_day($b['start']);
    if (!empty($x['start_date']) && !$x['due_date']) $x['due_date'] = $x['start_date'];
    if (!$x['due_date'] || ($x['start_date'] ?? null) === $x['due_date']) $x['start_date'] = null;
    if (!empty($x['start_date']) && $x['start_date'] > $x['due_date']) [$x['start_date'], $x['due_date']] = [$x['due_date'], $x['start_date']];
    $x['due_at'] = $x['due_date'] && $x['due_time'] ? wall_to_utc($x['due_date'], $x['due_time'], $x['tz']) : null;
    // a habit repeats with no due day (its days are its rrule); any other task needs a due day to repeat
    $habit = ($l['view'] ?? '') === 'habits';
    if ($has('rrule')) $x['rrule'] = $x['due_date'] || $habit ? clean_task_rrule((string)$b['rrule']) : '';
    if (!$x['due_date'] && !$habit) $x['rrule'] = '';
    if ($has('remind')) {
        $r = utc_time($b['remind'] ?? null);
        if ($r !== ($x['remind_at'] ?? null)) $x['reminded_at'] = null;
        $x['remind_at'] = $r;
    }
    return $x;
}

function insert_task(int $listId, array $x, ?int $position = null): string
{
    $tid = new_code('task_items', 'tid');
    if ($position === null) $position = (int)q('SELECT COALESCE(MIN(position), 1000) - 10 FROM ' . t('task_items') . ' WHERE list_id = ? AND done_at IS NULL', [$listId])->fetchColumn();
    q('INSERT INTO ' . t('task_items') . ' (tid, list_id, title, notes, checklist, tags, priority, starred, col, position, start_date, due_date, due_time, due_at, tz, remind_at, reminded_at, rrule, log, done_at, cal_eid, sch_pid, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [$tid, $listId, $x['title'], $x['notes'], $x['checklist'] ?? '[]', $x['tags'], $x['priority'], $x['starred'], $x['col'], $position,
        $x['start_date'] ?? null, $x['due_date'], $x['due_time'], $x['due_at'], $x['tz'], $x['remind_at'], $x['reminded_at'] ?? null, $x['rrule'], $x['log'] ?? null, $x['done_at'] ?? null, $x['cal_eid'] ?? null, $x['sch_pid'] ?? null, now_utc(), now_utc()]);
    return $tid;
}

function update_task(int $id, array $x): void
{
    q('UPDATE ' . t('task_items') . ' SET title = ?, notes = ?, checklist = ?, tags = ?, priority = ?, starred = ?, col = ?, start_date = ?, due_date = ?, due_time = ?, due_at = ?, tz = ?, remind_at = ?, reminded_at = ?, rrule = ?, updated_at = ? WHERE id = ?',
        [$x['title'], $x['notes'], $x['checklist'] ?? '[]', $x['tags'], $x['priority'], $x['starred'], $x['col'], $x['start_date'] ?? null, $x['due_date'], $x['due_time'], $x['due_at'], $x['tz'], $x['remind_at'], $x['reminded_at'] ?? null, $x['rrule'], now_utc(), $id]);
}

/** A task of the account with its list (FOR UPDATE inside a transaction), or null. */
function task_of(array $u, $tid, bool $lock = false): ?array
{
    $tid = valid_code($tid);
    if ($tid === '') return null;
    $x = q('SELECT i.*, l.lid, l.user_id FROM ' . t('task_items') . ' i JOIN ' . t('task_lists') . ' l ON l.id = i.list_id WHERE i.tid = ? AND l.user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$tid, $u['id']])->fetch();
    return $x ?: null;
}

function list_row(int $id): array
{
    return q('SELECT * FROM ' . t('task_lists') . ' WHERE id = ?', [$id])->fetch();
}

/**
 * Ticks a task (or takes the tick away). A repeating task that is ticked plans the next one: a copy with the next due day
 * (the reminder moves by the same amount, the checklist starts again) is added to the same list. Returns the new task
 * (or null). On a board the task moves to the column of done tasks, and back to the first one when the tick goes.
 */
function set_done(array $x, bool $done, string $tz): ?string
{
    $l = list_row((int)$x['list_id']);
    $col = $x['col'];
    if ($done && done_col($l) !== '') $col = done_col($l);
    if (!$done && $col === done_col($l)) $col = first_col($l);
    q('UPDATE ' . t('task_items') . ' SET done_at = ?, col = ?, updated_at = ? WHERE id = ?', [$done ? now_utc() : null, $col, now_utc(), $x['id']]);
    if (!$done || $x['rrule'] === '' || !$x['due_date'] || $x['done_at'] !== null) return null;
    $next = next_due($x['rrule'], $x['due_date'], true, $x['tz'] ?: $tz);
    if (!$next) return null;
    $shift = strtotime($next . ' UTC') - strtotime($x['due_date'] . ' UTC');
    $copy = $x;
    $copy['due_date'] = $next;
    $copy['start_date'] = !empty($x['start_date']) ? gmdate('Y-m-d', strtotime($x['start_date'] . ' UTC') + $shift) : null;
    $copy['due_at'] = $x['due_time'] ? wall_to_utc($next, $x['due_time'], $x['tz']) : null;
    $copy['remind_at'] = $x['remind_at'] ? gmdate('Y-m-d H:i:s', strtotime($x['remind_at'] . ' UTC') + $shift) : null;
    $copy['reminded_at'] = null;
    $copy['done_at'] = null;
    $copy['cal_eid'] = null;
    $copy['col'] = first_col($l);
    $copy['checklist'] = json_out(array_map(fn($c) => ['t' => $c['t'], 'd' => false], json_decode((string)($x['checklist'] ?? '[]'), true) ?: []));
    return insert_task((int)$x['list_id'], $copy, (int)$x['position']);
}

/** Everything the app works with: the open tasks of the lists, and the ones done in the last 60 days. */
function tasks_of(array $lists): array
{
    if (!$lists) return [];
    $byId = [];
    foreach ($lists as $l) $byId[(int)$l['id']] = $l;
    $rows = q('SELECT * FROM ' . t('task_items') . ' WHERE list_id IN (' . implode(',', array_keys($byId)) . ') AND (done_at IS NULL OR done_at > ?) ORDER BY position, id LIMIT 20000',
        [gmdate('Y-m-d H:i:s', time() - 60 * 86400)])->fetchAll();
    return array_map(fn($x) => out_task($x, $byId[(int)$x['list_id']]), $rows);
}

// ------------------------------------------------------------------ habits

/** The days a habit was done, clean: valid days, none in the future, unique, sorted, the last 400. */
function clean_log($log, string $tz): array
{
    try {
        $today = (new DateTime('now', new DateTimeZone($tz)))->format('Y-m-d');
    } catch (Throwable $e) {
        $today = gmdate('Y-m-d');
    }
    $out = [];
    foreach (is_array($log) ? $log : [] as $d) if (($d = valid_day($d)) && $d <= $today) $out[$d] = true;
    $out = array_keys($out);
    sort($out);
    return array_slice($out, -400);
}

// ------------------------------------------------------------------ SavSchedules

/**
 * What SavSchedules asks of the account, as read-only to-dos (`why`):
 *   decide  an own poll with answers and no date chosen yet: choose it (due: its deadline, if any)
 *   booked  a place taken in a sheet of somebody else, still to come
 *   gfinal  the date chosen for a poll the account answered, still to come
 * Every item opens SavSchedules (`link`). The polls made from a task are joined to it: `final` gives its date.
 */
function schedule_todos(array $u): array
{
    $sch = rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savschedules/';
    $out = [];
    $now = gmdate('Y-m-d H:i:s', time() - 3600);
    $today = gmdate('Y-m-d');
    $rows = q('SELECT s.*, (SELECT COUNT(*) FROM ' . t('responses') . ' r WHERE r.schedule_id = s.id) answers FROM ' . t('schedules') . " s
        WHERE s.owner_id = ? AND s.kind = 'poll' AND s.deleted_at IS NULL AND s.status <> 'suspended' AND s.final_option_id IS NULL ORDER BY s.updated_at DESC LIMIT 60", [$u['id']])->fetchAll();
    foreach ($rows as $s) {
        if ((int)$s['answers'] === 0) continue;
        $set = settings_of($s);
        $dl = $set['deadline'] ? gmdate('Y-m-d', strtotime($set['deadline'])) : null;
        $out[] = ['id' => 'sch-d-' . $s['pid'], 'why' => 'decide', 'pid' => $s['pid'], 'title' => $s['title'], 'answers' => (int)$s['answers'], 'due' => $dl, 'time' => null, 'start' => null,
            'closed' => is_closed($s), 'color' => SCH_COLORS[$set['color']] ?? SCH_COLORS['blue'], 'link' => $sch . '#/r/' . $s['pid']];
    }
    $rows = q('SELECT s.*, own.name owner_name, o.id oid, o.starts_at, o.ends_at, o.day, o.label, c.value FROM ' . t('responses') . ' r JOIN ' . t('schedules') . ' s ON s.id = r.schedule_id
        JOIN ' . t('users') . ' own ON own.id = s.owner_id JOIN ' . t('options') . ' o ON o.schedule_id = s.id LEFT JOIN ' . t('choices') . ' c ON c.response_id = r.id AND c.option_id = o.id
        WHERE r.user_id = ? AND s.owner_id <> ? AND s.deleted_at IS NULL AND s.status <> \'suspended\' AND ((o.day IS NOT NULL AND o.day >= ?) OR o.starts_at >= ?)
        ORDER BY COALESCE(o.day, o.starts_at) LIMIT 300', [$u['id'], $u['id'], $today, $now])->fetchAll();
    foreach ($rows as $r) {
        $isSlot = $r['kind'] === 'slots';
        if ($isSlot && (int)($r['value'] ?? 0) !== 2) continue;
        if (!$isSlot && ($r['final_option_id'] === null || (int)$r['final_option_id'] !== (int)$r['oid'])) continue;
        $set = settings_of($r);
        $out[] = ['id' => 'sch-' . ($isSlot ? 'b' : 'f') . '-' . $r['pid'] . '-' . $r['oid'], 'why' => $isSlot ? 'booked' : 'gfinal', 'pid' => $r['pid'],
            'title' => $r['title'] . ($r['label'] !== '' ? ' · ' . $r['label'] : ''), 'owner' => $r['owner_name'],
            'due' => $r['day'] ?: null, 'start' => $r['day'] ? null : iso($r['starts_at']), 'end' => $r['day'] || !$r['ends_at'] ? null : iso($r['ends_at']), 'tz' => $set['tz'],
            'color' => SCH_COLORS[$set['color']] ?? SCH_COLORS['blue'], 'link' => $sch . '#/s/' . $r['pid']];
    }
    return $out;
}

/** The polls made from tasks: their state (open, closed) and the date chosen, by pid. */
function linked_schedules(array $pids): array
{
    $pids = array_values(array_unique(array_filter($pids, fn($p) => is_string($p) && valid_pid($p))));
    if (!$pids) return [];
    $sch = rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savschedules/';
    $out = [];
    $rows = q('SELECT s.*, o.day fday, o.starts_at fstart, o.ends_at fend, (SELECT COUNT(*) FROM ' . t('responses') . ' r WHERE r.schedule_id = s.id) answers FROM ' . t('schedules') . ' s
        LEFT JOIN ' . t('options') . ' o ON o.id = s.final_option_id WHERE s.pid IN (' . implode(',', array_fill(0, count($pids), '?')) . ') AND s.deleted_at IS NULL', $pids)->fetchAll();
    foreach ($rows as $s) {
        $out[$s['pid']] = ['title' => $s['title'], 'answers' => (int)$s['answers'], 'closed' => is_closed($s), 'final' => $s['final_option_id'] ? ($s['fday'] ?: iso($s['fstart'])) : null,
            'finalAllDay' => (bool)$s['fday'], 'finalEnd' => $s['fend'] ? iso($s['fend']) : null, 'tz' => settings_of($s)['tz'], 'link' => $sch . '#/r/' . $s['pid']];
    }
    return $out;
}

// ------------------------------------------------------------------ SavCalendar

/** The tables of SavCalendar exist (created here when the account never opened the calendar). */
function ensure_calendar_schema(): void
{
    $v = (int)q('SELECT v FROM ' . t('meta') . " WHERE k = 'cal_schema_version'")->fetchColumn();
    if ($v >= 1) return;
    if (!defined('CAL_SCHEMA_VERSION')) define('CAL_SCHEMA_VERSION', 1);
    require_once dirname(__DIR__, 2) . '/savcalendar/lib/schema.php';
    install_cal_schema(db(), (string)config_value('prefix', 'sch_'));
}

/** The calendars of one's own in SavCalendar (the first one is made, as SavCalendar would, when there is none). */
function own_calendars(array $u, string $tz): array
{
    ensure_calendar_schema();
    $cals = q('SELECT cid, name, color, tz FROM ' . t('cal_calendars') . " WHERE user_id = ? AND kind = 'local' ORDER BY position, id", [$u['id']])->fetchAll();
    if ($cals) return $cals;
    q('INSERT IGNORE INTO ' . t('cal_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], json_out(['tz' => valid_tz($tz)]), now_utc()]);
    q('INSERT INTO ' . t('cal_calendars') . ' (cid, user_id, kind, name, color, tz, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
        [new_code('cal_calendars', 'cid'), $u['id'], 'local', ($u['ui_lang'] ?? '') === 'it' ? 'Personale' : 'Personal', '#c93a2f', valid_tz($tz), 0, now_utc(), now_utc()]);
    return q('SELECT cid, name, color, tz FROM ' . t('cal_calendars') . " WHERE user_id = ? AND kind = 'local' ORDER BY position, id", [$u['id']])->fetchAll();
}

/**
 * A task becomes an event of one's own calendar in SavCalendar: on its due day (whole day, or from its time for
 * $minutes), or at the time chosen in the dialog. The description links back to the task. Returns [eid, day].
 */
function task_to_event(array $u, array $x, array $b): array
{
    $tz = valid_tz($b['tz'] ?? '', $x['tz'] ?: 'UTC');
    $cals = own_calendars($u, $tz);
    $cid = valid_code($b['cal'] ?? '');
    $cal = null;
    foreach ($cals as $c) if ($c['cid'] === $cid) $cal = $c;
    if (!$cal) {
        $p = q('SELECT prefs FROM ' . t('cal_profiles') . ' WHERE user_id = ?', [$u['id']])->fetchColumn();
        $def = (json_decode((string)$p, true) ?: [])['defaultCal'] ?? '';
        foreach ($cals as $c) if ($c['cid'] === $def) $cal = $c;
        $cal ??= $cals[0];
    }
    $calId = (int)q('SELECT id FROM ' . t('cal_calendars') . ' WHERE cid = ?', [$cal['cid']])->fetchColumn();
    $day = valid_day($b['day'] ?? null) ?? $x['due_date'] ?? null;
    if (!$day) fail('bad_time', 422);
    $time = array_key_exists('time', $b) ? valid_clock($b['time']) : $x['due_time'];
    $minutes = max(5, min(24 * 60, (int)($b['minutes'] ?? 60)));
    if ($time) {
        $start = wall_to_utc($day, $time, $tz);
        if (!$start) fail('bad_time', 422);
        $end = gmdate('Y-m-d H:i:s', strtotime($start . ' UTC') + $minutes * 60);
        $all = 0;
    } else {
        $start = $day . ' 00:00:00';
        $end = gmdate('Y-m-d', strtotime($day . ' UTC') + 86400) . ' 00:00:00';
        $all = 1;
    }
    $link = app_url() . '#/t/' . $x['tid'];
    $descr = trim((string)$x['notes']);
    $descr = mb_substr(($descr !== '' ? $descr . "\n\n" : '') . 'SavTasks: ' . $link, 0, 8000);
    $eid = new_code('cal_events', 'eid');
    q('INSERT INTO ' . t('cal_events') . ' (eid, calendar_id, uid, recur_id, title, descr, place, url, all_day, starts_at, ends_at, tz, rrule, rrule_until, exdates, status, busy, color, created_at, updated_at)
        VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?)', [$eid, $calId, bin2hex(random_bytes(12)) . '@savtasks', $x['title'] !== '' ? $x['title'] : 'Task', $descr, '', $link, $all, $start, $end, $tz, '', '[]', 'confirmed', 1, '', now_utc(), now_utc()]);
    return [$eid, $day, $cal['name']];
}

/** The events made from tasks that still exist: eid => {day, allDay, start, calendar}. */
function linked_events(array $u, array $eids): array
{
    $eids = array_values(array_unique(array_filter($eids, fn($e) => valid_code($e) !== '')));
    if (!$eids) return [];
    try {
        $rows = q('SELECT e.eid, e.all_day, e.starts_at, e.tz, c.name FROM ' . t('cal_events') . ' e JOIN ' . t('cal_calendars') . ' c ON c.id = e.calendar_id
            WHERE c.user_id = ? AND e.eid IN (' . implode(',', array_fill(0, count($eids), '?')) . ')', array_merge([$u['id']], $eids))->fetchAll();
    } catch (PDOException $e) {
        return []; // SavCalendar was never opened on this database
    }
    $out = [];
    foreach ($rows as $r) $out[$r['eid']] = ['allDay' => (bool)$r['all_day'], 'start' => $r['all_day'] ? substr($r['starts_at'], 0, 10) : iso($r['starts_at']), 'calendar' => $r['name']];
    return $out;
}

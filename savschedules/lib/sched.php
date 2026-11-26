<?php
/**
 * SavSchedules — what a schedule is and who can do what with it.
 *
 * A schedule is a poll (everyone says which dates suit them: yes, if need be) or a sheet of slots (each slot holds
 * `capacity` people; when it is full nobody else can take it). Its owner chooses who may answer: anyone with the link
 * (a name is enough) or only people signed in to SavSchedules.
 *
 * Unique slots: every answer locks the row of its schedule (SELECT … FOR UPDATE) before counting the places, so two people
 * pressing at the same moment are served one after the other and the second one is told the slot is gone.
 */

declare(strict_types=1);

const SETTINGS_DEFAULT = [
    'access' => 'open',      // open: anyone with the link · account: only signed-in people
    'hidden' => false,       // people who answer do not see the names and answers of the others
    'maybe' => true,         // poll: "if need be" besides yes
    'maxPer' => 1,           // slots: places one person may take (0 = no limit)
    'minPer' => 0,           // poll: dates one person must accept at least (0 = none)
    'deadline' => null,      // ISO time after which nobody can answer
    'notify' => true,        // an email to the owner at every answer
    'askEmail' => 'optional',// no | optional | required (for people without an account)
    'note' => true,          // people may leave a short note
    'tz' => 'Europe/Rome',   // time zone the owner planned in (the times are kept in UTC)
    'color' => 'blue',
    'duration' => 60,        // minutes: length of a new slot in the editor
    'cap' => 1,              // slots: places of a new slot in the editor
];
const COLORS = ['blue', 'violet', 'green', 'coral', 'amber', 'pink', 'teal', 'slate'];

function q(string $sql, array $args = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

function new_pid(): string
{
    $abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    do {
        $p = '';
        for ($i = 0; $i < 10; $i++) $p .= $abc[random_int(0, strlen($abc) - 1)];
    } while (q('SELECT 1 FROM ' . t('schedules') . ' WHERE pid = ?', [$p])->fetchColumn());
    return $p;
}

function valid_pid($v): string
{
    return is_string($v) && preg_match('/^[a-z0-9]{10}$/', $v) ? $v : '';
}

function sch_by_pid(string $pid, bool $lock = false): ?array
{
    if (!valid_pid($pid)) return null;
    $st = q('SELECT * FROM ' . t('schedules') . ' WHERE pid = ?' . ($lock ? ' FOR UPDATE' : ''), [$pid]);
    return $st->fetch() ?: null;
}

function settings_of(array $s): array
{
    $x = json_decode((string)$s['settings'], true);
    return array_merge(SETTINGS_DEFAULT, is_array($x) ? $x : []);
}

/** A time sent by the browser (ISO 8601, any offset) as a UTC datetime of the database, or null. */
function utc_time($v): ?string
{
    if (!is_string($v) || $v === '' || strlen($v) > 40) return null;
    $t = strtotime($v);
    if ($t === false || $t < 946684800 || $t > 4102444800) return null; // 2000–2100
    return gmdate('Y-m-d H:i:s', $t);
}

function clean_settings($in, string $kind): array
{
    $in = is_array($in) ? $in : [];
    $o = SETTINGS_DEFAULT;
    $o['access'] = ($in['access'] ?? '') === 'account' ? 'account' : 'open';
    foreach (['hidden', 'maybe', 'notify', 'note'] as $k) if (array_key_exists($k, $in)) $o[$k] = (bool)$in[$k];
    $o['maxPer'] = max(0, min(MAX_OPTIONS, (int)($in['maxPer'] ?? 1)));
    $o['minPer'] = max(0, min(MAX_OPTIONS, (int)($in['minPer'] ?? 0)));
    $d = utc_time($in['deadline'] ?? null);
    $o['deadline'] = $d ? iso($d) : null;
    $o['askEmail'] = in_array($in['askEmail'] ?? '', ['no', 'optional', 'required'], true) ? $in['askEmail'] : 'optional';
    $tz = (string)($in['tz'] ?? '');
    $o['tz'] = in_array($tz, timezone_identifiers_list(), true) ? $tz : 'UTC';
    $o['color'] = in_array($in['color'] ?? '', COLORS, true) ? $in['color'] : 'blue';
    $o['duration'] = max(5, min(1440, (int)($in['duration'] ?? 60)));
    $o['cap'] = max(1, min(MAX_CAPACITY, (int)($in['cap'] ?? 1)));
    if ($kind === 'poll') $o['maxPer'] = 0;
    if ($kind === 'slots') { $o['maybe'] = false; $o['minPer'] = 0; }
    return $o;
}

/**
 * The options sent by the editor: [{id?, start, end?, day?, label?, cap?}]. A timed option has start (and end) in ISO,
 * a whole-day option has day (YYYY-MM-DD). Returned clean, sorted by time.
 */
function clean_options($list, string $kind): array
{
    if (!is_array($list)) fail('bad_request', 422);
    if (count($list) > MAX_OPTIONS) fail('too_many_options', 422);
    $out = [];
    foreach ($list as $o) {
        if (!is_array($o)) continue;
        $id = isset($o['id']) && is_int($o['id']) ? $o['id'] : null;
        $label = mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', '', (string)($o['label'] ?? '')) ?? ''), 0, 120);
        $cap = $kind === 'slots' ? max(1, min(MAX_CAPACITY, (int)($o['cap'] ?? 1))) : 1;
        $day = is_string($o['day'] ?? null) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $o['day'], $m) && checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $o['day'] : null;
        $start = $day ? null : utc_time($o['start'] ?? null);
        $end = $day ? null : utc_time($o['end'] ?? null);
        if (!$day && !$start) continue;
        if ($end && $end <= $start) $end = null;
        if ($end && strtotime($end) - strtotime($start) > 7 * 86400) $end = null;
        $out[] = ['id' => $id, 'start' => $start, 'end' => $end, 'day' => $day, 'label' => $label, 'cap' => $cap];
    }
    usort($out, fn($a, $b) => strcmp(($a['day'] ?? substr($a['start'], 0, 10)) . ($a['start'] ?? ''), ($b['day'] ?? substr($b['start'], 0, 10)) . ($b['start'] ?? '')));
    return $out;
}

/** Writes the options of a schedule: those with a known id are changed, the missing ones go (with their answers). */
function save_options(int $sid, array $opts): void
{
    $have = array_map('intval', q('SELECT id FROM ' . t('options') . ' WHERE schedule_id = ?', [$sid])->fetchAll(PDO::FETCH_COLUMN));
    $keep = [];
    foreach ($opts as $o) {
        if ($o['id'] && in_array($o['id'], $have, true)) {
            q('UPDATE ' . t('options') . ' SET starts_at = ?, ends_at = ?, day = ?, label = ?, capacity = ? WHERE id = ?', [$o['start'], $o['end'], $o['day'], $o['label'], $o['cap'], $o['id']]);
            $keep[] = $o['id'];
        } else {
            q('INSERT INTO ' . t('options') . ' (schedule_id, starts_at, ends_at, day, label, capacity) VALUES (?,?,?,?,?,?)', [$sid, $o['start'], $o['end'], $o['day'], $o['label'], $o['cap']]);
        }
    }
    $gone = array_diff($have, $keep);
    if ($gone) q('DELETE FROM ' . t('options') . ' WHERE schedule_id = ? AND id IN (' . implode(',', array_map('intval', $gone)) . ')', [$sid]);
    q('UPDATE ' . t('schedules') . ' SET final_option_id = NULL WHERE id = ? AND final_option_id IS NOT NULL AND final_option_id NOT IN (SELECT id FROM ' . t('options') . ' WHERE schedule_id = ?)', [$sid, $sid]);
}

/** Closed by its owner, by the master admins, or past its deadline. */
function is_closed(array $s): bool
{
    if ($s['status'] !== 'open' || $s['deleted_at'] !== null) return true;
    $d = settings_of($s)['deadline'];
    return $d && strtotime($d) < time();
}

function options_of(int $sid): array
{
    $rows = q('SELECT o.*, COALESCE(SUM(c.value = 2), 0) yes, COALESCE(SUM(c.value = 1), 0) maybe FROM ' . t('options') . ' o LEFT JOIN ' . t('choices') . ' c ON c.option_id = o.id
        WHERE o.schedule_id = ? GROUP BY o.id ORDER BY COALESCE(o.day, DATE(o.starts_at)), o.starts_at, o.id', [$sid])->fetchAll();
    return array_map(fn($o) => ['id' => (int)$o['id'], 'start' => iso($o['starts_at']), 'end' => iso($o['ends_at']), 'day' => $o['day'], 'label' => $o['label'], 'cap' => (int)$o['capacity'],
        'yes' => (int)$o['yes'], 'maybe' => (int)$o['maybe']], $rows);
}

/** The answers, with what each one chose. $full adds the emails (only for the owner). */
function responses_of(int $sid, bool $full, ?int $mine = null): array
{
    $ch = [];
    foreach (q('SELECT c.response_id, c.option_id, c.value FROM ' . t('choices') . ' c JOIN ' . t('responses') . ' r ON r.id = c.response_id WHERE r.schedule_id = ?', [$sid])->fetchAll() as $c) {
        $ch[(int)$c['response_id']][(string)$c['option_id']] = (int)$c['value'];
    }
    $rows = q('SELECT id, user_id, name, email, note, created_at, updated_at FROM ' . t('responses') . ' WHERE schedule_id = ? ORDER BY created_at, id', [$sid])->fetchAll();
    return array_map(function ($r) use ($ch, $full, $mine) {
        $o = ['id' => (int)$r['id'], 'name' => $r['name'], 'note' => $r['note'], 'account' => $r['user_id'] !== null, 'at' => iso($r['updated_at']), 'choices' => (object)($ch[(int)$r['id']] ?? []), 'mine' => $mine !== null && (int)$r['id'] === $mine];
        if ($full) $o['email'] = $r['email'];
        return $o;
    }, $rows);
}

/** The answer of the person asking: their account, or the private key of the answer. */
function my_response(array $s, ?array $u, string $token): ?array
{
    if ($token !== '' && preg_match('/^[a-f0-9]{48}$/', $token)) {
        $r = q('SELECT * FROM ' . t('responses') . ' WHERE schedule_id = ? AND edit_hash = ?', [$s['id'], hash('sha256', $token)])->fetch();
        if ($r) return $r;
    }
    if ($u) {
        $r = q('SELECT * FROM ' . t('responses') . ' WHERE schedule_id = ? AND user_id = ? ORDER BY id LIMIT 1', [$s['id'], $u['id']])->fetch();
        if ($r) return $r;
    }
    return null;
}

/**
 * The schedule as the browser sees it. The owner sees everything; the others see the names and answers only when they
 * are not hidden (the counts of the slots are always there: a full slot must look full).
 */
function out_schedule(array $s, ?array $u, bool $owner, ?array $mine = null): array
{
    $set = settings_of($s);
    $o = q('SELECT name FROM ' . t('users') . ' WHERE id = ?', [$s['owner_id']])->fetchColumn();
    $out = [
        'id' => $s['pid'], 'kind' => $s['kind'], 'title' => $s['title'], 'descr' => (string)$s['descr'], 'place' => $s['place'], 'settings' => $set,
        'status' => $s['status'], 'closed' => is_closed($s), 'final' => $s['final_option_id'] !== null ? (int)$s['final_option_id'] : null,
        'owner' => (string)$o, 'isOwner' => $owner, 'created' => iso($s['created_at']), 'updated' => iso($s['updated_at']),
        'options' => options_of((int)$s['id']),
    ];
    // a poll with hidden answers shows no numbers either: only the owner sees how it is going (a slot must still look full)
    if (!$owner && $set['hidden'] && $s['kind'] === 'poll') $out['options'] = array_map(fn($x) => array_merge($x, ['yes' => 0, 'maybe' => 0]), $out['options']);
    $mineId = $mine ? (int)$mine['id'] : null;
    if ($owner || !$set['hidden']) {
        $out['responses'] = responses_of((int)$s['id'], $owner, $mineId);
    } else {
        $out['responses'] = $mine ? array_values(array_filter(responses_of((int)$s['id'], false, $mineId), fn($r) => $r['mine'])) : [];
        $out['count'] = (int)q('SELECT COUNT(*) FROM ' . t('responses') . ' WHERE schedule_id = ?', [$s['id']])->fetchColumn();
    }
    if ($owner) $out['starred'] = (bool)$s['starred'];
    if ($mine) $out['mine'] = ['id' => (int)$mine['id'], 'name' => $mine['name'], 'email' => $mine['email'], 'note' => $mine['note']];
    return $out;
}

/** A short text of an option for the emails, in the time zone of the schedule. */
function option_text(array $o, string $tz, string $lang): string
{
    $loc = $lang === 'it' ? 'it_IT' : 'en_GB';
    $zone = new DateTimeZone($tz);
    if (!empty($o['day'])) {
        $d = new DateTime($o['day'], $zone);
        $txt = class_exists('IntlDateFormatter') ? (new IntlDateFormatter($loc, IntlDateFormatter::FULL, IntlDateFormatter::NONE, $tz))->format($d) : $d->format('l j F Y');
    } else {
        $a = new DateTime($o['starts_at'] . ' UTC');
        $a->setTimezone($zone);
        $txt = class_exists('IntlDateFormatter') ? (new IntlDateFormatter($loc, IntlDateFormatter::FULL, IntlDateFormatter::SHORT, $tz))->format($a) : $a->format('l j F Y, H:i');
        if (!empty($o['ends_at'])) {
            $b = new DateTime($o['ends_at'] . ' UTC');
            $b->setTimezone($zone);
            $txt .= '–' . $b->format('H:i');
        }
        $txt .= ' (' . $tz . ')';
    }
    return $txt . ($o['label'] !== '' ? ' · ' . $o['label'] : '');
}

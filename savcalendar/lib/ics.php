<?php
/**
 * SavCalendar — iCalendar (RFC 5545), without libraries: reading the .ics files of Google, Outlook, Apple, Thunderbird…
 * and writing the feed other calendars subscribe to.
 *
 * Reading keeps what a calendar shows: the events (VEVENT) with title, place, description, link, start and end (a time
 * in a zone, in UTC, floating, or whole days), status, busy or free, the repetition (RRULE, kept as it is: the app
 * expands it), the exceptions (EXDATE) and the changed occurrences (RECURRENCE-ID). Alarms, attendees and tasks are left
 * out. Zones: IANA names as they are, the names of Windows (Outlook) through a table, the rest by the offsets of the
 * VTIMEZONE of the file; a zone nobody knows is read as UTC.
 */

declare(strict_types=1);

/** The names of Windows used by Outlook and Exchange → IANA (the most common ones). */
const WINDOWS_ZONES = [
    'W. Europe Standard Time' => 'Europe/Berlin', 'Romance Standard Time' => 'Europe/Paris', 'Central Europe Standard Time' => 'Europe/Budapest',
    'Central European Standard Time' => 'Europe/Warsaw', 'GMT Standard Time' => 'Europe/London', 'Greenwich Standard Time' => 'Atlantic/Reykjavik',
    'E. Europe Standard Time' => 'Europe/Chisinau', 'FLE Standard Time' => 'Europe/Kiev', 'GTB Standard Time' => 'Europe/Bucharest',
    'Russian Standard Time' => 'Europe/Moscow', 'Turkey Standard Time' => 'Europe/Istanbul', 'Israel Standard Time' => 'Asia/Jerusalem',
    'Eastern Standard Time' => 'America/New_York', 'Central Standard Time' => 'America/Chicago', 'Mountain Standard Time' => 'America/Denver',
    'US Mountain Standard Time' => 'America/Phoenix', 'Pacific Standard Time' => 'America/Los_Angeles', 'Alaskan Standard Time' => 'America/Anchorage',
    'Hawaiian Standard Time' => 'Pacific/Honolulu', 'Atlantic Standard Time' => 'America/Halifax', 'Canada Central Standard Time' => 'America/Regina',
    'SA Pacific Standard Time' => 'America/Bogota', 'E. South America Standard Time' => 'America/Sao_Paulo', 'Argentina Standard Time' => 'America/Buenos_Aires',
    'Mexico Standard Time' => 'America/Mexico_City', 'Central America Standard Time' => 'America/Guatemala',
    'India Standard Time' => 'Asia/Kolkata', 'China Standard Time' => 'Asia/Shanghai', 'Tokyo Standard Time' => 'Asia/Tokyo', 'Korea Standard Time' => 'Asia/Seoul',
    'Singapore Standard Time' => 'Asia/Singapore', 'Arabian Standard Time' => 'Asia/Dubai', 'Arab Standard Time' => 'Asia/Riyadh', 'SE Asia Standard Time' => 'Asia/Bangkok',
    'AUS Eastern Standard Time' => 'Australia/Sydney', 'E. Australia Standard Time' => 'Australia/Brisbane', 'Cen. Australia Standard Time' => 'Australia/Adelaide',
    'W. Australia Standard Time' => 'Australia/Perth', 'New Zealand Standard Time' => 'Pacific/Auckland', 'South Africa Standard Time' => 'Africa/Johannesburg',
    'Egypt Standard Time' => 'Africa/Cairo', 'Morocco Standard Time' => 'Africa/Casablanca', 'W. Central Africa Standard Time' => 'Africa/Lagos',
    'UTC' => 'UTC', 'Coordinated Universal Time' => 'UTC',
];

/** An IANA zone for a TZID of a file, or '' when it cannot be told. */
function ics_zone(string $tzid, array $vtz = []): string
{
    static $known = null;
    $known ??= array_flip(timezone_identifiers_list());
    $tzid = trim($tzid, " \"'");
    if ($tzid === '') return '';
    if (isset($known[$tzid])) return $tzid;
    if (isset(WINDOWS_ZONES[$tzid])) return WINDOWS_ZONES[$tzid];
    if (in_array(strtoupper($tzid), ['Z', 'GMT', 'UTC', 'ETC/UTC', 'ETC/GMT'], true)) return 'UTC';
    // "/mozilla.org/20070129_1/Europe/Rome", "(GMT+01:00) Amsterdam, Berlin…" and friends: an IANA name inside it
    if (preg_match('~([A-Z][a-z]+(?:_[A-Za-z]+)*/[A-Z][A-Za-z_\-]+(?:/[A-Z][A-Za-z_\-]+)?)~', $tzid, $m) && isset($known[$m[1]])) return $m[1];
    // the VTIMEZONE of the file: a zone of the same offsets (standard and summer), the most common of them first
    if (isset($vtz[$tzid])) {
        [$std, $dst] = $vtz[$tzid];
        $jan = new DateTimeImmutable('2026-01-15 12:00 UTC');
        $jul = new DateTimeImmutable('2026-07-15 12:00 UTC');
        $prefer = ['Europe/Rome', 'Europe/London', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney', 'UTC'];
        foreach (array_merge($prefer, timezone_identifiers_list()) as $z) {
            $zone = new DateTimeZone($z);
            $a = $zone->getOffset($jan);
            $b = $zone->getOffset($jul);
            $north = [$a, $b];
            if ($dst === null ? ($a === $std && $b === $std) : ($north === [$std, $dst] || [$b, $a] === [$std, $dst])) return $z;
        }
    }
    return '';
}

function ics_unescape(string $v): string
{
    return strtr($v, ['\\n' => "\n", '\\N' => "\n", '\\,' => ',', '\\;' => ';', '\\\\' => '\\']);
}

/** The lines of a file, unfolded: [[NAME, [PARAM => value], value], …] */
function ics_lines(string $text): array
{
    if (strncmp($text, "\xEF\xBB\xBF", 3) === 0) $text = substr($text, 3);
    $text = preg_replace("/\r\n?/", "\n", $text);
    $text = preg_replace("/\n[ \t]/", '', $text);
    $out = [];
    foreach (explode("\n", $text) as $line) {
        if ($line === '') continue;
        // the name and the parameters end at the first ":" outside quotes
        $len = strlen($line);
        $q = false;
        $colon = -1;
        for ($i = 0; $i < $len; $i++) {
            $c = $line[$i];
            if ($c === '"') $q = !$q;
            elseif ($c === ':' && !$q) { $colon = $i; break; }
        }
        if ($colon < 1) continue;
        $head = substr($line, 0, $colon);
        $value = substr($line, $colon + 1);
        preg_match_all('/;([A-Za-z0-9\-]+)=("[^"]*"|[^;]*)/', $head, $pm, PREG_SET_ORDER);
        $name = strtoupper((string)strtok($head, ';'));
        $params = [];
        foreach ($pm as $p) $params[strtoupper($p[1])] = trim($p[2], '"');
        $out[] = [$name, $params, $value];
    }
    return $out;
}

/** An offset like "+0100" or "-053000" in seconds. */
function ics_offset(string $v): ?int
{
    if (!preg_match('/^([+-])(\d{2})(\d{2})(\d{2})?$/', trim($v), $m)) return null;
    $s = (int)$m[2] * 3600 + (int)$m[3] * 60 + (int)($m[4] ?? 0);
    return $m[1] === '-' ? -$s : $s;
}

/**
 * A date or a time of the file: ['allDay' => bool, 'utc' => 'Y-m-d H:i:s', 'tz' => zone]. Whole days are midnight of the
 * date (they never move with the zones). A floating time (no zone) is read in $tz, the zone of the calendar.
 */
function ics_time(string $value, array $params, string $tz, array $vtz): ?array
{
    $value = trim($value);
    if (($params['VALUE'] ?? '') === 'DATE' || preg_match('/^\d{8}$/', $value)) {
        if (!preg_match('/^(\d{4})(\d{2})(\d{2})/', $value, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return null;
        return ['allDay' => true, 'utc' => "$m[1]-$m[2]-$m[3] 00:00:00", 'tz' => $tz];
    }
    if (!preg_match('/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/', $value, $m)) return null;
    $wall = "$m[1]-$m[2]-$m[3] $m[4]:$m[5]:" . ($m[6] ?: '00');
    if (!empty($m[7])) return ['allDay' => false, 'utc' => $wall, 'tz' => $tz];
    $zone = isset($params['TZID']) ? (ics_zone($params['TZID'], $vtz) ?: $tz) : $tz;
    try {
        $d = new DateTimeImmutable($wall, new DateTimeZone($zone));
    } catch (Throwable $e) {
        return null;
    }
    return ['allDay' => false, 'utc' => $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'), 'tz' => $zone];
}

/** A DURATION (P1D, PT1H30M, P2W…) in seconds. */
function ics_duration(string $v): int
{
    if (!preg_match('/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/', trim($v), $m)) return 0;
    $s = ((int)($m[2] ?? 0)) * 604800 + ((int)($m[3] ?? 0)) * 86400 + ((int)($m[4] ?? 0)) * 3600 + ((int)($m[5] ?? 0)) * 60 + (int)($m[6] ?? 0);
    return ($m[1] ?? '') === '-' ? -$s : $s;
}

/** Only the parts of an RRULE the app understands, in a fixed order; '' when it is not a repetition we can show. */
function clean_rrule(string $r): string
{
    $parts = [];
    foreach (explode(';', strtoupper(trim(preg_replace('/^RRULE:/i', '', $r)))) as $p) {
        [$k, $v] = array_pad(explode('=', $p, 2), 2, '');
        $parts[$k] = $v;
    }
    if (!in_array($parts['FREQ'] ?? '', ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'], true)) return '';
    $out = ['FREQ=' . $parts['FREQ']];
    if (isset($parts['INTERVAL']) && preg_match('/^\d{1,3}$/', $parts['INTERVAL']) && (int)$parts['INTERVAL'] > 1) $out[] = 'INTERVAL=' . (int)$parts['INTERVAL'];
    if (isset($parts['COUNT']) && preg_match('/^\d{1,4}$/', $parts['COUNT']) && (int)$parts['COUNT'] > 0) $out[] = 'COUNT=' . (int)$parts['COUNT'];
    elseif (isset($parts['UNTIL']) && preg_match('/^\d{8}(T\d{6}Z?)?$/', $parts['UNTIL'])) $out[] = 'UNTIL=' . $parts['UNTIL'];
    if (isset($parts['BYDAY']) && preg_match('/^([+-]?\d{0,2}(MO|TU|WE|TH|FR|SA|SU),?)+$/', $parts['BYDAY'])) $out[] = 'BYDAY=' . rtrim($parts['BYDAY'], ',');
    if (isset($parts['BYMONTHDAY']) && preg_match('/^(-?\d{1,2},?)+$/', $parts['BYMONTHDAY'])) $out[] = 'BYMONTHDAY=' . rtrim($parts['BYMONTHDAY'], ',');
    if (isset($parts['BYMONTH']) && preg_match('/^(\d{1,2},?)+$/', $parts['BYMONTH'])) $out[] = 'BYMONTH=' . rtrim($parts['BYMONTH'], ',');
    if (isset($parts['BYSETPOS']) && preg_match('/^-?\d{1,3}$/', $parts['BYSETPOS'])) $out[] = 'BYSETPOS=' . $parts['BYSETPOS'];
    if (isset($parts['WKST']) && preg_match('/^(MO|TU|WE|TH|FR|SA|SU)$/', $parts['WKST'])) $out[] = 'WKST=' . $parts['WKST'];
    return implode(';', $out);
}

/** The last possible start of a repetition (UTC), or null when it goes on for ever or ends after a number of times. */
function rrule_until(string $rrule, string $tz): ?string
{
    if (!preg_match('/UNTIL=(\d{8})(T(\d{6})(Z)?)?/', $rrule, $m)) return null;
    $wall = substr($m[1], 0, 4) . '-' . substr($m[1], 4, 2) . '-' . substr($m[1], 6, 2) . ' ' . (isset($m[3]) ? substr($m[3], 0, 2) . ':' . substr($m[3], 2, 2) . ':' . substr($m[3], 4, 2) : '23:59:59');
    try {
        $d = new DateTimeImmutable($wall, new DateTimeZone(!empty($m[4]) ? 'UTC' : $tz));
        return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    } catch (Throwable $e) {
        return null;
    }
}

/**
 * The events of a file: ['name' => calendar name, 'tz' => zone, 'events' => [event…]]. Each event is ready for
 * cal_events: uid, recur_id, title, descr, place, url, all_day, starts_at, ends_at, tz, rrule, exdates (list), status, busy.
 * $tz: the zone for floating times when the file does not say one.
 */
function ics_parse(string $text, string $tz = 'UTC', int $max = MAX_EVENTS): array
{
    $lines = ics_lines($text);
    if (!$lines || $lines[0][0] !== 'BEGIN' || strtoupper($lines[0][2]) !== 'VCALENDAR') throw new RuntimeException('ics_invalid');
    // first the zones of the file and the name and zone of the calendar
    $vtz = [];
    $name = '';
    $cur = null;
    $sub = null;
    $offs = [];
    foreach ($lines as [$k, $p, $v]) {
        if ($k === 'X-WR-CALNAME' && $name === '') $name = ics_unescape($v);
        if ($k === 'X-WR-TIMEZONE' && ($z = ics_zone($v))) $tz = $z;
        if ($k === 'BEGIN' && strtoupper($v) === 'VTIMEZONE') { $cur = ''; $offs = []; }
        elseif ($cur !== null && $k === 'TZID') $cur = $v;
        elseif ($cur !== null && $k === 'BEGIN') $sub = strtoupper($v);
        elseif ($cur !== null && $k === 'TZOFFSETTO' && $sub) $offs[$sub] = ics_offset($v);
        elseif ($cur !== null && $k === 'END' && strtoupper($v) === 'VTIMEZONE') {
            if ($cur !== '') $vtz[$cur] = [$offs['STANDARD'] ?? ($offs['DAYLIGHT'] ?? 0), isset($offs['STANDARD'], $offs['DAYLIGHT']) ? $offs['DAYLIGHT'] : null];
            $cur = null;
            $sub = null;
        }
    }
    $events = [];
    $ev = null;
    $depth = 0;
    foreach ($lines as [$k, $p, $v]) {
        if ($k === 'BEGIN') {
            if (strtoupper($v) === 'VEVENT' && $ev === null) { $ev = ['exdates' => []]; $depth = 0; continue; }
            if ($ev !== null) $depth++; // a VALARM inside the event
            continue;
        }
        if ($k === 'END') {
            if ($ev !== null && $depth > 0) { $depth--; continue; }
            if ($ev !== null && strtoupper($v) === 'VEVENT') {
                $e = ics_event($ev, $tz, $vtz);
                if ($e) $events[] = $e;
                if (count($events) >= $max) break;
                $ev = null;
            }
            continue;
        }
        if ($ev === null || $depth > 0) continue;
        if ($k === 'EXDATE') { foreach (explode(',', $v) as $x) $ev['exdates'][] = [$x, $p]; continue; }
        if (!isset($ev[$k])) $ev[$k] = [$v, $p];
    }
    return ['name' => mb_substr($name, 0, 120), 'tz' => $tz, 'events' => $events];
}

/** One VEVENT read by ics_parse(), as a row for cal_events (or null when it has no start). */
function ics_event(array $ev, string $tz, array $vtz): ?array
{
    if (!isset($ev['DTSTART'])) return null;
    $a = ics_time($ev['DTSTART'][0], $ev['DTSTART'][1], $tz, $vtz);
    if (!$a) return null;
    $b = isset($ev['DTEND']) ? ics_time($ev['DTEND'][0], $ev['DTEND'][1], $tz, $vtz) : null;
    $start = strtotime($a['utc'] . ' UTC');
    if ($b) $end = strtotime($b['utc'] . ' UTC');
    elseif (isset($ev['DURATION'])) $end = $start + ics_duration($ev['DURATION'][0]);
    else $end = $a['allDay'] ? $start + 86400 : $start;
    if ($end < $start) $end = $start;
    if ($a['allDay'] && $end <= $start) $end = $start + 86400;
    $text = fn(string $k, int $max) => isset($ev[$k]) ? mb_substr(trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', ics_unescape($ev[$k][0])) ?? ''), 0, $max) : '';
    $status = strtolower($ev['STATUS'][0] ?? 'confirmed');
    $rrule = isset($ev['RRULE']) ? clean_rrule($ev['RRULE'][0]) : '';
    $ex = [];
    foreach ($ev['exdates'] as [$x, $p]) {
        $t = ics_time($x, $p + (isset($ev['DTSTART'][1]['TZID']) && !isset($p['TZID']) ? ['TZID' => $ev['DTSTART'][1]['TZID']] : []), $a['tz'], $vtz);
        if ($t) $ex[] = $t['allDay'] ? substr($t['utc'], 0, 10) : gmdate('Y-m-d\TH:i:s\Z', strtotime($t['utc'] . ' UTC'));
    }
    $rid = null;
    if (isset($ev['RECURRENCE-ID'])) {
        $r = ics_time($ev['RECURRENCE-ID'][0], $ev['RECURRENCE-ID'][1], $a['tz'], $vtz);
        if ($r) $rid = $r['utc'];
    }
    $url = $text('URL', 500);
    $uid = $text('UID', 255);
    return [
        'uid' => $uid !== '' ? $uid : 'x-' . md5($ev['DTSTART'][0] . ($ev['SUMMARY'][0] ?? '')),
        'recur_id' => $rid,
        'title' => $text('SUMMARY', 255),
        'descr' => $text('DESCRIPTION', 8000),
        'place' => $text('LOCATION', 255),
        'url' => preg_match('~^https?://~i', $url) ? $url : '',
        'all_day' => $a['allDay'] ? 1 : 0,
        'starts_at' => gmdate('Y-m-d H:i:s', $start),
        'ends_at' => gmdate('Y-m-d H:i:s', $end),
        'tz' => $a['tz'],
        'rrule' => $rid ? '' : $rrule,
        'exdates' => array_values(array_unique($ex)),
        'status' => in_array($status, ['tentative', 'cancelled'], true) ? $status : 'confirmed',
        'busy' => strtoupper($ev['TRANSP'][0] ?? 'OPAQUE') === 'TRANSPARENT' ? 0 : 1,
    ];
}

// ------------------------------------------------------------------ writing

function ics_text(string $s): string
{
    return str_replace(["\\", "\r\n", "\n", ',', ';'], ["\\\\", '\\n', '\\n', '\\,', '\\;'], $s);
}

/** Lines longer than 75 bytes are folded (without cutting a character in two). */
function ics_fold(string $line): string
{
    if (strlen($line) <= 75) return $line;
    $out = '';
    $cur = '';
    foreach (preg_split('//u', $line, -1, PREG_SPLIT_NO_EMPTY) as $ch) {
        if (strlen($cur) + strlen($ch) > ($out === '' ? 75 : 74)) {
            $out .= ($out === '' ? '' : "\r\n ") . $cur;
            $cur = '';
        }
        $cur .= $ch;
    }
    return $out . "\r\n " . $cur;
}

/** A VTIMEZONE with the changes of the zone from $from to $to (years), so that every calendar reads the times right. */
function ics_vtimezone(string $tz, int $from, int $to): array
{
    $zone = new DateTimeZone($tz);
    $tr = $zone->getTransitions(gmmktime(0, 0, 0, 1, 1, $from), gmmktime(0, 0, 0, 1, 1, $to + 1));
    $out = ['BEGIN:VTIMEZONE', 'TZID:' . $tz];
    $prev = $tr ? $tr[0]['offset'] : 0;
    $fmt = fn(int $s) => ($s < 0 ? '-' : '+') . sprintf('%02d%02d', intdiv(abs($s), 3600), intdiv(abs($s) % 3600, 60));
    $last = [];
    foreach ($tr as $t) {
        $local = gmdate('Ymd\THis', $t['ts'] + $prev);
        $kind = $t['isdst'] ? 'DAYLIGHT' : 'STANDARD';
        array_push($out, 'BEGIN:' . $kind, 'DTSTART:' . $local, 'TZOFFSETFROM:' . $fmt($prev), 'TZOFFSETTO:' . $fmt($t['offset']), 'TZNAME:' . $t['abbr'], 'END:' . $kind);
        $last[$kind] = [count($out) - 2, $t['ts'] + $prev];
        $prev = $t['offset'];
    }
    // the last change of each kind goes on every year (as the rules of the zone say today): repetitions years ahead keep their hour
    if (isset($last['DAYLIGHT'], $last['STANDARD']) && count($tr) > 2) {
        $days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        $two = [$last['STANDARD'], $last['DAYLIGHT']];
        usort($two, fn($a, $b) => $b[0] <=> $a[0]); // from the end, so the other place does not move
        foreach ($two as [$at, $ts]) {
            $d = (int)gmdate('j', $ts);
            $nth = $d + 7 > (int)gmdate('t', $ts) ? -1 : intdiv($d - 1, 7) + 1;
            array_splice($out, $at, 0, ['RRULE:FREQ=YEARLY;BYMONTH=' . (int)gmdate('n', $ts) . ';BYDAY=' . $nth . $days[(int)gmdate('w', $ts)]]);
        }
    }
    $out[] = 'END:VTIMEZONE';
    return $out;
}

/**
 * A whole calendar: $events are rows of cal_events (or made like them, the items of SavSchedules) with an extra 'link'.
 * The times are written in the zone of each event (with its VTIMEZONE) so that repetitions keep the hour across summer
 * time; whole days as dates.
 */
function ics_write(string $name, string $tz, array $events): string
{
    $now = gmdate('Ymd\THis\Z');
    $zones = [];
    $body = [];
    $years = [(int)gmdate('Y') - 1, (int)gmdate('Y') + 3];
    foreach ($events as $e) {
        $lines = ['BEGIN:VEVENT', 'UID:' . $e['uid'], 'DTSTAMP:' . $now];
        $etz = $e['tz'] ?: 'UTC';
        $a = strtotime($e['starts_at'] . ' UTC');
        $b = strtotime($e['ends_at'] . ' UTC');
        $years[0] = min($years[0], (int)gmdate('Y', $a));
        if ($e['all_day']) {
            $lines[] = 'DTSTART;VALUE=DATE:' . gmdate('Ymd', $a);
            $lines[] = 'DTEND;VALUE=DATE:' . gmdate('Ymd', max($b, $a + 86400));
        } elseif ($etz === 'UTC') {
            $lines[] = 'DTSTART:' . gmdate('Ymd\THis\Z', $a);
            $lines[] = 'DTEND:' . gmdate('Ymd\THis\Z', $b);
        } else {
            $zones[$etz] = true;
            $loc = fn(int $ts) => (new DateTimeImmutable('@' . $ts))->setTimezone(new DateTimeZone($etz))->format('Ymd\THis');
            $lines[] = 'DTSTART;TZID=' . $etz . ':' . $loc($a);
            $lines[] = 'DTEND;TZID=' . $etz . ':' . $loc($b);
        }
        if (!empty($e['recur_id'])) {
            $r = strtotime($e['recur_id'] . ' UTC');
            $lines[] = $e['all_day'] ? 'RECURRENCE-ID;VALUE=DATE:' . gmdate('Ymd', $r) : 'RECURRENCE-ID:' . gmdate('Ymd\THis\Z', $r);
        }
        if (!empty($e['rrule'])) $lines[] = 'RRULE:' . $e['rrule'];
        foreach ((array)($e['exdates'] ?? []) as $x) {
            if (strlen($x) === 10) $lines[] = 'EXDATE;VALUE=DATE:' . str_replace('-', '', $x);
            else $lines[] = 'EXDATE:' . gmdate('Ymd\THis\Z', strtotime($x));
        }
        $lines[] = 'SUMMARY:' . ics_text($e['title'] !== '' ? $e['title'] : '—');
        $descr = trim(($e['descr'] ?? '') . (!empty($e['link']) ? "\n\n" . $e['link'] : ''));
        if ($descr !== '') $lines[] = 'DESCRIPTION:' . ics_text($descr);
        if (($e['place'] ?? '') !== '') $lines[] = 'LOCATION:' . ics_text($e['place']);
        $u = ($e['url'] ?? '') ?: ($e['link'] ?? '');
        if ($u !== '') $lines[] = 'URL:' . $u;
        $lines[] = 'STATUS:' . strtoupper($e['status'] ?? 'confirmed');
        $lines[] = 'TRANSP:' . (($e['busy'] ?? 1) ? 'OPAQUE' : 'TRANSPARENT');
        $lines[] = 'END:VEVENT';
        array_push($body, ...$lines);
    }
    $head = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Illerom//SavCalendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'X-WR-CALNAME:' . ics_text($name), 'X-WR-TIMEZONE:' . $tz, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
    foreach (array_keys($zones) as $z) array_push($head, ...ics_vtimezone($z, $years[0], $years[1]));
    $all = array_merge($head, $body, ['END:VCALENDAR']);
    return implode("\r\n", array_map('ics_fold', $all)) . "\r\n";
}

<?php
/**
 * SavNewsletters — what it puts in SavCalendar (the other apps of SavOffice include this file, they do not call the API).
 *
 *   require_once '…/savnewsletters/lib/calendar.php';
 *   $items = savnewsletters_calendar_items($email, $from, $to, $appUrl);
 *
 * $email   the address of the account in the other app: its owner must have confirmed it there (the caller checks),
 *          and here it must belong to an active account confirmed too (email link or Google), or nothing comes back.
 * $from/$to UTC 'Y-m-d H:i:s', the range [from, to) shown by the calendar.
 * $appUrl  the address of SavNewsletters ending with "/" (e.g. https://www.illerom.eu/savnewsletters/): the links open it.
 *
 * Every newsletter of the groups the account is a member of (any role, groups not suspended) that has a time:
 *   pending   a slot proposed and waiting for a publisher        why 'proposed'  status 'tentative'
 *   scheduled approved, it leaves in that slot                    why 'scheduled' status 'confirmed'
 *   sending   leaving now                                         why 'sending'
 *   sent      already gone (the slot it left in)                  why 'sent'      closed true
 * Each one lasts a slot (30 minutes). The items have the shape of the ones SavCalendar makes for SavSchedules
 * (id, source, title, start, end, tz, color, readOnly, why, status, busy, link…), plus group, role and lang.
 *
 * Self-contained on purpose: no function, constant or global of the rest of SavNewsletters, so it can be loaded next to
 * another app's bootstrap (which has its own q(), t(), credentials()…). It reads savnewsletters/credentials.php in a
 * function scope and opens its own connection (the database of SavNewsletters is not the one of the caller).
 * Any failure (not installed, database down) gives an empty list: the calendar shows the rest anyway.
 */

declare(strict_types=1);

const SAVNEWSLETTERS_CAL_COLOR = '#c2307a';
const SAVNEWSLETTERS_CAL_SLOT = 1800; // seconds: newsletters leave on a 30-minute slot

/** The connection to the database of SavNewsletters, or null. */
function savnewsletters_cal_db(): ?array
{
    static $done = false, $link = null;
    if ($done) return $link;
    $done = true;
    $file = getenv('SAVNEWSLETTERS_CREDENTIALS') ?: (getenv('OPENNEWSLETTER_CREDENTIALS') ?: dirname(__DIR__) . '/credentials.php');
    if (!is_file($file)) return null;
    $read = static function (string $file): array {
        $localhost_db = $username_db = $password_db = $database_name = null;
        $table_prefix = 'on_';
        require $file;
        return [(string)$localhost_db, (string)$username_db, (string)$password_db, (string)$database_name, (string)($table_prefix ?: 'on_')];
    };
    try {
        [$host, $user, $pass, $name, $prefix] = $read($file);
        if ($host === '' || $user === '' || $name === '' || !preg_match('/^[A-Za-z0-9_]{0,20}$/', $prefix)) return null;
        $port = 3306;
        if (preg_match('/^(.+):(\d+)$/', $host, $m)) {
            $host = $m[1];
            $port = (int)$m[2];
        }
        $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $name), $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        return $link = [$pdo, $prefix];
    } catch (Throwable $e) {
        error_log('SavNewsletters calendar: ' . $e->getMessage());
        return null;
    }
}

function savnewsletters_calendar_items(string $email, string $from, string $to, string $appUrl): array
{
    $email = mb_strtolower(trim($email));
    $re = '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/';
    if ($email === '' || !preg_match($re, $from) || !preg_match($re, $to)) return [];
    $link = savnewsletters_cal_db();
    if (!$link) return [];
    [$pdo, $p] = $link;
    $appUrl = rtrim($appUrl, '/') . '/';
    // the time of a newsletter: the slot proposed, the slot approved, or the slot it left in
    $when = "CASE n.status WHEN 'pending' THEN n.proposed_at WHEN 'sent' THEN COALESCE(n.scheduled_at, n.started_at, n.sent_at) ELSE n.scheduled_at END";
    try {
        $st = $pdo->prepare("SELECT n.id, n.group_id, n.subject, n.lang, n.status, $when AS at, g.name AS group_name, g.timezone, m.role
            FROM `{$p}users` u
            JOIN `{$p}members` m ON m.user_id = u.id
            JOIN `{$p}groups` g ON g.id = m.group_id AND g.status = 'active'
            JOIN `{$p}newsletters` n ON n.group_id = g.id AND n.status IN ('pending', 'scheduled', 'sending', 'sent')
            WHERE u.email = ? AND u.status = 'active' AND (u.email_verified_at IS NOT NULL OR u.google_sub IS NOT NULL)
              AND $when >= ? AND $when < ?
            ORDER BY at, n.id LIMIT 2000");
        $st->execute([$email, gmdate('Y-m-d H:i:s', strtotime($from . ' UTC') - SAVNEWSLETTERS_CAL_SLOT), $to]);
        $rows = $st->fetchAll();
    } catch (Throwable $e) {
        error_log('SavNewsletters calendar: ' . $e->getMessage());
        return [];
    }
    $why = ['pending' => 'proposed', 'scheduled' => 'scheduled', 'sending' => 'sending', 'sent' => 'sent'];
    $out = [];
    foreach ($rows as $r) {
        $t = strtotime($r['at'] . ' UTC');
        $out[] = [
            'id' => 'nl-' . $r['id'], 'source' => 'newsletters', 'nid' => (int)$r['id'], 'gid' => (int)$r['group_id'],
            'title' => (string)$r['subject'], 'place' => '', 'descr' => (string)$r['group_name'],
            'allDay' => false, 'start' => gmdate('Y-m-d\TH:i:s\Z', $t), 'end' => gmdate('Y-m-d\TH:i:s\Z', $t + SAVNEWSLETTERS_CAL_SLOT),
            'tz' => (string)$r['timezone'], 'color' => SAVNEWSLETTERS_CAL_COLOR, 'readOnly' => true,
            'why' => $why[$r['status']], 'status' => $r['status'] === 'pending' ? 'tentative' : 'confirmed', 'busy' => false,
            'link' => $appUrl . '#/g/' . $r['group_id'] . '/n/' . $r['id'],
            'group' => (string)$r['group_name'], 'role' => (string)$r['role'], 'lang' => $r['lang'] === null ? '' : (string)$r['lang'],
            'closed' => $r['status'] === 'sent',
        ];
    }
    return $out;
}

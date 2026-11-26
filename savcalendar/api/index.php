<?php
/**
 * SavCalendar — JSON API.  api/index.php?r=<action>
 *
 * Accounts:     the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login, auth.google
 *               (and the routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *               auth.reset, auth.profile, auth.export, auth.delete
 * Calendar:     cal.init, cal.prefs, cal.events, cal.cal.save, cal.cal.delete, cal.cal.order, cal.cal.export, cal.cal.ics, cal.subscribe, cal.refresh, cal.import,
 *               cal.feed, cal.event.save, cal.event.delete, cal.event.get, cal.search, cal.sch.create
 * Feed:         ../feed/<token>.ics (no account: the private link is the key)
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
// what a schedule is: the library of SavSchedules itself, so the two apps never disagree
require dirname(__DIR__, 2) . '/savschedules/lib/sched.php';
require __DIR__ . '/../lib/ics.php';
require __DIR__ . '/../lib/fetch.php';
require __DIR__ . '/../lib/cal.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavCalendar API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false, 'googleClientId' => '']);
if (!credentials()) fail('not_installed', 503);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) fail('bad_request', 415);
remember_app_url();

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}

function writer(bool $unverifiedOk = false): array
{
    only('POST');
    $u = require_user($unverifiedOk);
    require_csrf($u);
    return $u;
}

function reader(): array
{
    only('GET');
    return require_user();
}

function validate_password(string $pw): void
{
    if (mb_strlen($pw) < 8) fail('password_short', 422);
    if (mb_strlen($pw) > 200) fail('password_long', 422);
}

function ui_lang(array $b): string
{
    $l = (string)($b['lang'] ?? '');
    return in_array($l, LANGS, true) ? $l : 'en';
}

function valid_email(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) fail('email_invalid', 422);
}

function user_row(int $id): array
{
    $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: [];
}

function new_user(string $name, string $email, string $hash, ?string $googleSub, string $lang): int
{
    db()->prepare('INSERT INTO ' . t('users') . ' (name, email, password_hash, google_sub, ui_lang, created_at, last_login_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([$name, $email, $hash, $googleSub, $lang, now_utc(), now_utc()]);
    return (int)db()->lastInsertId();
}

function signed_in(int $uid): void
{
    db()->prepare('UPDATE ' . t('users') . ' SET last_login_at = ? WHERE id = ?')->execute([now_utc(), $uid]);
    $csrf = create_auth_session($uid);
    send_json(['ok' => true, 'user' => public_user(user_row($uid)), 'csrf' => $csrf]);
}

function require_master(): array
{
    $u = require_user();
    if (!is_master($u)) fail('forbidden', 403);
    return $u;
}

// ---------- Google and SavAccount: signing in and joining an account that already exists ----------

require dirname(__DIR__, 2) . '/identity/identity.php';

/** The language of the messages of the sign-in: the app sends it with every request. */
function identity_lang(): string
{
    $h = strtolower((string)($_SERVER['HTTP_X_LANG'] ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')));
    return strpos($h, 'it') === 0 ? 'it' : 'en';
}

identity_setup([
    'name' => 'SavCalendar', 'cookie' => 'savcalendar', 'lang' => fn() => identity_lang(),
    'fail' => function (string $code, int $http): void {
        fail($code, $http);
    },
    'accepted' => fn(array $b) => !empty($b['acceptTerms']),
    'create' => fn(array $who, array $b) => new_user($who['name'] ?: explode('@', $who['email'])[0], $who['email'], '', null, ui_lang($b)),
    'writer' => fn() => writer(),
]);
identity_route($r);

switch ($r) {

    // ================================================================ accounts

    case 'auth.config':
        send_json(['ok' => true, 'installed' => true, 'googleClientId' => (string)config_value('google_client_id', ''), 'savAccount' => sav_enabled(), 'mailReady' => mail_settings() !== null]);

    case 'auth.me':
        only('GET');
        $u = current_user();
        if (!$u || $u['status'] !== 'active') send_json(['ok' => true, 'user' => null]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id'])), 'csrf' => $u['csrf_token']]);

    case 'auth.register':
        only('POST');
        if (too_many_attempts('register', 5, 60)) fail('rate_limited', 429);
        $b = body();
        $name = s($b, 'name', 80);
        $email = mb_strtolower(s($b, 'email', 190));
        $pw = (string)($b['password'] ?? '');
        if (mb_strlen($name) < 2) fail('name_required', 422);
        valid_email($email);
        validate_password($pw);
        if (empty($b['acceptTerms'])) fail('terms_required', 422);
        // The same answer whether the address is new or already registered, so nobody can find out who has an account
        $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE email = ?');
        $st->execute([$email]);
        $row = $st->fetch();
        record_attempt('register');
        if (!$row) send_account_link(user_row(new_user($name, $email, password_hash($pw, PASSWORD_DEFAULT), null, ui_lang($b))), ui_lang($b), 'verify');
        elseif (empty($row['email_verified_at']) && $row['status'] === 'active' && !too_many_attempts('verify_mail', 3, 60)) {
            record_attempt('verify_mail');
            send_account_link($row, ui_lang($b), 'verify');
        }
        send_json(['ok' => true, 'checkEmail' => true]);

    case 'auth.login':
        only('POST');
        if (too_many_attempts('login', 10, 15)) fail('rate_limited', 429);
        $b = body();
        $email = mb_strtolower(s($b, 'email', 190));
        $pw = (string)($b['password'] ?? '');
        $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE email = ?');
        $st->execute([$email]);
        $row = $st->fetch();
        // One answer for an unknown address, a wrong password and a Google-only account, in about the same time
        $ok = $row && $row['password_hash'] !== '' ? password_verify($pw, $row['password_hash']) : password_hash($pw, PASSWORD_DEFAULT) === '';
        if (!$ok) {
            record_attempt('login');
            fail('bad_credentials', 401);
        }
        if ($row['status'] !== 'active') fail('disabled', 403);
        clear_attempts('login');
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $row['id']]);
        signed_in((int)$row['id']);

    case 'auth.google':
        // Google already proves the address: no email check. A new account must accept the terms first ("needs_signup").
        only('POST');
        if (too_many_attempts('login', 20, 15)) fail('rate_limited', 429);
        $b = body();
        // Already linked: signs in. An address that has an account: proves it first (../identity/identity.php)
        ident_sign_in('google', verify_google_token((string)($b['credential'] ?? '')), $b);

    case 'auth.resend':
        $u = writer(true);
        if (!empty($u['email_verified_at'])) send_json(['ok' => true, 'user' => public_user(user_row((int)$u['id']))]);
        if (too_many_attempts('verify_mail', 3, 60)) fail('rate_limited', 429);
        record_attempt('verify_mail');
        send_account_link(user_row((int)$u['id']), ui_lang(body()), 'verify');
        send_json(['ok' => true]);

    case 'auth.verify':
        // The link of the email opens the app, which asks for this with a button: mail scanners that open links do nothing
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $token = (string)(body()['token'] ?? '');
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . ' WHERE token_hash = ? AND purpose = \'verify\' AND expires_at > ?');
        $st->execute([hash('sha256', $token), now_utc()]);
        $uid = (int)$st->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        db()->prepare('UPDATE ' . t('users') . ' SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([now_utc(), $uid]);
        db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ? AND purpose = \'verify\'')->execute([$uid]);
        if (user_row($uid)['status'] !== 'active') fail('disabled', 403);
        signed_in($uid);

    case 'auth.logout':
        only('POST');
        $u = current_user();
        if ($u) require_csrf($u);
        destroy_auth_session();
        send_json(['ok' => true]);

    case 'auth.password':
        $u = writer();
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['current'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        $pw = (string)($b['password'] ?? '');
        validate_password($pw);
        db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.forgot':
        // The same answer whether the address has an account or not
        only('POST');
        if (too_many_attempts('forgot', 5, 60)) fail('rate_limited', 429);
        record_attempt('forgot');
        $b = body();
        $st = db()->prepare('SELECT * FROM ' . t('users') . " WHERE email = ? AND status = 'active'");
        $st->execute([mb_strtolower(s($b, 'email', 190))]);
        $row = $st->fetch();
        if ($row) send_account_link($row, ui_lang($b), 'reset');
        send_json(['ok' => true]);

    case 'auth.reset':
        // The link proves the address too. Every other session of the account ends.
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $b = body();
        $pw = (string)($b['password'] ?? '');
        validate_password($pw);
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . " WHERE token_hash = ? AND purpose = 'reset' AND expires_at > ?");
        $st->execute([hash('sha256', (string)($b['token'] ?? '')), now_utc()]);
        $uid = (int)$st->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        if (user_row($uid)['status'] !== 'active') fail('disabled', 403);
        db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), now_utc(), $uid]);
        db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ?')->execute([$uid]);
        db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$uid]);
        signed_in($uid);

    case 'auth.profile':
        // Name and language of the app (also the language of the platform's emails). The email never changes.
        $u = writer(true);
        $b = body();
        $name = s($b, 'name', 80);
        if ($name !== '' && mb_strlen($name) < 2) fail('name_required', 422);
        db()->prepare('UPDATE ' . t('users') . ' SET name = IF(? = \'\', name, ?), ui_lang = ? WHERE id = ?')->execute([$name, $name, ui_lang($b), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.export':
        // Everything the calendar keeps of the account, as one JSON file (the polls and slots are exported by SavSchedules)
        $u = reader();
        $p = profile($u);
        $cals = [];
        foreach (calendars_of($u['id']) as $c) {
            $x = out_calendar($c);
            $x['eventsList'] = array_map(fn($e) => out_event($e, $c), q('SELECT * FROM ' . t('cal_events') . ' WHERE calendar_id = ? ORDER BY starts_at', [$c['id']])->fetchAll());
            $cals[] = $x;
        }
        header('Content-Disposition: attachment; filename="savcalendar-data.json"');
        send_json(['app' => 'SavCalendar', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => profile_prefs($p), 'calendars' => $cals]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);




    // ================================================================ calendar

    case 'cal.init':
        // Everything the app needs to start: settings, calendars (subscriptions read again when they are old)
        $u = reader();
        $p = profile($u, (string)($_GET['tz'] ?? 'UTC'));
        refresh_due($u['id']);
        send_json(['ok' => true, 'prefs' => (object)profile_prefs($p), 'feed' => $p['feed_token'] ? feed_url($p['feed_token']) : null,
            'calendars' => array_map('out_calendar', calendars_of($u['id'])), 'schedules' => rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savschedules/', 'tasks' => rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savtasks/', 'forms' => rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savforms/']);

    case 'cal.prefs':
        // Settings of the calendar (view, first day of the week, hours, what of SavSchedules to show…): read only by the app
        $u = writer();
        profile($u);
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 4000) fail('bad_request', 413);
        q('UPDATE ' . t('cal_profiles') . ' SET prefs = ? WHERE user_id = ?', [$p, $u['id']]);
        send_json(['ok' => true]);

    case 'cal.events':
        // The events of every calendar of the account that may touch the range, and the items of SavSchedules, SavNewsletters, SavTasks
        $u = reader();
        $from = utc_time($_GET['from'] ?? null);
        $to = utc_time($_GET['to'] ?? null);
        if (!$from || !$to || $to <= $from || strtotime($to) - strtotime($from) > 120 * 86400) fail('bad_request', 422);
        $prefs = profile_prefs(profile($u));
        $sch = ($prefs['schedules'] ?? true) !== false ? schedule_items($u, $from, $to, ($prefs['proposals'] ?? true) !== false) : [];
        send_json(['ok' => true, 'events' => events_between(calendars_of($u['id']), $from, $to), 'schedules' => $sch, 'newsletters' => newsletter_items($u, $from, $to, $prefs), 'tasks' => task_items($u, $from, $to, $prefs), 'forms' => form_items($u, $from, $to, $prefs)]);

    case 'cal.search':
        // Titles, places and descriptions of the own events (and of the subscriptions)
        $u = reader();
        $term = s($_GET, 'q', 80);
        if (mb_strlen($term) < 2) send_json(['ok' => true, 'events' => []]);
        $like = '%' . addcslashes($term, '%_\\') . '%';
        $cals = [];
        foreach (calendars_of($u['id']) as $c) $cals[(int)$c['id']] = $c;
        if (!$cals) send_json(['ok' => true, 'events' => []]);
        $rows = q('SELECT * FROM ' . t('cal_events') . ' WHERE calendar_id IN (' . implode(',', array_keys($cals)) . ') AND (title LIKE ? OR place LIKE ? OR descr LIKE ?) ORDER BY ABS(TIMESTAMPDIFF(DAY, starts_at, UTC_TIMESTAMP())) LIMIT 60', [$like, $like, $like])->fetchAll();
        send_json(['ok' => true, 'events' => array_map(fn($e) => out_event($e, $cals[(int)$e['calendar_id']]), $rows)]);

    case 'cal.cal.save':
        // A new calendar of one's own, or the name, colour, description, zone and visibility of a calendar
        $u = writer();
        $b = body();
        $c = isset($b['id']) ? calendar_of($u, $b['id']) : null;
        if (isset($b['id']) && !$c) fail('not_found', 404);
        $name = s($b, 'name', 120);
        if (!$c) {
            if ($name === '') fail('name_required', 422);
            if (count(calendars_of($u['id'])) >= MAX_CALENDARS) fail('too_many_calendars', 422);
            q('INSERT INTO ' . t('cal_calendars') . ' (cid, user_id, kind, name, color, descr, tz, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [new_code('cal_calendars', 'cid'), $u['id'], 'local', $name, valid_color($b['color'] ?? '', CAL_COLORS[array_rand(CAL_COLORS)]), s($b, 'descr', 500), valid_tz($b['tz'] ?? '', 'UTC'), 100, now_utc(), now_utc()]);
            $c = q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [db()->lastInsertId()])->fetch();
        } else {
            q('UPDATE ' . t('cal_calendars') . ' SET name = ?, color = ?, descr = ?, tz = ?, visible = ?, updated_at = ? WHERE id = ?', [$name !== '' ? $name : $c['name'], valid_color($b['color'] ?? '', $c['color']),
                array_key_exists('descr', $b) ? s($b, 'descr', 500) : $c['descr'], valid_tz($b['tz'] ?? '', $c['tz']), array_key_exists('visible', $b) ? (!empty($b['visible']) ? 1 : 0) : $c['visible'], now_utc(), $c['id']]);
            $c = q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [$c['id']])->fetch();
        }
        send_json(['ok' => true, 'calendar' => out_calendar($c)]);

    case 'cal.cal.export':
        // A whole calendar with all its events (for the .savcal file and the .csv, built by the app)
        $u = reader();
        $c = calendar_of($u, $_GET['id'] ?? '');
        if (!$c) fail('not_found', 404);
        send_json(['ok' => true, 'calendar' => out_calendar($c), 'events' => array_map(fn($e) => out_event($e, $c), q('SELECT * FROM ' . t('cal_events') . ' WHERE calendar_id = ? ORDER BY recur_id IS NOT NULL, starts_at', [$c['id']])->fetchAll())]);

    case 'cal.cal.ics':
        // A whole calendar as a standard .ics file to download (the same writer of the feed)
        $u = reader();
        $c = calendar_of($u, $_GET['id'] ?? '');
        if (!$c) fail('not_found', 404);
        header('Content-Type: text/calendar; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . (preg_replace('/[^A-Za-z0-9 _.-]+/', '', $c['name']) ?: 'calendar') . '.ics"');
        header('Cache-Control: no-store');
        echo ics_write($c['name'], $c['tz'], feed_rows([(int)$c['id']]));
        exit;

    case 'cal.cal.order':
        $u = writer();
        foreach (array_values((array)(body()['ids'] ?? [])) as $i => $cid) q('UPDATE ' . t('cal_calendars') . ' SET position = ? WHERE cid = ? AND user_id = ?', [$i, valid_code($cid), $u['id']]);
        send_json(['ok' => true]);

    case 'cal.cal.delete':
        // A calendar and its events (a subscription only stops being read: the calendar somewhere else stays as it is)
        $u = writer();
        $c = calendar_of($u, body()['id'] ?? '');
        if (!$c) fail('not_found', 404);
        if ($c['kind'] === 'local' && (int)q('SELECT COUNT(*) FROM ' . t('cal_calendars') . " WHERE user_id = ? AND kind = 'local'", [$u['id']])->fetchColumn() <= 1) fail('last_calendar', 422);
        q('DELETE FROM ' . t('cal_calendars') . ' WHERE id = ?', [$c['id']]);
        send_json(['ok' => true]);

    case 'cal.subscribe':
        // A calendar somewhere else, by its .ics link (Google: "secret address in iCal format"; Outlook: "publish calendar")
        $u = writer();
        $b = body();
        if (too_many_attempts('subscribe', 20, 60)) fail('rate_limited', 429);
        record_attempt('subscribe');
        $url = sub_url(s($b, 'url', 1000));
        if ($url === '') fail('sub_url', 422);
        if (count(calendars_of($u['id'])) >= MAX_CALENDARS) fail('too_many_calendars', 422);
        if (q('SELECT 1 FROM ' . t('cal_calendars') . " WHERE user_id = ? AND kind = 'sub' AND url = ?", [$u['id'], $url])->fetchColumn()) fail('sub_already', 409);
        // a link to one of our own feeds would show the calendar twice
        if (preg_match('~/savcalendar/feed/[a-f0-9]{32}\.ics~', $url)) fail('sub_self', 422);
        $tz = valid_tz($b['tz'] ?? '', 'UTC');
        $name = s($b, 'name', 120);
        q('INSERT INTO ' . t('cal_calendars') . ' (cid, user_id, kind, name, color, tz, url, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [new_code('cal_calendars', 'cid'), $u['id'], 'sub', $name !== '' ? $name : (string)parse_url($url, PHP_URL_HOST), valid_color($b['color'] ?? '', CAL_COLORS[array_rand(CAL_COLORS)]), $tz, $url, 200, now_utc(), now_utc()]);
        $c = q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [db()->lastInsertId()])->fetch();
        $r = refresh_subscription($c, true);
        if (!$r['ok']) {
            q('DELETE FROM ' . t('cal_calendars') . ' WHERE id = ?', [$c['id']]);
            fail($r['error'], 422);
        }
        if ($name === '' && !empty($r['name'])) q('UPDATE ' . t('cal_calendars') . ' SET name = ? WHERE id = ?', [$r['name'], $c['id']]);
        send_json(['ok' => true, 'calendar' => out_calendar(q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [$c['id']])->fetch()), 'count' => $r['count'] ?? 0]);

    case 'cal.refresh':
        $u = writer();
        $c = calendar_of($u, body()['id'] ?? '');
        if (!$c || $c['kind'] !== 'sub') fail('not_found', 404);
        if (too_many_attempts('refresh', 30, 60)) fail('rate_limited', 429);
        record_attempt('refresh');
        $r = refresh_subscription($c, true);
        $c = q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [$c['id']])->fetch();
        if (!$r['ok']) send_json(['ok' => false, 'error' => $r['error'], 'calendar' => out_calendar($c)], 422);
        send_json(['ok' => true, 'calendar' => out_calendar($c)]);

    case 'cal.import':
        // An .ics file into a calendar of one's own (a new one with the name of the file, or one that exists)
        $u = writer();
        $b = body();
        $tz = valid_tz($b['tz'] ?? '', 'UTC');
        if (is_array($b['savcal'] ?? null)) {
            // a .savcal: the calendar of SavCalendar itself, read by the app (name, colour, zone, events as cal.events gives them)
            $sc = $b['savcal'];
            $tz = valid_tz($sc['tz'] ?? '', $tz);
            $evs = [];
            foreach (array_slice(is_array($sc['events'] ?? null) ? $sc['events'] : [], 0, MAX_EVENTS) as $x) {
                if (!is_array($x)) continue;
                $e = clean_event($x, $tz);
                if (!$e) continue;
                $rid = null;
                if (!empty($x['recurId']) && is_string($x['recurId'])) $rid = preg_match('/^\d{4}-\d{2}-\d{2}$/', $x['recurId']) ? $x['recurId'] . ' 00:00:00' : utc_time($x['recurId']);
                $uid = mb_substr(trim((string)($x['uid'] ?? '')), 0, 255);
                $evs[] = $e + ['uid' => $uid !== '' ? $uid : new_uid(), 'recur_id' => $rid];
            }
            $ics = ['name' => mb_substr(trim((string)($sc['name'] ?? '')), 0, 120), 'tz' => $tz, 'events' => $evs];
            if (!isset($b['color']) && valid_color($sc['color'] ?? '')) $b['color'] = $sc['color'];
        } else {
            $text = (string)($b['ics'] ?? '');
            if ($text === '' || strlen($text) > MAX_ICS_BYTES) fail($text === '' ? 'ics_invalid' : 'file_big', 422);
            try {
                $ics = ics_parse($text, $tz);
            } catch (Throwable $e) {
                fail('ics_invalid', 422);
            }
        }
        if (!$ics['events']) fail('ics_empty', 422);
        db()->beginTransaction();
        $c = !empty($b['id']) ? calendar_of($u, $b['id']) : null;
        if (!empty($b['id']) && (!$c || $c['kind'] !== 'local')) fail('not_found', 404);
        if (!$c) {
            if (count(calendars_of($u['id'])) >= MAX_CALENDARS) fail('too_many_calendars', 422);
            $name = ($ics['name'] && isset($b['savcal'])) ? $ics['name'] : (s($b, 'name', 120) ?: ($ics['name'] ?: 'Calendar'));
            q('INSERT INTO ' . t('cal_calendars') . ' (cid, user_id, kind, name, color, descr, tz, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [new_code('cal_calendars', 'cid'), $u['id'], 'local', $name, valid_color($b['color'] ?? '', CAL_COLORS[array_rand(CAL_COLORS)]), mb_substr(trim((string)($b['savcal']['descr'] ?? '')), 0, 500), valid_tz($ics['tz'], $tz), 100, now_utc(), now_utc()]);
            $c = q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [db()->lastInsertId()])->fetch();
        }
        [$added, $updated] = import_events($c, $ics['events']);
        db()->commit();
        send_json(['ok' => true, 'calendar' => out_calendar($c), 'added' => $added, 'updated' => $updated]);

    case 'cal.feed':
        // The private link that lets other calendars show this one: on, off, or a new one (the old link stops working).
        // id "all": every calendar of one's own together with what comes from SavSchedules.
        $u = writer();
        $b = body();
        $act = in_array($b['action'] ?? '', ['on', 'off', 'reset'], true) ? $b['action'] : 'on';
        $token = $act === 'off' ? null : bin2hex(random_bytes(16));
        if (($b['id'] ?? '') === 'all') {
            $p = profile($u);
            if ($act === 'on' && $p['feed_token']) $token = $p['feed_token'];
            q('UPDATE ' . t('cal_profiles') . ' SET feed_token = ? WHERE user_id = ?', [$token, $u['id']]);
            send_json(['ok' => true, 'feed' => $token ? feed_url($token) : null]);
        }
        $c = calendar_of($u, $b['id'] ?? '');
        if (!$c || $c['kind'] !== 'local') fail('not_found', 404);
        if ($act === 'on' && $c['feed_token']) $token = $c['feed_token'];
        q('UPDATE ' . t('cal_calendars') . ' SET feed_token = ? WHERE id = ?', [$token, $c['id']]);
        send_json(['ok' => true, 'calendar' => out_calendar(q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [$c['id']])->fetch())]);

    case 'cal.event.get':
        $u = reader();
        $e = q('SELECT e.* FROM ' . t('cal_events') . ' e JOIN ' . t('cal_calendars') . ' c ON c.id = e.calendar_id WHERE e.eid = ? AND c.user_id = ?', [valid_code($_GET['id'] ?? ''), $u['id']])->fetch();
        if (!$e) fail('not_found', 404);
        $c = q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [$e['calendar_id']])->fetch();
        send_json(['ok' => true, 'event' => out_event($e, $c)]);

    case 'cal.event.save':
        // A new event, or a change to one: scope "all" (the whole series), "one" (only the occurrence that starts at
        // `occurrence`: it becomes a changed occurrence of its own) or "following" (the series is cut there and a new one
        // starts with the changes). An event may move to another calendar of one's own (the whole series).
        $u = writer();
        $b = body();
        $cal = calendar_of($u, $b['cal'] ?? '');
        if (!$cal) fail('not_found', 404);
        if ($cal['kind'] !== 'local') fail('read_only', 403);
        $e = clean_event($b, $cal['tz']);
        if (!$e) fail('bad_time', 422);
        $scope = in_array($b['scope'] ?? '', ['one', 'following'], true) ? $b['scope'] : 'all';
        db()->beginTransaction();
        if (empty($b['id'])) {
            if ((int)q('SELECT COUNT(*) FROM ' . t('cal_events') . ' WHERE calendar_id = ?', [$cal['id']])->fetchColumn() >= MAX_EVENTS) fail('too_many_events', 422);
            $eid = insert_event((int)$cal['id'], $e, new_uid());
        } else {
            $row = q('SELECT e.*, c.kind, c.user_id FROM ' . t('cal_events') . ' e JOIN ' . t('cal_calendars') . ' c ON c.id = e.calendar_id WHERE e.eid = ? FOR UPDATE', [valid_code($b['id'])])->fetch();
            if (!$row || (int)$row['user_id'] !== $u['id']) fail('not_found', 404);
            if ($row['kind'] !== 'local') fail('read_only', 403);
            $occ = null;
            if ($scope !== 'all' && $row['rrule'] !== '') {
                $occ = $row['all_day'] ? (preg_match('/^\d{4}-\d{2}-\d{2}/', (string)($b['occurrence'] ?? ''), $m) ? $m[0] . ' 00:00:00' : null) : utc_time($b['occurrence'] ?? null);
                if (!$occ) fail('bad_time', 422);
            }
            if ($occ && $scope === 'one') {
                // the occurrence becomes a row of its own (or that row is changed, if it already is one)
                $have = q('SELECT id, eid FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ? AND recur_id = ?', [$row['calendar_id'], $row['uid'], $occ])->fetch();
                $e['rrule'] = '';
                $e['exdates'] = [];
                if ($have) { update_event((int)$have['id'], $e); $eid = $have['eid']; }
                else $eid = insert_event((int)$row['calendar_id'], $e, $row['uid'], $occ);
            } elseif ($occ && $scope === 'following') {
                // the series ends just before this occurrence; a new series (a new uid) starts here with the changes
                $until = gmdate('Ymd\THis\Z', strtotime($occ . ' UTC') - 1);
                $old = preg_replace('/;?(UNTIL|COUNT)=[^;]*/', '', $row['rrule']) . ';UNTIL=' . ($row['all_day'] ? gmdate('Ymd', strtotime($occ . ' UTC') - 86400) : $until);
                q('UPDATE ' . t('cal_events') . ' SET rrule = ?, rrule_until = ?, updated_at = ? WHERE id = ?', [$old, gmdate('Y-m-d H:i:s', strtotime($occ . ' UTC') - 1), now_utc(), $row['id']]);
                q('DELETE FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ? AND recur_id >= ?', [$row['calendar_id'], $row['uid'], $occ]);
                $eid = insert_event((int)$cal['id'], $e, new_uid());
            } else {
                if ($row['recur_id'] !== null) { $e['rrule'] = ''; $e['exdates'] = []; } // a changed occurrence stays one
                update_event((int)$row['id'], $e);
                $eid = $row['eid'];
                if ((int)$row['calendar_id'] !== (int)$cal['id']) q('UPDATE ' . t('cal_events') . ' SET calendar_id = ? WHERE calendar_id = ? AND uid = ?', [$cal['id'], $row['calendar_id'], $row['uid']]);
                // the times of the series changed: its changed occurrences no longer match the series
                if ($row['rrule'] !== '' && ($row['starts_at'] !== $e['starts_at'] || $row['rrule'] !== $e['rrule'])) q('DELETE FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ? AND recur_id IS NOT NULL', [$cal['id'], $row['uid']]);
            }
        }
        db()->commit();
        $x = q('SELECT * FROM ' . t('cal_events') . ' WHERE eid = ?', [$eid])->fetch();
        send_json(['ok' => true, 'event' => out_event($x, q('SELECT * FROM ' . t('cal_calendars') . ' WHERE id = ?', [$x['calendar_id']])->fetch())]);

    case 'cal.event.delete':
        // scope "all" (the series with its changed occurrences), "one" (that occurrence only), "following" (from there on)
        $u = writer();
        $b = body();
        $row = q('SELECT e.*, c.kind, c.user_id FROM ' . t('cal_events') . ' e JOIN ' . t('cal_calendars') . ' c ON c.id = e.calendar_id WHERE e.eid = ?', [valid_code($b['id'] ?? '')])->fetch();
        if (!$row || (int)$row['user_id'] !== $u['id']) fail('not_found', 404);
        if ($row['kind'] !== 'local') fail('read_only', 403);
        $scope = in_array($b['scope'] ?? '', ['one', 'following'], true) ? $b['scope'] : 'all';
        db()->beginTransaction();
        $master = $row['recur_id'] !== null ? q('SELECT * FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ? AND recur_id IS NULL', [$row['calendar_id'], $row['uid']])->fetch() : $row;
        if ($scope === 'all' || !$master || $master['rrule'] === '') {
            if ($scope === 'all' || !$master) q('DELETE FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ?', [$row['calendar_id'], $row['uid']]);
            else q('DELETE FROM ' . t('cal_events') . ' WHERE id = ?', [$row['id']]);
        } else {
            $occ = $row['recur_id'] ?? ($row['all_day'] ? (preg_match('/^\d{4}-\d{2}-\d{2}/', (string)($b['occurrence'] ?? ''), $m) ? $m[0] . ' 00:00:00' : null) : utc_time($b['occurrence'] ?? null));
            if (!$occ) fail('bad_time', 422);
            if ($scope === 'one') {
                $ex = json_decode((string)($master['exdates'] ?? '[]'), true) ?: [];
                $ex[] = $master['all_day'] ? substr($occ, 0, 10) : gmdate('Y-m-d\TH:i:s\Z', strtotime($occ . ' UTC'));
                q('UPDATE ' . t('cal_events') . ' SET exdates = ?, updated_at = ? WHERE id = ?', [json_out(array_values(array_unique($ex))), now_utc(), $master['id']]);
                q('DELETE FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ? AND recur_id = ?', [$row['calendar_id'], $row['uid'], $occ]);
            } else {
                if (strtotime($occ . ' UTC') <= strtotime($master['starts_at'] . ' UTC')) q('DELETE FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ?', [$row['calendar_id'], $row['uid']]);
                else {
                    $old = preg_replace('/;?(UNTIL|COUNT)=[^;]*/', '', $master['rrule']) . ';UNTIL=' . ($master['all_day'] ? gmdate('Ymd', strtotime($occ . ' UTC') - 86400) : gmdate('Ymd\THis\Z', strtotime($occ . ' UTC') - 1));
                    q('UPDATE ' . t('cal_events') . ' SET rrule = ?, rrule_until = ?, updated_at = ? WHERE id = ?', [$old, gmdate('Y-m-d H:i:s', strtotime($occ . ' UTC') - 1), now_utc(), $master['id']]);
                    q('DELETE FROM ' . t('cal_events') . ' WHERE calendar_id = ? AND uid = ? AND recur_id >= ?', [$row['calendar_id'], $row['uid'], $occ]);
                }
            }
        }
        db()->commit();
        send_json(['ok' => true]);

    case 'cal.sch.create':
        // Dates chosen in the calendar become a poll or a sheet of slots of SavSchedules (the same account): the app then
        // opens it in the editor of SavSchedules, where everything else is set
        $u = writer();
        $b = body();
        if ((int)q('SELECT COUNT(*) FROM ' . t('schedules') . ' WHERE owner_id = ?', [$u['id']])->fetchColumn() >= MAX_USER_SCHEDULES) fail('too_many_schedules', 422);
        $kind = in_array($b['kind'] ?? '', KINDS, true) ? $b['kind'] : 'poll';
        $title = s($b, 'title', 160);
        if ($title === '') fail('title_required', 422);
        $set = clean_settings(array_merge(['tz' => valid_tz($b['tz'] ?? '', 'UTC')], is_array($b['settings'] ?? null) ? $b['settings'] : []), $kind);
        $opts = clean_options($b['options'] ?? [], $kind);
        if (!$opts) fail('nothing_chosen', 422);
        db()->beginTransaction();
        $pid = new_pid();
        q('INSERT INTO ' . t('schedules') . ' (pid, owner_id, kind, title, descr, place, settings, created_at, updated_at, seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$pid, $u['id'], $kind, $title, multiline($b, 'descr', 4000), s($b, 'place', 200), json_out($set), now_utc(), now_utc(), now_utc()]);
        save_options((int)db()->lastInsertId(), $opts);
        db()->commit();
        send_json(['ok' => true, 'id' => $pid, 'edit' => rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savschedules/#/e/' . $pid]);

    default:
        fail('not_found', 404);
}

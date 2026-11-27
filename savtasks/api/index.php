<?php
/**
 * SavTasks — JSON API.  api/index.php?r=<action>
 *
 * Accounts:     the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login
 *               (and the routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *               auth.reset, auth.profile, auth.export, auth.delete
 * Tasks:        tasks.init, tasks.prefs, tasks.all, tasks.list.save, tasks.list.delete, tasks.list.order, tasks.list.export,
 *               tasks.import, tasks.task.save, tasks.task.done, tasks.task.delete, tasks.task.move, tasks.task.order,
 *               tasks.done.clear, tasks.habit.mark, tasks.calendars
 * Other apps:   tasks.cal.create (a task becomes an event of SavCalendar), tasks.sch.create (a task becomes a poll of
 *               SavSchedules), tasks.schedules (what SavSchedules asks of the account)
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
// what a schedule is: the library of SavSchedules itself, so the apps never disagree
require dirname(__DIR__, 2) . '/savschedules/lib/sched.php';
require __DIR__ . '/../lib/tasks.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavTasks API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false]);
if (!credentials()) fail('not_installed', 503);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) fail('bad_request', 415);
remember_app_url();

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}


// ---------- One space for the whole of SavOffice: the space of SavDrive (../savdrive/lib/space.php)

require_once dirname(__DIR__, 2) . '/savdrive/lib/space.php';
const SPACE_APP = 'savtasks';

/** What a person keeps in SavTasks: lists and tasks. It counts in their space of SavOffice. */
function space_bytes(array $u): int
{
    $q = function (string $sql) use ($u): int { $st = db()->prepare($sql); $st->execute([$u['id']]); return (int)$st->fetchColumn(); };
    return $q('SELECT COALESCE(SUM(COALESCE(LENGTH(i.notes),0) + COALESCE(LENGTH(i.checklist),0) + COALESCE(LENGTH(i.log),0) + 256),0) FROM ' . t('task_items') . ' i JOIN ' . t('task_lists') . ' l ON l.id = i.list_id WHERE l.user_id = ?')
        + $q('SELECT COALESCE(SUM(COALESCE(LENGTH(`columns`),0) + 256),0) FROM ' . t('task_lists') . ' WHERE user_id = ?');
}

/** Whether the account $uid (the owner of what grows, also when someone else is writing) can keep $more bytes more. */
function space_allows_id(int $uid, int $more): bool
{
    $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE id = ?');
    $st->execute([$uid]);
    $o = $st->fetch();
    return !$o || savspace_allows((string)$o['email'], SPACE_APP, $more, space_bytes($o));
}

/** The space the app shows: the one of SavOffice (used in every app, out of the space of SavDrive); without SavDrive, its old limit. */
function space_out(array $u, int $used, int $quota): array
{
    $i = savspace_info((string)$u['email']);
    return $i ? ['used' => $i['used'], 'quota' => $i['quota'], 'spaceApps' => (object)$i['apps']] : ['used' => $used, 'quota' => $quota];
}

function writer(bool $unverifiedOk = false): array
{
    only('POST');
    $u = require_user($unverifiedOk);
    require_csrf($u);
    // a write that would go beyond the space of SavOffice is refused; then what the app keeps is counted again
    savspace_gate($u, SPACE_APP, (string)($GLOBALS['r'] ?? ''), fn() => space_bytes($u), fn() => fail('quota', 413));
    return $u;
}

function reader(): array
{
    only('GET');
    $u = require_user();
    savspace_touch($u, SPACE_APP, fn() => space_bytes($u));
    return $u;
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

// ---------- SavAccount: signing in and joining an account that already exists ----------

require dirname(__DIR__, 2) . '/identity/identity.php';

/** The language of the messages of the sign-in: the app sends it with every request. */
function identity_lang(): string
{
    $h = strtolower((string)($_SERVER['HTTP_X_LANG'] ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')));
    return strpos($h, 'it') === 0 ? 'it' : 'en';
}

identity_setup([
    'name' => 'SavTasks', 'cookie' => 'savtasks', 'lang' => fn() => identity_lang(),
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
        send_json(['ok' => true, 'installed' => true, 'savAccount' => sav_enabled(), 'mailReady' => mail_settings() !== null]);

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
        // One answer for an unknown address, a wrong password and an account without a password, in about the same time
        $ok = $row && $row['password_hash'] !== '' ? password_verify($pw, $row['password_hash']) : password_hash($pw, PASSWORD_DEFAULT) === '';
        if (!$ok) {
            record_attempt('login');
            fail('bad_credentials', 401);
        }
        if ($row['status'] !== 'active') fail('disabled', 403);
        clear_attempts('login');
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $row['id']]);
        signed_in((int)$row['id']);

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
        // Everything SavTasks keeps of the account, as one JSON file (calendar and schedules are exported by their apps)
        $u = reader();
        $p = profile($u);
        $lists = [];
        foreach (lists_of($u['id']) as $l) {
            $x = out_list($l);
            $x['tasks'] = array_map(fn($i) => out_task($i, $l), q('SELECT * FROM ' . t('task_items') . ' WHERE list_id = ? ORDER BY done_at IS NOT NULL, position, id', [$l['id']])->fetchAll());
            $lists[] = $x;
        }
        header('Content-Disposition: attachment; filename="savtasks-data.json"');
        send_json(['app' => 'SavTasks', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => profile_prefs($p), 'lists' => $lists]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);


    // ================================================================ tasks

    case 'tasks.init':
        // What the app needs to start: settings and the addresses of the other apps (the inbox is made the first time)
        $u = reader();
        $p = profile($u, (string)($_GET['tz'] ?? 'UTC'));
        $base = rtrim(dirname(rtrim(app_url(), '/')), '/') . '/';
        send_json(['ok' => true, 'prefs' => (object)profile_prefs($p), 'schedules' => $base . 'savschedules/', 'calendar' => $base . 'savcalendar/']);

    case 'tasks.prefs':
        // Settings of SavTasks (default list, what to show, reminders by email…): read only by the app and by the reminders
        $u = writer();
        profile($u);
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 4000) fail('bad_request', 413);
        q('UPDATE ' . t('task_profiles') . ' SET prefs = ? WHERE user_id = ?', [$p, $u['id']]);
        send_json(['ok' => true]);

    case 'tasks.all':
        // The lists and their tasks (open, and done in the last 60 days), with what the other apps say about them
        $u = reader();
        profile($u);
        $lists = lists_of($u['id']);
        $tasks = tasks_of($lists);
        $prefs = profile_prefs(profile($u));
        send_json(['ok' => true, 'lists' => array_map('out_list', $lists), 'tasks' => $tasks,
            'schedules' => ($prefs['schedules'] ?? true) !== false ? schedule_todos($u) : [],
            'linked' => ['events' => (object)linked_events($u, array_column($tasks, 'calEvent')), 'schedules' => (object)linked_schedules(array_column($tasks, 'schedule'))]]);

    case 'tasks.list.save':
        // A new list, or its name, colour, icon, way of showing (list or board), columns and archive
        $u = writer();
        $b = body();
        $l = isset($b['id']) ? list_of($u, $b['id']) : null;
        if (isset($b['id']) && !$l) fail('not_found', 404);
        $name = s($b, 'name', 120);
        $lang = ($u['ui_lang'] ?? '') === 'it' ? 'it' : 'en';
        $icon = in_array($b['icon'] ?? null, LIST_ICONS, true) ? $b['icon'] : null;
        $view = in_array($b['view'] ?? '', ['list', 'board', 'gantt', 'table', 'habits'], true) ? $b['view'] : null;
        if (!$l) {
            if ($name === '') fail('name_required', 422);
            if (count(lists_of($u['id'])) >= MAX_LISTS) fail('too_many_lists', 422);
            q('INSERT INTO ' . t('task_lists') . ' (lid, user_id, name, color, icon, view, columns, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [new_code('task_lists', 'lid'), $u['id'], $name, valid_color($b['color'] ?? '', LIST_COLORS[array_rand(LIST_COLORS)]), $icon ?? '', $view ?? 'list',
                    json_out(isset($b['columns']) ? clean_columns($b['columns'], $lang) : default_columns($lang)), 100, now_utc(), now_utc()]);
            $l = list_row((int)db()->lastInsertId());
        } else {
            db()->beginTransaction();
            $cols = isset($b['columns']) ? clean_columns($b['columns'], $lang) : columns_of($l);
            q('UPDATE ' . t('task_lists') . ' SET name = ?, color = ?, icon = ?, view = ?, columns = ?, archived = ?, updated_at = ? WHERE id = ?', [$name !== '' ? $name : $l['name'], valid_color($b['color'] ?? '', $l['color']),
                $icon ?? $l['icon'], $view ?? $l['view'], json_out($cols), array_key_exists('archived', $b) && !$l['inbox'] ? (!empty($b['archived']) ? 1 : 0) : $l['archived'], now_utc(), $l['id']]);
            if (isset($b['columns'])) {
                // the tasks of a column that went move to the first one (or to the column of done tasks, when they are done)
                $l = list_row((int)$l['id']);
                $ids = array_column($cols, 'id');
                $in = implode(',', array_fill(0, count($ids), '?'));
                q('UPDATE ' . t('task_items') . " SET col = ? WHERE list_id = ? AND done_at IS NULL AND col NOT IN ($in)", array_merge([first_col($l), $l['id']], $ids));
                q('UPDATE ' . t('task_items') . " SET col = ? WHERE list_id = ? AND done_at IS NOT NULL AND col NOT IN ($in)", array_merge([done_col($l) ?: first_col($l), $l['id']], $ids));
            }
            db()->commit();
            $l = list_row((int)$l['id']);
        }
        send_json(['ok' => true, 'list' => out_list($l)]);

    case 'tasks.list.delete':
        // A list and its tasks (the inbox stays)
        $u = writer();
        $l = list_of($u, body()['id'] ?? '');
        if (!$l) fail('not_found', 404);
        if ($l['inbox']) fail('inbox_stays', 422);
        q('DELETE FROM ' . t('task_lists') . ' WHERE id = ?', [$l['id']]);
        send_json(['ok' => true]);

    case 'tasks.list.order':
        $u = writer();
        foreach (array_values((array)(body()['ids'] ?? [])) as $i => $lid) q('UPDATE ' . t('task_lists') . ' SET position = ? WHERE lid = ? AND user_id = ?', [$i + 1, valid_code($lid), $u['id']]);
        send_json(['ok' => true]);

    case 'tasks.list.export':
        // A whole list with all its tasks, done ones too (for the .savtas, .csv and .md files, built by the app)
        $u = reader();
        $l = list_of($u, $_GET['id'] ?? '');
        if (!$l) fail('not_found', 404);
        send_json(['ok' => true, 'list' => out_list($l), 'tasks' => array_map(fn($i) => out_task($i, $l), q('SELECT * FROM ' . t('task_items') . ' WHERE list_id = ? ORDER BY done_at IS NOT NULL, position, id', [$l['id']])->fetchAll())]);

    case 'tasks.import':
        // A .savtas (a list of SavTasks, read by the app) becomes a new list; lines of text (a checklist, a Markdown list)
        // become tasks of a list that exists or of a new one
        $u = writer();
        $b = body();
        $tz = valid_tz($b['tz'] ?? '', 'UTC');
        $lang = ($u['ui_lang'] ?? '') === 'it' ? 'it' : 'en';
        db()->beginTransaction();
        $l = !empty($b['id']) ? list_of($u, $b['id']) : null;
        if (!empty($b['id']) && !$l) fail('not_found', 404);
        $src = is_array($b['savtas'] ?? null) ? $b['savtas'] : null;
        if (!$l) {
            if (count(lists_of($u['id'])) >= MAX_LISTS) fail('too_many_lists', 422);
            $name = mb_substr(trim((string)($src['name'] ?? '')), 0, 120) ?: (s($b, 'name', 120) ?: ($lang === 'it' ? 'Lista importata' : 'Imported list'));
            q('INSERT INTO ' . t('task_lists') . ' (lid, user_id, name, color, icon, view, columns, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [new_code('task_lists', 'lid'), $u['id'], $name, valid_color($src['color'] ?? '', LIST_COLORS[array_rand(LIST_COLORS)]), in_array($src['icon'] ?? '', LIST_ICONS, true) ? (string)($src['icon'] ?? '') : '',
                    in_array($src['view'] ?? '', ['board', 'gantt', 'table', 'habits'], true) ? $src['view'] : 'list', json_out(clean_columns($src['columns'] ?? null, $lang)), 100, now_utc(), now_utc()]);
            $l = list_row((int)db()->lastInsertId());
        }
        $left = MAX_TASKS - (int)q('SELECT COUNT(*) FROM ' . t('task_items') . ' WHERE list_id = ?', [$l['id']])->fetchColumn();
        $added = 0;
        $items = $src ? (is_array($src['tasks'] ?? null) ? $src['tasks'] : []) : array_map(fn($line) => is_array($line) ? $line : ['title' => (string)$line], is_array($b['lines'] ?? null) ? $b['lines'] : []);
        $pos = (int)q('SELECT COALESCE(MAX(position), 0) FROM ' . t('task_items') . ' WHERE list_id = ?', [$l['id']])->fetchColumn();
        foreach (array_slice($items, 0, MAX_TASKS) as $it) {
            if (!is_array($it) || $left-- <= 0) break;
            $x = clean_task($it, $l, $tz);
            if (isset($it['log'])) $x['log'] = json_out(clean_log($it['log'], $tz));
            if ($x['title'] === '') continue;
            if (!empty($it['done'])) {
                $x['done_at'] = utc_time($it['done']) ?? now_utc();
                // a done task without a column of its own goes to the column of done tasks
                if (done_col($l) !== '' && !in_array($it['col'] ?? null, array_column(columns_of($l), 'id'), true)) $x['col'] = done_col($l);
            }
            if ($x['remind_at'] && $x['remind_at'] < now_utc()) $x['reminded_at'] = now_utc(); // no emails for the past
            insert_task((int)$l['id'], $x, $pos += 10);
            $added++;
        }
        db()->commit();
        send_json(['ok' => true, 'list' => out_list(list_row((int)$l['id'])), 'added' => $added]);

    case 'tasks.task.save':
        // A new task (in a list of one's own; at the top, or at the bottom with "end"), or a change to one: only the fields
        // sent change
        $u = writer();
        $b = body();
        $tz = valid_tz($b['tz'] ?? '', 'UTC');
        db()->beginTransaction();
        if (empty($b['id'])) {
            $l = !empty($b['list']) ? list_of($u, $b['list']) : inbox_of($u);
            if (!$l) fail('not_found', 404);
            if ((int)q('SELECT COUNT(*) FROM ' . t('task_items') . ' WHERE list_id = ?', [$l['id']])->fetchColumn() >= MAX_TASKS) fail('too_many_tasks', 422);
            $x = clean_task($b, $l, $tz);
            if ($x['title'] === '') fail('title_required', 422);
            $pos = !empty($b['end']) ? (int)q('SELECT COALESCE(MAX(position), 0) + 10 FROM ' . t('task_items') . ' WHERE list_id = ?', [$l['id']])->fetchColumn() : null;
            $tid = insert_task((int)$l['id'], $x, $pos);
        } else {
            $old = task_of($u, $b['id'], true);
            if (!$old) fail('not_found', 404);
            $l = list_row((int)$old['list_id']);
            $x = clean_task($b, $l, $tz, $old);
            if ($x['title'] === '' && array_key_exists('title', $b)) fail('title_required', 422);
            update_task((int)$old['id'], $x);
            $tid = $old['tid'];
        }
        db()->commit();
        $row = q('SELECT * FROM ' . t('task_items') . ' WHERE tid = ?', [$tid])->fetch();
        send_json(['ok' => true, 'task' => out_task($row, list_row((int)$row['list_id']))]);

    case 'tasks.task.done':
        // Ticks a task or takes the tick away; a repeating task that is ticked plans the next one (`next`)
        $u = writer();
        $b = body();
        db()->beginTransaction();
        $x = task_of($u, $b['id'] ?? '', true);
        if (!$x) fail('not_found', 404);
        $nextTid = set_done($x, !empty($b['done']), valid_tz($b['tz'] ?? '', 'UTC'));
        db()->commit();
        $row = q('SELECT * FROM ' . t('task_items') . ' WHERE id = ?', [$x['id']])->fetch();
        $l = list_row((int)$row['list_id']);
        $next = $nextTid ? q('SELECT * FROM ' . t('task_items') . ' WHERE tid = ?', [$nextTid])->fetch() : null;
        send_json(['ok' => true, 'task' => out_task($row, $l), 'next' => $next ? out_task($next, $l) : null]);

    case 'tasks.task.delete':
        $u = writer();
        $x = task_of($u, body()['id'] ?? '');
        if (!$x) fail('not_found', 404);
        q('DELETE FROM ' . t('task_items') . ' WHERE id = ?', [$x['id']]);
        send_json(['ok' => true]);

    case 'tasks.task.move':
        // A task to another list and/or another column of a board; `order`: the tasks of the place where it lands, in
        // their new order (it included). A task moved into the column of done tasks is ticked, and the other way round
        $u = writer();
        $b = body();
        db()->beginTransaction();
        $x = task_of($u, $b['id'] ?? '', true);
        if (!$x) fail('not_found', 404);
        $to = !empty($b['list']) ? list_of($u, $b['list']) : list_row((int)$x['list_id']);
        if (!$to) fail('not_found', 404);
        if ((int)$to['id'] !== (int)$x['list_id'] && (int)q('SELECT COUNT(*) FROM ' . t('task_items') . ' WHERE list_id = ?', [$to['id']])->fetchColumn() >= MAX_TASKS) fail('too_many_tasks', 422);
        $ids = array_column(columns_of($to), 'id');
        $col = in_array($b['col'] ?? null, $ids, true) ? $b['col'] : (in_array($x['col'], $ids, true) && (int)$to['id'] === (int)$x['list_id'] ? $x['col'] : ($x['done_at'] && done_col($to) ? done_col($to) : first_col($to)));
        q('UPDATE ' . t('task_items') . ' SET list_id = ?, col = ?, updated_at = ? WHERE id = ?', [$to['id'], $col, now_utc(), $x['id']]);
        // a habit moved out of a list of habits has no due day to repeat on
        if ($to['view'] !== 'habits' && !$x['due_date'] && $x['rrule'] !== '') q('UPDATE ' . t('task_items') . " SET rrule = '' WHERE id = ?", [$x['id']]);
        $nextTid = null;
        if (array_key_exists('col', $b) && done_col($to) !== '') {
            $x['list_id'] = $to['id'];
            $x['col'] = $col;
            if ($col === done_col($to) && !$x['done_at']) $nextTid = set_done($x, true, valid_tz($b['tz'] ?? '', 'UTC'));
            elseif ($col !== done_col($to) && $x['done_at']) {
                q('UPDATE ' . t('task_items') . ' SET done_at = NULL WHERE id = ?', [$x['id']]);
            }
        }
        foreach (array_values((array)($b['order'] ?? [])) as $i => $tid) q('UPDATE ' . t('task_items') . ' SET position = ? WHERE tid = ? AND list_id = ?', [($i + 1) * 10, valid_code($tid), $to['id']]);
        db()->commit();
        $row = q('SELECT * FROM ' . t('task_items') . ' WHERE id = ?', [$x['id']])->fetch();
        $next = $nextTid ? q('SELECT * FROM ' . t('task_items') . ' WHERE tid = ?', [$nextTid])->fetch() : null;
        send_json(['ok' => true, 'task' => out_task($row, $to), 'next' => $next ? out_task($next, $to) : null]);

    case 'tasks.habit.mark':
        // A day of a habit done, or not done after all (today or a day before: never a day to come)
        $u = writer();
        $b = body();
        db()->beginTransaction();
        $x = task_of($u, $b['id'] ?? '', true);
        if (!$x) fail('not_found', 404);
        $day = valid_day($b['day'] ?? null);
        $tz = valid_tz($b['tz'] ?? '', $x['tz'] ?: 'UTC');
        if (!$day || clean_log([$day], $tz) === []) fail('bad_time', 422);
        $log = json_decode((string)($x['log'] ?? '[]'), true) ?: [];
        $log = !empty($b['done']) ? array_merge($log, [$day]) : array_values(array_diff($log, [$day]));
        q('UPDATE ' . t('task_items') . ' SET log = ?, updated_at = ? WHERE id = ?', [json_out(clean_log($log, $tz)), now_utc(), $x['id']]);
        db()->commit();
        $row = q('SELECT * FROM ' . t('task_items') . ' WHERE id = ?', [$x['id']])->fetch();
        send_json(['ok' => true, 'task' => out_task($row, list_row((int)$row['list_id']))]);

    case 'tasks.task.order':
        // The tasks of a list (or of a column of its board) in their new order
        $u = writer();
        $b = body();
        $l = list_of($u, $b['list'] ?? '');
        if (!$l) fail('not_found', 404);
        foreach (array_values((array)($b['ids'] ?? [])) as $i => $tid) q('UPDATE ' . t('task_items') . ' SET position = ? WHERE tid = ? AND list_id = ?', [($i + 1) * 10, valid_code($tid), $l['id']]);
        send_json(['ok' => true]);

    case 'tasks.done.clear':
        // The done tasks of a list go for good
        $u = writer();
        $l = list_of($u, body()['list'] ?? '');
        if (!$l) fail('not_found', 404);
        $n = q('DELETE FROM ' . t('task_items') . ' WHERE list_id = ? AND done_at IS NOT NULL', [$l['id']])->rowCount();
        send_json(['ok' => true, 'removed' => $n]);

    case 'tasks.schedules':
        $u = reader();
        send_json(['ok' => true, 'schedules' => schedule_todos($u)]);

    // ================================================================ the other apps of SavOffice

    case 'tasks.calendars':
        // The calendars of one's own in SavCalendar, for "add to calendar" (the first one is made if there is none)
        $u = reader();
        $cals = own_calendars($u, valid_tz($_GET['tz'] ?? '', 'UTC'));
        $p = q('SELECT prefs FROM ' . t('cal_profiles') . ' WHERE user_id = ?', [$u['id']])->fetchColumn();
        send_json(['ok' => true, 'calendars' => array_map(fn($c) => ['id' => $c['cid'], 'name' => $c['name'], 'color' => $c['color']], $cals), 'default' => (json_decode((string)$p, true) ?: [])['defaultCal'] ?? null]);

    case 'tasks.cal.create':
        // A task becomes an event in SavCalendar (the same account): on its due day, or at the day and time chosen
        $u = writer();
        $b = body();
        db()->beginTransaction();
        $x = task_of($u, $b['id'] ?? '', true);
        if (!$x) fail('not_found', 404);
        [$eid, $day, $calName] = task_to_event($u, $x, $b);
        q('UPDATE ' . t('task_items') . ' SET cal_eid = ?, updated_at = ? WHERE id = ?', [$eid, now_utc(), $x['id']]);
        db()->commit();
        send_json(['ok' => true, 'event' => $eid, 'calendar' => $calName, 'link' => rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savcalendar/#/day/' . $day]);

    case 'tasks.sch.create':
        // A task that needs other people becomes a date poll in SavSchedules (the same account): the app then opens it in
        // the editor of SavSchedules, where everything else is set. The task remembers it and shows the date once chosen
        $u = writer();
        $b = body();
        if ((int)q('SELECT COUNT(*) FROM ' . t('schedules') . ' WHERE owner_id = ?', [$u['id']])->fetchColumn() >= MAX_USER_SCHEDULES) fail('too_many_schedules', 422);
        db()->beginTransaction();
        $x = task_of($u, $b['id'] ?? '', true);
        if (!$x) fail('not_found', 404);
        $kind = in_array($b['kind'] ?? '', KINDS, true) ? $b['kind'] : 'poll';
        $title = s($b, 'title', 160) ?: mb_substr($x['title'], 0, 160);
        if ($title === '') fail('title_required', 422);
        $set = clean_settings(array_merge(['tz' => valid_tz($b['tz'] ?? '', 'UTC'), 'color' => 'teal'], is_array($b['settings'] ?? null) ? $b['settings'] : []), $kind);
        $opts = clean_options($b['options'] ?? [], $kind);
        if (!$opts) fail('nothing_chosen', 422);
        $pid = new_pid();
        q('INSERT INTO ' . t('schedules') . ' (pid, owner_id, kind, title, descr, place, settings, created_at, updated_at, seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$pid, $u['id'], $kind, $title, multiline($b, 'descr', 4000) ?: mb_substr((string)$x['notes'], 0, 4000), s($b, 'place', 200), json_out($set), now_utc(), now_utc(), now_utc()]);
        save_options((int)db()->lastInsertId(), $opts);
        q('UPDATE ' . t('task_items') . ' SET sch_pid = ?, updated_at = ? WHERE id = ?', [$pid, now_utc(), $x['id']]);
        db()->commit();
        send_json(['ok' => true, 'id' => $pid, 'edit' => rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savschedules/#/e/' . $pid]);

    default:
        fail('not_found', 404);
}

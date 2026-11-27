<?php
/**
 * SavSchedules — JSON API.  api/index.php?r=<action>
 *
 * Accounts:     auth.config, auth.me, auth.register, auth.login (and the routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout,
 *               auth.password, auth.forgot, auth.reset, auth.prefs, auth.profile, auth.export, auth.delete
 * Owner:        sch.list, sch.create, sch.get, sch.save, sch.status, sch.final, sch.assign, sch.star, sch.seen, sch.duplicate, sch.trash, sch.restore, sch.delete, sch.empty_trash,
 *               resp.delete
 * Answering:    pub.get, pub.answer, pub.withdraw  (no account needed, unless the owner asks for one)
 * Abuse:        report.add
 * Master admin: master.overview, master.users, master.block, master.schedules, master.suspend, master.reports, master.report
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in). An answer without an account is
 * recognised by its private key (48 hex characters), kept by the browser and sent in the email of the answer.
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/sched.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavSchedules API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
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
const SPACE_APP = 'savschedules';

/** What a person keeps in SavSchedules: polls and slots. It counts in their space of SavOffice. */
function space_bytes(array $u): int
{
    $q = function (string $sql) use ($u): int { $st = db()->prepare($sql); $st->execute([$u['id']]); return (int)$st->fetchColumn(); };
    return $q('SELECT COALESCE(SUM(COALESCE(LENGTH(descr),0) + COALESCE(LENGTH(settings),0) + 512),0) FROM ' . t('schedules') . ' WHERE owner_id = ?')
        + $q('SELECT COUNT(*) * 128 FROM ' . t('options') . ' o JOIN ' . t('schedules') . ' s ON s.id = o.schedule_id WHERE s.owner_id = ?');
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
    'name' => 'SavSchedules', 'cookie' => 'savschedules', 'lang' => fn() => identity_lang(),
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
        share_session(); // SavCalendar uses the same session
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

    case 'auth.prefs':
        // Global settings of the editor: a small JSON object read only by the app
        $u = writer();
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 4000) fail('bad_request', 413);
        db()->prepare('UPDATE ' . t('users') . ' SET prefs = ? WHERE id = ?')->execute([$p, $u['id']]);
        send_json(['ok' => true]);

    case 'auth.profile':
        // Name and language of the app (also the language of the platform's emails). The email never changes.
        $u = writer(true);
        $b = body();
        $name = s($b, 'name', 80);
        if ($name !== '' && mb_strlen($name) < 2) fail('name_required', 422);
        db()->prepare('UPDATE ' . t('users') . ' SET name = IF(? = \'\', name, ?), ui_lang = ? WHERE id = ?')->execute([$name, $name, ui_lang($b), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.export':
        // Everything the account keeps, as one JSON file: profile, own schedules with their answers, answers given
        $u = reader();
        $own = [];
        foreach (q('SELECT * FROM ' . t('schedules') . ' WHERE owner_id = ? ORDER BY id', [$u['id']])->fetchAll() as $s) {
            $x = out_schedule($s, $u, true);
            $x['trash'] = $s['deleted_at'] !== null;
            $own[] = $x;
        }
        $given = array_map(fn($r) => ['schedule' => $r['pid'], 'title' => $r['title'], 'name' => $r['name'], 'note' => $r['note'], 'at' => iso($r['updated_at'])],
            q('SELECT s.pid, s.title, r.name, r.note, r.updated_at FROM ' . t('responses') . ' r JOIN ' . t('schedules') . ' s ON s.id = r.schedule_id WHERE r.user_id = ? ORDER BY r.id', [$u['id']])->fetchAll());
        header('Content-Disposition: attachment; filename="savschedules-data.json"');
        send_json(['app' => 'SavSchedules', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at']), 'prefs' => json_decode((string)($u['prefs'] ?? '{}'), true)],
            'schedules' => $own, 'answers' => $given]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);


    // ================================================================ owner

    case 'sch.list':
        // Own schedules (trash too) with their numbers, and the ones answered with this account
        $u = reader();
        $rows = q('SELECT s.*, (SELECT COUNT(*) FROM ' . t('responses') . ' r WHERE r.schedule_id = s.id) answers,
                (SELECT COUNT(*) FROM ' . t('responses') . ' r WHERE r.schedule_id = s.id AND (s.seen_at IS NULL OR r.updated_at > s.seen_at)) fresh,
                (SELECT MAX(r.updated_at) FROM ' . t('responses') . ' r WHERE r.schedule_id = s.id) last_answer,
                (SELECT COUNT(*) FROM ' . t('options') . ' o WHERE o.schedule_id = s.id) n_options,
                (SELECT COALESCE(SUM(o.capacity),0) FROM ' . t('options') . ' o WHERE o.schedule_id = s.id) places,
                (SELECT COUNT(*) FROM ' . t('choices') . ' c JOIN ' . t('options') . ' o ON o.id = c.option_id WHERE o.schedule_id = s.id AND c.value = 2) taken,
                (SELECT COUNT(*) FROM ' . t('assignments') . ' a WHERE a.schedule_id = s.id) assigned,
                (SELECT MIN(COALESCE(o.starts_at, o.day)) FROM ' . t('options') . ' o WHERE o.schedule_id = s.id) first_at,
                (SELECT MAX(COALESCE(o.ends_at, o.starts_at, o.day)) FROM ' . t('options') . ' o WHERE o.schedule_id = s.id) last_at
            FROM ' . t('schedules') . ' s WHERE s.owner_id = ? ORDER BY s.updated_at DESC LIMIT ' . MAX_USER_SCHEDULES, [$u['id']])->fetchAll();
        $out = array_map(function ($s) {
            $set = settings_of($s);
            return ['id' => $s['pid'], 'kind' => $s['kind'], 'title' => $s['title'], 'place' => $s['place'], 'color' => $set['color'], 'access' => $set['access'], 'hidden' => $set['hidden'], 'deadline' => $set['deadline'],
                'status' => $s['status'], 'closed' => is_closed($s), 'final' => $s['final_option_id'] !== null || (int)$s['assigned'] > 0, 'expected' => $set['expected'], 'starred' => (bool)$s['starred'], 'deleted' => $s['deleted_at'] !== null,
                'answers' => (int)$s['answers'], 'fresh' => (int)$s['fresh'], 'lastAnswer' => iso($s['last_answer']), 'options' => (int)$s['n_options'], 'places' => (int)$s['places'], 'taken' => (int)$s['taken'],
                'first' => $s['first_at'] ? iso(strlen($s['first_at']) === 10 ? $s['first_at'] . ' 00:00:00' : $s['first_at']) : null,
                'last' => $s['last_at'] ? iso(strlen($s['last_at']) === 10 ? $s['last_at'] . ' 23:59:59' : $s['last_at']) : null,
                'created' => iso($s['created_at']), 'updated' => iso($s['updated_at'])];
        }, $rows);
        $answered = array_map(fn($r) => ['id' => $r['pid'], 'kind' => $r['kind'], 'title' => $r['title'], 'owner' => $r['owner'], 'color' => settings_of($r)['color'], 'closed' => is_closed($r), 'at' => iso($r['updated_at_r'])],
            q('SELECT s.*, o.name owner, r.updated_at updated_at_r FROM ' . t('responses') . ' r JOIN ' . t('schedules') . ' s ON s.id = r.schedule_id JOIN ' . t('users') . ' o ON o.id = s.owner_id
                WHERE r.user_id = ? AND s.owner_id <> ? AND s.deleted_at IS NULL AND s.status <> \'suspended\' ORDER BY r.updated_at DESC LIMIT 300', [$u['id'], $u['id']])->fetchAll());
        send_json(['ok' => true, 'schedules' => $out, 'answered' => $answered]);

    case 'sch.create':
    case 'sch.save':
        // The whole schedule at once: title, description, place, settings and options
        $u = writer();
        $b = body();
        $new = $r === 'sch.create';
        if ($new) {
            if ((int)q('SELECT COUNT(*) FROM ' . t('schedules') . ' WHERE owner_id = ?', [$u['id']])->fetchColumn() >= MAX_USER_SCHEDULES) fail('too_many_schedules', 422);
            $kind = in_array($b['kind'] ?? '', KINDS, true) ? $b['kind'] : 'poll';
        } else {
            $s = sch_by_pid((string)($b['id'] ?? ''));
            if (!$s || (int)$s['owner_id'] !== $u['id']) fail('not_found', 404);
            if ($s['status'] === 'suspended') fail('suspended', 403);
            $kind = $s['kind'];
        }
        $title = s($b, 'title', 160);
        if ($title === '') fail('title_required', 422);
        $set = clean_settings($b['settings'] ?? [], $kind);
        $opts = clean_options($b['options'] ?? [], $kind);
        db()->beginTransaction();
        if ($new) {
            $pid = new_pid();
            q('INSERT INTO ' . t('schedules') . ' (pid, owner_id, kind, title, descr, place, settings, created_at, updated_at, seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$pid, $u['id'], $kind, $title, multiline($b, 'descr', 4000), s($b, 'place', 200), json_out($set), now_utc(), now_utc(), now_utc()]);
            $sid = (int)db()->lastInsertId();
        } else {
            $sid = (int)$s['id'];
            q('UPDATE ' . t('schedules') . ' SET title = ?, descr = ?, place = ?, settings = ?, updated_at = ? WHERE id = ?', [$title, multiline($b, 'descr', 4000), s($b, 'place', 200), json_out($set), now_utc(), $sid]);
        }
        save_options($sid, $opts);
        db()->commit();
        $s = q('SELECT * FROM ' . t('schedules') . ' WHERE id = ?', [$sid])->fetch();
        send_json(['ok' => true, 'schedule' => out_schedule($s, $u, true)]);

    case 'sch.get':
        $u = reader();
        $s = sch_by_pid((string)($_GET['id'] ?? ''));
        if (!$s || (int)$s['owner_id'] !== $u['id']) fail('not_found', 404);
        send_json(['ok' => true, 'schedule' => out_schedule($s, $u, true)]);

    case 'sch.status':
    case 'sch.final':
    case 'sch.assign':
    case 'sch.star':
    case 'sch.seen':
    case 'sch.trash':
    case 'sch.restore':
    case 'sch.delete':
    case 'sch.duplicate':
    case 'resp.delete':
        $u = writer();
        $b = body();
        $s = sch_by_pid((string)($b['id'] ?? ''));
        if (!$s || (int)$s['owner_id'] !== $u['id']) fail('not_found', 404);
        if ($s['status'] === 'suspended' && !in_array($r, ['sch.trash', 'sch.delete'], true)) fail('suspended', 403);
        $sid = (int)$s['id'];
        if ($r === 'sch.status') q('UPDATE ' . t('schedules') . ' SET status = ?, updated_at = ? WHERE id = ?', [($b['open'] ?? false) ? 'open' : 'closed', now_utc(), $sid]);
        if ($r === 'sch.star') q('UPDATE ' . t('schedules') . ' SET starred = ? WHERE id = ?', [($b['on'] ?? false) ? 1 : 0, $sid]);
        if ($r === 'sch.seen') q('UPDATE ' . t('schedules') . ' SET seen_at = ? WHERE id = ?', [now_utc(), $sid]);
        if ($r === 'sch.trash') q('UPDATE ' . t('schedules') . ' SET deleted_at = ? WHERE id = ?', [now_utc(), $sid]);
        if ($r === 'sch.restore') q('UPDATE ' . t('schedules') . ' SET deleted_at = NULL WHERE id = ?', [$sid]);
        if ($r === 'sch.delete') {
            q('DELETE FROM ' . t('schedules') . ' WHERE id = ?', [$sid]);
            send_json(['ok' => true]);
        }
        if ($r === 'resp.delete') q('DELETE FROM ' . t('responses') . ' WHERE id = ? AND schedule_id = ?', [(int)($b['response'] ?? 0), $sid]);
        if ($r === 'sch.final') {
            // The chosen date (null takes the choice back); with notify the people who left an email are told
            $opt = isset($b['option']) && $b['option'] !== null ? (int)$b['option'] : null;
            $row = $opt ? q('SELECT * FROM ' . t('options') . ' WHERE id = ? AND schedule_id = ?', [$opt, $sid])->fetch() : null;
            if ($opt && !$row) fail('not_found', 404);
            q('UPDATE ' . t('schedules') . ' SET final_option_id = ?, status = IF(? IS NULL, status, \'closed\'), updated_at = ? WHERE id = ?', [$opt, $opt, now_utc(), $sid]);
            if ($row && !empty($b['notify'])) {
                $set = settings_of($s);
                $people = q('SELECT DISTINCT COALESCE(NULLIF(r.email, \'\'), us.email) email, r.name, COALESCE(us.ui_lang, ?) lang FROM ' . t('responses') . ' r LEFT JOIN ' . t('users') . ' us ON us.id = r.user_id WHERE r.schedule_id = ?', [$u['ui_lang'] ?: 'en', $sid])->fetchAll();
                foreach ($people as $p) {
                    if (!$p['email']) continue;
                    $T = mail_t($p['lang']);
                    send_notice($p['email'], $p['name'], $p['lang'], fill($T['final_subject'], ['title' => $s['title']]), $T['final_title'],
                        [fill($T['hello'], ['name' => $p['name']]), fill($T['final_body'], ['by' => $u['name'], 'title' => $s['title']]), option_text($row, $set['tz'], $p['lang']) . ($s['place'] !== '' ? "\n" . $s['place'] : '')],
                        app_url() . '#/s/' . $s['pid'], $T['final_button']);
                }
            }
        }
        if ($r === 'sch.assign') {
            // Kind "assign": the slot of each person ({response id: option id}; null takes it back). One person per slot;
            // a slot the person had not said they could take is kept as forced. Giving the slots closes the answers.
            if ($s['kind'] !== 'assign') fail('bad_request', 422);
            $map = is_array($b['assign'] ?? null) ? $b['assign'] : [];
            $opts = array_map('intval', q('SELECT id FROM ' . t('options') . ' WHERE schedule_id = ?', [$sid])->fetchAll(PDO::FETCH_COLUMN));
            $resp = array_map('intval', q('SELECT id FROM ' . t('responses') . ' WHERE schedule_id = ?', [$sid])->fetchAll(PDO::FETCH_COLUMN));
            $said = [];
            foreach (q('SELECT c.response_id, c.option_id, c.value FROM ' . t('choices') . ' c JOIN ' . t('responses') . ' x ON x.id = c.response_id WHERE x.schedule_id = ?', [$sid])->fetchAll() as $c) $said[(int)$c['response_id']][(int)$c['option_id']] = (int)$c['value'];
            $rows = [];
            $used = [];
            foreach ($map as $rid => $oid) {
                $rid = (int)$rid;
                $oid = (int)$oid;
                if (!in_array($rid, $resp, true) || !in_array($oid, $opts, true)) fail('not_found', 404);
                if (isset($used[$oid])) fail('slot_twice', 422);
                $used[$oid] = true;
                $rows[] = [$rid, $sid, $oid, empty($said[$rid][$oid]) ? 1 : 0, now_utc()];
            }
            db()->beginTransaction();
            q('DELETE FROM ' . t('assignments') . ' WHERE schedule_id = ?', [$sid]);
            $ins = db()->prepare('INSERT INTO ' . t('assignments') . ' (response_id, schedule_id, option_id, forced, created_at) VALUES (?,?,?,?,?)');
            foreach ($rows as $x) $ins->execute($x);
            q('UPDATE ' . t('schedules') . ' SET status = IF(?, \'closed\', status), updated_at = ? WHERE id = ?', [$rows ? 1 : 0, now_utc(), $sid]);
            db()->commit();
            if ($rows && !empty($b['notify'])) {
                // each person who left an email (or answered with an account) is told their slot
                $set = settings_of($s);
                $byId = [];
                foreach (q('SELECT * FROM ' . t('options') . ' WHERE schedule_id = ?', [$sid])->fetchAll() as $o) $byId[(int)$o['id']] = $o;
                $people = q('SELECT r.id, COALESCE(NULLIF(r.email, \'\'), us.email) email, r.name, COALESCE(us.ui_lang, ?) lang FROM ' . t('responses') . ' r LEFT JOIN ' . t('users') . ' us ON us.id = r.user_id WHERE r.schedule_id = ?', [$u['ui_lang'] ?: 'en', $sid])->fetchAll();
                foreach ($people as $p) {
                    $oid = (int)($map[$p['id']] ?? $map[(string)$p['id']] ?? 0);
                    if (!$p['email'] || !$oid || !isset($byId[$oid])) continue;
                    $T = mail_t($p['lang']);
                    send_notice($p['email'], $p['name'], $p['lang'], fill($T['assign_subject'], ['title' => $s['title']]), $T['assign_title'],
                        [fill($T['hello'], ['name' => $p['name']]), fill($T['assign_body'], ['by' => $u['name'], 'title' => $s['title']]), option_text($byId[$oid], $set['tz'], $p['lang']) . ($s['place'] !== '' ? "\n" . $s['place'] : '')],
                        app_url() . '#/s/' . $s['pid'], $T['final_button']);
                }
            }
        }
        if ($r === 'sch.duplicate') {
            // A copy without answers, open again: the same event next month, the same office hours next week
            db()->beginTransaction();
            $pid = new_pid();
            q('INSERT INTO ' . t('schedules') . ' (pid, owner_id, kind, title, descr, place, settings, created_at, updated_at, seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                [$pid, $u['id'], $s['kind'], mb_substr(s($b, 'title', 160) ?: $s['title'], 0, 160), $s['descr'], $s['place'], $s['settings'], now_utc(), now_utc(), now_utc()]);
            $nid = (int)db()->lastInsertId();
            q('INSERT INTO ' . t('options') . ' (schedule_id, starts_at, ends_at, day, label, capacity) SELECT ?, starts_at, ends_at, day, label, capacity FROM ' . t('options') . ' WHERE schedule_id = ? ORDER BY id', [$nid, $sid]);
            db()->commit();
            send_json(['ok' => true, 'id' => $pid]);
        }
        $s = q('SELECT * FROM ' . t('schedules') . ' WHERE id = ?', [$sid])->fetch();
        send_json(['ok' => true, 'schedule' => out_schedule($s, $u, true)]);

    case 'sch.empty_trash':
        $u = writer();
        q('DELETE FROM ' . t('schedules') . ' WHERE owner_id = ? AND deleted_at IS NOT NULL', [$u['id']]);
        send_json(['ok' => true]);

    // ================================================================ answering (no account needed)

    case 'pub.get':
        only('GET');
        $s = sch_by_pid((string)($_GET['id'] ?? ''));
        if (!$s || $s['deleted_at'] !== null) fail('not_found', 404);
        if ($s['status'] === 'suspended') fail('suspended', 403);
        if (q('SELECT status FROM ' . t('users') . ' WHERE id = ?', [$s['owner_id']])->fetchColumn() !== 'active') fail('not_found', 404);
        $u = current_user();
        if ($u && ($u['status'] !== 'active' || empty($u['email_verified_at']))) $u = null;
        $owner = $u && (int)$s['owner_id'] === $u['id'];
        $mine = my_response($s, $u, (string)($_GET['key'] ?? ''));
        send_json(['ok' => true, 'schedule' => out_schedule($s, $u, $owner, $mine), 'me' => $u ? ['name' => $u['name'], 'email' => $u['email']] : null]);

    case 'pub.answer':
        // A new answer, or a change to one's own (account or private key). Places of the slots are counted under a lock.
        only('POST');
        if (too_many_attempts('answer', 60, 60)) fail('rate_limited', 429);
        $b = body();
        $u = current_user();
        if ($u) {
            require_csrf($u);
            if ($u['status'] !== 'active' || empty($u['email_verified_at'])) $u = null;
        }
        db()->beginTransaction();
        $s = sch_by_pid((string)($b['id'] ?? ''), true);
        if (!$s || $s['deleted_at'] !== null) fail('not_found', 404);
        if ($s['status'] === 'suspended') fail('suspended', 403);
        if (is_closed($s)) fail('closed', 409);
        $set = settings_of($s);
        if ($set['access'] === 'account' && !$u) fail('signin_required', 401);
        $mine = my_response($s, $u, (string)($b['key'] ?? ''));
        if ($set['access'] === 'account' && $mine && $mine['user_id'] !== null && (int)$mine['user_id'] !== $u['id']) fail('forbidden', 403);
        // who answers
        $name = s($b, 'name', 80);
        if ($name === '' && $u) $name = $u['name'];
        if (mb_strlen($name) < 1) fail('name_required', 422);
        $email = mb_strtolower(s($b, 'email', 190));
        if ($u && $email === '') $email = '';
        if ($email !== '') valid_email($email);
        if (!$u && $set['askEmail'] === 'required' && $email === '') fail('email_required', 422);
        if ($set['askEmail'] === 'no' && !$u) $email = '';
        $note = $set['note'] ? s($b, 'note', 500) : '';
        // what they chose
        $valid = array_map('intval', q('SELECT id FROM ' . t('options') . ' WHERE schedule_id = ?', [$s['id']])->fetchAll(PDO::FETCH_COLUMN));
        $choices = [];
        foreach ((array)($b['choices'] ?? []) as $k => $v) {
            $k = (int)$k;
            $v = (int)$v;
            if (!in_array($k, $valid, true) || $v < 1 || $v > 2) continue;
            if ($v === 1 && ($s['kind'] === 'slots' || !$set['maybe'])) continue;
            $choices[$k] = $v;
        }
        if (!$choices && $s['kind'] !== 'assign') fail('nothing_chosen', 422); // assign: "not available" for every slot is an answer too
        if ($s['kind'] === 'slots' && $set['maxPer'] > 0 && count($choices) > $set['maxPer']) fail('too_many_places', 422);
        if ($s['kind'] === 'poll' && $set['minPer'] > 0 && count(array_filter($choices, fn($v) => $v === 2)) < min($set['minPer'], count($valid))) fail('too_few_dates', 422);
        if (!$mine && (int)q('SELECT COUNT(*) FROM ' . t('responses') . ' WHERE schedule_id = ?', [$s['id']])->fetchColumn() >= MAX_RESPONSES) fail('too_many_answers', 422);
        if ($s['kind'] === 'slots') {
            // a place already held by this answer stays its own; the others must still have room
            $ids = implode(',', array_keys($choices));
            $full = q('SELECT o.id FROM ' . t('options') . ' o LEFT JOIN ' . t('choices') . ' c ON c.option_id = o.id AND c.value = 2 AND c.response_id <> ?
                WHERE o.id IN (' . $ids . ') GROUP BY o.id, o.capacity HAVING COUNT(c.response_id) >= o.capacity', [$mine ? (int)$mine['id'] : 0])->fetchAll(PDO::FETCH_COLUMN);
            if ($full) {
                db()->rollBack();
                send_json(['ok' => false, 'error' => 'slot_taken', 'taken' => array_map('intval', $full), 'schedule' => out_schedule($s, $u, false, $mine)], 409);
            }
        }
        $key = null;
        if ($mine) {
            $rid = (int)$mine['id'];
            q('UPDATE ' . t('responses') . ' SET name = ?, email = ?, note = ?, user_id = COALESCE(user_id, ?), updated_at = ? WHERE id = ?', [$name, $email, $note, $u ? $u['id'] : null, now_utc(), $rid]);
            q('DELETE FROM ' . t('choices') . ' WHERE response_id = ?', [$rid]);
        } else {
            $key = bin2hex(random_bytes(24));
            q('INSERT INTO ' . t('responses') . ' (schedule_id, user_id, name, email, note, edit_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)', [$s['id'], $u ? $u['id'] : null, $name, $email, $note, hash('sha256', $key), now_utc(), now_utc()]);
            $rid = (int)db()->lastInsertId();
        }
        $ins = db()->prepare('INSERT INTO ' . t('choices') . ' (response_id, option_id, value) VALUES (?,?,?)');
        foreach ($choices as $k => $v) $ins->execute([$rid, $k, $v]);
        q('UPDATE ' . t('schedules') . ' SET updated_at = ? WHERE id = ?', [now_utc(), $s['id']]);
        db()->commit();
        record_attempt('answer');
        $mine = q('SELECT * FROM ' . t('responses') . ' WHERE id = ?', [$rid])->fetch();
        // emails: the owner (if they want them) and the person who answered (with the link to change the answer)
        $owner = user_row((int)$s['owner_id']);
        $lang = ui_lang($b);
        // assign: the answer that completes the people expected tells the owner that the slots can be given (always)
        $allIn = $key && $s['kind'] === 'assign' && $set['expected'] > 0 && (int)q('SELECT COUNT(*) FROM ' . t('responses') . ' WHERE schedule_id = ?', [$s['id']])->fetchColumn() === $set['expected'];
        if ($allIn) {
            $T = mail_t($owner['ui_lang'] ?: 'en');
            send_notice($owner['email'], $owner['name'], $owner['ui_lang'] ?: 'en', fill($T['allin_subject'], ['title' => $s['title']]), $T['allin_title'],
                [fill($T['hello'], ['name' => $owner['name']]), fill($T['allin_body'], ['n' => $set['expected'], 'title' => $s['title']])], app_url() . '#/r/' . $s['pid'], $T['allin_button']);
        } elseif ($set['notify'] && (!$u || $u['id'] !== (int)$owner['id'])) {
            $T = mail_t($owner['ui_lang'] ?: 'en');
            send_notice($owner['email'], $owner['name'], $owner['ui_lang'] ?: 'en', fill($T['answer_subject'], ['name' => $name, 'title' => $s['title']]), $T['answer_title'],
                [fill($T['hello'], ['name' => $owner['name']]), fill($T[$key ? 'answer_body' : 'answer_changed'], ['name' => $name, 'title' => $s['title']]), $T['answer_off']], app_url() . '#/r/' . $s['pid'], $T['answer_button']);
        }
        $to = $email !== '' ? $email : ($u ? $u['email'] : '');
        if ($to !== '' && $key) {
            $T = mail_t($lang);
            $list = q('SELECT o.*, c.value FROM ' . t('options') . ' o JOIN ' . t('choices') . ' c ON c.option_id = o.id WHERE c.response_id = ? AND c.value >= ? ORDER BY COALESCE(o.day, DATE(o.starts_at)), o.starts_at', [$rid, $s['kind'] === 'assign' ? 1 : 2])->fetchAll();
            $lines = implode("\n", array_map(fn($o) => '• ' . option_text($o, $set['tz'], $lang) . ((int)$o['value'] === 1 ? ' (' . $T['mine_maybe'] . ')' : ''), $list));
            send_notice($to, $name, $lang, fill($T['mine_subject'], ['title' => $s['title']]), $T['mine_title'],
                [fill($T['hello'], ['name' => $name]), fill($T['mine_body'], ['title' => $s['title']]), $lines !== '' ? $T[['slots' => 'mine_slots', 'assign' => 'mine_assign'][$s['kind']] ?? 'mine_poll'] . "\n" . $lines : '', $T['mine_keep']],
                app_url() . '#/s/' . $s['pid'] . '/' . $key, $T['mine_button']);
        }
        $s = sch_by_pid($s['pid']);
        send_json(['ok' => true, 'key' => $key, 'schedule' => out_schedule($s, $u, $u && (int)$s['owner_id'] === $u['id'], $mine)]);

    case 'pub.withdraw':
        // One's own answer goes away, and its places are free again
        only('POST');
        $b = body();
        $u = current_user();
        if ($u) require_csrf($u);
        $s = sch_by_pid((string)($b['id'] ?? ''));
        if (!$s || $s['deleted_at'] !== null) fail('not_found', 404);
        if (is_closed($s)) fail('closed', 409);
        $mine = my_response($s, $u, (string)($b['key'] ?? ''));
        if (!$mine) fail('not_found', 404);
        q('DELETE FROM ' . t('responses') . ' WHERE id = ?', [$mine['id']]);
        $set = settings_of($s);
        $owner = user_row((int)$s['owner_id']);
        if ($set['notify'] && (!$u || $u['id'] !== (int)$owner['id'])) {
            $T = mail_t($owner['ui_lang'] ?: 'en');
            send_notice($owner['email'], $owner['name'], $owner['ui_lang'] ?: 'en', fill($T['answer_subject'], ['name' => $mine['name'], 'title' => $s['title']]), $T['answer_title'],
                [fill($T['hello'], ['name' => $owner['name']]), fill($T['answer_cancel'], ['name' => $mine['name'], 'title' => $s['title']]), $T['answer_off']], app_url() . '#/r/' . $s['pid'], $T['answer_button']);
        }
        send_json(['ok' => true, 'schedule' => out_schedule($s, $u, false, null)]);

    // ================================================================ abuse

    case 'report.add':
        only('POST');
        if (too_many_attempts('report', 5, 60)) fail('rate_limited', 429);
        $b = body();
        $s = sch_by_pid((string)($b['id'] ?? ''));
        if (!$s) fail('not_found', 404);
        $reason = in_array($b['reason'] ?? '', ['spam', 'scam', 'offensive', 'other'], true) ? $b['reason'] : 'other';
        record_attempt('report');
        q('INSERT INTO ' . t('reports') . ' (schedule_id, reason, note, created_at) VALUES (?,?,?,?)', [$s['id'], $reason, multiline($b, 'note', 1000), now_utc()]);
        send_json(['ok' => true]);

    // ================================================================ master admins

    case 'master.overview':
        require_master();
        $n = fn(string $sql) => (int)db()->query($sql)->fetchColumn();
        send_json(['ok' => true, 'users' => $n('SELECT COUNT(*) FROM ' . t('users')), 'active30' => $n('SELECT COUNT(*) FROM ' . t('users') . ' WHERE last_login_at > UTC_TIMESTAMP() - INTERVAL 30 DAY'),
            'schedules' => $n('SELECT COUNT(*) FROM ' . t('schedules') . ' WHERE deleted_at IS NULL'), 'polls' => $n('SELECT COUNT(*) FROM ' . t('schedules') . " WHERE kind = 'poll' AND deleted_at IS NULL"),
            'answers' => $n('SELECT COUNT(*) FROM ' . t('responses')), 'guests' => $n('SELECT COUNT(*) FROM ' . t('responses') . ' WHERE user_id IS NULL'), 'reports' => $n('SELECT COUNT(*) FROM ' . t('reports') . " WHERE status = 'open'")]);

    case 'master.users':
        require_master();
        $term = '%' . addcslashes(s($_GET, 'q', 80), '%_\\') . '%';
        $rows = q('SELECT u.id, u.name, u.email, u.status, u.email_verified_at, u.created_at, u.last_login_at, (SELECT COUNT(*) FROM ' . t('schedules') . ' s WHERE s.owner_id = u.id) schedules
            FROM ' . t('users') . ' u WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.id DESC LIMIT 200', [$term, $term])->fetchAll();
        send_json(['ok' => true, 'users' => array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name'], 'email' => $x['email'], 'status' => $x['status'], 'verified' => $x['email_verified_at'] !== null,
            'created' => iso($x['created_at']), 'seen' => iso($x['last_login_at']), 'schedules' => (int)$x['schedules']], $rows)]);

    case 'master.block':
        $me = require_master();
        require_csrf($me);
        $b = body();
        $id = (int)($b['user'] ?? 0);
        if ($id === $me['id']) fail('forbidden', 403);
        q('UPDATE ' . t('users') . ' SET status = ? WHERE id = ?', [($b['blocked'] ?? false) ? 'disabled' : 'active', $id]);
        if ($b['blocked'] ?? false) q('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?', [$id]);
        send_json(['ok' => true]);

    case 'master.schedules':
        // Titles, owners and numbers: never the answers
        require_master();
        $term = '%' . addcslashes(s($_GET, 'q', 80), '%_\\') . '%';
        $rows = q('SELECT s.pid, s.kind, s.title, s.status, s.created_at, u.name, u.email, (SELECT COUNT(*) FROM ' . t('responses') . ' r WHERE r.schedule_id = s.id) answers,
                (SELECT COUNT(*) FROM ' . t('reports') . ' p WHERE p.schedule_id = s.id AND p.status = \'open\') reports
            FROM ' . t('schedules') . ' s JOIN ' . t('users') . ' u ON u.id = s.owner_id WHERE s.deleted_at IS NULL AND (s.title LIKE ? OR u.email LIKE ?) ORDER BY reports DESC, s.id DESC LIMIT 200', [$term, $term])->fetchAll();
        send_json(['ok' => true, 'schedules' => array_map(fn($x) => ['id' => $x['pid'], 'kind' => $x['kind'], 'title' => $x['title'], 'status' => $x['status'], 'owner' => $x['name'], 'email' => $x['email'],
            'answers' => (int)$x['answers'], 'reports' => (int)$x['reports'], 'created' => iso($x['created_at'])], $rows)]);

    case 'master.suspend':
        $me = require_master();
        require_csrf($me);
        $b = body();
        $s = sch_by_pid((string)($b['id'] ?? ''));
        if (!$s) fail('not_found', 404);
        q('UPDATE ' . t('schedules') . ' SET status = ? WHERE id = ?', [($b['on'] ?? false) ? 'suspended' : 'closed', $s['id']]);
        send_json(['ok' => true]);

    case 'master.reports':
        require_master();
        $rows = q('SELECT p.*, s.pid, s.title, s.status sstatus FROM ' . t('reports') . ' p JOIN ' . t('schedules') . ' s ON s.id = p.schedule_id ORDER BY p.status = \'open\' DESC, p.id DESC LIMIT 200')->fetchAll();
        send_json(['ok' => true, 'reports' => array_map(fn($x) => ['id' => (int)$x['id'], 'schedule' => $x['pid'], 'title' => $x['title'], 'suspended' => $x['sstatus'] === 'suspended', 'reason' => $x['reason'], 'note' => $x['note'],
            'open' => $x['status'] === 'open', 'at' => iso($x['created_at'])], $rows)]);

    case 'master.report':
        $me = require_master();
        require_csrf($me);
        q('UPDATE ' . t('reports') . ' SET status = \'closed\' WHERE id = ?', [(int)(body()['report'] ?? 0)]);
        send_json(['ok' => true]);

    default:
        fail('not_found', 404);
}

<?php
/**
 * SavForms — JSON API.  api/index.php?r=<action>
 *
 * Accounts:     the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login
 *               (and the routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *               auth.reset, auth.profile, auth.export, auth.delete
 * Forms:        forms.init, forms.prefs, forms.list, forms.get, forms.create, forms.save, forms.duplicate, forms.delete,
 *               forms.export, forms.import
 * Answers:      forms.summary (the charts), forms.answers (one by one), forms.answers.delete, forms.csv
 * Answering:    pub.form, pub.submit, pub.summary (no account needed, unless the form asks for one)
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in). The deadlines of the forms show in
 * SavCalendar, which reads these tables itself (savcalendar/lib/cal.php, form_items()).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/forms.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavForms API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
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

// ---------- SavAccount: signing in and joining an account that already exists ----------

require dirname(__DIR__, 2) . '/identity/identity.php';

/** The language of the messages of the sign-in: the app sends it with every request. */
function identity_lang(): string
{
    $h = strtolower((string)($_SERVER['HTTP_X_LANG'] ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')));
    return strpos($h, 'it') === 0 ? 'it' : 'en';
}

identity_setup([
    'name' => 'SavForms', 'cookie' => 'savforms', 'lang' => fn() => identity_lang(),
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
        // Everything SavForms keeps of the account, as one JSON file: its forms with their answers
        $u = reader();
        $p = profile($u);
        $forms = [];
        foreach (q('SELECT * FROM ' . t('form_forms') . ' WHERE user_id = ? ORDER BY id', [$u['id']])->fetchAll() as $f) {
            $x = out_form($f);
            $x['answers'] = [];
            each_response((int)$f['id'], function ($r) use (&$x) {
                $x['answers'][] = out_response($r);
            });
            $forms[] = $x;
        }
        $mine = q('SELECT f.fid, f.title, r.created_at FROM ' . t('form_responses') . ' r JOIN ' . t('form_forms') . ' f ON f.id = r.form_id WHERE r.user_id = ? ORDER BY r.id', [$u['id']])->fetchAll();
        header('Content-Disposition: attachment; filename="savforms-data.json"');
        send_json(['app' => 'SavForms', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => profile_prefs($p), 'forms' => $forms, 'answeredWithAccount' => array_map(fn($r) => ['form' => $r['fid'], 'title' => $r['title'], 'when' => iso($r['created_at'])], $mine)]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);


    // ================================================================ forms of the account

    case 'forms.init':
        // What the app needs to start: settings and the addresses of the other apps
        $u = reader();
        $p = profile($u, (string)($_GET['tz'] ?? 'UTC'));
        $base = rtrim(dirname(rtrim(app_url(), '/')), '/') . '/';
        send_json(['ok' => true, 'prefs' => (object)profile_prefs($p), 'calendar' => $base . 'savcalendar/', 'schedules' => $base . 'savschedules/', 'app' => app_url()]);

    case 'forms.prefs':
        $u = writer();
        profile($u);
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 4000) fail('bad_request', 413);
        q('UPDATE ' . t('form_profiles') . ' SET prefs = ? WHERE user_id = ?', [$p, $u['id']]);
        send_json(['ok' => true]);

    case 'forms.list':
        // The forms of the account, the newest changed first, with how many answers came since the owner last looked
        $u = reader();
        profile($u);
        $rows = q('SELECT f.*, (SELECT COUNT(*) FROM ' . t('form_responses') . ' r WHERE r.form_id = f.id AND r.created_at > COALESCE(f.seen_at, \'1970-01-01\')) AS fresh
            FROM ' . t('form_forms') . ' f WHERE f.user_id = ? ORDER BY f.updated_at DESC LIMIT ' . MAX_FORMS, [$u['id']])->fetchAll();
        send_json(['ok' => true, 'forms' => array_map(fn($f) => out_brief($f, (int)$f['fresh']), $rows)]);

    case 'forms.get':
        $u = reader();
        $f = form_of($u, $_GET['id'] ?? '');
        if (!$f) fail('not_found', 404);
        send_json(['ok' => true, 'form' => out_form($f)]);

    case 'forms.create':
        // A new form: empty, from a model of the app, or from a .savfor file (both cleaned here like every save)
        $u = writer();
        $b = body();
        if ((int)q('SELECT COUNT(*) FROM ' . t('form_forms') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_FORMS) fail('too_many_forms', 422);
        $items = clean_questions($b['items'] ?? []);
        $content = json_out($items);
        if (strlen($content) > MAX_FORM_BYTES) fail('too_big', 413);
        $fid = new_code('form_forms', 'fid');
        $theme = clean_theme($b['theme'] ?? ['color' => FORM_COLORS[array_rand(FORM_COLORS)]]);
        q('INSERT INTO ' . t('form_forms') . ' (fid, user_id, title, descr, content, theme, settings, accepting, tz, created_at, updated_at, seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [$fid, $u['id'], s($b, 'title', 200), multiline($b, 'descr', 5000), $content, json_out($theme), json_out(clean_settings($b['settings'] ?? [])), 1, valid_tz($b['tz'] ?? '', 'UTC'), now_utc(), now_utc(), now_utc()]);
        send_json(['ok' => true, 'form' => out_form(form_by_fid($fid))]);

    case 'forms.save':
        // The editor saves as it goes: only the parts sent change. The questions can change while answers exist (the answers
        // are kept by the ids of questions and options); a question that goes keeps its answers in the CSV until deleted
        $u = writer();
        $b = body();
        db()->beginTransaction();
        $f = form_of($u, $b['id'] ?? '', true);
        if (!$f) fail('not_found', 404);
        $set = [];
        $args = [];
        if (array_key_exists('title', $b)) { $set[] = 'title = ?'; $args[] = s($b, 'title', 200); }
        if (array_key_exists('descr', $b)) { $set[] = 'descr = ?'; $args[] = multiline($b, 'descr', 5000); }
        if (array_key_exists('items', $b)) {
            $content = json_out(clean_questions($b['items']));
            if (strlen($content) > MAX_FORM_BYTES) fail('too_big', 413);
            $set[] = 'content = ?';
            $args[] = $content;
        }
        if (array_key_exists('theme', $b)) { $set[] = 'theme = ?'; $args[] = json_out(clean_theme($b['theme'])); }
        if (array_key_exists('settings', $b)) { $set[] = 'settings = ?'; $args[] = json_out(clean_settings($b['settings'])); }
        if (array_key_exists('accepting', $b)) { $set[] = 'accepting = ?'; $args[] = !empty($b['accepting']) ? 1 : 0; }
        if (array_key_exists('opens', $b)) { $set[] = 'opens_at = ?'; $args[] = utc_time($b['opens']); }
        if (array_key_exists('closes', $b)) { $set[] = 'closes_at = ?'; $args[] = utc_time($b['closes']); }
        if (array_key_exists('tz', $b)) { $set[] = 'tz = ?'; $args[] = valid_tz($b['tz'], $f['tz']); }
        if (array_key_exists('inCalendar', $b)) { $set[] = 'in_calendar = ?'; $args[] = !empty($b['inCalendar']) ? 1 : 0; }
        if (array_key_exists('starred', $b)) { $set[] = 'starred = ?'; $args[] = !empty($b['starred']) ? 1 : 0; }
        if (array_key_exists('archived', $b)) { $set[] = 'archived = ?'; $args[] = !empty($b['archived']) ? 1 : 0; }
        if ($set) {
            // starring or archiving is not a change of the form: it keeps its place in the list
            $touch = array_diff(array_keys($b), ['id', 'starred', 'archived']) ? ', updated_at = ?' : '';
            if ($touch) $args[] = now_utc();
            $args[] = $f['id'];
            q('UPDATE ' . t('form_forms') . ' SET ' . implode(', ', $set) . $touch . ' WHERE id = ?', $args);
        }
        $f = form_of($u, $f['fid']);
        if ($f['opens_at'] && $f['closes_at'] && $f['opens_at'] >= $f['closes_at']) fail('dates_order', 422);
        db()->commit();
        send_json(['ok' => true, 'form' => out_form($f)]);

    case 'forms.duplicate':
        // A copy of the questions, look and settings (no answers), closed until it is opened again
        $u = writer();
        $f = form_of($u, body()['id'] ?? '');
        if (!$f) fail('not_found', 404);
        if ((int)q('SELECT COUNT(*) FROM ' . t('form_forms') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_FORMS) fail('too_many_forms', 422);
        $fid = new_code('form_forms', 'fid');
        $copy = ($u['ui_lang'] ?? '') === 'it' ? ' (copia)' : ' (copy)';
        q('INSERT INTO ' . t('form_forms') . ' (fid, user_id, title, descr, content, theme, settings, accepting, tz, in_calendar, created_at, updated_at, seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$fid, $u['id'], mb_substr($f['title'] . $copy, 0, 200), $f['descr'], $f['content'], $f['theme'], $f['settings'], 1, $f['tz'], $f['in_calendar'], now_utc(), now_utc(), now_utc()]);
        send_json(['ok' => true, 'form' => out_form(form_by_fid($fid))]);

    case 'forms.delete':
        // A form and all its answers, for good
        $u = writer();
        $f = form_of($u, body()['id'] ?? '');
        if (!$f) fail('not_found', 404);
        q('DELETE FROM ' . t('form_forms') . ' WHERE id = ?', [$f['id']]);
        send_json(['ok' => true]);

    case 'forms.export':
        // A whole form for its .savfor file (built by the app), with its answers when asked
        $u = reader();
        $f = form_of($u, $_GET['id'] ?? '');
        if (!$f) fail('not_found', 404);
        $x = out_form($f);
        if (!empty($_GET['answers'])) {
            $x['answers'] = [];
            each_response((int)$f['id'], function ($r) use (&$x) {
                $a = out_response($r);
                unset($a['account']);
                $x['answers'][] = $a;
            });
        }
        send_json(['ok' => true, 'form' => $x]);

    case 'forms.import':
        // A .savfor (read by the app): a new form, and its answers when the file has them
        $u = writer();
        $b = body();
        $src = is_array($b['form'] ?? null) ? $b['form'] : null;
        if (!$src) fail('bad_file', 422);
        if ((int)q('SELECT COUNT(*) FROM ' . t('form_forms') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_FORMS) fail('too_many_forms', 422);
        $items = clean_questions($src['items'] ?? []);
        $content = json_out($items);
        if (strlen($content) > MAX_FORM_BYTES) fail('too_big', 413);
        db()->beginTransaction();
        $fid = new_code('form_forms', 'fid');
        q('INSERT INTO ' . t('form_forms') . ' (fid, user_id, title, descr, content, theme, settings, accepting, tz, created_at, updated_at, seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [$fid, $u['id'], clean_line($src['title'] ?? '', 200), clean_text($src['descr'] ?? '', 5000), $content, json_out(clean_theme($src['theme'] ?? [])), json_out(clean_settings($src['settings'] ?? [])), 0,
                valid_tz($src['tz'] ?? '', valid_tz($b['tz'] ?? '', 'UTC')), now_utc(), now_utc(), now_utc()]);
        $f = form_by_fid($fid);
        $n = 0;
        if (!empty($b['withAnswers']) && is_array($src['answers'] ?? null)) {
            $set = settings_of($f);
            foreach (array_slice($src['answers'], 0, MAX_RESPONSES) as $r) {
                if (!is_array($r)) continue;
                // the answers of a file are checked like new ones, only without "required": a wrong one is left out
                $a = clean_answers($items, is_array($r['answers'] ?? null) ? $r['answers'] : [], true);
                [$sc, $mx] = $set['quiz'] ? score_of($items, $a) : [null, null];
                $when = utc_time($r['created'] ?? '') ?? now_utc();
                q('INSERT INTO ' . t('form_responses') . ' (rid, form_id, name, email, answers, score, max_score, seconds, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                    [new_code('form_responses', 'rid'), $f['id'], clean_line($r['name'] ?? '', 80), clean_line($r['email'] ?? '', 190), json_out((object)$a), $mx ? $sc : null, $mx ?: null,
                        isset($r['seconds']) ? max(0, min(864000, (int)$r['seconds'])) : null, $when, utc_time($r['updated'] ?? '') ?? $when]);
                $n++;
            }
            recount((int)$f['id']);
        }
        db()->commit();
        send_json(['ok' => true, 'form' => out_form(form_by_fid($fid)), 'answers' => $n]);

    // ================================================================ answers, for the owner

    case 'forms.summary':
        // The charts of the answers (see summarize()); looking at them marks the answers as seen
        $u = reader();
        $f = form_of($u, $_GET['id'] ?? '');
        if (!$f) fail('not_found', 404);
        q('UPDATE ' . t('form_forms') . ' SET seen_at = ? WHERE id = ?', [now_utc(), $f['id']]);
        send_json(['ok' => true, 'form' => out_form($f), 'summary' => summarize($f)]);

    case 'forms.answers':
        // The answers one by one, the newest first: `offset`, `limit` (at most 100), `q` (a text found in them)
        $u = reader();
        $f = form_of($u, $_GET['id'] ?? '');
        if (!$f) fail('not_found', 404);
        $limit = max(1, min(100, (int)($_GET['limit'] ?? 20)));
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        $where = 'form_id = ?';
        $args = [$f['id']];
        $find = trim((string)($_GET['q'] ?? ''));
        if ($find !== '') {
            $where .= ' AND (answers LIKE ? OR email LIKE ? OR name LIKE ?)';
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($find, 0, 100)) . '%';
            array_push($args, $like, $like, $like);
        }
        $total = (int)q('SELECT COUNT(*) FROM ' . t('form_responses') . " WHERE $where", $args)->fetchColumn();
        $rows = q('SELECT * FROM ' . t('form_responses') . " WHERE $where ORDER BY created_at DESC, id DESC LIMIT $limit OFFSET $offset", $args)->fetchAll();
        send_json(['ok' => true, 'total' => $total, 'answers' => array_map('out_response', $rows)]);

    case 'forms.answers.delete':
        // Some answers (ids), or all of them (all: true), for good
        $u = writer();
        $b = body();
        $f = form_of($u, $b['id'] ?? '');
        if (!$f) fail('not_found', 404);
        if (!empty($b['all'])) $n = q('DELETE FROM ' . t('form_responses') . ' WHERE form_id = ?', [$f['id']])->rowCount();
        else {
            $ids = array_values(array_filter(array_map('valid_code', array_slice((array)($b['ids'] ?? []), 0, 1000))));
            $n = $ids ? q('DELETE FROM ' . t('form_responses') . ' WHERE form_id = ? AND rid IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([$f['id']], $ids))->rowCount() : 0;
        }
        recount((int)$f['id']);
        send_json(['ok' => true, 'removed' => $n]);

    case 'forms.csv':
        // All the answers as a CSV file (UTF-8 with BOM, so spreadsheets read the accents): one row per answer
        $u = reader();
        $f = form_of($u, $_GET['id'] ?? '');
        if (!$f) fail('not_found', 404);
        $it = ($u['ui_lang'] ?? '') === 'it';
        $set = settings_of($f);
        $cols = csv_columns(questions_of($f));
        $name = preg_replace('/[^\p{L}\p{N} _-]+/u', '', $f['title']) ?: 'form';
        header('Content-Type: text/csv; charset=utf-8');
        header('Cache-Control: no-store');
        header("Content-Disposition: attachment; filename=\"savforms.csv\"; filename*=UTF-8''" . rawurlencode(mb_substr($name, 0, 80) . '.csv'));
        $tz = valid_tz($f['tz'], 'UTC');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");
        $head = [$it ? 'Data e ora' : 'Timestamp'];
        if ($set['collectEmail'] !== 'none') array_push($head, $it ? 'Nome' : 'Name', 'Email');
        if ($set['quiz']) $head[] = $it ? 'Punteggio' : 'Score';
        foreach ($cols as $c) $head[] = $c[0];
        fwrite($out, implode(',', array_map('csv_cell', $head)) . "\r\n");
        each_response((int)$f['id'], function ($r) use ($out, $cols, $set, $tz) {
            $a = json_decode((string)$r['answers'], true) ?: [];
            $d = new DateTime($r['created_at'], new DateTimeZone('UTC'));
            $d->setTimezone(new DateTimeZone($tz));
            $line = [$d->format('Y-m-d H:i:s')];
            if ($set['collectEmail'] !== 'none') array_push($line, $r['name'], $r['email']);
            if ($set['quiz']) $line[] = $r['score'] !== null ? rtrim(rtrim((string)$r['score'], '0'), '.') . '/' . rtrim(rtrim((string)$r['max_score'], '0'), '.') : '';
            foreach ($cols as $c) $line[] = $c[1]($a);
            fwrite($out, implode(',', array_map('csv_cell', $line)) . "\r\n");
        });
        fclose($out);
        exit;

    // ================================================================ answering (anybody with the link)

    case 'pub.form':
        // A form to answer. With `edit` (the secret given after answering, when the form allows it) also those answers;
        // signed in, and the form keeps one answer per person: whether it was already given (and the answers, to change them)
        only('GET');
        $f = form_by_fid($_GET['id'] ?? '');
        if (!$f) fail('not_found', 404);
        $u = current_user();
        if ($u && $u['status'] !== 'active') $u = null;
        $set = settings_of($f);
        $mine = null;
        $edit = (string)($_GET['edit'] ?? '');
        if ($set['allowEdit'] && preg_match('/^[a-f0-9]{48}$/', $edit)) $mine = q('SELECT * FROM ' . t('form_responses') . ' WHERE form_id = ? AND edit_hash = ?', [$f['id'], hash('sha256', $edit)])->fetch() ?: null;
        if (!$mine && $u && ($set['onePerPerson'] || $set['requireSignin'])) $mine = q('SELECT * FROM ' . t('form_responses') . ' WHERE form_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1', [$f['id'], $u['id']])->fetch() ?: null;
        $x = public_form($f);
        $x['isOwner'] = $u && (int)$u['id'] === (int)$f['user_id'];
        send_json(['ok' => true, 'form' => $x, 'me' => $u ? ['name' => $u['name'], 'email' => $u['email'], 'verified' => !empty($u['email_verified_at'])] : null,
            'mine' => $mine ? ['id' => $mine['rid'], 'answers' => $set['allowEdit'] ? (object)(json_decode((string)$mine['answers'], true) ?: []) : null, 'when' => iso($mine['created_at']), 'email' => $mine['email'], 'name' => $mine['name']] : null]);

    case 'pub.submit':
        // Answers to a form. No account needed, unless the form asks for one. Checked against the questions; a quiz is scored
        only('POST');
        $b = body();
        $f = form_by_fid($b['id'] ?? '');
        if (!$f) fail('not_found', 404);
        // the hidden field of the page: only machines fill it in. They are told it went well
        if (s($b, 'website', 100) !== '') send_json(['ok' => true, 'id' => 'xxxxxxxxxx']);
        if (too_many_attempts('form_submit', 30, 10)) fail('rate_limited', 429);
        $set = settings_of($f);
        $u = current_user();
        if ($u && $u['status'] !== 'active') $u = null;
        if ($u) require_csrf($u); // signed in: the answers may carry the account, so a page elsewhere cannot send them
        if ($set['requireSignin'] && (!$u || empty($u['email_verified_at']))) fail('signin_required', 401);
        $items = questions_of($f);
        try {
            $answers = clean_answers($items, $b['answers'] ?? []);
        } catch (AnswerError $e) {
            answer_fail($e->getMessage(), $e->qid);
        }
        db()->beginTransaction();
        $f = q('SELECT * FROM ' . t('form_forms') . ' WHERE id = ? FOR UPDATE', [$f['id']])->fetch();
        // changing answers already given: with the secret, or as the same account when the form keeps one per person
        $old = null;
        $edit = (string)($b['edit'] ?? '');
        if ($set['allowEdit'] && preg_match('/^[a-f0-9]{48}$/', $edit)) $old = q('SELECT * FROM ' . t('form_responses') . ' WHERE form_id = ? AND edit_hash = ? FOR UPDATE', [$f['id'], hash('sha256', $edit)])->fetch() ?: null;
        if (!$old && $u && $set['onePerPerson']) {
            $old = q('SELECT * FROM ' . t('form_responses') . ' WHERE form_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE', [$f['id'], $u['id']])->fetch() ?: null;
            if ($old && !$set['allowEdit']) fail('already_answered', 409);
        }
        $state = form_state($f, $set);
        if ($state['state'] !== 'open' && !($old && $state['state'] === 'full')) fail('form_' . $state['state'], 409);
        // who answered: the account (when the form asks for it), or the address written
        $email = '';
        $name = '';
        if ($set['collectEmail'] === 'account' && $u) {
            $email = (string)$u['email'];
            $name = (string)$u['name'];
        } elseif ($set['collectEmail'] === 'ask') {
            $email = mb_strtolower(s($b, 'email', 190));
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) answer_fail('answer_email', '_email');
            $name = s($b, 'name', 80);
        }
        [$score, $max] = $set['quiz'] ? score_of($items, $answers) : [0, 0];
        $seconds = isset($b['seconds']) ? max(0, min(864000, (int)$b['seconds'])) : null;
        $token = null;
        if ($old) {
            q('UPDATE ' . t('form_responses') . ' SET answers = ?, email = IF(? = \'\', email, ?), name = IF(? = \'\', name, ?), score = ?, max_score = ?, updated_at = ? WHERE id = ?',
                [json_out((object)$answers), $email, $email, $name, $name, $max ? $score : null, $max ?: null, now_utc(), $old['id']]);
            $rid = $old['rid'];
            if ($set['allowEdit']) $token = preg_match('/^[a-f0-9]{48}$/', $edit) && $old['edit_hash'] === hash('sha256', $edit) ? $edit : null;
        } else {
            if ($set['allowEdit']) $token = bin2hex(random_bytes(24));
            $rid = new_code('form_responses', 'rid');
            q('INSERT INTO ' . t('form_responses') . ' (rid, form_id, user_id, name, email, answers, score, max_score, seconds, edit_hash, ip_hash, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [$rid, $f['id'], $u && ($set['requireSignin'] || $set['onePerPerson'] || $set['collectEmail'] === 'account') ? $u['id'] : null, $name, $email, json_out((object)$answers), $max ? $score : null, $max ?: null, $seconds,
                    $token ? hash('sha256', $token) : null, hash('sha256', client_ip() . '|' . gmdate('Y-m-d') . '|' . $f['fid']), now_utc(), now_utc()]);
            q('UPDATE ' . t('form_forms') . ' SET responses = responses + 1, last_response_at = ? WHERE id = ?', [now_utc(), $f['id']]);
        }
        record_attempt('form_submit');
        db()->commit();
        if (!$old && $set['notify']) {
            // one email per answer, at most 50 a day for one form
            $today = (int)q('SELECT COUNT(*) FROM ' . t('form_responses') . ' WHERE form_id = ? AND created_at > ?', [$f['id'], gmdate('Y-m-d H:i:s', time() - 86400)])->fetchColumn();
            $owner = user_row((int)$f['user_id']);
            if ($today <= 50 && $owner && !empty($owner['email_verified_at'])) send_response_notice($owner, $f, (int)$f['responses'] + 1, $name ?: $email);
        }
        send_json(['ok' => true, 'id' => $rid, 'edit' => $token, 'changed' => (bool)$old, 'confirm' => $set['confirm'], 'quiz' => quiz_feedback($f, $answers), 'summary' => $set['showSummary']]);

    case 'pub.summary':
        // The charts of the answers for who answered, when the owner chose to show them (never the answers one by one)
        only('GET');
        $f = form_by_fid($_GET['id'] ?? '');
        if (!$f) fail('not_found', 404);
        $u = current_user();
        if (!settings_of($f)['showSummary'] && !($u && (int)$u['id'] === (int)$f['user_id'])) fail('forbidden', 403);
        $sum = summarize($f);
        // texts written by people stay private: only the counts of the choices, scales and numbers are shown
        foreach ($sum['items'] as &$it) unset($it['texts'], $it['same'], $it['others']);
        unset($it);
        send_json(['ok' => true, 'form' => public_form($f), 'summary' => $sum]);

    default:
        fail('not_found', 404);
}

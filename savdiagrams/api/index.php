<?php
/**
 * SavDiagrams — JSON API.  api/index.php?r=<action>
 *
 * Accounts:     the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login
 *               (and the routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *               auth.reset, auth.profile, auth.export, auth.delete
 * Diagrams:     dg.init, dg.prefs, dg.get, dg.create, dg.save, dg.duplicate, dg.trash, dg.restore, dg.delete, dg.empty_trash
 *
 * SavDocuments and SavPresentations read dg.init and dg.get from their own pages ("Insert a diagram"): same site, and the
 * cookie of the session goes with every request to /savdiagrams/.
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/diagrams.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavDiagrams API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
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
const SPACE_APP = 'savdiagrams';

/** What a person keeps in SavDiagrams: the diagrams. It counts in their space of SavOffice. */
function space_bytes(array $u): int
{
    $st = db()->prepare('SELECT COALESCE(SUM(bytes),0) FROM ' . t('dg_diagrams') . ' WHERE user_id = ?');
    $st->execute([$u['id']]);
    return (int)$st->fetchColumn();
}

/**
 * What this app keeps for the person, listed in SavDrive (a folder of the app in My drive): its folders and its
 * items with the address that opens them here ({@see savspace_catalog_save} in ../savdrive/lib/space.php).
 */
function office_catalog(array $u): array
{
    $all = function (string $sql, array $args = []) use ($u): array { $st = db()->prepare($sql); $st->execute($args ?: [$u['id']]); return $st->fetchAll(); };
    return ['folders' => [], 'items' => array_map(fn($b) => [$b['did'], $b['title'], null, (int)$b['bytes'], $b['updated_at'], '#/d/' . $b['did']],
        $all('SELECT did, title, bytes, updated_at FROM ' . t('dg_diagrams') . ' WHERE user_id = ? AND trashed_at IS NULL ORDER BY updated_at DESC LIMIT 3000'))];
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
    return $i ? ['used' => $i['used'], 'quota' => $i['quota'], 'unlimited' => $i['unlimited'], 'spaceApps' => (object)$i['apps']] : ['used' => $used, 'quota' => $quota];
}

function writer(bool $unverifiedOk = false): array
{
    only('POST');
    $u = require_user($unverifiedOk);
    require_csrf($u);
    // a write that would go beyond the space of SavOffice is refused; then what the app keeps is counted again
    savspace_gate($u, SPACE_APP, (string)($GLOBALS['r'] ?? ''), fn() => space_bytes($u), fn() => fail('quota', 413), fn() => office_catalog($u));
    return $u;
}

function reader(): array
{
    only('GET');
    $u = require_user();
    savspace_touch($u, SPACE_APP, fn() => space_bytes($u), fn() => office_catalog($u));
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
    'name' => 'SavDiagrams', 'cookie' => 'savdiagrams', 'lang' => fn() => identity_lang(),
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
        // Everything the diagrams keep of the account, as one JSON file (polls, slots and calendars are exported by their apps)
        $u = reader();
        $p = profile($u);
        $diagrams = array_map(fn($b) => out_diagram($b), q('SELECT * FROM ' . t('dg_diagrams') . ' WHERE user_id = ? ORDER BY created_at', [$u['id']])->fetchAll());
        foreach ($diagrams as &$b) unset($b['thumb']);
        unset($b);
        header('Content-Disposition: attachment; filename="savdiagrams-data.json"');
        send_json(['app' => 'SavDiagrams', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => profile_prefs($p), 'diagrams' => $diagrams]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);

    // ================================================================ diagrams

    case 'dg.init':
        // Everything the home needs: the settings and the diagrams (without their items)
        $u = reader();
        $p = profile($u);
        send_json(['ok' => true, 'prefs' => (object)profile_prefs($p), 'diagrams' => array_map('out_diagram_card', diagrams_of($u['id'])), 'trashDays' => TRASH_DAYS]);

    case 'dg.prefs':
        // Settings of the diagrams (last shape, styles, theme, home view…): read only by the app
        $u = writer();
        profile($u);
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 6000) fail('bad_request', 413);
        q('UPDATE ' . t('dg_profiles') . ' SET prefs = ? WHERE user_id = ?', [$p, $u['id']]);
        send_json(['ok' => true]);

    case 'dg.get':
        $u = reader();
        $b = own_diagram($u, $_GET['id'] ?? '', true);
        if (empty($_GET['quiet'])) q('UPDATE ' . t('dg_diagrams') . ' SET opened_at = ? WHERE id = ?', [now_utc(), $b['id']]);
        send_json(['ok' => true, 'diagram' => out_diagram($b)]);

    case 'dg.create':
        // A new diagram: empty, from a template, or opened from a .savdia or .drawio file (the items come cleaned)
        $u = writer();
        $b = body();
        $lang = ui_lang($b);
        $diagram = create_diagram($u, clean_title($b['title'] ?? '', $lang), is_array($b['settings'] ?? null) ? $b['settings'] : [], clean_items($b['items'] ?? []), (string)clean_thumb($b['thumb'] ?? ''));
        send_json(['ok' => true, 'diagram' => out_diagram($diagram)]);

    case 'dg.save':
        // The changes of the editor: put (items new or changed), del (ids), order (ids), title, settings, thumb.
        // base: the version the browser had; when another tab saved in between, stale tells it to read the diagram again.
        $u = writer();
        $b = body();
        db()->beginTransaction();
        $row = own_diagram($u, $b['id'] ?? '', false, true);
        $stale = (int)($b['base'] ?? 0) !== (int)$row['version'];
        $sets = [];
        $args = [];
        $put = clean_items($b['put'] ?? []);
        $del = array_values(array_filter(is_array($b['del'] ?? null) ? $b['del'] : [], fn($x) => is_string($x) && preg_match('/^[A-Za-z0-9_-]{1,24}$/', $x)));
        $order = is_array($b['order'] ?? null) ? array_slice($b['order'], 0, DG_MAX_ITEMS) : null;
        if ($put || $del || $order) {
            $items = apply_changes(json_decode((string)$row['items'], true) ?: [], $put, $del, $order);
            if (count($items) > DG_MAX_ITEMS) fail('diagram_big', 413);
            $json = json_out($items);
            if (strlen($json) > MAX_DIAGRAM_BYTES) fail('diagram_big', 413);
            array_push($sets, 'items = ?', 'n_items = ?', 'bytes = ?');
            array_push($args, $json, count($items), strlen($json));
        }
        if (array_key_exists('title', $b)) { $sets[] = 'title = ?'; $args[] = clean_title($b['title'], ui_lang($b)); }
        if (is_array($b['settings'] ?? null)) { $sets[] = 'settings = ?'; $args[] = json_out(clean_settings($b['settings'])); }
        $thumb = clean_thumb($b['thumb'] ?? null);
        if ($thumb !== null) { $sets[] = 'thumb = ?'; $args[] = $thumb; }
        if (!$sets) { db()->commit(); send_json(['ok' => true, 'version' => (int)$row['version'], 'stale' => $stale]); }
        // the view alone (where the diagram was looked at) is not a change: the diagram keeps its place in the home
        $onlyView = count($sets) === 1 && $sets[0] === 'settings = ?' && !$put && !$del && !$order && array_diff_key(clean_settings($b['settings']), ['view' => 1]) == array_diff_key(clean_settings(json_decode((string)$row['settings'], true)), ['view' => 1]);
        if (!$onlyView) { $sets[] = 'updated_at = ?'; $args[] = now_utc(); }
        $sets[] = 'version = version + 1';
        $args[] = $row['id'];
        q('UPDATE ' . t('dg_diagrams') . ' SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
        db()->commit();
        send_json(['ok' => true, 'version' => (int)$row['version'] + 1, 'stale' => $stale, 'updated' => $onlyView ? iso($row['updated_at']) : gmdate('Y-m-d\TH:i:s\Z')]);

    case 'dg.duplicate':
        $u = writer();
        $b = body();
        $src = own_diagram($u, $b['id'] ?? '');
        $title = s($b, 'title', 160) ?: mb_substr((ui_lang($b) === 'it' ? 'Copia di ' : 'Copy of ') . $src['title'], 0, 160);
        $diagram = create_diagram($u, $title, json_decode((string)$src['settings'], true) ?: [], json_decode((string)$src['items'], true) ?: [], (string)$src['thumb']);
        send_json(['ok' => true, 'diagram' => out_diagram_card($diagram)]);

    case 'dg.trash':
    case 'dg.restore':
    case 'dg.delete':
        // Several diagrams at once (ids). Deleting for good: only from the trash.
        $u = writer();
        $ids = array_values(array_filter(array_map('valid_code', is_array(body()['ids'] ?? null) ? array_slice(body()['ids'], 0, 500) : [])));
        if (!$ids) fail('bad_request', 422);
        $in = implode(',', array_fill(0, count($ids), '?'));
        if ($r === 'dg.trash') q('UPDATE ' . t('dg_diagrams') . " SET trashed_at = ? WHERE user_id = ? AND trashed_at IS NULL AND bid IN ($in)", array_merge([now_utc(), $u['id']], $ids));
        elseif ($r === 'dg.restore') q('UPDATE ' . t('dg_diagrams') . " SET trashed_at = NULL WHERE user_id = ? AND bid IN ($in)", array_merge([$u['id']], $ids));
        else q('DELETE FROM ' . t('dg_diagrams') . " WHERE user_id = ? AND trashed_at IS NOT NULL AND bid IN ($in)", array_merge([$u['id']], $ids));
        send_json(['ok' => true]);

    case 'dg.empty_trash':
        $u = writer();
        q('DELETE FROM ' . t('dg_diagrams') . ' WHERE user_id = ? AND trashed_at IS NOT NULL', [$u['id']]);
        send_json(['ok' => true]);

    default:
        fail('not_found', 404);
}

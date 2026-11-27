<?php
/**
 * SavWhiteboard — JSON API.  api/index.php?r=<action>
 *
 * Accounts:     the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login
 *               (and the routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *               auth.reset, auth.profile, auth.export, auth.delete
 * Boards:       wb.init, wb.prefs, wb.get, wb.create, wb.save, wb.duplicate, wb.trash, wb.restore, wb.delete, wb.empty_trash
 * Pictures:     media (public by its random id), media.upload, media.list, media.delete, search, search.thumb, media.import
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/boards.php';
require __DIR__ . '/../lib/media.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavWhiteboard API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false]);
if (!credentials()) fail('not_installed', 503);

// a picture travels as itself (the body is the file); everything else is JSON
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $r !== 'media.upload' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) fail('bad_request', 415);
if ($r === 'media') serve_media((string)($_GET['id'] ?? ''));
remember_app_url();

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}


// ---------- One space for the whole of SavOffice: the space of SavDrive (../savdrive/lib/space.php)

require_once dirname(__DIR__, 2) . '/savdrive/lib/space.php';
const SPACE_APP = 'savwhiteboard';

/** What a person keeps in SavWhiteboard: boards and their pictures. It counts in their space of SavOffice. */
function space_bytes(array $u): int
{
    $q = function (string $sql) use ($u): int { $st = db()->prepare($sql); $st->execute([$u['id']]); return (int)$st->fetchColumn(); };
    return $q('SELECT COALESCE(SUM(bytes),0) FROM ' . t('wb_boards') . ' WHERE user_id = ?')
        + $q('SELECT COALESCE(SUM(bytes),0) FROM ' . t('wb_media') . ' WHERE user_id = ?');
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
    'name' => 'SavWhiteboard', 'cookie' => 'savwhiteboard', 'lang' => fn() => identity_lang(),
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
        send_json(['ok' => true, 'installed' => true, 'savAccount' => sav_enabled(), 'mailReady' => mail_settings() !== null, 'sources' => search_sources(), 'maxUpload' => MAX_UPLOAD_BYTES]);

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
        // Everything the boards keep of the account, as one JSON file (polls, slots and calendars are exported by their apps)
        $u = reader();
        $p = profile($u);
        $boards = array_map(fn($b) => out_board($b), q('SELECT * FROM ' . t('wb_boards') . ' WHERE user_id = ? ORDER BY created_at', [$u['id']])->fetchAll());
        foreach ($boards as &$b) unset($b['thumb']);
        unset($b);
        header('Content-Disposition: attachment; filename="savwhiteboard-data.json"');
        send_json(['app' => 'SavWhiteboard', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => profile_prefs($p), 'boards' => $boards,
            'pictures' => array_map(fn($m) => media_out($m) + ['url' => app_url() . 'api/?r=media&id=' . $m['id']], q('SELECT * FROM ' . t('wb_media') . ' WHERE user_id = ? ORDER BY created_at', [$u['id']])->fetchAll())]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        // the pictures of the account are files: they go too (their rows go with the account)
        $files = q('SELECT id FROM ' . t('wb_media') . ' WHERE user_id = ?', [$u['id']])->fetchAll(PDO::FETCH_COLUMN);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        delete_media_files($files);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);

    // ================================================================ boards

    case 'wb.init':
        // Everything the home needs: the settings and the boards (without their items)
        $u = reader();
        $p = profile($u);
        send_json(['ok' => true, 'prefs' => (object)profile_prefs($p), 'boards' => array_map('out_board_card', boards_of($u['id'])), 'trashDays' => TRASH_DAYS]);

    case 'wb.prefs':
        // Settings of the boards (tools, colours, sizes, theme, home view…): read only by the app
        $u = writer();
        profile($u);
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 6000) fail('bad_request', 413);
        q('UPDATE ' . t('wb_profiles') . ' SET prefs = ? WHERE user_id = ?', [$p, $u['id']]);
        send_json(['ok' => true]);

    case 'wb.get':
        $u = reader();
        $b = own_board($u, $_GET['id'] ?? '', true);
        if (empty($_GET['quiet'])) q('UPDATE ' . t('wb_boards') . ' SET opened_at = ? WHERE id = ?', [now_utc(), $b['id']]);
        send_json(['ok' => true, 'board' => out_board($b)]);

    case 'wb.create':
        // A new board: empty, from a ready-made start, or opened from a .savwhi file (the items come cleaned)
        $u = writer();
        $b = body();
        $lang = ui_lang($b);
        $board = create_board($u, clean_title($b['title'] ?? '', $lang), is_array($b['settings'] ?? null) ? $b['settings'] : [], clean_items($b['items'] ?? []), (string)clean_thumb($b['thumb'] ?? ''));
        send_json(['ok' => true, 'board' => out_board($board)]);

    case 'wb.save':
        // The changes of the editor: put (items new or changed), del (ids), order (ids), title, settings, thumb.
        // base: the version the browser had; when another tab saved in between, stale tells it to read the board again.
        $u = writer();
        $b = body();
        db()->beginTransaction();
        $row = own_board($u, $b['id'] ?? '', false, true);
        $stale = (int)($b['base'] ?? 0) !== (int)$row['version'];
        $sets = [];
        $args = [];
        $put = clean_items($b['put'] ?? []);
        $del = array_values(array_filter(is_array($b['del'] ?? null) ? $b['del'] : [], fn($x) => is_string($x) && preg_match('/^[A-Za-z0-9_-]{1,24}$/', $x)));
        $order = is_array($b['order'] ?? null) ? array_slice($b['order'], 0, WB_MAX_ITEMS) : null;
        if ($put || $del || $order) {
            $items = apply_changes(json_decode((string)$row['items'], true) ?: [], $put, $del, $order);
            if (count($items) > WB_MAX_ITEMS) fail('board_big', 413);
            $json = json_out($items);
            if (strlen($json) > MAX_BOARD_BYTES) fail('board_big', 413);
            array_push($sets, 'items = ?', 'n_items = ?', 'bytes = ?');
            array_push($args, $json, count($items), strlen($json));
        }
        if (array_key_exists('title', $b)) { $sets[] = 'title = ?'; $args[] = clean_title($b['title'], ui_lang($b)); }
        if (is_array($b['settings'] ?? null)) { $sets[] = 'settings = ?'; $args[] = json_out(clean_settings($b['settings'])); }
        $thumb = clean_thumb($b['thumb'] ?? null);
        if ($thumb !== null) { $sets[] = 'thumb = ?'; $args[] = $thumb; }
        if (!$sets) { db()->commit(); send_json(['ok' => true, 'version' => (int)$row['version'], 'stale' => $stale]); }
        // the view alone (where the board was looked at) is not a change: the board keeps its place in the home
        $onlyView = count($sets) === 1 && $sets[0] === 'settings = ?' && !$put && !$del && !$order && array_diff_key(clean_settings($b['settings']), ['view' => 1]) == array_diff_key(clean_settings(json_decode((string)$row['settings'], true)), ['view' => 1]);
        if (!$onlyView) { $sets[] = 'updated_at = ?'; $args[] = now_utc(); }
        $sets[] = 'version = version + 1';
        $args[] = $row['id'];
        q('UPDATE ' . t('wb_boards') . ' SET ' . implode(', ', $sets) . ' WHERE id = ?', $args);
        db()->commit();
        send_json(['ok' => true, 'version' => (int)$row['version'] + 1, 'stale' => $stale, 'updated' => $onlyView ? iso($row['updated_at']) : gmdate('Y-m-d\TH:i:s\Z')]);

    case 'wb.duplicate':
        $u = writer();
        $b = body();
        $src = own_board($u, $b['id'] ?? '');
        $title = s($b, 'title', 160) ?: mb_substr((ui_lang($b) === 'it' ? 'Copia di ' : 'Copy of ') . $src['title'], 0, 160);
        $board = create_board($u, $title, json_decode((string)$src['settings'], true) ?: [], json_decode((string)$src['items'], true) ?: [], (string)$src['thumb']);
        send_json(['ok' => true, 'board' => out_board_card($board)]);

    case 'wb.trash':
    case 'wb.restore':
    case 'wb.delete':
        // Several boards at once (ids). Deleting for good: only from the trash.
        $u = writer();
        $ids = array_values(array_filter(array_map('valid_code', is_array(body()['ids'] ?? null) ? array_slice(body()['ids'], 0, 500) : [])));
        if (!$ids) fail('bad_request', 422);
        $in = implode(',', array_fill(0, count($ids), '?'));
        if ($r === 'wb.trash') q('UPDATE ' . t('wb_boards') . " SET trashed_at = ? WHERE user_id = ? AND trashed_at IS NULL AND bid IN ($in)", array_merge([now_utc(), $u['id']], $ids));
        elseif ($r === 'wb.restore') q('UPDATE ' . t('wb_boards') . " SET trashed_at = NULL WHERE user_id = ? AND bid IN ($in)", array_merge([$u['id']], $ids));
        else q('DELETE FROM ' . t('wb_boards') . " WHERE user_id = ? AND trashed_at IS NOT NULL AND bid IN ($in)", array_merge([$u['id']], $ids));
        send_json(['ok' => true]);

    case 'wb.empty_trash':
        $u = writer();
        q('DELETE FROM ' . t('wb_boards') . ' WHERE user_id = ? AND trashed_at IS NOT NULL', [$u['id']]);
        send_json(['ok' => true]);

    // ================================================================ pictures and search (as in SavPresentations)

    case 'media.upload':
        $u = writer();
        if (too_many_attempts('upload', 200, 60)) fail('rate_limited', 429);
        record_attempt('upload');
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_UPLOAD_BYTES) fail('image_big', 413);
        $bytes = (string)file_get_contents('php://input', false, null, 0, MAX_UPLOAD_BYTES + 1);
        if (strlen($bytes) > MAX_UPLOAD_BYTES) fail('image_big', 413);
        if ($bytes === '') fail('image_type', 422);
        send_json(['ok' => true, 'media' => store_picture((int)$u['id'], $bytes, s($_GET, 'name', 120))]);

    case 'media.list':
        $u = reader();
        $rows = q('SELECT * FROM ' . t('wb_media') . ' WHERE user_id = ? ORDER BY created_at DESC LIMIT 300', [$u['id']])->fetchAll();
        send_json(['ok' => true, 'media' => array_map('media_out', $rows), ] + space_out($u, media_used((int)$u['id']), (int)config_value('quota')));

    case 'media.delete':
        // boards that use it show an empty frame where it was
        $u = writer();
        $id = (string)(body()['id'] ?? '');
        $st = db()->prepare('DELETE FROM ' . t('wb_media') . ' WHERE id = ? AND user_id = ?');
        $st->execute([$id, $u['id']]);
        if ($st->rowCount()) delete_media_files([$id]);
        send_json(['ok' => true]);

    case 'search':
        reader();
        if (too_many_attempts('search', 300, 10)) fail('rate_limited', 429);
        record_attempt('search');
        $q = s($_GET, 'q', 100);
        if (mb_strlen($q) < 2) fail('text_required', 422);
        $res = search_media('image', (string)($_GET['source'] ?? ''), $q, max(1, min(20, (int)($_GET['page'] ?? 1))), !empty($_GET['free']));
        if (!$res) fail('search_failed', 502);
        send_json(['ok' => true] + search_public($res));

    case 'search.thumb':
        // the previews go through the server too
        only('GET');
        if (!current_user()) fail('unauthenticated', 401);
        $i = search_item((string)($_GET['k'] ?? ''), (int)($_GET['n'] ?? -1));
        $bytes = $i ? http_get($i['thumb'], 3000000) : null;
        $size = $bytes ? @getimagesizefromstring($bytes) : null;
        if (!$size || !in_array($size['mime'], ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) {
            http_response_code(404);
            exit;
        }
        header('Content-Type: ' . $size['mime']);
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=43200');
        header("Content-Security-Policy: default-src 'none'");
        echo $bytes;
        exit;

    case 'media.import':
        $u = writer();
        if (too_many_attempts('upload', 200, 60)) fail('rate_limited', 429);
        record_attempt('upload');
        $b = body();
        $i = search_item((string)($b['k'] ?? ''), (int)($b['n'] ?? -1));
        if (!$i) fail('search_expired', 410);
        $bytes = http_get($i['url'], 25000000, [], 25) ?? http_get($i['thumb'], 5000000);
        if (!$bytes) fail('import_failed', 502);
        $credit = trim(($i['title'] ? '“' . mb_substr($i['title'], 0, 80) . '” ' : '') . ($i['author'] ? '© ' . $i['author'] . ' · ' : '') . $i['license']);
        send_json(['ok' => true, 'media' => store_picture((int)$u['id'], $bytes, mb_substr($i['title'], 0, 120), $credit), 'credit' => $credit, 'page' => $i['page'], 'needsCredit' => !empty($i['needsCredit'])]);

    default:
        fail('not_found', 404);
}

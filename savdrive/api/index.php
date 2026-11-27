<?php
/**
 * SavDrive — JSON API.  api/index.php?r=<action>
 *
 * Accounts:     auth.config, auth.me, auth.register, auth.login (and the routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout,
 *               auth.password, auth.forgot, auth.reset, auth.prefs, auth.profile, auth.export, auth.delete
 * Drive:        drive.list, drive.folders, office.get (what an app of SavOffice keeps, listed), folder.create, node.rename, node.move, node.copy, node.star, node.color,
 *               node.trash, node.restore, node.delete, trash.empty, node.share
 * Files:        file.get (GET: the file itself; inline=1 shows it in the page when it is safe), folder.zip (a folder as a ZIP), file.thumb, file.thumbs, file.heads (what the cards show of many files), file.part (a picture inside a file of SavOffice), node.info, upload.start
 *               (conflict: rename keeps both when the name is taken, otherwise 409 name_taken),
 *               upload.chunk (the piece is the body), upload.cancel
 * People:       people.get, people.set (levels by folder, inherited below, with exceptions: lib/access.php), drive.list?in=withme
 * Comments:     comment.list, comment.add, comment.delete
 * Shared links: pub.info, pub.get (anyone with the link, files only)
 * Temporary:    temp.create, temp.finish, temp.list, temp.extend, temp.revoke (the owner; files uploaded for a link: upload.start
 *               with temp), tmp.info, tmp.unlock, tmp.get, tmp.zip (anyone with the link: lib/temp.php)
 * Master admin: master.overview, master.settings, master.users, master.activate, master.quota, master.delete
 * SavPhotos:    photos.* (lib/photos.php)
 * Vault:        vault.* (lib/vault.php: encrypted in the browser; its files travel through upload.chunk too)
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavDrive API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false]);
if (!credentials()) fail('not_installed', 503);

// ---------------------------------------------------------------- files sent as themselves (not JSON)

// A file of the signed-in account. The apps of SavOffice read their files from here too (same site, same cookie).
if ($r === 'file.get') {
    $u = current_user();
    $n = $u && $u['status'] === 'active' && is_activated($u) ? node_by_uid((string)($_GET['id'] ?? '')) : null;
    // the owner, or who can at least read it (lib/access.php), while it is not in the trash
    $role = $n && $n['kind'] === 'file' ? node_role($u, $n) : null;
    if (!$role || ($role !== 'owner' && ($n['trashed_at'] || level($role) < level('read') || !owner_active((int)$n['user_id'])))) {
        http_response_code(404);
        exit;
    }
    if ($role === 'owner' && (empty($_GET['inline']) || !empty($_GET['open']))) db()->prepare('UPDATE ' . t('nodes') . ' SET opened_at = ? WHERE id = ?')->execute([now_utc(), $n['id']]);
    stream_file(blob_path((int)$n['user_id'], (string)$n['bkey']), (string)$n['name'], (string)$n['mime'], !empty($_GET['inline']));
}

// The small picture of an image (for the cards of the grid): who can read the file
if ($r === 'file.thumb') {
    $u = current_user();
    $n = $u && $u['status'] === 'active' && is_activated($u) ? node_by_uid((string)($_GET['id'] ?? '')) : null;
    $role = $n && $n['kind'] === 'file' ? node_role($u, $n) : null;
    $path = $role && ($role === 'owner' || (!$n['trashed_at'] && level($role) >= level('read') && owner_active((int)$n['user_id']))) && str_starts_with((string)$n['mime'], 'image/') ? thumb_path($n) : null;
    if (!$path) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: image/jpeg');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=604800');
    header('ETag: "' . $n['bkey'] . '"');
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

// Many small pictures in one request (?ids=a,b,c, at most 40): {thumbs: {id: base64 JPEG | null}, later: [ids]}. The cards
// of the grid ask them together, so the hosting never sees a burst of requests (it answers 429 to too many). Pictures not
// yet drawn are drawn for 3 seconds at most: the rest come back in "later" and are asked again a moment after.
if ($r === 'file.thumbs') {
    $u = current_user();
    if (!$u || $u['status'] !== 'active' || !is_activated($u)) fail('unauthorized', 401);
    $ids = array_values(array_unique(array_filter(explode(',', (string)($_GET['ids'] ?? '')), fn($x) => preg_match('/^[A-Za-z0-9]{16}$/', $x))));
    if (!$ids || count($ids) > 40) fail('bad_request', 422);
    $out = [];
    $later = [];
    $t0 = microtime(true);
    foreach ($ids as $id) {
        $n = node_by_uid($id);
        $role = $n && $n['kind'] === 'file' ? node_role($u, $n) : null;
        if (!$role || ($role !== 'owner' && ($n['trashed_at'] || level($role) < level('read') || !owner_active((int)$n['user_id']))) || !str_starts_with((string)$n['mime'], 'image/')) { $out[$id] = null; continue; }
        if (!is_file(blob_path((int)$n['user_id'], (string)$n['bkey']) . '.t.jpg') && microtime(true) - $t0 > 3) { $later[] = $id; continue; }
        $path = thumb_path($n);
        $out[$id] = $path ? base64_encode((string)file_get_contents($path)) : null;
    }
    header('Cache-Control: private, no-store');
    send_json(['ok' => true, 'thumbs' => (object)$out, 'later' => $later]);
}

// A picture inside a file of SavOffice (?id=&path=media/…): the previews draw a presentation or a document without
// downloading it whole. Who can read the file.
if ($r === 'file.part') {
    $u = current_user();
    $n = $u && $u['status'] === 'active' && is_activated($u) ? node_by_uid((string)($_GET['id'] ?? '')) : null;
    $role = $n && $n['kind'] === 'file' && $n['bkey'] ? node_role($u, $n) : null;
    $part = (string)($_GET['path'] ?? '');
    $ok = $role && ($role === 'owner' || (!$n['trashed_at'] && level($role) >= level('read') && owner_active((int)$n['user_id'])))
        && preg_match('/\.(savdoc|savboo|savspr|savpre)$/i', (string)$n['name']) && preg_match('#^media/[A-Za-z0-9_.-]{1,120}$#', $part);
    $src = $ok ? blob_path((int)$n['user_id'], (string)$n['bkey']) : '';
    $entry = $ok ? (zip_index($src)[$part] ?? null) : null;
    $data = $entry ? zip_entry($src, $entry, 40 * 1048576) : null;
    if ($data === null) {
        http_response_code(404);
        exit;
    }
    $types = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif', 'webp' => 'image/webp', 'avif' => 'image/avif', 'svg' => 'image/svg+xml', 'mp4' => 'video/mp4', 'webm' => 'video/webm'];
    $type = $types[strtolower(pathinfo($part, PATHINFO_EXTENSION))] ?? 'application/octet-stream';
    // ?w=: smaller, for the cards (480) and the preview window (1600); kept next to the file
    $w = (int)($_GET['w'] ?? 0);
    if (in_array($w, [480, 1600], true) && str_starts_with($type, 'image/') && $type !== 'image/svg+xml' && ($small = part_small($n, $part, $data, $w))) { $data = (string)file_get_contents($small[0]); $type = $small[1]; }
    header('Content-Type: ' . $type);
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox"); // a picture, never a page
    header('Cache-Control: private, max-age=604800');
    header('ETag: "' . $n['bkey'] . '"');
    header('Content-Length: ' . strlen($data));
    echo $data;
    exit;
}

// A folder as a ZIP (lib/zipstream.php), with the folders inside it: who can read it (only what they can read, when it is
// shared with exceptions lower down). ?check=1: only whether it can be made ({files, bytes} or the error)
if ($r === 'folder.zip') {
    require_once __DIR__ . '/../lib/zipstream.php';
    $u = current_user();
    $f = $u && $u['status'] === 'active' && is_activated($u) ? node_by_uid((string)($_GET['id'] ?? '')) : null;
    $role = $f && $f['kind'] === 'folder' ? node_role($u, $f) : null;
    if (!$role || ($role !== 'owner' && ($f['trashed_at'] || level($role) < level('read') || !owner_active((int)$f['user_id'])))) {
        http_response_code(404);
        exit;
    }
    $owner = (int)$f['user_id'];
    $roles = $role === 'owner' ? null : tree_roles($u, $owner);
    $ids = implode(',', subtree_ids($owner, (int)$f['id']));
    $st = db()->prepare('SELECT id, parent_id, kind, name, size, bkey, updated_at FROM ' . t('nodes') . " WHERE user_id = ? AND id IN ($ids) AND trashed_at IS NULL");
    $st->execute([$owner]);
    $rows = [];
    foreach ($st->fetchAll() as $n) $rows[(int)$n['id']] = $n;
    // the path of a file inside the folder: the names of the folders between them
    $path = function (array $n) use (&$rows, $f): string {
        $parts = [$n['name']];
        for ($p = (int)$n['parent_id'], $i = 0; $p && $p !== (int)$f['id'] && isset($rows[$p]) && $i <= MAX_DEPTH; $p = (int)$rows[$p]['parent_id'], $i++) array_unshift($parts, $rows[$p]['name']);
        return implode('/', $parts);
    };
    $entries = [];
    foreach ($rows as $id => $n) {
        if ($n['kind'] !== 'file' || !$n['bkey'] || ($roles !== null && level($roles[$id] ?? null) < level('read'))) continue;
        $entries[] = ['name' => $path($n), 'path' => blob_path($owner, (string)$n['bkey']), 'size' => (int)$n['size'], 'time' => $n['updated_at']];
    }
    usort($entries, fn($a, $b) => strcmp($a['name'], $b['name']));
    $err = zip_check($entries);
    if (!empty($_GET['check'])) send_json($err ? ['ok' => false, 'error' => $err] : ['ok' => true, 'files' => count($entries), 'bytes' => array_sum(array_column($entries, 'size'))], $err ? 422 : 200);
    if ($err) fail($err, 422);
    zip_send(clean_name($f['name']) . '.zip', $entries);
}

// A file shared with a link: anyone who has the link
if ($r === 'pub.get') {
    $tok = (string)($_GET['t'] ?? '');
    $n = null;
    if (preg_match('/^[a-f0-9]{32}$/', $tok)) {
        $st = db()->prepare('SELECT n.*, u.activated, u.status ustatus FROM ' . t('nodes') . ' n JOIN ' . t('users') . " u ON u.id = n.user_id WHERE n.share_token = ? AND n.trashed_at IS NULL AND n.kind = 'file'");
        $st->execute([$tok]);
        $n = $st->fetch() ?: null;
    }
    if (!$n || $n['ustatus'] !== 'active' || !$n['activated']) {
        http_response_code(404);
        exit;
    }
    stream_file(blob_path((int)$n['user_id'], (string)$n['bkey']), (string)$n['name'], (string)$n['mime'], !empty($_GET['inline']));
}

// A temporary link (lib/temp.php): one of its items (?i=, a folder as a ZIP) or all of them in a ZIP. ?k=: the key given by
// tmp.unlock when the link has a password. Each download counts (the last one allowed ends the link).
if ($r === 'tmp.get' || $r === 'tmp.zip') {
    require_once __DIR__ . '/../lib/zipstream.php';
    $l = temp_by_token((string)($_GET['t'] ?? ''));
    if ($l && temp_over($l)) { temp_delete($l); $l = null; }
    $items = $l && (int)$l['ready'] && temp_unlocked($l, (string)($_GET['k'] ?? '')) ? temp_items($l) : [];
    if ($r === 'tmp.get') $items = array_values(array_filter($items, fn($i) => $i['id'] === (int)($_GET['i'] ?? 0)));
    if (!$items) {
        http_response_code(404);
        exit;
    }
    if ($r === 'tmp.get' && $items[0]['kind'] === 'file') {
        $path = blob_path((int)$l['user_id'], (string)$items[0]['bkey']);
        if (!is_file($path) || !temp_count($l)) { http_response_code(404); exit; }
        stream_file($path, (string)$items[0]['name'], (string)$items[0]['mime'], false);
    }
    $entries = temp_entries($l, $items);
    if (zip_check($entries) || !temp_count($l)) {
        http_response_code(422);
        exit;
    }
    zip_send(count($items) === 1 ? clean_name($items[0]['name']) . '.zip' : 'SavDrive ' . gmdate('Y-m-d') . '.zip', $entries);
}

// POST is JSON (a form of another site cannot send it); only a piece of an upload travels as itself, with the X-CSRF-Token header
$ctype = (string)($_SERVER['CONTENT_TYPE'] ?? '');
if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos($ctype, 'application/json') !== 0 && !(($r === 'upload.chunk' || $r === 'photos.thumbset') && stripos($ctype, 'application/octet-stream') === 0)
    && !($r === 'photos.upload' && stripos($ctype, 'multipart/form-data') === 0)) fail('bad_request', 415); // SavPhotos sends a photo, its data and its small picture in one request
remember_app_url();
if (random_int(1, 60) === 1) { purge_old(); vault_resets_due(); temp_purge(); } // temporary links that are over (lib/temp.php)

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

/** A new account: activated at once or waiting for an admin, as the admins chose (masters never wait). */
function new_user(string $name, string $email, string $hash, string $lang): int
{
    $on = default_active() || in_array(mb_strtolower($email), (array)config_value('master_emails', []), true);
    db()->prepare('INSERT INTO ' . t('users') . ' (name, email, password_hash, ui_lang, activated, activated_at, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$name, $email, $hash, $lang, $on ? 1 : 0, $on ? now_utc() : null, now_utc(), now_utc()]);
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

/** The ids of a request (one or many), as rows of this account. */
function own_nodes(array $u): array
{
    $ids = body()['ids'] ?? (isset(body()['id']) ? [body()['id']] : []);
    if (!is_array($ids) || !$ids || count($ids) > 500) fail('bad_request', 422);
    return array_map(fn($id) => own_node($u, $id), array_values(array_unique(array_filter($ids, 'is_string'))));
}

/** Items for the browser, with what this person can do: role and owner for what belongs to others, people for the owner. */
function out_items(array $u, array $rows, array $extra = []): array
{
    $counts = share_counts(array_map(fn($n) => (int)$n['id'], array_filter($rows, fn($n) => (int)$n['user_id'] === (int)$u['id'])));
    $names = names_by_id(array_merge(array_column($rows, 'user_id'), array_column($rows, 'created_by')));
    return array_map(function ($n) use ($u, $counts, $names, $extra) {
        $mine = (int)$n['user_id'] === (int)$u['id'];
        $x = out_node($n, $extra[(int)$n['id']] ?? []);
        $x['role'] = $mine ? 'owner' : ($n['role'] ?? node_role($u, $n));
        if (!$mine) $x['owner'] = $names[(int)$n['user_id']] ?? '';
        if ($mine) $x['people'] = $counts[(int)$n['id']] ?? 0;
        if (!empty($n['created_by']) && (int)$n['created_by'] !== (int)$n['user_id']) $x['by'] = $names[(int)$n['created_by']] ?? '';
        return $x;
    }, $rows);
}

/** The ids of a request (one or many) that this person can reach with at least $need (lib/access.php). */
function reach_nodes(array $u, string $need): array
{
    $ids = body()['ids'] ?? (isset(body()['id']) ? [body()['id']] : []);
    if (!is_array($ids) || !$ids || count($ids) > 500) fail('bad_request', 422);
    return array_map(fn($id) => reach_node($u, $id, $need), array_values(array_unique(array_filter($ids, 'is_string'))));
}

function drive_space(array $u): array
{
    $row = user_row((int)$u['id']);
    return ['used' => user_used((int)$u['id']), 'quota' => user_quota($row), 'unlimited' => is_unlimited(user_quota($row)), 'parts' => (object)space_parts((int)$u['id'])];
}

// ---------------------------------------------------------------- SavAccount: signing in and joining an account that already exists

require dirname(__DIR__, 2) . '/identity/identity.php';

/** The language of the messages of the sign-in: the app sends it with every request. */
function identity_lang(): string
{
    $h = strtolower((string)($_SERVER['HTTP_X_LANG'] ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')));
    return strpos($h, 'it') === 0 ? 'it' : 'en';
}

identity_setup([
    'name' => 'SavDrive', 'cookie' => 'savdrive', 'lang' => fn() => identity_lang(),
    'fail' => function (string $code, int $http): void {
        fail($code, $http);
    },
    'accepted' => fn(array $b) => !empty($b['acceptTerms']),
    'create' => fn(array $who, array $b) => new_user($who['name'] ?: explode('@', $who['email'])[0], $who['email'], '', ui_lang($b)),
    'writer' => fn() => writer(),
]);
identity_route($r);

// SavPhotos (../savphotos/): the photos and videos of the drive, with albums; its routes are in lib/photos.php
if (strncmp($r, 'photos.', 7) === 0) {
    require __DIR__ . '/../lib/photos.php';
    photos_route($r);
}

// The Vault: encrypted in the browser, its routes are in lib/vault.php
if (strncmp($r, 'vault.', 6) === 0) vault_route($r);

switch ($r) {

    // ================================================================ accounts

    case 'auth.config':
        send_json(['ok' => true, 'installed' => true, 'savAccount' => sav_enabled(), 'mailReady' => mail_settings() !== null, 'chunk' => CHUNK_BYTES, 'space' => default_quota()]); // space: what a new account gets, shown on the first page

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
        if (!$row) send_account_link(user_row(new_user($name, $email, password_hash($pw, PASSWORD_DEFAULT), ui_lang($b))), ui_lang($b), 'verify');
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
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . ' WHERE token_hash = ? AND purpose = \'verify\' AND expires_at > ?');
        $st->execute([hash('sha256', (string)(body()['token'] ?? '')), now_utc()]);
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
        // Settings of the app (view, sorting, theme): a small JSON object read only by the app
        $u = writer();
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 4000) fail('bad_request', 413);
        db()->prepare('UPDATE ' . t('users') . ' SET prefs = ? WHERE id = ?')->execute([$p, $u['id']]);
        send_json(['ok' => true]);

    case 'auth.profile':
        // Name and language of the app (also the language of the emails). The email never changes.
        $u = writer(true);
        $b = body();
        $name = s($b, 'name', 80);
        if ($name !== '' && mb_strlen($name) < 2) fail('name_required', 422);
        db()->prepare('UPDATE ' . t('users') . ' SET name = IF(? = \'\', name, ?), ui_lang = ? WHERE id = ?')->execute([$name, $name, ui_lang($b), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.export':
        // What the account keeps about itself and the list of its files and folders (the files are downloaded one by one)
        $u = require_user(true);
        only('GET');
        $st = db()->prepare('SELECT n.*, p.uid parent_uid FROM ' . t('nodes') . ' n LEFT JOIN ' . t('nodes') . ' p ON p.id = n.parent_id WHERE n.user_id = ? ORDER BY n.id');
        $st->execute([$u['id']]);
        $out = ['app' => 'SavDrive', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at']), 'quota' => user_quota($u), 'prefs' => json_decode((string)($u['prefs'] ?? '{}'), true)],
            'items' => array_map(fn($n) => out_node($n, ['parent' => $n['parent_uid']]), $st->fetchAll())];
        header('Content-Disposition: attachment; filename="savdrive-data.json"');
        send_json($out);

    case 'auth.delete':
        // The account, its files and folders, at once and for ever
        $u = writer(true);
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)(body()['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        if (is_master($row)) fail('forbidden', 403); // a master is removed from credentials.php first
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        delete_user_storage((int)$u['id']);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);

    // ================================================================ drive

    case 'drive.list':
        // One place: a folder (uid or root), or a view: starred, recent, trash; ?q= searches every folder
        $u = reader();
        if (random_int(1, 5) === 1) temp_purge((int)$u['id']); // its temporary links that are over stop counting in the space
        $where = (string)($_GET['in'] ?? 'root');
        $q = s($_GET, 'q', 120);
        $T = t('nodes');
        $path = [];
        if ($q !== '') {
            $st = db()->prepare("SELECT * FROM $T WHERE user_id = ? AND trashed_at IS NULL AND name LIKE ? ORDER BY kind = 'file', name LIMIT 300");
            $st->execute([$u['id'], '%' . addcslashes($q, '%_\\') . '%']);
        } elseif ($where === 'starred') {
            $st = db()->prepare("SELECT * FROM $T WHERE user_id = ? AND trashed_at IS NULL AND starred = 1 ORDER BY kind = 'file', name LIMIT 1000");
            $st->execute([$u['id']]);
        } elseif ($where === 'recent') {
            $st = db()->prepare("SELECT * FROM $T WHERE user_id = ? AND trashed_at IS NULL AND kind = 'file' ORDER BY GREATEST(updated_at, COALESCE(opened_at, updated_at)) DESC LIMIT 60");
            $st->execute([$u['id']]);
        } elseif ($where === 'shared') {
            $st = db()->prepare("SELECT * FROM $T WHERE user_id = ? AND trashed_at IS NULL AND share_token IS NOT NULL ORDER BY name LIMIT 1000");
            $st->execute([$u['id']]);
        } elseif ($where === 'trash') {
            $st = db()->prepare("SELECT * FROM $T WHERE user_id = ? AND trash_root = 1 AND trashed_at IS NOT NULL ORDER BY trashed_at DESC LIMIT 2000");
            $st->execute([$u['id']]);
        } elseif ($where === 'withme') {
            // what other people share with this person: the highest things they can reach (what is inside is reached from there)
            $st = db()->prepare("SELECT n.*, s.role FROM " . t('shares') . " s JOIN $T n ON n.id = s.node_id JOIN " . t('users') . " o ON o.id = n.user_id
                WHERE s.email = ? AND s.role <> 'none' AND n.trashed_at IS NULL AND n.user_id <> ? AND o.status = 'active' AND o.activated = 1 ORDER BY n.kind = 'file', n.name LIMIT 2000");
            $st->execute([mb_strtolower((string)$u['email']), $u['id']]);
        } else {
            $f = $where === 'root' ? null : reach_folder($u, $where, 'read');
            $owner = $f ? (int)$f['user_id'] : (int)$u['id'];
            $folderRole = $f ? $f['role'] : 'owner';
            if ($f && $owner === (int)$u['id']) $path = array_map(fn($p) => ['id' => $p['uid'], 'name' => $p['name']], node_path($f));
            elseif ($f) {
                // somebody else's folder: the path from the highest folder this person can open
                $roles = tree_roles($u, $owner);
                $path = [];
                foreach (array_reverse(node_path($f)) as $p) {
                    if (level($roles[(int)$p['id']] ?? null) < level('read')) break;
                    array_unshift($path, ['id' => $p['uid'], 'name' => $p['name']]);
                }
            }
            $st = db()->prepare("SELECT * FROM $T WHERE user_id = ? AND parent_id " . ($f ? '= ' . (int)$f['id'] : 'IS NULL') . " AND trashed_at IS NULL ORDER BY kind = 'file', name LIMIT 5000");
            $st->execute([$owner]);
        }
        $rows = $st->fetchAll();
        if (!empty($roles) || (isset($owner) && $owner !== (int)$u['id'])) {
            // inside a folder of somebody else: only what this person has a level on (an exclusion hides it)
            $roles ??= tree_roles($u, $owner);
            $rows = array_values(array_filter(array_map(function ($n) use ($roles) { $n['role'] = $roles[(int)$n['id']] ?? null; return $n; }, $rows), fn($n) => $n['role'] !== null));
        }
        if ($where === 'withme') {
            // a thing inside another shared thing is reached from there
            $rows = array_values(array_filter($rows, function ($n) use ($u) {
                if ($n['parent_id'] === null) return true;
                $st = db()->prepare('SELECT * FROM ' . t('nodes') . ' WHERE id = ?');
                $st->execute([$n['parent_id']]);
                $p = $st->fetch();
                return !$p || level(node_role($u, $p)) < level('read');
            }));
        }
        // where each item is, for the views that mix folders
        $parents = [];
        if ($q !== '' || in_array($where, ['starred', 'recent', 'shared', 'trash', 'withme'], true)) {
            $ids = array_values(array_unique(array_filter(array_map(fn($n) => $n['parent_id'], $rows))));
            if ($ids) {
                $s2 = db()->query("SELECT id, uid, name FROM $T WHERE id IN (" . implode(',', array_map('intval', $ids)) . ')');
                foreach ($s2->fetchAll() as $p) $parents[(int)$p['id']] = ['id' => $p['uid'], 'name' => $p['name']];
            }
        }
        // the size of the folders: what is inside them, at any depth (one query for the whole account)
        $sizes = [];
        $treeKids = [];
        foreach (array_unique(array_map(fn($n) => (int)$n['user_id'], array_filter($rows, fn($n) => $n['kind'] === 'folder'))) as $treeOwner) {
            $s3 = db()->prepare("SELECT id, parent_id, kind, size FROM $T WHERE user_id = ? AND trashed_at IS NULL" . ($where === 'trash' ? ' OR (user_id = ? AND trashed_at IS NOT NULL)' : ''));
            $s3->execute($where === 'trash' ? [$treeOwner, $treeOwner] : [$treeOwner]);
            $kids = [];
            $own = [];
            foreach ($s3->fetchAll() as $n) {
                $kids[(int)$n['parent_id']][] = (int)$n['id'];
                $own[(int)$n['id']] = $n['kind'] === 'file' ? (int)$n['size'] : 0;
            }
            $sum = function (int $id, int $depth = 0) use (&$sum, &$kids, &$own): array {
                $b = $own[$id] ?? 0;
                $c = 0;
                if ($depth <= MAX_DEPTH) foreach ($kids[$id] ?? [] as $k) {
                    [$kb, $kc] = $sum($k, $depth + 1);
                    $b += $kb;
                    $c += 1 + $kc;
                }
                return [$b, $c];
            };
            foreach ($rows as $n) if ($n['kind'] === 'folder' && (int)$n['user_id'] === $treeOwner) $sizes[(int)$n['id']] = $sum((int)$n['id']);
            $treeKids[$treeOwner] = $kids; // for what peeks out of the folders below
        }
        // what peeks out of the folder cards: two files inside each folder, pictures first, the newest ones (directly
        // inside it, or else in the folders inside it)
        $peeks = [];
        if ($where !== 'trash') {
            $order = "ORDER BY (mime LIKE 'image/%' AND mime <> 'image/svg+xml' AND size < 41943040) DESC, updated_at DESC LIMIT 8";
            $ps = db()->prepare("SELECT id, uid, name, mime, size, updated_at FROM $T WHERE user_id = ? AND parent_id = ? AND kind = 'file' AND trashed_at IS NULL $order");
            $rolesOf = [];
            foreach (array_slice(array_values(array_filter($rows, fn($n) => $n['kind'] === 'folder')), 0, 80) as $n) {
                $o = (int)$n['user_id'];
                $ps->execute([$o, $n['id']]);
                $list = $ps->fetchAll();
                if (!$list && !empty($treeKids[$o][(int)$n['id']])) {
                    $below = [];
                    for ($level = $treeKids[$o][(int)$n['id']], $i = 0; $level && $i <= MAX_DEPTH && count($below) < 3000; $i++) {
                        $below = array_merge($below, $level);
                        $next = [];
                        foreach ($level as $k) foreach ($treeKids[$o][$k] ?? [] as $kk) $next[] = $kk;
                        $level = $next;
                    }
                    $sd = db()->prepare("SELECT id, uid, name, mime, size, updated_at FROM $T WHERE user_id = ? AND id IN (" . implode(',', array_map('intval', array_slice($below, 0, 3000))) . ") AND kind = 'file' AND trashed_at IS NULL $order");
                    $sd->execute([$o]);
                    $list = $sd->fetchAll();
                }
                if ($o !== (int)$u['id']) { // somebody else's folder: only what this person can read
                    $rolesOf[$o] ??= tree_roles($u, $o);
                    $list = array_filter($list, fn($c) => level($rolesOf[$o][(int)$c['id']] ?? null) >= level('read'));
                }
                $peeks[$n['uid']] = array_map(fn($c) => ['id' => $c['uid'], 'name' => $c['name'], 'mime' => $c['mime'], 'size' => (int)$c['size'], 'updated' => iso($c['updated_at'])], array_slice(array_values($list), 0, 2));
            }
        }
        $extra = [];
        foreach ($rows as $n) if ($n['parent_id'] !== null && isset($parents[(int)$n['parent_id']]) && (int)$n['user_id'] === (int)$u['id']) $extra[(int)$n['id']] = ['parent' => $parents[(int)$n['parent_id']]];
        $items = array_map(function ($x) use ($sizes, $rows, $peeks) {
            if ($x['kind'] === 'folder') { $row = array_values(array_filter($rows, fn($n) => $n['uid'] === $x['id']))[0] ?? null; [$x['size'], $x['count']] = $row ? ($sizes[(int)$row['id']] ?? [0, 0]) : [0, 0]; }
            if (isset($peeks[$x['id']])) $x['peek'] = $peeks[$x['id']];
            return $x;
        }, out_items($u, $rows, $extra));
        // My drive also holds a folder for each app of SavOffice that keeps something for this person (office.get)
        $office = $where === 'root' && $q === '' ? office_summary($u) : [];
        // the folder of SavPhotos (lib/photos.php: "SavPhotos" in My drive) is shown as the folder of that app, for who can use it
        if ($where === 'root' && $q === '') {
            require_once __DIR__ . '/../lib/photos.php';
            $can = false;
            try { $can = photo_allowed($u); } catch (Throwable $e) { /* SavPhotos not installed yet */ }
            if ($can) foreach ($items as $i => $x) if ($x['kind'] === 'folder' && mb_strtolower($x['name']) === mb_strtolower(PHOTO_ROOT) && ($x['role'] ?? 'owner') === 'owner') { $items[$i]['special'] = 'savphotos'; break; }
        }
        // a search finds what the apps keep too
        $officeHits = [];
        if ($q !== '') foreach (office_catalogs($u) as $app => $c) foreach ($c['items'] as $d) {
            if (count($officeHits) >= 100) break 2;
            if (mb_stripos((string)$d[1], $q) !== false) $officeHits[] = ['app' => $app, 'id' => $d[0], 'title' => $d[1], 'folder' => $d[2], 'size' => (int)$d[3], 'updated' => $d[4], 'open' => $d[5]];
        }
        send_json(['ok' => true, 'items' => $items, 'office' => $office, 'officeHits' => $officeHits, 'path' => $path, 'role' => $folderRole ?? 'owner', 'sharedRoot' => isset($owner) && $owner !== (int)$u['id']] + drive_space($u));

    case 'office.get':
        // ?app=: what an app of SavOffice keeps for this person, with its folders, as the app listed it (lib/space.php)
        $u = reader();
        $app = (string)($_GET['app'] ?? '');
        $c = office_catalogs($u)[$app] ?? null;
        if (!$c) fail('not_found', 404);
        send_json(['ok' => true, 'app' => $app] + $c);

    case 'drive.folders':
        // Every folder of the account, for choosing where to move things
        // ?in=<id of a thing of somebody else>: the folders of that tree where this person can move things
        $u = reader();
        $ctx = !empty($_GET['in']) ? reach_node($u, (string)$_GET['in'], 'view') : null;
        $owner = $ctx ? (int)$ctx['user_id'] : (int)$u['id'];
        $st = db()->prepare('SELECT n.id, n.uid, n.name, n.color, p.uid parent FROM ' . t('nodes') . ' n LEFT JOIN ' . t('nodes') . " p ON p.id = n.parent_id WHERE n.user_id = ? AND n.kind = 'folder' AND n.trashed_at IS NULL ORDER BY n.name LIMIT 5000");
        $st->execute([$owner]);
        $list = $st->fetchAll();
        if ($owner !== (int)$u['id']) {
            $roles = tree_roles($u, $owner);
            $list = array_map(function ($f) use ($roles) { $f['can'] = level($roles[(int)$f['id']] ?? null) >= level('move'); $f['seen'] = isset($roles[(int)$f['id']]); return $f; }, $list);
            $list = array_values(array_filter($list, fn($f) => $f['seen']));
            $ids = array_column($list, 'uid');
            $list = array_map(function ($f) use ($ids) { if (!in_array($f['parent'], $ids, true)) $f['parent'] = null; return $f; }, $list);
        }
        send_json(['ok' => true, 'mine' => $owner === (int)$u['id'], 'folders' => array_map(fn($f) => ['id' => $f['uid'], 'name' => $f['name'], 'color' => $f['color'], 'parent' => $f['parent'], 'can' => $f['can'] ?? true], $list)]);

    case 'folder.create':
        $u = writer();
        $name = clean_name(body()['name'] ?? '');
        if ($name === '') fail('name_required', 422);
        $parent = reach_folder($u, body()['parent'] ?? null, 'write');
        $owner = $parent ? (int)$parent['user_id'] : (int)$u['id']; // inside a shared folder it belongs to its owner
        if ($parent && count(node_path($parent)) >= MAX_DEPTH) fail('too_deep', 422);
        if (count_nodes($owner) >= MAX_NODES) fail('too_many', 422);
        $pid = $parent ? (int)$parent['id'] : null;
        // reuse: a folder with this name already there is used as it is (a folder uploaded again goes into the same one)
        if (!empty(body()['reuse'])) {
            $st = db()->prepare('SELECT uid FROM ' . t('nodes') . ' WHERE user_id = ? AND parent_id ' . ($pid === null ? 'IS NULL' : '= ' . $pid) . " AND kind = 'folder' AND trashed_at IS NULL AND LOWER(name) = LOWER(?) LIMIT 1");
            $st->execute([$owner, $name]);
            if ($same = $st->fetchColumn()) send_json(['ok' => true, 'reused' => true, 'item' => out_node(node_by_uid((string)$same))]);
        }
        $uid = new_uid();
        db()->prepare('INSERT INTO ' . t('nodes') . " (uid, user_id, parent_id, kind, name, created_by, created_at, updated_at) VALUES (?,?,?,'folder',?,?,?,?)")
            ->execute([$uid, $owner, $pid, free_name($owner, $pid, $name), $u['id'], now_utc(), now_utc()]);
        send_json(['ok' => true, 'item' => out_node(node_by_uid($uid), ['size' => 0, 'count' => 0])]);

    case 'node.rename':
        $u = writer();
        $n = reach_node($u, body()['id'] ?? '', 'write');
        $name = clean_name(body()['name'] ?? '');
        if ($name === '') fail('name_required', 422);
        $pid = $n['parent_id'] === null ? null : (int)$n['parent_id'];
        $name = free_name((int)$n['user_id'], $pid, $name, (int)$n['id']);
        $mime = $n['kind'] === 'file' ? guess_mime($name, (string)$n['mime']) : '';
        db()->prepare('UPDATE ' . t('nodes') . ' SET name = ?, mime = ?, updated_at = ? WHERE id = ?')->execute([$name, $mime, now_utc(), $n['id']]);
        send_json(['ok' => true, 'item' => out_node(node_by_uid($n['uid']))]);

    case 'node.move':
        $u = writer();
        // things move inside the tree of their owner: who is not the owner needs "move" on them and on the folder they go to
        $nodes = reach_nodes($u, 'move');
        $to = reach_folder($u, body()['to'] ?? null, 'move');
        $toId = $to ? (int)$to['id'] : null;
        $toOwner = $to ? (int)$to['user_id'] : (int)$u['id'];
        $depth = $to ? count(node_path($to)) : 0;
        db()->beginTransaction();
        foreach ($nodes as $n) {
            if ($n['trashed_at']) fail('in_trash', 409);
            if ((int)$n['user_id'] !== $toOwner) fail('move_owner', 422);
            if ($n['kind'] === 'folder' && $to && in_array((int)$to['id'], subtree_ids($toOwner, (int)$n['id']), true)) fail('move_inside', 422);
            if ($n['kind'] === 'folder' && $depth >= MAX_DEPTH) fail('too_deep', 422);
            if ($n['parent_id'] === null ? $toId === null : (int)$n['parent_id'] === $toId) continue;
            db()->prepare('UPDATE ' . t('nodes') . ' SET parent_id = ?, name = ?, updated_at = ? WHERE id = ?')->execute([$toId, free_name($toOwner, $toId, (string)$n['name'], (int)$n['id']), now_utc(), $n['id']]);
        }
        db()->commit();
        send_json(['ok' => true]);

    case 'node.copy':
        // A copy of a file next to it, "Name (2).ext": it counts in the space like any other file
        $u = writer();
        // next to it, so in the tree (and the space) of its owner
        $n = reach_node($u, body()['id'] ?? '', 'write', 'file');
        if ($n['trashed_at']) fail('in_trash', 409);
        $owner = (int)$n['user_id'];
        if (user_used($owner, true) + (int)$n['size'] > user_quota(user_row($owner))) fail('quota', 413);
        if (count_nodes($owner) >= MAX_NODES) fail('too_many', 422);
        $key = new_key();
        if (!@copy(blob_path($owner, (string)$n['bkey']), blob_path($owner, $key))) throw new RuntimeException('copy failed');
        $pid = $n['parent_id'] === null ? null : (int)$n['parent_id'];
        $uid = new_uid();
        db()->prepare('INSERT INTO ' . t('nodes') . " (uid, user_id, parent_id, kind, name, mime, size, bkey, created_by, created_at, updated_at) VALUES (?,?,?,'file',?,?,?,?,?,?,?)")
            ->execute([$uid, $owner, $pid, free_name($owner, $pid, (string)$n['name']), $n['mime'], $n['size'], $key, $u['id'], now_utc(), now_utc()]);
        send_json(['ok' => true, 'item' => out_node(node_by_uid($uid))] + drive_space($u));

    case 'node.star':
        $u = writer();
        $on = !empty(body()['on']) ? 1 : 0;
        foreach (own_nodes($u) as $n) db()->prepare('UPDATE ' . t('nodes') . ' SET starred = ? WHERE id = ?')->execute([$on, $n['id']]);
        send_json(['ok' => true]);

    case 'node.color':
        // The colour of a folder ('' = the usual one)
        $u = writer();
        $c = (string)(body()['color'] ?? '');
        if ($c !== '' && !preg_match('/^#[0-9a-f]{6}$/', $c)) fail('bad_request', 422);
        foreach (reach_nodes($u, 'write') as $n) if ($n['kind'] === 'folder') db()->prepare('UPDATE ' . t('nodes') . ' SET color = ? WHERE id = ?')->execute([$c, $n['id']]);
        send_json(['ok' => true]);

    case 'node.trash':
        // Into the trash with everything inside; it stays there TRASH_DAYS, still counted in the space
        $u = writer();
        db()->beginTransaction();
        // into the trash of the owner (who can restore it); who is not the owner needs "delete"
        $files = []; // the files of SavOffice that go: the apps put their linked documents in their trash too (savoffice.js)
        foreach (reach_nodes($u, 'delete') as $n) {
            if ($n['trashed_at']) continue;
            $ids = implode(',', subtree_ids((int)$n['user_id'], (int)$n['id']));
            $files = array_merge($files, office_uids((int)$n['user_id'], $ids, true));
            db()->prepare('UPDATE ' . t('nodes') . " SET trashed_at = ?, trash_root = 0, share_token = NULL WHERE user_id = ? AND id IN ($ids) AND trashed_at IS NULL")->execute([now_utc(), $n['user_id']]);
            db()->prepare('UPDATE ' . t('nodes') . ' SET trash_root = 1 WHERE id = ?')->execute([$n['id']]);
        }
        db()->commit();
        send_json(['ok' => true, 'files' => $files]);

    case 'node.restore':
        // Back where it was; if that folder is gone (or still in the trash), to My drive
        $u = writer();
        db()->beginTransaction();
        $files = []; // the files of SavOffice that come back: their linked documents come back in the apps too
        foreach (own_nodes($u) as $n) {
            if (!$n['trash_root']) continue;
            $pid = $n['parent_id'] === null ? null : (int)$n['parent_id'];
            if ($pid !== null) {
                $st = db()->prepare('SELECT trashed_at FROM ' . t('nodes') . ' WHERE id = ?');
                $st->execute([$pid]);
                $p = $st->fetch();
                if (!$p || $p['trashed_at']) $pid = null;
            }
            $ids = implode(',', subtree_ids((int)$u['id'], (int)$n['id']));
            $files = array_merge($files, office_uids((int)$u['id'], $ids, false));
            db()->prepare('UPDATE ' . t('nodes') . " SET trashed_at = NULL, trash_root = 0 WHERE user_id = ? AND id IN ($ids)")->execute([$u['id']]);
            db()->prepare('UPDATE ' . t('nodes') . ' SET parent_id = ?, name = ? WHERE id = ?')->execute([$pid, free_name((int)$u['id'], $pid, (string)$n['name'], (int)$n['id']), $n['id']]);
        }
        db()->commit();
        send_json(['ok' => true, 'files' => $files] + drive_space($u));

    case 'node.delete':
        // For ever: only what is in the trash
        $u = writer();
        $ids = [];
        foreach (own_nodes($u) as $n) {
            if (!$n['trashed_at']) fail('not_in_trash', 409);
            $ids[] = (int)$n['id'];
        }
        delete_nodes_forever((int)$u['id'], $ids);
        send_json(['ok' => true] + drive_space($u));

    case 'trash.empty':
        $u = writer();
        $st = db()->prepare('SELECT id FROM ' . t('nodes') . ' WHERE user_id = ? AND trash_root = 1');
        $st->execute([$u['id']]);
        delete_nodes_forever((int)$u['id'], $st->fetchAll(PDO::FETCH_COLUMN));
        send_json(['ok' => true] + drive_space($u));

    case 'node.share':
        // A link anyone can open to see or download a file; off = the link stops working
        $u = writer();
        $n = own_node($u, body()['id'] ?? '', 'file');
        if ($n['trashed_at']) fail('in_trash', 409);
        $tok = !empty(body()['on']) ? ($n['share_token'] ?: bin2hex(random_bytes(16))) : null;
        db()->prepare('UPDATE ' . t('nodes') . ' SET share_token = ? WHERE id = ?')->execute([$tok, $n['id']]);
        send_json(['ok' => true, 'token' => $tok]);

    case 'pub.info':
        only('GET');
        $tok = (string)($_GET['t'] ?? '');
        $n = null;
        if (preg_match('/^[a-f0-9]{32}$/', $tok)) {
            $st = db()->prepare('SELECT n.*, u.name owner, u.activated, u.status ustatus FROM ' . t('nodes') . ' n JOIN ' . t('users') . " u ON u.id = n.user_id WHERE n.share_token = ? AND n.trashed_at IS NULL AND n.kind = 'file'");
            $st->execute([$tok]);
            $n = $st->fetch() ?: null;
        }
        if (!$n || $n['ustatus'] !== 'active' || !$n['activated']) fail('not_found', 404);
        send_json(['ok' => true, 'file' => ['name' => $n['name'], 'mime' => $n['mime'], 'size' => (int)$n['size'], 'updated' => iso($n['updated_at']), 'owner' => $n['owner'],
            'app' => out_node($n)['app']]]);

    // ================================================================ temporary links (lib/temp.php)

    case 'temp.create':
        // {mode: upload | drive, ids (drive: files and folders of this account), expires (1h, 1d, 7d, 30d) or at (a date),
        // password, maxDownloads, notify, message}. Mode upload: the link waits (ready = 0) while its files upload with
        // upload.start {temp: id}, then temp.finish.
        $u = writer();
        $b = body();
        temp_purge((int)$u['id']);
        $mode = ($b['mode'] ?? '') === 'drive' ? 'drive' : 'upload';
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('temp_links') . ' WHERE user_id = ?');
        $st->execute([$u['id']]);
        if ((int)$st->fetchColumn() >= TEMP_MAX_LINKS) fail('temp_too_many', 422);
        $expires = temp_expiry($b['expires'] ?? null, $b['at'] ?? null);
        $pass = (string)($b['password'] ?? '');
        if ($pass !== '' && (mb_strlen($pass) < 4 || mb_strlen($pass) > 200)) fail('temp_password', 422);
        $max = isset($b['maxDownloads']) && $b['maxDownloads'] !== null && $b['maxDownloads'] !== '' ? (int)$b['maxDownloads'] : null;
        if ($max !== null && ($max < 1 || $max > 100000)) fail('temp_max', 422);
        $msg = trim(mb_substr(str_replace("\r", '', (string)($b['message'] ?? '')), 0, TEMP_MESSAGE_MAX));
        $nodes = [];
        if ($mode === 'drive') {
            $ids = $b['ids'] ?? [];
            if (!is_array($ids) || !$ids || count($ids) > TEMP_MAX_ITEMS) fail('bad_request', 422);
            foreach (array_values(array_unique(array_filter($ids, 'is_string'))) as $id) {
                $n = own_node($u, $id);
                if ($n['trashed_at']) fail('in_trash', 409);
                $nodes[] = $n;
            }
        }
        db()->beginTransaction();
        $tok = new_temp_token();
        db()->prepare('INSERT INTO ' . t('temp_links') . ' (token, user_id, mode, message, pass_hash, max_downloads, notify, ready, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$tok, $u['id'], $mode, $msg !== '' ? $msg : null, $pass !== '' ? password_hash($pass, PASSWORD_DEFAULT) : null, $max, empty($b['notify']) ? 0 : 1, $mode === 'drive' ? 1 : 0, now_utc(), $expires]);
        $lid = (int)db()->lastInsertId();
        foreach ($nodes as $n) db()->prepare('INSERT INTO ' . t('temp_items') . ' (link_id, user_id, node_id, name, created_at) VALUES (?,?,?,?,?)')->execute([$lid, $u['id'], $n['id'], $n['name'], now_utc()]);
        db()->commit();
        send_json(['ok' => true, 'link' => temp_out(own_temp($u, $lid))]);

    case 'temp.finish':
        // {id}: the files of a link of mode upload have all arrived: the link starts working
        $u = writer();
        $l = own_temp($u, body()['id'] ?? 0);
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('temp_items') . ' WHERE link_id = ?');
        $st->execute([$l['id']]);
        if (!(int)$st->fetchColumn()) fail('temp_empty', 422);
        db()->prepare('UPDATE ' . t('temp_links') . ' SET ready = 1 WHERE id = ?')->execute([$l['id']]);
        send_json(['ok' => true, 'link' => temp_out(own_temp($u, (int)$l['id']))] + drive_space($u));

    case 'temp.list':
        // The links of this account that still work (the ended ones are cleaned up first)
        $u = reader();
        temp_purge((int)$u['id']);
        $st = db()->prepare('SELECT * FROM ' . t('temp_links') . ' WHERE user_id = ? AND ready = 1 ORDER BY expires_at LIMIT ' . TEMP_MAX_LINKS);
        $st->execute([$u['id']]);
        send_json(['ok' => true, 'links' => array_map('temp_out', $st->fetchAll())] + drive_space($u));

    case 'temp.extend':
        // {id, expires | at}: a new expiry (from now, or a date)
        $u = writer();
        $b = body();
        $l = own_temp($u, $b['id'] ?? 0);
        if (temp_over($l)) { temp_delete($l); fail('not_found', 404); }
        db()->prepare('UPDATE ' . t('temp_links') . ' SET expires_at = ? WHERE id = ?')->execute([temp_expiry($b['expires'] ?? null, $b['at'] ?? null), $l['id']]);
        send_json(['ok' => true, 'link' => temp_out(own_temp($u, (int)$l['id']))]);

    case 'temp.revoke':
        // {id}: the link stops working at once; the files uploaded for it are deleted (those of the drive stay)
        $u = writer();
        temp_delete(own_temp($u, body()['id'] ?? 0));
        send_json(['ok' => true] + drive_space($u));

    case 'tmp.info':
        // ?t=&k=: what a temporary link gives, for the page of who receives it (no account). With a password and no key:
        // only {locked: true}
        only('GET');
        require_once __DIR__ . '/../lib/zipstream.php';
        $l = temp_by_token((string)($_GET['t'] ?? ''));
        if ($l && temp_over($l)) { temp_delete($l); $l = null; }
        $items = $l && (int)$l['ready'] ? temp_items($l) : [];
        if (!$items) fail('not_found', 404);
        header('Cache-Control: private, no-store');
        if (!temp_unlocked($l, (string)($_GET['k'] ?? ''))) send_json(['ok' => true, 'locked' => true]);
        send_json(['ok' => true, 'locked' => false, 'owner' => $l['owner'], 'message' => $l['message'], 'expires' => iso($l['expires_at']),
            'left' => $l['max_downloads'] === null ? null : (int)$l['max_downloads'] - (int)$l['downloads'],
            'items' => array_map(fn($i) => ['id' => $i['id'], 'name' => $i['name'], 'kind' => $i['kind'], 'size' => $i['size'], 'mime' => $i['mime'], 'files' => $i['files']], $items),
            'size' => array_sum(array_column($items, 'size')), 'files' => array_sum(array_column($items, 'files')), 'zip' => zip_check(temp_entries($l, $items)) === null]);

    case 'tmp.unlock':
        // {t, password}: the key of a link with a password (the download addresses carry it)
        only('POST');
        if (too_many_attempts('temp_pass', 20, 15)) fail('rate_limited', 429);
        $b = body();
        $l = temp_by_token((string)($b['t'] ?? ''));
        if (!$l || temp_over($l) || !(int)$l['ready']) fail('not_found', 404);
        if (!$l['pass_hash']) send_json(['ok' => true, 'key' => '']);
        if (!password_verify((string)($b['password'] ?? ''), (string)$l['pass_hash'])) { record_attempt('temp_pass'); fail('temp_bad_password', 422); }
        send_json(['ok' => true, 'key' => temp_key($l)]);

    case 'node.info':
        // ?id=: everything about a file or folder for the panel of details
        $u = reader();
        $n = reach_node($u, (string)($_GET['id'] ?? ''), 'read');
        $owner = (int)$n['user_id'];
        $names = names_by_id([$owner, (int)($n['created_by'] ?? 0)]);
        // where it is: the folders this person can reach
        $path = [];
        $roles = $n['role'] === 'owner' ? null : tree_roles($u, $owner);
        foreach (array_reverse(node_path($n)) as $i => $p) {
            if ($i === 0) continue;
            if ($roles !== null && level($roles[(int)$p['id']] ?? null) < level('read')) break;
            array_unshift($path, ['id' => $p['uid'], 'name' => $p['name']]);
        }
        $x = out_items($u, [$n])[0] + ['path' => $path, 'mine' => $n['role'] === 'owner', 'ownerName' => $names[$owner] ?? '', 'author' => $names[(int)($n['created_by'] ?: $owner)] ?? ''];
        if ($n['kind'] === 'folder') {
            // its size and the last change of what is inside, at any depth
            $ids = implode(',', subtree_ids($owner, (int)$n['id']));
            $st = db()->prepare('SELECT COUNT(CASE WHEN kind = \'file\' THEN 1 END) files, COUNT(CASE WHEN kind = \'folder\' THEN 1 END) - 1 folders, COALESCE(SUM(CASE WHEN kind = \'file\' THEN size END),0) size,
                MAX(CASE WHEN id <> ? THEN updated_at END) inner_at FROM ' . t('nodes') . " WHERE user_id = ? AND id IN ($ids) AND trashed_at IS NULL");
            $st->execute([$n['id'], $owner]);
            $g = $st->fetch();
            $x += ['files' => (int)$g['files'], 'folders' => max(0, (int)$g['folders']), 'innerUpdated' => iso($g['inner_at'])];
            $x['size'] = (int)$g['size'];
        } elseif (str_starts_with((string)$n['mime'], 'image/')) $x['image'] = image_details($n);
        if ($n['role'] !== 'owner') unset($x['opened']);
        send_json(['ok' => true, 'info' => $x]);

    case 'node.archive':
        // ?id=: what is inside an archive (ZIP, TAR, TAR.GZ, RAR), read from its index without extracting (lib/archive.php)
        $u = reader();
        $n = reach_node($u, (string)($_GET['id'] ?? ''), 'read', 'file');
        if ($n['role'] !== 'owner' && $n['trashed_at']) fail('not_found', 404); // as file.get: in the trash, only for its owner
        if (!preg_match('/\.(zip|tar|tgz|gz|rar|7z)$/i', (string)$n['name']) || !$n['bkey']) fail('not_archive', 400);
        $src = blob_path((int)$n['user_id'], (string)$n['bkey']);
        if (!is_file($src)) fail('not_found', 404);
        // the same file (the same key) has always the same contents: what was read once is kept next to it
        $cache = $src . '.a.json';
        $list = is_file($cache) ? json_decode((string)file_get_contents($cache), true) : null;
        if (!is_array($list)) {
            @set_time_limit(30);
            $list = archive_list($src, (string)$n['name']);
            @file_put_contents($cache, json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE));
        }
        send_json(['ok' => true, 'archive' => $list]);

    case 'file.heads':
        // ?ids=a,b,c (at most 20): what the cards show of many files in one request, so the hosting never sees a burst of
        // requests. For each id: {b64, whole} (the beginning of a text file, or a whole file of SavOffice up to 3 MB),
        // {archive} (the index of an archive, as node.archive), or null. What does not fit (6 MB in all, 4 s of work)
        // comes back in "later", to be asked again.
        $u = reader();
        $ids = array_values(array_unique(array_filter(explode(',', (string)($_GET['ids'] ?? '')), fn($x) => preg_match('/^[A-Za-z0-9]{16}$/', $x))));
        if (!$ids || count($ids) > 20) fail('bad_request', 422);
        $out = [];
        $later = [];
        $budget = 6 * 1048576;
        $t0 = microtime(true);
        foreach ($ids as $id) {
            $n = node_by_uid($id);
            $role = $n && $n['kind'] === 'file' && $n['bkey'] ? node_role($u, $n) : null;
            if (!$role || ($role !== 'owner' && ($n['trashed_at'] || level($role) < level('read') || !owner_active((int)$n['user_id'])))) { $out[$id] = null; continue; }
            $src = blob_path((int)$n['user_id'], (string)$n['bkey']);
            if (!is_file($src)) { $out[$id] = null; continue; }
            if (microtime(true) - $t0 > 4) { $later[] = $id; continue; }
            $name = (string)$n['name'];
            $size = (int)$n['size'];
            if (preg_match('/\.(zip|tar|tgz|gz|rar|7z)$/i', $name)) {
                $cache = $src . '.a.json';
                $list = is_file($cache) ? json_decode((string)file_get_contents($cache), true) : null;
                if (!is_array($list)) {
                    @set_time_limit(30);
                    $list = archive_list($src, $name);
                    @file_put_contents($cache, json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE));
                }
                $out[$id] = ['archive' => $list];
                $budget -= (int)@filesize($cache);
            } elseif (preg_match('/\.(savdoc|savboo|savspr|savpre)$/i', $name)) {
                // a file of SavOffice: only its JSON (the pictures come one by one, file.part), whatever the size of the file
                $index = zip_index($src);
                $main = null;
                foreach (['document.json', 'book.json', 'workbook.json', 'deck.json'] as $k) if (isset($index[$k])) { $main = $k; break; }
                $json = $main ? zip_entry($src, $index[$main], 12 * 1048576) : null;
                if ($json === null) { $out[$id] = null; continue; }
                if (strlen($json) > $budget && $out) { $later[] = $id; continue; }
                $out[$id] = ['office' => $main, 'json' => $json, 'names' => array_values(array_filter(array_keys($index), fn($k) => strncmp($k, 'media/', 6) === 0))];
                $budget -= strlen($json);
            } else {
                $len = $size <= 60000 ? $size : 4000;
                if ($len > $budget && $out) { $later[] = $id; continue; }
                $fh = @fopen($src, 'rb');
                $data = $fh && $len > 0 ? (string)fread($fh, $len) : '';
                if ($fh) fclose($fh);
                $out[$id] = ['b64' => base64_encode($data), 'whole' => $len >= $size];
                $budget -= $len;
            }
            if ($budget <= 0) { foreach (array_slice($ids, array_search($id, $ids, true) + 1) as $rest) $later[] = $rest; break; }
        }
        send_json(['ok' => true, 'heads' => (object)$out, 'later' => array_values(array_unique($later))]);

    // ================================================================ people and their levels (lib/access.php)

    case 'people.get':
        // ?id=: who can reach a file or folder of this person, here or from a folder above (only the owner manages them)
        $u = reader();
        $n = reach_node($u, (string)($_GET['id'] ?? ''), 'owner');
        send_json(['ok' => true, 'people' => node_people($n)]);

    case 'people.set':
        // {id, email, role | null, notify}: a level here for a person (none = excluded here and below); null = as from above
        $u = writer();
        $b = body();
        $n = reach_node($u, $b['id'] ?? '', 'owner');
        if ($n['trashed_at']) fail('in_trash', 409);
        $email = mb_strtolower(s($b, 'email', 190));
        valid_email($email);
        if ($email === mb_strtolower((string)$u['email'])) fail('share_self', 422);
        $role = $b['role'] ?? null;
        if ($role !== null && !in_array($role, SHARE_ROLES, true)) fail('bad_request', 422);
        if ($role === null) db()->prepare('DELETE FROM ' . t('shares') . ' WHERE node_id = ? AND email = ?')->execute([$n['id'], $email]);
        else {
            $st = db()->prepare('SELECT COUNT(*) FROM ' . t('shares') . ' WHERE node_id = ?');
            $st->execute([$n['id']]);
            if ((int)$st->fetchColumn() >= 200) fail('too_many', 422);
            $had = node_role(['id' => 0, 'email' => $email], $n);
            db()->prepare('INSERT INTO ' . t('shares') . ' (node_id, email, role, created_by, created_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE role = VALUES(role)')->execute([$n['id'], $email, $role, $u['id'], now_utc()]);
            // an email to who gets in (not for a change of level or an exclusion)
            if (!empty($b['notify']) && $role !== 'none' && $had === null && mail_settings() && !too_many_attempts('share_mail', 60, 60)) {
                record_attempt('share_mail');
                $st = db()->prepare('SELECT name, ui_lang FROM ' . t('users') . ' WHERE email = ?');
                $st->execute([$email]);
                $to = $st->fetch() ?: ['name' => '', 'ui_lang' => (string)($u['ui_lang'] ?? 'en')];
                $L = in_array($to['ui_lang'], LANGS, true) ? $to['ui_lang'] : 'en';
                $T = mail_t($L);
                send_notice($email, (string)$to['name'], $L, fill($T['dshare_subject'], ['by' => $u['name'], 'name' => $n['name']]), $T['dshare_title'],
                    [$to['name'] ? fill($T['hello'], ['name' => $to['name']]) : $T['hello_plain'], fill($T['dshare_body'], ['by' => $u['name'], 'name' => $n['name'], 'role' => $T['levels'][$role] ?? $role]), $T['dshare_signup']],
                    app_url() . '#/' . ($n['kind'] === 'folder' ? 'f/' . $n['uid'] : 'withme'), $T['dshare_button']);
            }
        }
        send_json(['ok' => true, 'people' => node_people($n)]);

    // ================================================================ comments (who can at least comment)

    case 'comment.list':
        $u = reader();
        $n = reach_node($u, (string)($_GET['id'] ?? ''), 'read');
        $st = db()->prepare('SELECT c.id, c.user_id, c.body, c.created_at, u.name FROM ' . t('comments') . ' c LEFT JOIN ' . t('users') . ' u ON u.id = c.user_id WHERE c.node_id = ? ORDER BY c.id LIMIT 500');
        $st->execute([$n['id']]);
        send_json(['ok' => true, 'role' => $n['role'], 'comments' => array_map(fn($c) => ['id' => (int)$c['id'], 'by' => $c['name'] ?? '', 'body' => $c['body'], 'at' => iso($c['created_at']),
            'mine' => (int)$c['user_id'] === (int)$u['id'], 'canDelete' => (int)$c['user_id'] === (int)$u['id'] || $n['role'] === 'owner'], $st->fetchAll())]);

    case 'comment.add':
        $u = writer();
        $n = reach_node($u, body()['id'] ?? '', 'comment');
        $text = trim(str_replace(["\r\n", "\r"], "\n", (string)(body()['body'] ?? '')));
        $text = mb_substr(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '', 0, 4000);
        if ($text === '') fail('comment_empty', 422);
        if (too_many_attempts('comment', 120, 60)) fail('rate_limited', 429);
        record_attempt('comment');
        db()->prepare('INSERT INTO ' . t('comments') . ' (node_id, user_id, body, created_at) VALUES (?,?,?,?)')->execute([$n['id'], $u['id'], $text, now_utc()]);
        send_json(['ok' => true]);

    case 'comment.delete':
        // its author, or the owner of the file or folder
        $u = writer();
        $st = db()->prepare('SELECT c.*, n.uid FROM ' . t('comments') . ' c JOIN ' . t('nodes') . ' n ON n.id = c.node_id WHERE c.id = ?');
        $st->execute([(int)(body()['id'] ?? 0)]);
        $c = $st->fetch();
        if (!$c) fail('not_found', 404);
        $n = reach_node($u, (string)$c['uid'], 'read');
        if ((int)$c['user_id'] !== (int)$u['id'] && $n['role'] !== 'owner') fail('forbidden', 403);
        db()->prepare('DELETE FROM ' . t('comments') . ' WHERE id = ?')->execute([$c['id']]);
        send_json(['ok' => true]);

    // ================================================================ uploads, in pieces

    case 'upload.start':
        // Space is checked before anything travels: what is used, the uploads under way and this file
        $u = writer();
        if (too_many_attempts('upload', 2000, 60)) fail('rate_limited', 429);
        record_attempt('upload');
        $b = body();
        $name = clean_name($b['name'] ?? '');
        $size = (int)($b['size'] ?? -1);
        if ($name === '') fail('name_required', 422);
        if ($size < 0) fail('bad_request', 422);
        // replace: the id of a file whose content this upload becomes (its name, folder, star and link stay); the old
        // content stops counting when the new one arrives
        // temp: the id of a temporary link of this account still waiting for its files (lib/temp.php): the file becomes an
        // item of the link, not a node of the drive (no folder, no names to compare)
        $temp = isset($b['temp']) && $b['temp'] !== null ? own_temp($u, $b['temp']) : null;
        if ($temp && ($temp['mode'] !== 'upload' || (int)$temp['ready'] || temp_over($temp))) fail('temp_gone', 410);
        if ($temp) {
            $st = db()->prepare('SELECT COUNT(*) FROM ' . t('temp_items') . ' WHERE link_id = ?');
            $st->execute([$temp['id']]);
            if ((int)$st->fetchColumn() >= TEMP_MAX_ITEMS) fail('temp_too_many_files', 422);
        }
        $old = !$temp && isset($b['replace']) && $b['replace'] !== null ? reach_node($u, $b['replace'], 'write', 'file') : null;
        if ($old && $old['trashed_at']) fail('in_trash', 409);
        $parent = $old || $temp ? null : reach_folder($u, $b['folder'] ?? null, 'write');
        // a file with the same name in that folder: the app asks whether to replace it or keep both (conflict: rename)
        if (!$old && !$temp && ($b['conflict'] ?? '') !== 'rename') {
            $st = db()->prepare('SELECT uid FROM ' . t('nodes') . " WHERE user_id = ? AND parent_id " . ($parent ? '= ' . (int)$parent['id'] : 'IS NULL') . " AND kind = 'file' AND trashed_at IS NULL AND LOWER(name) = LOWER(?) LIMIT 1");
            $st->execute([$parent ? (int)$parent['user_id'] : (int)$u['id'], $name]);
            $same = $st->fetchColumn();
            if ($same) send_json(['ok' => false, 'error' => 'name_taken', 'existing' => $same, 'name' => $name], 409);
        }
        // what goes into a folder of somebody else belongs to them and counts in their space
        $owner = $old ? (int)$old['user_id'] : ($parent ? (int)$parent['user_id'] : (int)$u['id']);
        $row = user_row($owner);
        $quota = user_quota($row);
        if (user_used($owner, true) + $size - ($old ? (int)$old['size'] : 0) > $quota) send_json(['ok' => false, 'error' => 'quota', 'used' => user_used($owner), 'quota' => $quota], 413);
        if (!$old && !$temp && count_nodes($owner) >= MAX_NODES) fail('too_many', 422);
        $id = new_key();
        db()->prepare('INSERT INTO ' . t('uploads') . ' (id, user_id, parent_id, name, mime, size, replace_id, temp_id, created_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
            ->execute([$id, $u['id'], $parent ? $parent['id'] : null, $name, guess_mime($name, (string)($b['mime'] ?? '')), $size, $old ? $old['id'] : null, $temp ? $temp['id'] : null, now_utc(), gmdate('Y-m-d H:i:s', time() + UPLOAD_HOURS * 3600)]);
        if (@file_put_contents(storage_dir((int)$u['id']) . "/$id.part", '') === false) throw new RuntimeException('storage not writable');
        // an empty file is already complete
        if ($size === 0) $_GET['id'] = $id;
        if ($size > 0) send_json(['ok' => true, 'upload' => $id, 'chunk' => CHUNK_BYTES]);
    // no break: an empty file is finished at once

    case 'upload.chunk':
        // ?id=&offset=: the piece is the body. The last one makes the file.
        $u = writer();
        $id = (string)($_GET['id'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/', $id)) fail('bad_request', 422);
        db()->beginTransaction();
        $st = db()->prepare('SELECT * FROM ' . t('uploads') . ' WHERE id = ? AND user_id = ? FOR UPDATE');
        $st->execute([$id, $u['id']]);
        $up = $st->fetch();
        if (!$up) fail('upload_gone', 410);
        $part = storage_dir((int)$u['id']) . "/$id.part";
        $offset = (int)($_GET['offset'] ?? 0);
        if ($offset !== (int)$up['received']) {
            db()->rollBack();
            send_json(['ok' => false, 'error' => 'offset', 'received' => (int)$up['received']], 409);
        }
        if ((int)$up['size'] > 0) {
            $in = fopen('php://input', 'rb');
            $out = fopen($part, 'ab');
            $got = stream_copy_to_stream($in, $out, CHUNK_BYTES + 1);
            fclose($in);
            fclose($out);
            if ($got === false || $got > CHUNK_BYTES || $offset + $got > (int)$up['size']) {
                $fh = fopen($part, 'r+');
                ftruncate($fh, $offset);
                fclose($fh);
                fail('bad_chunk', 422);
            }
            $received = $offset + $got;
        } else $received = 0;
        if ($received < (int)$up['size']) {
            db()->prepare('UPDATE ' . t('uploads') . ' SET received = ? WHERE id = ?')->execute([$received, $id]);
            db()->commit();
            send_json(['ok' => true, 'received' => $received]);
        }
        // complete: the folder may have gone to the trash meanwhile, then the file lands in My drive
        clearstatcache(true, $part);
        if (filesize($part) !== (int)$up['size']) fail('bad_chunk', 422);
        if (!empty($up['vault_id'])) vault_upload_done($u, $up, $part); // a file of the Vault (lib/vault.php): it never becomes a node of the drive
        // a file of a temporary link: an item of the link (if it still waits for its files), never a node
        if ($up['temp_id'] !== null) {
            $s4 = db()->prepare('SELECT * FROM ' . t('temp_links') . ' WHERE id = ? AND user_id = ? FOR UPDATE');
            $s4->execute([$up['temp_id'], $u['id']]);
            $tl = $s4->fetch();
            if (!$tl || (int)$tl['ready'] || temp_over($tl)) {
                db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE id = ?')->execute([$id]);
                db()->commit();
                @unlink($part);
                fail('temp_gone', 410);
            }
            $key = new_key();
            if (!@rename($part, blob_path((int)$u['id'], $key))) throw new RuntimeException('cannot store the file');
            db()->prepare('INSERT INTO ' . t('temp_items') . ' (link_id, user_id, node_id, name, mime, size, bkey, created_at) VALUES (?,?,NULL,?,?,?,?,?)')
                ->execute([$tl['id'], $u['id'], $up['name'], $up['mime'], $up['size'], $key, now_utc()]);
            db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE id = ?')->execute([$id]);
            db()->commit();
            send_json(['ok' => true, 'done' => true, 'temp' => true, 'item' => ['name' => $up['name'], 'size' => (int)$up['size']]] + drive_space($u));
        }
        // the folder (of this person, or shared with them, still with "write") may have gone meanwhile: then My drive
        $pid = $up['parent_id'] === null ? null : (int)$up['parent_id'];
        $owner = (int)$u['id'];
        if ($pid !== null) {
            $s2 = db()->prepare('SELECT * FROM ' . t('nodes') . ' WHERE id = ?');
            $s2->execute([$pid]);
            $p = $s2->fetch();
            if (!$p || $p['trashed_at'] || level(node_role($u, $p)) < level('write')) $pid = null;
            else $owner = (int)$p['user_id'];
        }
        $old = null;
        if ($up['replace_id'] !== null) {
            $s3 = db()->prepare('SELECT * FROM ' . t('nodes') . " WHERE id = ? AND kind = 'file' AND trashed_at IS NULL FOR UPDATE");
            $s3->execute([$up['replace_id']]);
            $old = $s3->fetch() ?: null;
            if ($old && level(node_role($u, $old)) < level('write')) $old = null;
            if ($old) $owner = (int)$old['user_id'];
        }
        $key = new_key();
        if (!@rename($part, blob_path($owner, $key))) throw new RuntimeException('cannot store the file');
        // the new content of a file that is still there (and not in the trash): same id, name, folder, star and link
        if ($old) {
            db()->prepare('UPDATE ' . t('nodes') . ' SET bkey = ?, size = ?, updated_at = ? WHERE id = ?')->execute([$key, $up['size'], now_utc(), $old['id']]);
            db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE id = ?')->execute([$id]);
            db()->commit();
            if ($old['bkey']) { @unlink(blob_path($owner, (string)$old['bkey'])); @unlink(blob_path($owner, (string)$old['bkey']) . '.t.jpg'); @unlink(blob_path($owner, (string)$old['bkey']) . '.a.json'); }
            send_json(['ok' => true, 'done' => true, 'replaced' => true, 'item' => out_node(node_by_uid((string)$old['uid']))] + drive_space($u));
        }
        // a file to replace that is gone meanwhile (or no longer writable) becomes a new file
        $uid = new_uid();
        db()->prepare('INSERT INTO ' . t('nodes') . " (uid, user_id, parent_id, kind, name, mime, size, bkey, created_by, created_at, updated_at) VALUES (?,?,?,'file',?,?,?,?,?,?,?)")
            ->execute([$uid, $owner, $pid, free_name($owner, $pid, (string)$up['name']), $up['mime'], $up['size'], $key, $u['id'], now_utc(), now_utc()]);
        db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE id = ?')->execute([$id]);
        db()->commit();
        send_json(['ok' => true, 'done' => true, 'item' => out_node(node_by_uid($uid))] + drive_space($u));

    case 'upload.cancel':
        $u = writer();
        $id = (string)(body()['id'] ?? '');
        if (!preg_match('/^[a-f0-9]{32}$/', $id)) fail('bad_request', 422);
        $st = db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE id = ? AND user_id = ?');
        $st->execute([$id, $u['id']]);
        if ($st->rowCount()) @unlink(storage_dir((int)$u['id']) . "/$id.part");
        send_json(['ok' => true]);

    // ================================================================ master admin

    case 'master.overview':
        only('GET');
        require_master();
        $n = fn(string $sql) => (int)db()->query($sql)->fetchColumn();
        send_json(['ok' => true, 'users' => $n('SELECT COUNT(*) FROM ' . t('users')), 'active' => $n('SELECT COUNT(*) FROM ' . t('users') . ' WHERE activated = 1'),
            'waiting' => $n('SELECT COUNT(*) FROM ' . t('users') . ' WHERE activated = 0'), 'files' => $n('SELECT COUNT(*) FROM ' . t('nodes') . " WHERE kind = 'file'"),
            'folders' => $n('SELECT COUNT(*) FROM ' . t('nodes') . " WHERE kind = 'folder'"), 'bytes' => $n('SELECT COALESCE(SUM(size),0) FROM ' . t('nodes') . " WHERE kind = 'file'") + $n('SELECT COALESCE(SUM(size),0) FROM ' . t('vault_nodes') . " WHERE kind = 'file' AND bkey IS NOT NULL") + $n('SELECT COALESCE(SUM(bytes),0) FROM ' . t('usage') . " WHERE app <> 'savdrive'"),
            'driveBytes' => $n('SELECT COALESCE(SUM(size),0) FROM ' . t('nodes') . " WHERE kind = 'file'"), 'people' => $n('SELECT COUNT(*) FROM (SELECT email FROM ' . t('users') . ' UNION SELECT email FROM ' . t('usage') . ') x'),
            'given' => $n('SELECT COALESCE(SUM(COALESCE(q.quota, ' . default_quota() . ')),0) FROM ' . t('users') . ' u LEFT JOIN ' . t('quotas') . ' q ON q.email = u.email WHERE u.activated = 1 AND (q.quota IS NULL OR q.quota < ' . UNLIMITED . ')'),
            'unlimited' => $n('SELECT COUNT(*) FROM ' . t('quotas') . ' WHERE quota >= ' . UNLIMITED),
            'defaultQuota' => default_quota(), 'defaultActive' => default_active(), 'disk' => @disk_free_space(storage_dir()) ?: null]);

    case 'master.settings':
        // The space of the accounts without one of their own, and whether new accounts are activated at once
        $u = require_master();
        only('POST');
        require_csrf($u);
        $b = body();
        if (isset($b['defaultQuota'])) {
            $q = (int)$b['defaultQuota'];
            if ($q < 1048576 || $q > MAX_QUOTA) fail('bad_quota', 422);
            set_setting('default_quota', (string)$q);
            if (!function_exists('savspace_default_forget')) require_once dirname(__DIR__) . '/lib/space.php';
            savspace_default_forget(); // the first page of SavDrive and Illerom show the new space at once
        }
        if (isset($b['defaultActive'])) set_setting('default_active', !empty($b['defaultActive']) ? '1' : '0');
        send_json(['ok' => true, 'defaultQuota' => default_quota(), 'defaultActive' => default_active()]);

    case 'master.users':
        // ?q= name or email · ?show=waiting|active|all
        only('GET');
        require_master();
        $q = '%' . addcslashes(s($_GET, 'q', 80), '%_\\') . '%';
        $show = (string)($_GET['show'] ?? 'all');
        $extra = $show === 'waiting' ? ' AND u.activated = 0' : ($show === 'active' ? ' AND u.activated = 1' : '');
        $st = db()->prepare('SELECT u.*, (SELECT COALESCE(SUM(n.size),0) FROM ' . t('nodes') . " n WHERE n.user_id = u.id AND n.kind = 'file') + (SELECT COALESCE(SUM(v.size),0) FROM " . t('vault_nodes') . " v WHERE v.user_id = u.id AND v.kind = 'file' AND v.bkey IS NOT NULL) + (SELECT COALESCE(SUM(i.size),0) FROM " . t('temp_items') . " i WHERE i.user_id = u.id AND i.bkey IS NOT NULL) used, (SELECT COUNT(*) FROM " . t('nodes') . " n WHERE n.user_id = u.id AND n.kind = 'file') files
            FROM " . t('users') . " u WHERE (u.name LIKE ? OR u.email LIKE ?)$extra ORDER BY u.activated, u.id DESC LIMIT 500");
        $st->execute([$q, $q]);
        $rows = $st->fetchAll();
        // what every person keeps in the other apps of SavOffice (by email): their space is this one
        $st = db()->query('SELECT email, app, bytes FROM ' . t('usage') . " WHERE bytes > 0 AND app <> 'savdrive'");
        $other = [];
        foreach ($st->fetchAll() as $g) $other[$g['email']][$g['app']] = (int)$g['bytes'];
        $quotas = array_map('intval', array_column(db()->query('SELECT email, quota FROM ' . t('quotas'))->fetchAll(), 'quota', 'email'));
        $out = array_map(function ($x) use ($other, $quotas) {
            $e = mb_strtolower($x['email']);
            $parts = array_filter(['savdrive' => (int)$x['used']] + ($other[$e] ?? []));
            return ['id' => (int)$x['id'], 'name' => $x['name'], 'email' => $x['email'], 'account' => true, 'verified' => !empty($x['email_verified_at']),
                'activated' => is_activated($x), 'master' => is_master($x), 'used' => array_sum($parts), 'parts' => (object)$parts, 'files' => (int)$x['files'], 'quota' => $quotas[$e] ?? default_quota(), 'unlimited' => is_unlimited($quotas[$e] ?? 0), 'ownQuota' => isset($quotas[$e]),
                'created' => iso($x['created_at']), 'login' => iso($x['last_login_at'])];
        }, $rows);
        // people who use other apps of SavOffice without an account of SavDrive: they use this space too
        if ($show !== 'waiting' && $show !== 'active') {
            $have = array_flip(array_map(fn($x) => mb_strtolower($x['email']), $rows));
            $needle = mb_strtolower(s($_GET, 'q', 80));
            foreach ($other as $e => $parts) {
                if (isset($have[$e]) || ($needle !== '' && mb_strpos($e, $needle) === false)) continue;
                $out[] = ['id' => null, 'name' => $e, 'email' => $e, 'account' => false, 'verified' => false, 'activated' => false, 'master' => false, 'used' => array_sum($parts), 'parts' => (object)$parts, 'files' => 0,
                    'quota' => $quotas[$e] ?? default_quota(), 'unlimited' => is_unlimited($quotas[$e] ?? 0), 'ownQuota' => isset($quotas[$e]), 'created' => null, 'login' => null];
            }
        }
        send_json(['ok' => true, 'defaultQuota' => default_quota(), 'users' => $out]);

    case 'master.activate':
        // {ids, on}: activates (and tells by email) or deactivates accounts; a deactivated one is signed out everywhere
        $u = require_master();
        only('POST');
        require_csrf($u);
        $on = !empty(body()['on']);
        $ids = body()['ids'] ?? (isset(body()['id']) ? [body()['id']] : []);
        if (!is_array($ids) || !$ids || count($ids) > 500) fail('bad_request', 422);
        $done = 0;
        foreach (array_unique(array_map('intval', $ids)) as $id) {
            $x = user_row($id);
            if (!$x || is_master($x) || (bool)$x['activated'] === $on) continue;
            db()->prepare('UPDATE ' . t('users') . ' SET activated = ?, activated_at = ? WHERE id = ?')->execute([$on ? 1 : 0, $on ? now_utc() : null, $id]);
            if (!$on) db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$id]);
            elseif (!empty($x['email_verified_at']) && mail_settings()) {
                $L = in_array($x['ui_lang'], LANGS, true) ? $x['ui_lang'] : 'en';
                $T = mail_t($L);
                send_notice((string)$x['email'], (string)$x['name'], $L, $T['active_subject'], $T['active_title'],
                    [fill($T['hello'], ['name' => $x['name']]), fill($T['active_body'], ['quota' => human_bytes(user_quota($x))])], app_url(), $T['active_button']);
            }
            $done++;
        }
        send_json(['ok' => true, 'changed' => $done]);

    case 'master.quota':
        // {id | email, quota}: bytes of its own, or null = the default space. By email also for people who use other apps
        // of SavOffice without an account here: the space is one for the whole suite
        $u = require_master();
        only('POST');
        require_csrf($u);
        $x = !empty(body()['id']) ? user_row((int)body()['id']) : [];
        $email = $x ? mb_strtolower((string)$x['email']) : mb_strtolower(s(body(), 'email', 190));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) fail('not_found', 404);
        // {unlimited: true}: a space without a limit
        $q = !empty(body()['unlimited']) ? UNLIMITED : (body()['quota'] ?? null);
        if ($q !== null) {
            $q = (int)$q;
            if ($q < 0 || ($q > MAX_QUOTA && $q !== UNLIMITED)) fail('bad_quota', 422);
            db()->prepare('INSERT INTO ' . t('quotas') . ' (email, quota, updated_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quota = VALUES(quota), updated_at = VALUES(updated_at)')->execute([$email, $q, now_utc()]);
        } else db()->prepare('DELETE FROM ' . t('quotas') . ' WHERE email = ?')->execute([$email]);
        db()->prepare('UPDATE ' . t('users') . ' SET quota = NULL WHERE email = ?')->execute([$email]);
        $now = email_quota($email) ?? default_quota();
        send_json(['ok' => true, 'quota' => $now, 'unlimited' => is_unlimited($now)]);

    case 'master.delete':
        // An account and all its files, for ever (never a master)
        $u = require_master();
        only('POST');
        require_csrf($u);
        $x = user_row((int)(body()['id'] ?? 0));
        if (!$x || is_master($x)) fail('forbidden', 403);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$x['id']]);
        delete_user_storage((int)$x['id']);
        send_json(['ok' => true]);

    default:
        fail('not_found', 404);
}

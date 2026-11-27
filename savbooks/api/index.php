<?php
/**
 * SavBooks — JSON API.  api/index.php?r=<action>
 *
 * Accounts:     auth.config, auth.me, auth.register, auth.login (and the routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout,
 *               auth.password, auth.forgot, auth.reset, auth.prefs, auth.profile, auth.export, auth.delete
 * Home:         doc.list, doc.previews, folder.create, folder.rename, folder.delete
 * Documents:    doc.create, doc.get, doc.sync, doc.duplicate, doc.move, doc.star, doc.trash, doc.restore, doc.delete, doc.empty_trash, doc.leave
 * Sharing:      share.get, share.visibility, share.add, share.role, share.remove, invite.create, invite.remove, invite.accept
 * Comments:     comment.list, comment.add, comment.resolve, comment.delete  (private = personal notes)
 * Versions:     version.list, version.get, version.save, version.restore
 * Images:       img (GET), img.upload, img.search, img.import, img.mine, img.copy
 * Typefaces:    font (GET), font.list, font.upload (the file is the body), font.delete
 * Abuse:        report.add
 * Master admin: master.overview, master.users, master.block, master.docs, master.suspend, master.reports, master.report
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in). Roles: viewer, commenter, editor, owner.
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/docs.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavBooks API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false]);
if (!credentials()) fail('not_installed', 503);

// Typefaces from file: anyone with the id (24 random hex digits, written in the documents that use them) can read them,
// so a shared document looks the same for everybody
if ($r === 'font') {
    $id = (string)($_GET['id'] ?? '');
    $f = null;
    if (preg_match('/^[a-f0-9]{24}$/', $id)) {
        $st = db()->prepare('SELECT mime, data FROM ' . t('fonts') . ' WHERE id = ?');
        $st->execute([$id]);
        $f = $st->fetch() ?: null;
    }
    if (!$f) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: ' . $f['mime']);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=31536000, immutable');
    header("Content-Security-Policy: default-src 'none'");
    echo $f['data'];
    exit;
}

// Pictures: only for who can open their document
if ($r === 'img') {
    $id = (string)($_GET['id'] ?? '');
    $img = null;
    if (preg_match('/^[a-f0-9]{24}$/', $id)) {
        $st = db()->prepare('SELECT i.mime, i.data, d.pid FROM ' . t('images') . ' i JOIN ' . t('documents') . ' d ON d.id = i.doc_id WHERE i.id = ?');
        $st->execute([$id]);
        $img = $st->fetch() ?: null;
    }
    if ($img) {
        $u = current_user();
        $d = doc_by_pid($img['pid']);
        if (!$d || (doc_role($d, $u) === null && !($u && is_master($u) && has_report((int)$d['id'])))) $img = null;
    }
    if (!$img) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: ' . $img['mime']);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=86400');
    header("Content-Security-Policy: default-src 'none'");
    echo $img['data'];
    exit;
}

// POST is JSON (a form of another site cannot send it); only a typeface travels as itself, and still needs the X-CSRF-Token header
$ctype = (string)($_SERVER['CONTENT_TYPE'] ?? '');
if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos($ctype, 'application/json') !== 0 && !(($_GET['r'] ?? '') === 'font.upload' && stripos($ctype, 'application/octet-stream') === 0)) fail('bad_request', 415);
remember_app_url();

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}


// ---------- One space for the whole of SavOffice: the space of SavDrive (../savdrive/lib/space.php)

require_once dirname(__DIR__, 2) . '/savdrive/lib/space.php';
const SPACE_APP = 'savbooks';

/** What a person keeps in SavBooks: books (text, previews, versions), their pictures and typefaces from file. It counts in their space of SavOffice. */
function space_bytes(array $u): int
{
    $q = function (string $sql) use ($u): int { $st = db()->prepare($sql); $st->execute([$u['id']]); return (int)$st->fetchColumn(); };
    return $q('SELECT COALESCE(SUM(LENGTH(doc) + COALESCE(LENGTH(preview),0)),0) FROM ' . t('documents') . ' WHERE owner_id = ?')
        + $q('SELECT COALESCE(SUM(LENGTH(v.doc)),0) FROM ' . t('versions') . ' v JOIN ' . t('documents') . ' d ON d.id = v.doc_id WHERE d.owner_id = ?')
        + $q('SELECT COALESCE(SUM(i.bytes),0) FROM ' . t('images') . ' i JOIN ' . t('documents') . ' d ON d.id = i.doc_id WHERE d.owner_id = ?')
        + $q('SELECT COALESCE(SUM(bytes),0) FROM ' . t('fonts') . ' WHERE user_id = ?');
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
    claim_shares(user_row($uid));
    $csrf = create_auth_session($uid);
    send_json(['ok' => true, 'user' => public_user(user_row($uid)), 'csrf' => $csrf]);
}

function require_master(): array
{
    $u = require_user();
    if (!is_master($u)) fail('forbidden', 403);
    return $u;
}

function has_report(int $docId): bool
{
    $st = db()->prepare('SELECT 1 FROM ' . t('reports') . " WHERE doc_id = ? AND status = 'open' LIMIT 1");
    $st->execute([$docId]);
    return (bool)$st->fetchColumn();
}

function pid(): string
{
    return (string)($_SERVER['REQUEST_METHOD'] === 'POST' ? (body()['doc'] ?? '') : ($_GET['doc'] ?? ''));
}

function client_id($v): string
{
    return is_string($v) && preg_match('/^[a-z0-9]{12}$/', $v) ? $v : '';
}

function share_role($v): string
{
    if (!in_array($v, ['viewer', 'commenter', 'editor'], true)) fail('bad_request', 422);
    return $v;
}

function out_share(array $d): array
{
    $st = db()->prepare('SELECT s.id, s.email, s.role, s.user_id, u.name FROM ' . t('shares') . ' s LEFT JOIN ' . t('users') . ' u ON u.id = s.user_id WHERE s.doc_id = ? ORDER BY s.id');
    $st->execute([$d['id']]);
    $people = array_map(fn($p) => ['id' => (int)$p['id'], 'email' => $p['email'], 'name' => $p['name'], 'role' => $p['role'], 'pending' => $p['user_id'] === null], $st->fetchAll());
    $o = user_row((int)$d['owner_id']);
    $st = db()->prepare('SELECT i.id, i.role, i.label, i.expires_at, i.used_at, u.name FROM ' . t('invites') . ' i LEFT JOIN ' . t('users') . ' u ON u.id = i.used_by WHERE i.doc_id = ? ORDER BY i.id DESC LIMIT 50');
    $st->execute([$d['id']]);
    $links = array_map(fn($l) => ['id' => (int)$l['id'], 'role' => $l['role'], 'label' => $l['label'] ?? '', 'expires' => iso($l['expires_at']), 'used' => $l['used_at'] ? iso($l['used_at']) : null, 'by' => $l['name']], $st->fetchAll());
    return ['ok' => true, 'visibility' => $d['visibility'], 'linkRole' => $d['link_role'], 'owner' => ['name' => $o['name'], 'email' => $o['email']], 'people' => $people, 'links' => $links];
}

function out_comments(array $d, ?array $u): array
{
    $st = db()->prepare('SELECT c.*, u.name FROM ' . t('comments') . ' c JOIN ' . t('users') . ' u ON u.id = c.user_id WHERE c.doc_id = ? AND (c.private = 0 OR c.user_id = ?) ORDER BY c.id');
    $st->execute([$d['id'], $u ? $u['id'] : 0]);
    return array_map(fn($c) => ['id' => (int)$c['id'], 'parent' => $c['parent_id'] !== null ? (int)$c['parent_id'] : null, 'private' => (bool)$c['private'], 'block' => $c['block'], 'quote' => $c['quote'],
        'body' => $c['body'], 'resolved' => (bool)$c['resolved'], 'by' => $c['name'], 'mine' => $u && (int)$c['user_id'] === (int)$u['id'], 'at' => iso($c['created_at'])], $st->fetchAll());
}

function comments_stamp(array $d, ?array $u): string
{
    $st = db()->prepare('SELECT CONCAT(COUNT(*), \'-\', COALESCE(MAX(id),0), \'-\', COALESCE(SUM(resolved),0)) FROM ' . t('comments') . ' WHERE doc_id = ? AND (private = 0 OR user_id = ?)');
    $st->execute([$d['id'], $u ? $u['id'] : 0]);
    return (string)$st->fetchColumn();
}

/** Marks this browser as present and returns the others. */
function presence(array $d, ?array $u, string $client, string $block): array
{
    if ($u && $client !== '') {
        db()->prepare('INSERT INTO ' . t('presence') . ' (doc_id, client, user_id, block, seen_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), block = VALUES(block), seen_at = VALUES(seen_at)')
            ->execute([$d['id'], $client, $u['id'], $block, now_utc()]);
        if (random_int(1, 40) === 1) db()->prepare('DELETE FROM ' . t('presence') . ' WHERE seen_at < ?')->execute([gmdate('Y-m-d H:i:s', time() - 600)]);
    }
    if (!$u) return [];
    $st = db()->prepare('SELECT p.client, p.block, p.user_id, u.name FROM ' . t('presence') . ' p JOIN ' . t('users') . ' u ON u.id = p.user_id WHERE p.doc_id = ? AND p.seen_at > ? AND p.user_id <> ?');
    $st->execute([$d['id'], gmdate('Y-m-d H:i:s', time() - 25), $u['id']]);
    return array_map(fn($p) => ['client' => $p['client'], 'name' => $p['name'], 'block' => $p['block'], 'hue' => ((int)$p['user_id'] * 137) % 360], $st->fetchAll());
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
    'name' => 'SavBooks', 'cookie' => 'savbooks', 'lang' => fn() => identity_lang(),
    'fail' => function (string $code, int $http): void {
        fail($code, $http);
    },
    'accepted' => fn(array $b) => !empty($b['acceptTerms']),
    'create' => fn(array $who, array $b) => new_user($who['name'] ?: explode('@', $who['email'])[0], $who['email'], '', null, ui_lang($b)),
    'after' => function (int $uid, array $b): void {
        claim_shares(user_row($uid));
    },
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
        // Everything the account keeps, as one JSON file: profile, folders, own documents (text and settings), comments written
        $u = reader();
        $q = function (string $sql, array $p) { $st = db()->prepare($sql); $st->execute($p); return $st->fetchAll(); };
        $docs = array_map(fn($d) => ['id' => $d['pid'], 'title' => $d['title'], 'created' => iso($d['created_at']), 'updated' => iso($d['updated_at']), 'trash' => $d['deleted_at'] !== null, 'content' => json_decode($d['doc'], true)],
            $q('SELECT pid, title, doc, created_at, updated_at, deleted_at FROM ' . t('documents') . ' WHERE owner_id = ? ORDER BY id', [$u['id']]));
        $out = ['app' => 'SavBooks', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at']), 'prefs' => json_decode((string)($u['prefs'] ?? '{}'), true)],
            'folders' => array_column($q('SELECT name FROM ' . t('folders') . ' WHERE user_id = ? ORDER BY name', [$u['id']]), 'name'), 'documents' => $docs,
            'comments' => array_map(fn($c) => ['document' => $c['pid'], 'text' => $c['body'], 'private' => (bool)$c['private'], 'at' => iso($c['created_at'])], $q('SELECT d.pid, c.body, c.private, c.created_at FROM ' . t('comments') . ' c JOIN ' . t('documents') . ' d ON d.id = c.doc_id WHERE c.user_id = ? ORDER BY c.id', [$u['id']]))];
        header('Content-Disposition: attachment; filename="savbooks-data.json"');
        send_json($out);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);

    // ================================================================ home

    case 'doc.list':
        // Everything the home needs: own documents (trash too), shared ones already opened or given by name, folders
        $u = reader();
        claim_shares($u);
        $cols = 'd.id, d.pid, d.title, d.owner_id, d.folder_id, d.rev, d.words, d.visibility, d.link_role, d.status, d.deleted_at, d.created_at, d.updated_at, v.opened_at, COALESCE(v.starred,0) starred, o.name owner_name';
        $st = db()->prepare("SELECT $cols, (SELECT COUNT(*) FROM " . t('shares') . ' s WHERE s.doc_id = d.id) people FROM ' . t('documents') . ' d JOIN ' . t('users') . ' o ON o.id = d.owner_id
            LEFT JOIN ' . t('visits') . ' v ON v.doc_id = d.id AND v.user_id = ? WHERE d.owner_id = ? ORDER BY d.updated_at DESC LIMIT ' . MAX_USER_DOCS);
        $st->execute([$u['id'], $u['id']]);
        $rows = $st->fetchAll();
        $st = db()->prepare("SELECT $cols, 0 people FROM " . t('documents') . ' d JOIN ' . t('users') . ' o ON o.id = d.owner_id
            LEFT JOIN ' . t('visits') . ' v ON v.doc_id = d.id AND v.user_id = ? LEFT JOIN ' . t('shares') . ' s ON s.doc_id = d.id AND s.user_id = ?
            WHERE d.owner_id <> ? AND d.deleted_at IS NULL AND d.status = \'active\' AND o.status = \'active\' AND (s.id IS NOT NULL OR (d.visibility = \'link\' AND v.opened_at IS NOT NULL)) ORDER BY d.updated_at DESC LIMIT 500');
        $st->execute([$u['id'], $u['id'], $u['id']]);
        $out = [];
        foreach (array_merge($rows, $st->fetchAll()) as $d) {
            $mine = (int)$d['owner_id'] === (int)$u['id'];
            $out[] = out_meta($d, $mine ? 'owner' : doc_role($d, $u), ['mine' => $mine, 'owner' => $d['owner_name'], 'starred' => (bool)$d['starred'], 'opened' => iso($d['opened_at']), 'people' => (int)$d['people'], 'suspended' => $d['status'] !== 'active']);
        }
        $st = db()->prepare('SELECT id, name FROM ' . t('folders') . ' WHERE user_id = ? ORDER BY name');
        $st->execute([$u['id']]);
        $folders = array_map(fn($f) => ['id' => (int)$f['id'], 'name' => $f['name']], $st->fetchAll());
        $st = db()->prepare('SELECT COALESCE(SUM(i.bytes),0) FROM ' . t('images') . ' i JOIN ' . t('documents') . ' d ON d.id = i.doc_id WHERE d.owner_id = ?');
        $st->execute([$u['id']]);
        send_json(['ok' => true, 'docs' => $out, 'folders' => $folders, ] + space_out($u, (int)$st->fetchColumn(), MAX_USER_IMAGE_BYTES));

    case 'doc.previews':
        // The beginning of the documents that are being looked at in the home (at most 24 at a time)
        $u = reader();
        $out = [];
        foreach (array_slice(array_unique(explode(',', (string)($_GET['ids'] ?? ''))), 0, 24) as $id) {
            $d = doc_by_pid($id);
            if (!$d || doc_role($d, $u) === null) continue;
            if ($d['preview'] === null) { // made before the previews
                $d['preview'] = doc_preview(doc_data($d));
                db()->prepare('UPDATE ' . t('documents') . ' SET preview = ? WHERE id = ?')->execute([$d['preview'], $d['id']]);
            }
            $out[$id] = json_decode((string)$d['preview'], true);
        }
        send_json(['ok' => true, 'previews' => (object)$out]);

    case 'folder.create':
        $u = writer();
        $name = s(body(), 'name', 80);
        if ($name === '') fail('name_required', 422);
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('folders') . ' WHERE user_id = ?');
        $st->execute([$u['id']]);
        if ((int)$st->fetchColumn() >= 200) fail('too_many_docs', 422);
        db()->prepare('INSERT INTO ' . t('folders') . ' (user_id, name, created_at) VALUES (?,?,?)')->execute([$u['id'], $name, now_utc()]);
        send_json(['ok' => true, 'id' => (int)db()->lastInsertId()]);

    case 'folder.rename':
        $u = writer();
        $f = own_folder($u['id'], (int)(body()['id'] ?? 0));
        $name = s(body(), 'name', 80);
        if ($name === '') fail('name_required', 422);
        db()->prepare('UPDATE ' . t('folders') . ' SET name = ? WHERE id = ?')->execute([$name, $f['id']]);
        send_json(['ok' => true]);

    case 'folder.delete':
        // Its documents stay, out of any folder
        $u = writer();
        $f = own_folder($u['id'], (int)(body()['id'] ?? 0));
        db()->prepare('DELETE FROM ' . t('folders') . ' WHERE id = ?')->execute([$f['id']]);
        send_json(['ok' => true]);

    // ================================================================ documents

    case 'doc.create':
        $u = writer();
        if (too_many_attempts('create', 120, 60)) fail('rate_limited', 429);
        record_attempt('create');
        $b = body();
        $d = create_doc($u['id'], clean_title($b['title'] ?? '') ?: 'Book', clean_doc($b['content'] ?? []), isset($b['folder']) ? (int)$b['folder'] : null);
        send_json(['ok' => true, 'doc' => out_meta($d, 'owner')]);

    case 'doc.get':
        only('GET');
        $u = current_user();
        $d = doc_by_pid(pid());
        // a master admin reads a document only while a report on it is open
        if ($d && $u && is_master($u) && isset($_GET['review']) && has_report((int)$d['id'])) send_json(['ok' => true, 'doc' => out_meta($d, 'viewer', ['owner' => names_of([$d['owner_id']])[(int)$d['owner_id']] ?? '', 'review' => true]), 'content' => doc_data($d), 'comments' => [], 'stamp' => '']);
        [$d, $role] = require_doc($u, pid(), 'viewer');
        if ($u && !empty($u['email_verified_at']) && !isset($_GET['quiet'])) db()->prepare('INSERT INTO ' . t('visits') . ' (user_id, doc_id, opened_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE opened_at = VALUES(opened_at)')->execute([$u['id'], $d['id'], now_utc()]);
        $st = db()->prepare('SELECT starred FROM ' . t('visits') . ' WHERE user_id = ? AND doc_id = ?');
        $st->execute([$u ? $u['id'] : 0, $d['id']]);
        send_json(['ok' => true, 'doc' => out_meta($d, $role, ['owner' => names_of([$d['owner_id']])[(int)$d['owner_id']] ?? '', 'mine' => $role === 'owner', 'starred' => (bool)$st->fetchColumn()]),
            'content' => doc_data($d), 'comments' => out_comments($d, $u), 'stamp' => comments_stamp($d, $u)]);

    case 'doc.sync':
        // Sends the own changes (if any) and receives those of the others since `rev`. Polled every few seconds.
        only('POST');
        $u = current_user();
        $b = body();
        $ops = is_array($b['ops'] ?? null) ? $b['ops'] : [];
        $client = client_id($b['client'] ?? '');
        $since = (int)($b['rev'] ?? 0);
        $refused = [];
        $applied = [];
        if ($ops) {
            $u = require_user();
            require_csrf($u);
            if ($client === '') fail('bad_request', 422);
            db()->beginTransaction();
            [$d, $role] = require_doc($u, pid(), 'editor', true);
            if ($d['deleted_at']) fail('doc_in_trash', 409);
            $doc = doc_data($d);
            $title = (string)$d['title'];
            [$done, $refused] = apply_ops($doc, $title, $ops);
            if ($done) {
                keep_version($d, (int)$u['id']);
                save_ops($d, $doc, $title, $done, $client, (int)$u['id']);
                $applied = array_map(fn($o) => ['t' => $o['t'], 'id' => $o['id'] ?? '', 'v' => $o['v'] ?? 0], $done);
            }
            db()->commit();
        }
        [$d, $role] = require_doc($u, pid(), 'viewer');
        $st = db()->prepare('SELECT rev, client, ops FROM ' . t('ops') . ' WHERE doc_id = ? AND rev > ? ORDER BY rev');
        $st->execute([$d['id'], $since]);
        $news = $st->fetchAll();
        $rev = (int)$d['rev'];
        // a gap (restored version, old operations already deleted): the browser reloads the document
        if ($since < $rev && count($news) < $rev - $since) send_json(['ok' => true, 'reload' => true, 'rev' => $rev, 'applied' => $applied, 'refused' => $refused, 'role' => $role]);
        $others = [];
        foreach ($news as $n) if ($n['client'] !== $client || $client === '') foreach (json_decode($n['ops'], true) ?: [] as $o) $others[] = $o;
        $block = valid_block_id($b['block'] ?? null) ? $b['block'] : '';
        send_json(['ok' => true, 'rev' => $rev, 'ops' => $others, 'applied' => $applied, 'refused' => $refused, 'role' => $role, 'people' => presence($d, $u, $client, $block), 'stamp' => comments_stamp($d, $u)]);

    case 'doc.duplicate':
        $u = writer();
        [$d, $role] = require_doc($u, pid(), 'viewer');
        $doc = doc_data($d);
        if (!empty($doc['settings']['noCopy']) && role_rank($role) < role_rank('editor')) fail('forbidden', 403);
        db()->beginTransaction();
        $n = create_doc($u['id'], clean_title(body()['title'] ?? '') ?: $d['title'], $doc, (int)$d['owner_id'] === (int)$u['id'] && $d['folder_id'] !== null ? (int)$d['folder_id'] : null);
        $doc = copy_images($doc, (int)$d['id'], (int)$n['id'], $u['id']);
        db()->prepare('UPDATE ' . t('documents') . ' SET doc = ?, preview = ? WHERE id = ?')->execute([json_out($doc), doc_preview($doc), $n['id']]);
        db()->commit();
        send_json(['ok' => true, 'doc' => out_meta($n, 'owner')]);

    case 'doc.move':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        $f = isset(body()['folder']) && body()['folder'] !== null ? (int)body()['folder'] : null;
        if ($f !== null) own_folder($u['id'], $f);
        db()->prepare('UPDATE ' . t('documents') . ' SET folder_id = ? WHERE id = ?')->execute([$f, $d['id']]);
        send_json(['ok' => true]);

    case 'doc.rename':
        $u = writer();
        db()->beginTransaction();
        [$d] = require_doc($u, pid(), 'editor', true);
        $doc = doc_data($d);
        $title = (string)$d['title'];
        [$done] = apply_ops($doc, $title, [['t' => 'title', 'title' => body()['title'] ?? '']]);
        if (!$done) fail('name_required', 422);
        save_ops($d, $doc, $title, $done, '', $u['id']);
        db()->commit();
        send_json(['ok' => true]);

    case 'doc.star':
        $u = writer();
        [$d] = require_doc($u, pid(), 'viewer');
        $on = empty(body()['on']) ? 0 : 1;
        db()->prepare('INSERT INTO ' . t('visits') . ' (user_id, doc_id, starred) VALUES (?,?,?) ON DUPLICATE KEY UPDATE starred = VALUES(starred)')->execute([$u['id'], $d['id'], $on]);
        send_json(['ok' => true]);

    case 'doc.trash':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        db()->prepare('UPDATE ' . t('documents') . ' SET deleted_at = ? WHERE id = ?')->execute([now_utc(), $d['id']]);
        send_json(['ok' => true]);

    case 'doc.restore':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        db()->prepare('UPDATE ' . t('documents') . ' SET deleted_at = NULL WHERE id = ?')->execute([$d['id']]);
        send_json(['ok' => true]);

    case 'doc.delete':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        if (!$d['deleted_at']) fail('not_in_trash', 409);
        db()->prepare('DELETE FROM ' . t('documents') . ' WHERE id = ?')->execute([$d['id']]);
        send_json(['ok' => true]);

    case 'doc.empty_trash':
        // Everything of the own trash goes away for good, now (with its pictures, comments and versions)
        $u = writer();
        $st = db()->prepare('DELETE FROM ' . t('documents') . ' WHERE owner_id = ? AND deleted_at IS NOT NULL');
        $st->execute([$u['id']]);
        send_json(['ok' => true, 'deleted' => $st->rowCount()]);

    case 'doc.leave':
        // A document of someone else goes away from the own list
        $u = writer();
        $d = doc_by_pid(pid());
        if (!$d) fail('doc_not_found', 404);
        db()->prepare('DELETE FROM ' . t('shares') . ' WHERE doc_id = ? AND user_id = ?')->execute([$d['id'], $u['id']]);
        db()->prepare('DELETE FROM ' . t('visits') . ' WHERE doc_id = ? AND user_id = ?')->execute([$d['id'], $u['id']]);
        send_json(['ok' => true]);

    // ================================================================ sharing (only the owner)

    case 'share.get':
        $u = reader();
        [$d] = require_doc($u, pid(), 'owner');
        send_json(out_share($d));

    case 'share.visibility':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        $v = body()['visibility'] ?? '';
        if (!in_array($v, ['private', 'link'], true)) fail('bad_request', 422);
        db()->prepare('UPDATE ' . t('documents') . ' SET visibility = ?, link_role = ? WHERE id = ?')->execute([$v, share_role(body()['role'] ?? 'viewer'), $d['id']]);
        send_json(out_share(doc_by_pid(pid())));

    case 'share.add':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        if (too_many_attempts('share', 60, 60)) fail('rate_limited', 429);
        $b = body();
        $email = mb_strtolower(s($b, 'email', 190));
        valid_email($email);
        $role = share_role($b['role'] ?? '');
        if ($email === mb_strtolower((string)$u['email'])) fail('share_self', 422);
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('shares') . ' WHERE doc_id = ?');
        $st->execute([$d['id']]);
        if ((int)$st->fetchColumn() >= 200) fail('too_many_people', 422);
        record_attempt('share');
        $st = db()->prepare('SELECT id, name, ui_lang, prefs FROM ' . t('users') . ' WHERE email = ? AND email_verified_at IS NOT NULL');
        $st->execute([$email]);
        $row = $st->fetch() ?: null;
        $st = db()->prepare('SELECT 1 FROM ' . t('shares') . ' WHERE doc_id = ? AND email = ?');
        $st->execute([$d['id'], $email]);
        $new = !$st->fetchColumn();
        db()->prepare('INSERT INTO ' . t('shares') . ' (doc_id, user_id, email, role, created_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE role = VALUES(role), user_id = COALESCE(user_id, VALUES(user_id))')
            ->execute([$d['id'], $row ? $row['id'] : null, $email, $role, now_utc()]);
        // who already has an account may have asked not to be told by email (settings)
        if ($new && !empty($b['notify']) && !($row && (json_decode((string)$row['prefs'], true)['mailShare'] ?? true) === false)) {
            $lang = $row ? (string)$row['ui_lang'] : (string)$u['ui_lang'];
            $T = mail_t($lang);
            $vars = ['by' => $u['name'], 'title' => $d['title'], 'role' => $T['roles'][$role]];
            send_notice($email, $row ? (string)$row['name'] : '', $lang, fill($T['share_subject'], $vars), $T['share_title'],
                [$row ? fill($T['hello'], ['name' => $row['name']]) : $T['hello_plain'], fill($T['share_body'], $vars), $row ? '' : $T['share_signup']], app_url() . '#/d/' . $d['pid'], $T['share_button']);
        }
        send_json(out_share($d));

    case 'share.role':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        db()->prepare('UPDATE ' . t('shares') . ' SET role = ? WHERE id = ? AND doc_id = ?')->execute([share_role(body()['role'] ?? ''), (int)(body()['id'] ?? 0), $d['id']]);
        send_json(out_share($d));

    case 'share.remove':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        db()->prepare('DELETE FROM ' . t('shares') . ' WHERE id = ? AND doc_id = ?')->execute([(int)(body()['id'] ?? 0), $d['id']]);
        send_json(out_share($d));

    case 'invite.create':
        // A single-use link: whoever opens it first, signed in, gets access. A name (who it is for) is optional;
        // it lasts 1 hour, 1 day, 7 or 30 days. Used and expired links stay listed for 30 days.
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        if (too_many_attempts('share', 60, 60)) fail('rate_limited', 429);
        record_attempt('share');
        $b = body();
        $hours = (int)($b['hours'] ?? 168);
        if (!in_array($hours, [1, 24, 168, 720], true)) $hours = 168;
        $token = bin2hex(random_bytes(20));
        db()->prepare('DELETE FROM ' . t('invites') . ' WHERE COALESCE(used_at, expires_at) < ?')->execute([gmdate('Y-m-d H:i:s', time() - 30 * 86400)]);
        db()->prepare('INSERT INTO ' . t('invites') . ' (doc_id, token_hash, role, label, created_at, expires_at) VALUES (?,?,?,?,?,?)')
            ->execute([$d['id'], hash('sha256', $token), share_role($b['role'] ?? ''), mb_substr(clean_title($b['label'] ?? ''), 0, 60) ?: null, now_utc(), gmdate('Y-m-d H:i:s', time() + $hours * 3600)]);
        send_json(['ok' => true, 'url' => app_url() . '#/invite/' . $token] + out_share($d));

    case 'invite.remove':
        $u = writer();
        [$d] = require_doc($u, pid(), 'owner');
        db()->prepare('DELETE FROM ' . t('invites') . ' WHERE id = ? AND doc_id = ?')->execute([(int)(body()['id'] ?? 0), $d['id']]);
        send_json(out_share($d));

    case 'invite.accept':
        $u = writer();
        if (too_many_attempts('invite', 30, 15)) fail('rate_limited', 429);
        $hash = hash('sha256', (string)(body()['token'] ?? ''));
        db()->beginTransaction();
        $st = db()->prepare('SELECT i.*, d.pid, d.owner_id FROM ' . t('invites') . ' i JOIN ' . t('documents') . ' d ON d.id = i.doc_id WHERE i.token_hash = ? AND i.expires_at > ? AND i.used_at IS NULL FOR UPDATE');
        $st->execute([$hash, now_utc()]);
        $i = $st->fetch();
        if (!$i) {
            db()->rollBack();
            record_attempt('invite');
            fail('token_invalid', 410);
        }
        if ((int)$i['owner_id'] !== $u['id']) {
            $have = db()->prepare('SELECT role FROM ' . t('shares') . ' WHERE doc_id = ? AND email = ?');
            $have->execute([$i['doc_id'], $u['email']]);
            $old = $have->fetchColumn();
            if (!$old || role_rank($i['role']) > role_rank((string)$old))
                db()->prepare('INSERT INTO ' . t('shares') . ' (doc_id, user_id, email, role, created_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE role = VALUES(role), user_id = VALUES(user_id)')->execute([$i['doc_id'], $u['id'], $u['email'], $i['role'], now_utc()]);
            db()->prepare('UPDATE ' . t('invites') . ' SET used_by = ?, used_at = ? WHERE id = ?')->execute([$u['id'], now_utc(), $i['id']]);
        }
        db()->commit();
        send_json(['ok' => true, 'doc' => $i['pid']]);

    // ================================================================ comments and personal notes

    case 'comment.list':
        only('GET');
        $u = current_user();
        [$d] = require_doc($u, pid(), 'viewer');
        send_json(['ok' => true, 'comments' => out_comments($d, $u), 'stamp' => comments_stamp($d, $u)]);

    case 'comment.add':
        $u = writer();
        $b = body();
        $private = !empty($b['private']);
        [$d, $role] = require_doc($u, pid(), $private ? 'viewer' : 'commenter'); // personal notes are for everybody
        if (!$private && role_rank($role) < role_rank('editor') && !empty(doc_data($d)['settings']['noComments'])) fail('forbidden', 403);
        if (too_many_attempts('comment', 300, 60)) fail('rate_limited', 429);
        record_attempt('comment');
        $text = multiline($b, 'body', 4000);
        if ($text === '') fail('text_required', 422);
        $parent = null;
        if (!empty($b['parent'])) {
            $st = db()->prepare('SELECT id, private FROM ' . t('comments') . ' WHERE id = ? AND doc_id = ? AND parent_id IS NULL AND (private = 0 OR user_id = ?)');
            $st->execute([(int)$b['parent'], $d['id'], $u['id']]);
            $p = $st->fetch();
            if (!$p) fail('bad_request', 422);
            $parent = (int)$p['id'];
            if ((bool)$p['private'] !== $private) fail('bad_request', 422);
        }
        db()->prepare('INSERT INTO ' . t('comments') . ' (doc_id, user_id, parent_id, private, block, quote, body, created_at) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([$d['id'], $u['id'], $parent, $private ? 1 : 0, valid_block_id($b['block'] ?? null) ? $b['block'] : '', s($b, 'quote', 300), $text, now_utc()]);
        send_json(['ok' => true, 'comments' => out_comments($d, $u), 'stamp' => comments_stamp($d, $u)]);

    case 'comment.resolve':
        $u = writer();
        [$d, $role] = require_doc($u, pid(), 'viewer');
        $st = db()->prepare('SELECT user_id FROM ' . t('comments') . ' WHERE id = ? AND doc_id = ? AND private = 0');
        $st->execute([(int)(body()['id'] ?? 0), $d['id']]);
        $by = $st->fetchColumn();
        if ($by === false || ((int)$by !== $u['id'] && role_rank($role) < role_rank('editor'))) fail('forbidden', 403);
        db()->prepare('UPDATE ' . t('comments') . ' SET resolved = ? WHERE id = ?')->execute([empty(body()['on']) ? 0 : 1, (int)body()['id']]);
        send_json(['ok' => true, 'comments' => out_comments($d, $u), 'stamp' => comments_stamp($d, $u)]);

    case 'comment.delete':
        $u = writer();
        [$d, $role] = require_doc($u, pid(), 'viewer');
        $st = db()->prepare('SELECT user_id, private FROM ' . t('comments') . ' WHERE id = ? AND doc_id = ?');
        $st->execute([(int)(body()['id'] ?? 0), $d['id']]);
        $c = $st->fetch();
        if (!$c || ((int)$c['user_id'] !== $u['id'] && ($role !== 'owner' || $c['private']))) fail('forbidden', 403);
        db()->prepare('DELETE FROM ' . t('comments') . ' WHERE id = ?')->execute([(int)body()['id']]);
        send_json(['ok' => true, 'comments' => out_comments($d, $u), 'stamp' => comments_stamp($d, $u)]);

    // ================================================================ versions (editors)

    case 'version.list':
        $u = reader();
        [$d] = require_doc($u, pid(), 'editor');
        $st = db()->prepare('SELECT v.id, v.name, v.title, v.words, v.created_at, u.name by_name FROM ' . t('versions') . ' v LEFT JOIN ' . t('users') . ' u ON u.id = v.user_id WHERE v.doc_id = ? ORDER BY v.id DESC');
        $st->execute([$d['id']]);
        send_json(['ok' => true, 'versions' => array_map(fn($v) => ['id' => (int)$v['id'], 'name' => $v['name'], 'title' => $v['title'], 'words' => (int)$v['words'], 'by' => $v['by_name'], 'at' => iso($v['created_at'])], $st->fetchAll())]);

    case 'version.get':
        $u = reader();
        [$d] = require_doc($u, pid(), 'editor');
        $st = db()->prepare('SELECT doc FROM ' . t('versions') . ' WHERE id = ? AND doc_id = ?');
        $st->execute([(int)($_GET['id'] ?? 0), $d['id']]);
        $raw = $st->fetchColumn();
        if ($raw === false) fail('doc_not_found', 404);
        send_json(['ok' => true, 'content' => json_decode($raw, true)]);

    case 'version.save':
        $u = writer();
        [$d] = require_doc($u, pid(), 'editor');
        $name = s(body(), 'name', 80);
        if ($name === '') fail('name_required', 422);
        keep_version($d, $u['id'], $name);
        send_json(['ok' => true]);

    case 'version.restore':
        // The present text is kept as a version too. The revision jumps: every open browser reloads the document.
        $u = writer();
        db()->beginTransaction();
        [$d] = require_doc($u, pid(), 'editor', true);
        $st = db()->prepare('SELECT doc, title, words FROM ' . t('versions') . ' WHERE id = ? AND doc_id = ?');
        $st->execute([(int)(body()['id'] ?? 0), $d['id']]);
        $v = $st->fetch();
        if (!$v) fail('doc_not_found', 404);
        db()->prepare('INSERT INTO ' . t('versions') . ' (doc_id, user_id, name, title, doc, words, created_at) VALUES (?,?,\'\',?,?,?,?)')->execute([$d['id'], $u['id'], $d['title'], $d['doc'], $d['words'], now_utc()]);
        $doc = json_decode($v['doc'], true);
        foreach ($doc['blocks'] as &$bl) $bl['v'] = (int)$bl['v'] + 100000; // never equal to a version some browser knows
        unset($bl);
        db()->prepare('UPDATE ' . t('documents') . ' SET doc = ?, preview = ?, title = ?, words = ?, rev = rev + 2, updated_at = ?, updated_by = ? WHERE id = ?')->execute([json_out($doc), doc_preview($doc), $v['title'], $v['words'], now_utc(), $u['id'], $d['id']]);
        db()->commit();
        send_json(['ok' => true]);

    // ================================================================ images

    case 'img.upload':
        $u = writer();
        [$d] = require_doc($u, pid(), 'editor');
        if (too_many_attempts('img', 300, 60)) fail('rate_limited', 429);
        record_attempt('img');
        $data = (string)(body()['data'] ?? '');
        if (!preg_match('#^data:image/[a-z]+;base64,#', $data, $m)) fail('image_invalid', 422);
        $bin = base64_decode(substr($data, strlen($m[0])), true);
        send_json(['ok' => true, 'id' => store_image($d, $bin === false ? '' : $bin)]);

    case 'img.mine':
        // The pictures of one's own documents, newest first: to use one again (as "My pictures" in SavPresentations)
        $u = reader();
        $st = db()->prepare('SELECT i.id, i.bytes, i.created_at, d.title FROM ' . t('images') . ' i JOIN ' . t('documents') . ' d ON d.id = i.doc_id WHERE d.owner_id = ? ORDER BY i.created_at DESC LIMIT 240');
        $st->execute([$u['id']]);
        send_json(['ok' => true, 'images' => array_map(fn($x) => ['id' => $x['id'], 'bytes' => (int)$x['bytes'], 'doc' => $x['title'], 'at' => $x['created_at']], $st->fetchAll())]);

    case 'img.copy':
        // One of my pictures into this document (each document keeps its own copy: sharing it never shows the others)
        $u = writer();
        [$d] = require_doc($u, pid(), 'editor');
        if (too_many_attempts('img', 300, 60)) fail('rate_limited', 429);
        record_attempt('img');
        $st = db()->prepare('SELECT i.data FROM ' . t('images') . ' i JOIN ' . t('documents') . ' d ON d.id = i.doc_id WHERE i.id = ? AND d.owner_id = ?');
        $st->execute([(string)(body()['id'] ?? ''), $u['id']]);
        $bin = $st->fetchColumn();
        if ($bin === false) fail('doc_not_found', 404);
        send_json(['ok' => true, 'id' => store_image($d, (string)$bin)]);

    // ================================================================ typefaces from file

    case 'font.list':
        $u = reader();
        $st = db()->prepare('SELECT id, name, bytes FROM ' . t('fonts') . ' WHERE user_id = ? ORDER BY name');
        $st->execute([$u['id']]);
        send_json(['ok' => true, 'fonts' => array_map(fn($f) => ['id' => $f['id'], 'name' => $f['name'], 'bytes' => (int)$f['bytes']], $st->fetchAll())]);

    case 'font.upload':
        // The file itself is the body (not JSON); the name comes in the address. TrueType, OpenType, WOFF and WOFF2, 5 MB at most.
        $u = writer();
        if (too_many_attempts('font', 30, 60)) fail('rate_limited', 429);
        record_attempt('font');
        $name = trim(preg_replace('/[^A-Za-z0-9 \-]/', '', (string)($_GET['name'] ?? '')));
        $name = mb_substr(preg_replace('/\s+/', ' ', $name), 0, 60);
        if ($name === '' || !preg_match('/^[A-Za-z0-9]/', $name)) fail('font_name', 422);
        $bin = (string)file_get_contents('php://input', false, null, 0, MAX_FONT_BYTES + 1);
        if (strlen($bin) > MAX_FONT_BYTES) fail('font_big', 413);
        $magic = substr($bin, 0, 4);
        $mime = ["\x00\x01\x00\x00" => 'font/ttf', 'true' => 'font/ttf', 'OTTO' => 'font/otf', 'wOFF' => 'font/woff', 'wOF2' => 'font/woff2'][$magic] ?? '';
        if ($mime === '' || strlen($bin) < 1000) fail('font_invalid', 422);
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('fonts') . ' WHERE user_id = ?');
        $st->execute([$u['id']]);
        if ((int)$st->fetchColumn() >= MAX_USER_FONTS) fail('font_many', 422);
        $id = bin2hex(random_bytes(12));
        db()->prepare('INSERT INTO ' . t('fonts') . ' (id, user_id, name, mime, bytes, data, created_at) VALUES (?,?,?,?,?,?,?)')->execute([$id, $u['id'], $name, $mime, strlen($bin), $bin, now_utc()]);
        send_json(['ok' => true, 'font' => ['id' => $id, 'name' => $name, 'bytes' => strlen($bin)]]);

    case 'font.delete':
        // Documents that use it fall back to a typeface of the same kind
        $u = writer();
        db()->prepare('DELETE FROM ' . t('fonts') . ' WHERE id = ? AND user_id = ?')->execute([(string)(body()['id'] ?? ''), $u['id']]);
        send_json(['ok' => true]);

    case 'img.search':
        $u = reader();
        if (too_many_attempts('imgsearch', 60, 60)) fail('rate_limited', 429);
        record_attempt('imgsearch');
        $q = s($_GET, 'q', 80);
        if (mb_strlen($q) < 2) fail('text_required', 422);
        send_json(['ok' => true, 'images' => search_images($q, max(1, min(10, (int)($_GET['page'] ?? 1))))]);

    case 'img.import':
        $u = writer();
        [$d] = require_doc($u, pid(), 'editor');
        if (too_many_attempts('img', 300, 60)) fail('rate_limited', 429);
        record_attempt('img');
        send_json(['ok' => true, 'id' => store_image($d, fetch_free_image((string)(body()['src'] ?? '')))]);

    // ================================================================ abuse reports

    case 'report.add':
        only('POST');
        if (too_many_attempts('report', 5, 60)) fail('rate_limited', 429);
        record_attempt('report');
        $u = current_user();
        if ($u) require_csrf($u);
        [$d] = require_doc($u, pid(), 'viewer');
        $reason = (string)(body()['reason'] ?? '');
        if (!in_array($reason, ['spam', 'phishing', 'illegal', 'other'], true)) fail('bad_request', 422);
        db()->prepare('INSERT INTO ' . t('reports') . ' (doc_id, user_id, reason, note, created_at) VALUES (?,?,?,?,?)')->execute([$d['id'], $u ? $u['id'] : null, $reason, multiline(body(), 'note', 1000), now_utc()]);
        send_json(['ok' => true]);

    // ================================================================ master admin

    case 'master.overview':
        only('GET');
        require_master();
        $n = fn(string $sql) => (int)db()->query($sql)->fetchColumn();
        $day = gmdate('Y-m-d H:i:s', time() - 30 * 86400);
        send_json(['ok' => true, 'users' => $n('SELECT COUNT(*) FROM ' . t('users')), 'blocked' => $n('SELECT COUNT(*) FROM ' . t('users') . " WHERE status = 'disabled'"),
            'docs' => $n('SELECT COUNT(*) FROM ' . t('documents') . ' WHERE deleted_at IS NULL'), 'active' => $n('SELECT COUNT(*) FROM ' . t('documents') . " WHERE updated_at > '$day'"),
            'images' => $n('SELECT COALESCE(SUM(bytes),0) FROM ' . t('images')), 'reports' => $n('SELECT COUNT(*) FROM ' . t('reports') . " WHERE status = 'open'")]);

    case 'master.users':
        only('GET');
        require_master();
        $q = '%' . addcslashes(s($_GET, 'q', 80), '%_\\') . '%';
        $st = db()->prepare('SELECT u.*, (SELECT COUNT(*) FROM ' . t('documents') . ' d WHERE d.owner_id = u.id) docs FROM ' . t('users') . ' u WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.id DESC LIMIT 200');
        $st->execute([$q, $q]);
        send_json(['ok' => true, 'users' => array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name'], 'email' => $x['email'], 'verified' => !empty($x['email_verified_at']), 'blocked' => $x['status'] !== 'active', 'reason' => $x['block_reason'],
            'note' => $x['block_note'], 'docs' => (int)$x['docs'], 'created' => iso($x['created_at']), 'login' => iso($x['last_login_at']), 'master' => is_master($x)], $st->fetchAll())]);

    case 'master.block':
        only('POST');
        $u = require_master();
        require_csrf($u);
        $x = user_row((int)(body()['id'] ?? 0));
        if (!$x || is_master($x)) fail('forbidden', 403);
        $on = !empty(body()['on']);
        $reason = (string)(body()['reason'] ?? '');
        if ($on && !in_array($reason, ['spam', 'phishing', 'illegal', 'other'], true)) fail('bad_request', 422);
        db()->prepare('UPDATE ' . t('users') . ' SET status = ?, block_reason = ?, block_note = ? WHERE id = ?')->execute([$on ? 'disabled' : 'active', $on ? $reason : '', $on ? s(body(), 'note', 300) : '', $x['id']]);
        if ($on) db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$x['id']]);
        send_json(['ok' => true]);

    case 'master.docs':
        // Only what describes a document, never its text
        only('GET');
        require_master();
        $q = '%' . addcslashes(s($_GET, 'q', 80), '%_\\') . '%';
        $st = db()->prepare('SELECT d.pid, d.words, d.visibility, d.status, d.deleted_at, d.updated_at, LENGTH(d.doc) bytes, o.name owner, o.email, (SELECT COUNT(*) FROM ' . t('reports') . ' r WHERE r.doc_id = d.id) reports
            FROM ' . t('documents') . ' d JOIN ' . t('users') . ' o ON o.id = d.owner_id WHERE o.name LIKE ? OR o.email LIKE ? OR d.pid LIKE ? ORDER BY d.updated_at DESC LIMIT 200');
        $st->execute([$q, $q, $q]);
        send_json(['ok' => true, 'docs' => array_map(fn($x) => ['id' => $x['pid'], 'owner' => $x['owner'], 'email' => $x['email'], 'words' => (int)$x['words'], 'bytes' => (int)$x['bytes'], 'visibility' => $x['visibility'],
            'suspended' => $x['status'] !== 'active', 'trash' => !empty($x['deleted_at']), 'reports' => (int)$x['reports'], 'updated' => iso($x['updated_at'])], $st->fetchAll())]);

    case 'master.suspend':
        only('POST');
        $u = require_master();
        require_csrf($u);
        $d = doc_by_pid(pid());
        if (!$d) fail('doc_not_found', 404);
        db()->prepare('UPDATE ' . t('documents') . ' SET status = ? WHERE id = ?')->execute([empty(body()['on']) ? 'active' : 'suspended', $d['id']]);
        send_json(['ok' => true]);

    case 'master.reports':
        only('GET');
        require_master();
        $st = db()->query('SELECT r.*, d.pid, d.title, d.status dstatus, o.name owner, o.email, u.name by_name FROM ' . t('reports') . ' r JOIN ' . t('documents') . ' d ON d.id = r.doc_id JOIN ' . t('users') . ' o ON o.id = d.owner_id
            LEFT JOIN ' . t('users') . " u ON u.id = r.user_id ORDER BY r.status = 'closed', r.id DESC LIMIT 200");
        send_json(['ok' => true, 'reports' => array_map(fn($x) => ['id' => (int)$x['id'], 'doc' => $x['pid'], 'title' => $x['status'] === 'open' ? $x['title'] : $x['pid'], 'owner' => $x['owner'], 'email' => $x['email'], 'by' => $x['by_name'], 'reason' => $x['reason'], 'note' => $x['note'],
            'open' => $x['status'] === 'open', 'suspended' => $x['dstatus'] !== 'active', 'at' => iso($x['created_at'])], $st->fetchAll())]);

    case 'master.report':
        only('POST');
        $u = require_master();
        require_csrf($u);
        db()->prepare('UPDATE ' . t('reports') . ' SET status = ? WHERE id = ?')->execute([empty(body()['closed']) ? 'open' : 'closed', (int)(body()['id'] ?? 0)]);
        send_json(['ok' => true]);

    default:
        fail('not_found', 404);
}

<?php
/**
 * SavPresentations — JSON API.  api/?r=<action>
 *
 * Accounts:      auth.config, me, register, login, resend, verify, forgot, reset, logout, password, profile, settings, export, delete
 * Home:          home.list, folder.create|rename|delete, deck.create|get|sync|move|trash|restore|purge|duplicate|template
 * Pages:         page.rules, page.rule (permissions of single people on single pages)
 * Sharing:       share.get, share.access, share.invite, share.role, share.remove, share.link, share.unlink, share.accept, deck.leave
 * Versions:      version.list|get|save|restore
 * Comments:      comment.list|add|edit|resolve|delete        Personal notes: note.list|save|delete
 * Pictures:      media (public by id), media.upload, media.video.begin|piece|end|drop, media.list, media.delete, media.import, media.poster, search, search.thumb
 * Reports:       report.create
 * Master admin:  admin.overview, admin.users, admin.user, admin.decks, admin.deck, admin.view, admin.reports, admin.report, admin.log
 *
 * Every POST of a signed-in person needs the X-CSRF-Token header (given at sign-in). Roles: see lib/decks.php.
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/decks.php';
require __DIR__ . '/../lib/media.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavPresentations API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');
if (!credentials()) fail('not_installed', 503);
if ($r === 'media') serve_media((string)($_GET['id'] ?? ''));
if ($r === 'font') serve_font((string)($_GET['id'] ?? ''));
if ($_SERVER['REQUEST_METHOD'] === 'POST' && !in_array($r, ['media.upload', 'media.video.piece', 'font.upload'], true) && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) fail('bad_request', 415);
remember_app_url();

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}


// ---------- One space for the whole of SavOffice: the space of SavDrive (../savdrive/lib/space.php)

require_once dirname(__DIR__, 2) . '/savdrive/lib/space.php';
const SPACE_APP = 'savpresentations';

/** What a person keeps in SavPresentations: presentations (slides, versions, small pictures), pictures and videos, typefaces from file. It counts in their space of SavOffice. */
function space_bytes(array $u): int
{
    $q = function (string $sql) use ($u): int { $st = db()->prepare($sql); $st->execute([$u['id']]); return (int)$st->fetchColumn(); };
    return $q('SELECT COALESCE(SUM(COALESCE(LENGTH(meta),0) + COALESCE(LENGTH(thumb),0)),0) FROM ' . t('decks') . ' WHERE owner_id = ?')
        + $q('SELECT COALESCE(SUM(LENGTH(s.data)),0) FROM ' . t('slides') . ' s JOIN ' . t('decks') . ' d ON d.id = s.deck_id WHERE d.owner_id = ?')
        + $q('SELECT COALESCE(SUM(COALESCE(LENGTH(v.meta),0) + COALESCE(LENGTH(v.slides),0)),0) FROM ' . t('versions') . ' v JOIN ' . t('decks') . ' d ON d.id = v.deck_id WHERE d.owner_id = ?')
        + $q('SELECT COALESCE(SUM(bytes),0) FROM ' . t('media') . ' WHERE user_id = ?')
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

/** Signed-in and confirmed person, or null for an anonymous visitor (public links). */
function visitor(): ?array
{
    $u = current_user();
    return $u && $u['status'] === 'active' && !empty($u['email_verified_at']) ? $u : null;
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

function user_by_email(string $email): ?array
{
    $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE email = ?');
    $st->execute([$email]);
    return $st->fetch() ?: null;
}

function new_user(string $name, string $email, string $hash, ?string $googleSub, string $lang): int
{
    db()->prepare('INSERT INTO ' . t('users') . ' (name, email, password_hash, google_sub, ui_lang, settings, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$name, $email, $hash, $googleSub, $lang, '{}', now_utc(), now_utc()]);
    return (int)db()->lastInsertId();
}

function signed_in(int $uid): void
{
    db()->prepare('UPDATE ' . t('users') . ' SET last_login_at = ? WHERE id = ?')->execute([now_utc(), $uid]);
    $row = user_row($uid);
    accept_invites($row);
    $csrf = create_auth_session($uid);
    send_json(['ok' => true, 'user' => public_user($row), 'csrf' => $csrf]);
}

function refuse_blocked(array $row): void
{
    if ($row['status'] === 'active') return;
    send_json(['ok' => false, 'error' => 'blocked', 'reason' => $row['block_reason'] ?: 'other'], 403);
}

function own_folder(array $u, $id): ?int
{
    $id = (int)$id;
    if (!$id) return null;
    $st = db()->prepare('SELECT id FROM ' . t('folders') . ' WHERE id = ? AND user_id = ?');
    $st->execute([$id, $u['id']]);
    if (!$st->fetchColumn()) fail('folder_not_found', 404);
    return $id;
}

function share_role(array $b): string
{
    $role = (string)($b['role'] ?? 'viewer');
    if (!in_array($role, ['viewer', 'commenter', 'editor'], true)) fail('bad_request', 422);
    return $role;
}

function deck_title(array $b): string
{
    return mb_substr(trim(clean_text($b['title'] ?? '', 150)), 0, 150) ?: 'Untitled';
}

/** The pages this person can see; the speaker notes only of those they can edit. */
function slides_for(array $d, array $acc): array
{
    $out = [];
    foreach (deck_slides((int)$d['id']) as $s) {
        $role = page_role($acc, $s['sid']);
        if ($role === '') continue;
        if (role_rank($role) < role_rank('editor')) unset($s['d']->notes);
        $out[] = $s;
    }
    return $out;
}

/** The changes this person can know. Null = something about who sees what has changed: the page reads everything again. */
function ops_for(?array $ops, array $acc): ?array
{
    if ($ops === null || $acc['role'] === 'owner') return $ops;
    $out = [];
    foreach ($ops as $o) {
        $k = $o['o']->k ?? '';
        if ($k === 'page.rules') return null;
        if ($k === 'deck.set') {
            $out[] = $o;
            continue;
        }
        $role = page_role($acc, (string)($o['o']->s ?? ''));
        $editor = role_rank($role) >= role_rank('editor');
        if (!$editor && $k === 'slide.set' && property_exists($o['o']->p, 'hide')) return null;
        if ($role === '') continue;
        if (!$editor) {
            if (isset($o['o']->p->notes)) unset($o['o']->p->notes);
            if (isset($o['o']->d->notes)) unset($o['o']->d->notes);
        }
        $out[] = $o;
    }
    return $out;
}

/** The versions are whole copies: only for who can edit every page. */
function require_versions(array $u, string $uid): array
{
    [$d, $role] = require_deck($u, $uid, 'editor');
    if (pages_limited(page_access($d, $u, $role))) fail('pages_limited', 403);
    return $d;
}

function require_master(): array
{
    $u = require_user();
    if (!is_master($u)) fail('forbidden', 403);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') require_csrf($u);
    return $u;
}

function audit(array $admin, string $action, string $target, string $note = ''): void
{
    db()->prepare('INSERT INTO ' . t('audit') . ' (admin_id, action, target, note, created_at) VALUES (?,?,?,?,?)')->execute([$admin['id'], $action, mb_substr($target, 0, 190), mb_substr($note, 0, 500), now_utc()]);
}

function anchor($v): string
{
    if (!is_array($v)) return '';
    $out = [];
    if (valid_key($v['e'] ?? '')) $out['e'] = $v['e'];
    foreach (['x', 'y', 'w', 'h'] as $k) {
        $n = clean_num($v[$k] ?? null, -20000, 20000);
        if ($n !== null) $out[$k] = round($n, 1);
    }
    return $out ? json_out($out) : '';
}

/** Removes an account with everything it owns, pictures included. */
function delete_user(int $id): void
{
    $st = db()->prepare('SELECT id FROM ' . t('media') . ' WHERE user_id = ?');
    $st->execute([$id]);
    $files = $st->fetchAll(PDO::FETCH_COLUMN);
    $st = db()->prepare('SELECT id FROM ' . t('fonts') . ' WHERE user_id = ?');
    $st->execute([$id]);
    $fonts = $st->fetchAll(PDO::FETCH_COLUMN);
    db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$id]);
    delete_media_files($files);
    foreach ($fonts as $f) @unlink(font_path($f));
}

// ---------- SavAccount: signing in and joining an account that already exists (../identity/identity.php) ----------

require dirname(__DIR__, 2) . '/identity/identity.php';

identity_setup([
    'name' => APP_NAME, 'cookie' => 'savpresentations',
    'lang' => fn() => strpos(strtolower((string)($_SERVER['HTTP_X_LANG'] ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''))), 'it') === 0 ? 'it' : 'en',
    'fail' => function (string $code, int $http): void {
        fail($code, $http);
    },
    'accepted' => fn(array $b) => !empty($b['acceptTerms']),
    'create' => fn(array $who, array $b) => new_user($who['name'] ?: explode('@', $who['email'])[0], $who['email'], '', null, ui_lang($b)),
    'after' => function (int $uid, array $b): void {
        accept_invites(user_row($uid));
    },
    'writer' => fn() => writer(),
]);
identity_route($r);

switch ($r) {

    // ================================================================ accounts

    case 'auth.config':
        send_json(['ok' => true, 'savAccount' => sav_enabled(), 'mailReady' => mail_settings() !== null, 'sources' => search_sources()]);

    case 'auth.me':
        only('GET');
        $u = current_user();
        if (!$u || $u['status'] !== 'active') send_json(['ok' => true, 'user' => null]);
        accept_invites($u);
        send_json(['ok' => true, 'user' => public_user($u), 'csrf' => $u['csrf_token']]);

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
        record_attempt('register');
        $row = user_by_email($email);
        $hash = password_hash($pw, PASSWORD_DEFAULT);
        if (!$row) send_account_link(user_row(new_user($name, $email, $hash, null, ui_lang($b))), ui_lang($b), 'verify');
        elseif (empty($row['email_verified_at']) && $row['status'] === 'active' && !too_many_attempts('verify_mail', 3, 60)) {
            record_attempt('verify_mail');
            send_account_link($row, ui_lang($b), 'verify');
        }
        send_json(['ok' => true, 'checkEmail' => true]);

    case 'auth.login':
        only('POST');
        if (too_many_attempts('login', 10, 15)) fail('rate_limited', 429);
        $b = body();
        $pw = (string)($b['password'] ?? '');
        $row = user_by_email(mb_strtolower(s($b, 'email', 190)));
        // One answer for an unknown address, a wrong password and an account without a password, in about the same time
        $ok = $row && $row['password_hash'] !== '' ? password_verify($pw, $row['password_hash']) : password_hash($pw, PASSWORD_DEFAULT) === '';
        if (!$ok) {
            record_attempt('login');
            fail('bad_credentials', 401);
        }
        refuse_blocked($row);
        clear_attempts('login');
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $row['id']]);
        signed_in((int)$row['id']);

    case 'auth.resend':
        $u = writer(true);
        if (!empty($u['email_verified_at'])) send_json(['ok' => true]);
        if (too_many_attempts('verify_mail', 3, 60)) fail('rate_limited', 429);
        record_attempt('verify_mail');
        send_account_link($u, ui_lang(body()), 'verify');
        send_json(['ok' => true]);

    case 'auth.verify':
        // The link of the email opens the app, which asks for this with a button: mail scanners that open links do nothing
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . " WHERE token_hash = ? AND kind = 'verify' AND expires_at > ?");
        $st->execute([hash('sha256', (string)(body()['token'] ?? '')), now_utc()]);
        $uid = (int)$st->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        db()->prepare('UPDATE ' . t('users') . ' SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([now_utc(), $uid]);
        db()->prepare('DELETE FROM ' . t('email_tokens') . " WHERE user_id = ? AND kind = 'verify'")->execute([$uid]);
        refuse_blocked(user_row($uid));
        signed_in($uid);

    case 'auth.forgot':
        only('POST');
        if (too_many_attempts('forgot', 5, 60)) fail('rate_limited', 429);
        record_attempt('forgot');
        $b = body();
        $row = user_by_email(mb_strtolower(s($b, 'email', 190)));
        if ($row && $row['status'] === 'active') send_account_link($row, ui_lang($b), 'reset');
        send_json(['ok' => true]); // the same answer for an unknown address

    case 'auth.reset':
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $b = body();
        validate_password((string)($b['password'] ?? ''));
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . " WHERE token_hash = ? AND kind = 'reset' AND expires_at > ?");
        $st->execute([hash('sha256', (string)($b['token'] ?? '')), now_utc()]);
        $uid = (int)$st->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([password_hash((string)$b['password'], PASSWORD_DEFAULT), now_utc(), $uid]);
        db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ?')->execute([$uid]);
        db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$uid]); // everywhere signed out
        refuse_blocked(user_row($uid));
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
        if ($u['password_hash'] !== '' && !password_verify((string)($b['current'] ?? ''), $u['password_hash'])) fail('bad_password', 422);
        validate_password((string)($b['password'] ?? ''));
        db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash((string)$b['password'], PASSWORD_DEFAULT), $u['id']]);
        db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ? AND csrf_token <> ?')->execute([$u['id'], $u['csrf_token']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.profile':
        $u = writer(true);
        $b = body();
        $name = s($b, 'name', 80);
        if ($name !== '' && mb_strlen($name) < 2) fail('name_required', 422);
        db()->prepare('UPDATE ' . t('users') . ' SET name = IF(? = \'\', name, ?), ui_lang = ? WHERE id = ?')->execute([$name, $name, ui_lang($b + ['lang' => $u['ui_lang']]), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.settings':
        // Settings for all the presentations of this person
        $u = writer();
        $in = body()['settings'] ?? [];
        $cur = json_decode((string)$u['settings'], true) ?: [];
        $enum = ['mode' => ['auto', 'light', 'dark'], 'format' => ['16-9', '16-10', '4-3', 'a4', 'a4-p', 'a3', 'a3-p', 'square', 'story'], 'access' => ['private', 'link'], 'linkRole' => ['viewer', 'commenter', 'editor'], 'tr' => TRANSITIONS, 'view' => ['grid', 'list'],
            'head' => array_merge([''], array_slice(FONT_IDS, 2)), 'body' => array_merge([''], array_slice(FONT_IDS, 2))];
        foreach ($enum as $k => $vals) if (isset($in[$k]) && in_array($in[$k], $vals, true)) $cur[$k] = $in[$k];
        foreach (['simple', 'snap', 'grid', 'guides', 'numbers', 'mailShare', 'mailComments', 'spell', 'notesBar'] as $k) if (isset($in[$k])) $cur[$k] = (bool)$in[$k];
        if (isset($in['tools']) && is_array($in['tools'])) $cur['tools'] = array_values(array_unique(array_filter(array_slice($in['tools'], 0, 20), fn($x) => is_string($x) && preg_match('/^[a-z]{2,12}$/', $x))));
        if (isset($in['stars']) && is_array($in['stars'])) $cur['stars'] = array_values(array_filter(array_slice($in['stars'], 0, 200), fn($x) => is_string($x) && preg_match('/^[A-Za-z0-9]{22}$/', $x)));
        if (isset($in['theme']) && preg_match('/^[a-z0-9-]{1,24}$/', (string)$in['theme'])) $cur['theme'] = $in['theme'];
        db()->prepare('UPDATE ' . t('users') . ' SET settings = ? WHERE id = ?')->execute([json_out($cur ?: new stdClass()), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.export':
        // Everything stored about this person
        $u = reader();
        $all = function (string $sql) use ($u) {
            $st = db()->prepare($sql);
            $st->execute([$u['id']]);
            return $st->fetchAll();
        };
        $decks = $all('SELECT id, uid, title, meta, access, link_role, status, created_at, updated_at FROM ' . t('decks') . ' WHERE owner_id = ?');
        foreach ($decks as &$d) {
            $d['slides'] = deck_slides((int)$d['id']);
            $d['meta'] = json_decode($d['meta']);
            unset($d['id']);
        }
        header('Content-Disposition: attachment; filename="savpresentations-data.json"');
        send_json(['account' => array_diff_key(public_user($u), ['master' => 1, 'mailReady' => 1]), 'createdAt' => iso($u['created_at']), 'folders' => $all('SELECT id, parent_id, name FROM ' . t('folders') . ' WHERE user_id = ?'), 'presentations' => $decks,
            'comments' => $all('SELECT body, sid, created_at FROM ' . t('comments') . ' WHERE user_id = ?'), 'notes' => $all('SELECT body, sid, created_at FROM ' . t('notes') . ' WHERE user_id = ?'), 'pictures' => $all('SELECT id, name, width, height, bytes, created_at FROM ' . t('media') . ' WHERE user_id = ?')]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        if ($u['password_hash'] !== '') {
            if (!password_verify((string)($b['password'] ?? ''), $u['password_hash'])) fail('bad_password', 422);
        } elseif (mb_strtolower(s($b, 'email', 190)) !== mb_strtolower((string)$u['email'])) fail('email_mismatch', 422);
        destroy_auth_session();
        delete_user((int)$u['id']);
        send_json(['ok' => true]);

    // ================================================================ home

    case 'home.list':
        $u = reader();
        $first = '(SELECT s.data FROM ' . t('slides') . ' s WHERE s.deck_id = d.id ORDER BY s.pos, s.sid LIMIT 1) AS first_slide, (SELECT COUNT(*) FROM ' . t('slides') . ' s WHERE s.deck_id = d.id) AS n_slides';
        $st = db()->prepare("SELECT d.*, d.folder_id AS my_folder, $first, (SELECT COUNT(*) FROM " . t('members') . ' m WHERE m.deck_id = d.id) AS members FROM ' . t('decks') . ' d WHERE d.owner_id = ? ORDER BY d.updated_at DESC LIMIT 500');
        $st->execute([$u['id']]);
        $decks = array_map(fn($d) => deck_card($d + ['owner_name' => $u['name']], 'owner'), $st->fetchAll());
        $seen = " AND s.data NOT LIKE '%\\\"hide\\\":1%' AND COALESCE((SELECT p1.role FROM " . t('page_rules') . ' p1 WHERE p1.deck_id = d.id AND p1.sid = s.sid AND p1.who = \'u:' . (int)$u['id'] . '\'), (SELECT p2.role FROM ' . t('page_rules') . " p2 WHERE p2.deck_id = d.id AND p2.sid = s.sid AND p2.who = '*'), 'viewer') <> 'none'";
        $first = str_replace('s.deck_id = d.id', 's.deck_id = d.id' . $seen, $first);
        $st = db()->prepare("SELECT d.*, m.role, o.name AS owner_name, $first FROM " . t('members') . ' m JOIN ' . t('decks') . ' d ON d.id = m.deck_id JOIN ' . t('users') . " o ON o.id = d.owner_id AND o.status = 'active' WHERE m.user_id = ? AND d.status = 'active' ORDER BY d.updated_at DESC LIMIT 300");
        $st->execute([$u['id']]);
        $shared = array_map(fn($d) => deck_card($d, $d['role']), $st->fetchAll());
        $st = db()->prepare('SELECT id, parent_id, name FROM ' . t('folders') . ' WHERE user_id = ? ORDER BY name');
        $st->execute([$u['id']]);
        $folders = array_map(fn($f) => ['id' => (int)$f['id'], 'parent' => $f['parent_id'] ? (int)$f['parent_id'] : null, 'name' => $f['name']], $st->fetchAll());
        send_json(['ok' => true, 'decks' => $decks, 'shared' => $shared, 'folders' => $folders, ] + space_out($u, media_used((int)$u['id']), (int)config_value('quota')));

    case 'folder.create':
        $u = writer();
        $b = body();
        $name = s($b, 'name', 80);
        if ($name === '') fail('name_required', 422);
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('folders') . ' WHERE user_id = ?');
        $st->execute([$u['id']]);
        if ((int)$st->fetchColumn() >= 200) fail('too_many', 422);
        db()->prepare('INSERT INTO ' . t('folders') . ' (user_id, parent_id, name, created_at) VALUES (?,?,?,?)')->execute([$u['id'], own_folder($u, $b['parent'] ?? 0), $name, now_utc()]);
        send_json(['ok' => true, 'id' => (int)db()->lastInsertId()]);

    case 'folder.rename':
        $u = writer();
        $b = body();
        $name = s($b, 'name', 80);
        if ($name === '') fail('name_required', 422);
        db()->prepare('UPDATE ' . t('folders') . ' SET name = ? WHERE id = ?')->execute([$name, own_folder($u, $b['id'] ?? 0)]);
        send_json(['ok' => true]);

    case 'folder.delete':
        // The presentations (and subfolders) inside move one level up: nothing is deleted with a folder
        $u = writer();
        $id = own_folder($u, body()['id'] ?? 0);
        if (!$id) fail('folder_not_found', 404);
        $st = db()->prepare('SELECT parent_id FROM ' . t('folders') . ' WHERE id = ?');
        $st->execute([$id]);
        $parent = $st->fetchColumn() ?: null;
        db()->beginTransaction();
        db()->prepare('UPDATE ' . t('decks') . ' SET folder_id = ? WHERE folder_id = ?')->execute([$parent, $id]);
        db()->prepare('UPDATE ' . t('folders') . ' SET parent_id = ? WHERE parent_id = ?')->execute([$parent, $id]);
        db()->prepare('DELETE FROM ' . t('folders') . ' WHERE id = ?')->execute([$id]);
        db()->commit();
        send_json(['ok' => true]);

    case 'deck.create':
        // The browser builds it (blank, template or opened file); everything is cleaned again here
        $u = writer();
        $b = body();
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('decks') . ' WHERE owner_id = ?');
        $st->execute([$u['id']]);
        if ((int)$st->fetchColumn() >= 1000) fail('too_many', 422);
        $uid = create_deck((int)$u['id'], deck_title($b), clean_meta($b['meta'] ?? []), is_array($b['slides'] ?? null) ? $b['slides'] : [], own_folder($u, $b['folder'] ?? 0));
        $set = json_decode((string)$u['settings'], true) ?: [];
        if (($set['access'] ?? '') === 'link') db()->prepare("UPDATE " . t('decks') . " SET access = 'link', link_role = ? WHERE uid = ?")->execute([in_array($set['linkRole'] ?? '', ['viewer', 'commenter', 'editor'], true) ? $set['linkRole'] : 'viewer', $uid]);
        send_json(['ok' => true, 'uid' => $uid]);

    case 'deck.get':
        only('GET');
        $u = visitor();
        [$d, $role] = require_deck($u, (string)($_GET['d'] ?? ''));
        $acc = page_access($d, $u, $role);
        $slides = slides_for($d, $acc);
        // the pages where this person can do something different from the rest
        $perms = [];
        foreach ($slides as $s) if (($r2 = page_role($acc, $s['sid'])) !== $role) $perms[$s['sid']] = $r2;
        $ruled = [];
        if ($role === 'owner') {
            $st = db()->prepare('SELECT DISTINCT sid FROM ' . t('page_rules') . ' WHERE deck_id = ?');
            $st->execute([$d['id']]);
            $ruled = $st->fetchAll(PDO::FETCH_COLUMN);
        }
        send_json(['ok' => true, 'role' => $role, 'me' => $u ? public_user($u) : null, 'deck' => ['uid' => $d['uid'], 'title' => $d['title'], 'owner' => $d['owner_name'], 'access' => $d['access'], 'status' => $d['status'], 'template' => (bool)$d['is_template'], 'meta' => json_decode($d['meta']), 'seq' => (int)$d['seq'], 'updated' => iso($d['updated_at']), 'perms' => $perms ?: new stdClass(), 'ruled' => $ruled, 'limited' => $role !== 'owner' && pages_limited($acc), 'slides' => $slides]]);

    case 'deck.sync':
        // Sends the changes of this browser (who can edit) and gets those of the others, with who is here
        only('POST');
        $u = visitor();
        if ($u) require_csrf($u);
        $b = body();
        [$d, $role] = require_deck($u, (string)($b['d'] ?? ''));
        $client = (string)($b['client'] ?? '');
        if (!valid_key($client)) fail('bad_request', 422);
        $since = (int)($b['since'] ?? 0);
        $seq = (int)$d['seq'];
        $acc = page_access($d, $u, $role);
        $ops = $b['ops'] ?? [];
        $denied = 0;
        if ($ops) {
            if (!$u || !can_write($acc)) fail('forbidden', 403);
            if ($d['status'] !== 'active') fail('deck_trashed', 409);
            $seq = apply_ops($d, $u, $client, $ops, $role, $denied);
            $acc = page_access($d, $u, $role);
        }
        touch_presence((int)$d['id'], $client, $u, $b['state'] ?? null);
        $raw = ops_since((int)$d['id'], $since, $seq);
        $news = ops_for($raw, $acc);
        // the comments can change too: their number tells the page to read them again
        $st = db()->prepare('SELECT COUNT(*), COALESCE(MAX(id), 0), COALESCE(SUM(resolved_at IS NOT NULL), 0) FROM ' . t('comments') . ' WHERE deck_id = ?');
        $st->execute([$d['id']]);
        // the number of the last change read counts also the ones this person cannot see
        send_json(['ok' => true, 'role' => $role, 'seq' => $raw ? end($raw)['n'] : ($raw === null ? $seq : $since), 'ops' => $news, 'reload' => $news === null, 'denied' => $denied, 'people' => presence_list((int)$d['id'], $client, $acc), 'cv' => implode('.', $st->fetch(PDO::FETCH_NUM))]);

    case 'deck.bye':
        // The page is closing (sendBeacon: no custom headers, so it can only remove this browser's own presence)
        only('POST');
        $b = body();
        if (valid_key($b['client'] ?? '')) db()->prepare('DELETE p FROM ' . t('presence') . ' p JOIN ' . t('decks') . ' d ON d.id = p.deck_id WHERE d.uid = ? AND p.client = ?')->execute([(string)($b['d'] ?? ''), $b['client']]);
        send_json(['ok' => true]);

    case 'deck.move':
        $u = writer();
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''), 'owner');
        db()->prepare('UPDATE ' . t('decks') . ' SET folder_id = ? WHERE id = ?')->execute([own_folder($u, $b['folder'] ?? 0), $d['id']]);
        send_json(['ok' => true]);

    case 'deck.rename':
        $u = writer();
        $b = body();
        [$d, $role] = require_deck($u, (string)($b['d'] ?? ''), 'editor');
        apply_ops($d, $u, 'server', [['k' => 'deck.set', 'p' => ['title' => deck_title($b)]]], $role);
        send_json(['ok' => true]);

    case 'deck.trash':
    case 'deck.restore':
        $u = writer();
        $d = deck_by_uid((string)(body()['d'] ?? ''));
        if (!$d || (int)$d['owner_id'] !== (int)$u['id'] || $d['status'] === 'suspended') fail('deck_not_found', 404);
        $trash = $r === 'deck.trash';
        db()->prepare('UPDATE ' . t('decks') . ' SET status = ?, trashed_at = ? WHERE id = ?')->execute([$trash ? 'trashed' : 'active', $trash ? now_utc() : null, $d['id']]);
        send_json(['ok' => true]);

    case 'deck.purge':
        $u = writer();
        $d = deck_by_uid((string)(body()['d'] ?? ''));
        if (!$d || (int)$d['owner_id'] !== (int)$u['id'] || $d['status'] !== 'trashed') fail('deck_not_found', 404);
        db()->prepare('DELETE FROM ' . t('decks') . ' WHERE id = ?')->execute([$d['id']]);
        send_json(['ok' => true]);

    case 'deck.duplicate':
        $u = writer();
        $b = body();
        [$d, $role] = require_deck($u, (string)($b['d'] ?? ''));
        $meta = json_decode($d['meta'], true) ?: [];
        if (role_rank($role) < role_rank('editor') && isset($meta['opts']['copy']) && !$meta['opts']['copy']) fail('copy_off', 403);
        $slides = json_decode(json_out(slides_for($d, page_access($d, $u, $role))), true);
        $uid = create_deck((int)$u['id'], mb_substr(deck_title($b + ['title' => $d['title']]), 0, 150), clean_meta($meta), $slides, $role === 'owner' ? ($d['folder_id'] ? (int)$d['folder_id'] : null) : null, !empty($b['template']));
        send_json(['ok' => true, 'uid' => $uid]);

    case 'deck.template':
        $u = writer();
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''), 'owner');
        db()->prepare('UPDATE ' . t('decks') . ' SET is_template = ? WHERE id = ?')->execute([empty($b['on']) ? 0 : 1, $d['id']]);
        send_json(['ok' => true]);

    case 'deck.leave':
        $u = writer();
        $d = deck_by_uid((string)(body()['d'] ?? ''));
        if ($d) db()->prepare('DELETE FROM ' . t('page_rules') . ' WHERE deck_id = ? AND who = ?')->execute([$d['id'], 'u:' . (int)$u['id']]);
        if ($d) db()->prepare('DELETE FROM ' . t('members') . ' WHERE deck_id = ? AND user_id = ?')->execute([$d['id'], $u['id']]);
        send_json(['ok' => true]);

    // ================================================================ sharing (owner and editors see it; the owner changes it)

    case 'share.get':
        $u = reader();
        [$d, $role] = require_deck($u, (string)($_GET['d'] ?? ''), 'editor');
        $st = db()->prepare('SELECT u.id, u.name, u.email, m.role FROM ' . t('members') . ' m JOIN ' . t('users') . ' u ON u.id = m.user_id WHERE m.deck_id = ? ORDER BY u.name');
        $st->execute([$d['id']]);
        $members = array_map(fn($m) => ['id' => (int)$m['id'], 'name' => $m['name'], 'email' => $m['email'], 'role' => $m['role'], 'color' => user_color((int)$m['id'])], $st->fetchAll());
        $st = db()->prepare('SELECT email, role FROM ' . t('invites') . ' WHERE deck_id = ? ORDER BY email');
        $st->execute([$d['id']]);
        $invites = $st->fetchAll();
        $st = db()->prepare('SELECT l.id, l.role, l.label, l.created_at, l.expires_at, l.used_at, u.name FROM ' . t('links') . ' l LEFT JOIN ' . t('users') . ' u ON u.id = l.used_by WHERE l.deck_id = ? ORDER BY l.id DESC LIMIT 50');
        $st->execute([$d['id']]);
        $links = array_map(fn($l) => ['id' => (int)$l['id'], 'role' => $l['role'], 'label' => $l['label'], 'created' => iso($l['created_at']), 'expires' => iso($l['expires_at']), 'used' => iso($l['used_at']), 'by' => $l['name']], $st->fetchAll());
        $o = user_row((int)$d['owner_id']);
        send_json(['ok' => true, 'role' => $role, 'access' => $d['access'], 'linkRole' => $d['link_role'], 'owner' => ['id' => (int)$o['id'], 'name' => $o['name'], 'email' => $o['email'], 'color' => user_color((int)$o['id'])], 'members' => $members, 'invites' => $invites, 'links' => $links]);

    case 'share.access':
        $u = writer();
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''), 'owner');
        $access = ($b['access'] ?? '') === 'link' ? 'link' : 'private';
        db()->prepare('UPDATE ' . t('decks') . ' SET access = ?, link_role = ? WHERE id = ?')->execute([$access, share_role($b), $d['id']]);
        send_json(['ok' => true]);

    case 'share.invite':
        $u = writer();
        if (too_many_attempts('invite', 40, 60)) fail('rate_limited', 429);
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''), 'owner');
        $email = mb_strtolower(s($b, 'email', 190));
        valid_email($email);
        $role = share_role($b);
        if ($email === mb_strtolower((string)$u['email'])) fail('share_self', 422);
        record_attempt('invite');
        $row = user_by_email($email);
        $known = $row && !empty($row['email_verified_at']);
        if ($known) {
            if ((int)$row['id'] === (int)$d['owner_id']) fail('share_self', 422);
            db()->prepare('INSERT INTO ' . t('members') . ' (deck_id, user_id, role, created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE role = VALUES(role)')->execute([$d['id'], $row['id'], $role, now_utc()]);
        } else {
            db()->prepare('INSERT INTO ' . t('invites') . ' (deck_id, email, role, created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE role = VALUES(role)')->execute([$d['id'], $email, $role, now_utc()]);
        }
        $set = $known ? (json_decode((string)$row['settings'], true) ?: []) : [];
        if (!empty($b['notify']) && ($set['mailShare'] ?? true) && (!$known || $row['status'] === 'active')) {
            $lang = $known ? $row['ui_lang'] : $u['ui_lang'];
            $T = mail_t($lang);
            $v = ['by' => $u['name'] . ' (' . $u['email'] . ')', 'title' => $d['title'], 'role' => $T['role_' . $role]];
            send_notice($email, $known ? $row['name'] : '', $lang, fill($T['share_subject'], ['by' => $u['name'], 'title' => $d['title']]), $T['share_title'], [fill($T['share_body'], $v), $known ? '' : $T['share_signup'], $T['share_warn']], app_url() . '?d=' . $d['uid'], $T['share_button']);
        }
        send_json(['ok' => true, 'pending' => !$known]);

    case 'share.role':
    case 'share.remove':
        $u = writer();
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''), 'owner');
        $byEmail = isset($b['email']);
        $who = [$byEmail ? mb_strtolower(s($b, 'email', 190)) : (int)($b['user'] ?? 0)];
        $table = t($byEmail ? 'invites' : 'members');
        $col = $byEmail ? 'email' : 'user_id';
        if ($r === 'share.role') db()->prepare("UPDATE $table SET role = ? WHERE deck_id = ? AND $col = ?")->execute([share_role($b), $d['id'], $who[0]]);
        else {
            db()->prepare("DELETE FROM $table WHERE deck_id = ? AND $col = ?")->execute([$d['id'], $who[0]]);
            db()->prepare('DELETE FROM ' . t('page_rules') . ' WHERE deck_id = ? AND who = ?')->execute([$d['id'], ($byEmail ? 'e:' : 'u:') . $who[0]]);
        }
        send_json(['ok' => true]);

    case 'page.rules':
        // Who can do what on the single pages (the owner only)
        $u = reader();
        [$d] = require_deck($u, (string)($_GET['d'] ?? ''), 'owner');
        $st = db()->prepare('SELECT sid, who, role FROM ' . t('page_rules') . ' WHERE deck_id = ?');
        $st->execute([$d['id']]);
        send_json(['ok' => true, 'rules' => $st->fetchAll()]);

    case 'page.rule':
        // Sets (or with role '' removes) a rule on some pages. Everyone else reads the presentation again
        $u = writer();
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''), 'owner');
        $role = (string)($b['role'] ?? '');
        if (!in_array($role, ['', 'none', 'viewer', 'commenter', 'editor'], true)) fail('bad_request', 422);
        $who = (string)($b['who'] ?? '');
        $ok = $who === '*';
        if (preg_match('/^u:(\d+)$/', $who, $m)) {
            $st = db()->prepare('SELECT COUNT(*) FROM ' . t('members') . ' WHERE deck_id = ? AND user_id = ?');
            $st->execute([$d['id'], (int)$m[1]]);
            $ok = (int)$st->fetchColumn() > 0;
        } elseif (strpos($who, 'e:') === 0) {
            $who = mb_strtolower($who);
            $st = db()->prepare('SELECT COUNT(*) FROM ' . t('invites') . ' WHERE deck_id = ? AND email = ?');
            $st->execute([$d['id'], substr($who, 2)]);
            $ok = (int)$st->fetchColumn() > 0;
        }
        $sids = array_values(array_unique(array_filter(array_slice((array)($b['pages'] ?? []), 0, MAX_SLIDES), 'valid_key')));
        if (!$ok || !$sids) fail('bad_request', 422);
        $db = db();
        $db->beginTransaction();
        $st = $db->prepare('SELECT seq FROM ' . t('decks') . ' WHERE id = ? FOR UPDATE');
        $st->execute([$d['id']]);
        $seq = (int)$st->fetchColumn() + 1;
        $has = $db->prepare('SELECT COUNT(*) FROM ' . t('slides') . ' WHERE deck_id = ? AND sid = ?');
        $set = $db->prepare($role === '' ? 'DELETE FROM ' . t('page_rules') . ' WHERE deck_id = ? AND sid = ? AND who = ?' : 'REPLACE INTO ' . t('page_rules') . ' (deck_id, sid, who, role) VALUES (?,?,?,?)');
        foreach ($sids as $sid) {
            $has->execute([$d['id'], $sid]);
            if ((int)$has->fetchColumn()) $set->execute($role === '' ? [$d['id'], $sid, $who] : [$d['id'], $sid, $who, $role]);
        }
        $db->prepare('INSERT INTO ' . t('ops') . ' (deck_id, seq, client, user_id, op, created_at) VALUES (?,?,?,?,?,?)')->execute([$d['id'], $seq, 'server', $u['id'], json_out(['k' => 'page.rules']), now_utc()]);
        $db->prepare('UPDATE ' . t('decks') . ' SET seq = ? WHERE id = ?')->execute([$seq, $d['id']]);
        $db->commit();
        send_json(['ok' => true]);

    case 'share.link':
        // A single-use link: shown once, only its hash is stored
        $u = writer();
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''), 'owner');
        $hours = in_array((int)($b['hours'] ?? 24), [1, 24, 168, 720], true) ? (int)$b['hours'] : 24;
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('links') . ' WHERE deck_id = ? AND used_at IS NULL AND expires_at > ?');
        $st->execute([$d['id'], now_utc()]);
        if ((int)$st->fetchColumn() >= 50) fail('too_many', 422);
        $token = bin2hex(random_bytes(16));
        db()->prepare('INSERT INTO ' . t('links') . ' (deck_id, token_hash, role, label, created_at, expires_at) VALUES (?,?,?,?,?,?)')->execute([$d['id'], hash('sha256', $token), share_role($b), s($b, 'label', 60), now_utc(), gmdate('Y-m-d H:i:s', time() + $hours * 3600)]);
        send_json(['ok' => true, 'id' => (int)db()->lastInsertId(), 'url' => app_url() . '?join=' . $token]);

    case 'share.unlink':
        $u = writer();
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''), 'owner');
        db()->prepare('DELETE FROM ' . t('links') . ' WHERE deck_id = ? AND id = ?')->execute([$d['id'], (int)($b['id'] ?? 0)]);
        send_json(['ok' => true]);

    case 'share.accept':
        $u = writer();
        if (too_many_attempts('join', 20, 15)) fail('rate_limited', 429);
        $hash = hash('sha256', (string)(body()['token'] ?? ''));
        db()->beginTransaction();
        $st = db()->prepare('SELECT l.*, d.uid, d.owner_id, d.status AS deck_status FROM ' . t('links') . ' l JOIN ' . t('decks') . ' d ON d.id = l.deck_id WHERE l.token_hash = ? FOR UPDATE');
        $st->execute([$hash]);
        $l = $st->fetch();
        if (!$l || $l['deck_status'] !== 'active') {
            record_attempt('join');
            fail('link_invalid', 410);
        }
        if ((int)$l['owner_id'] === (int)$u['id'] || (int)$l['used_by'] === (int)$u['id']) { // the owner trying it out does not use it up
            db()->commit();
            send_json(['ok' => true, 'uid' => $l['uid']]);
        }
        if ($l['used_at'] !== null) fail('link_used', 410);
        if (strtotime($l['expires_at'] . ' UTC') < time()) fail('link_expired', 410);
        db()->prepare('UPDATE ' . t('links') . ' SET used_by = ?, used_at = ? WHERE id = ?')->execute([$u['id'], now_utc(), $l['id']]);
        add_member((int)$l['deck_id'], (int)$u['id'], $l['role']);
        db()->commit();
        send_json(['ok' => true, 'uid' => $l['uid']]);

    // ================================================================ versions

    case 'version.list':
        $u = reader();
        $d = require_versions($u, (string)($_GET['d'] ?? ''));
        $st = db()->prepare('SELECT v.id, v.label, v.title, v.created_at, u.name FROM ' . t('versions') . ' v LEFT JOIN ' . t('users') . ' u ON u.id = v.user_id WHERE v.deck_id = ? ORDER BY v.id DESC LIMIT 100');
        $st->execute([$d['id']]);
        send_json(['ok' => true, 'versions' => array_map(fn($v) => ['id' => (int)$v['id'], 'label' => $v['label'], 'title' => $v['title'], 'by' => $v['name'] ?? '', 'at' => iso($v['created_at'])], $st->fetchAll())]);

    case 'version.get':
        $u = reader();
        $d = require_versions($u, (string)($_GET['d'] ?? ''));
        $st = db()->prepare('SELECT * FROM ' . t('versions') . ' WHERE id = ? AND deck_id = ?');
        $st->execute([(int)($_GET['id'] ?? 0), $d['id']]);
        $v = $st->fetch();
        if (!$v) fail('version_not_found', 404);
        send_json(['ok' => true, 'title' => $v['title'], 'meta' => json_decode($v['meta']), 'slides' => json_decode($v['slides'])]);

    case 'version.save':
        $u = writer();
        $b = body();
        $d = require_versions($u, (string)($b['d'] ?? ''));
        if (too_many_attempts('version', 20, 60)) fail('rate_limited', 429);
        record_attempt('version');
        send_json(['ok' => true, 'id' => save_version($d, $u, $d['title'], $d['meta'], s($b, 'label', 80) ?: '—')]);

    case 'version.restore':
        $u = writer();
        $b = body();
        $d = require_versions($u, (string)($b['d'] ?? ''));
        $st = db()->prepare('SELECT * FROM ' . t('versions') . ' WHERE id = ? AND deck_id = ?');
        $st->execute([(int)($b['id'] ?? 0), $d['id']]);
        $v = $st->fetch();
        if (!$v) fail('version_not_found', 404);
        restore_version($d, $u, $v);
        send_json(['ok' => true]);

    // ================================================================ comments and personal notes

    case 'comment.list':
        only('GET');
        $u = visitor();
        [$d, $role] = require_deck($u, (string)($_GET['d'] ?? ''));
        $acc = page_access($d, $u, $role);
        $st = db()->prepare('SELECT c.*, u.name FROM ' . t('comments') . ' c JOIN ' . t('users') . ' u ON u.id = c.user_id WHERE c.deck_id = ? ORDER BY c.id LIMIT 2000');
        $st->execute([$d['id']]);
        send_json(['ok' => true, 'comments' => array_map(fn($c) => ['id' => (int)$c['id'], 'parent' => $c['parent_id'] ? (int)$c['parent_id'] : null, 'user' => (int)$c['user_id'], 'name' => $c['name'], 'color' => user_color((int)$c['user_id']), 's' => $c['sid'], 'a' => $c['anchor'] ? json_decode($c['anchor']) : null, 'body' => $c['body'], 'resolved' => $c['resolved_at'] !== null, 'at' => iso($c['created_at'])], array_values(array_filter($st->fetchAll(), fn($c) => $c['sid'] === '' || page_role($acc, $c['sid']) !== '')))]);

    case 'comment.add':
        $u = writer();
        $b = body();
        [$d, $role] = require_deck($u, (string)($b['d'] ?? ''));
        $acc = page_access($d, $u, $role);
        $meta = json_decode($d['meta'], true) ?: [];
        if (isset($meta['opts']['comments']) && !$meta['opts']['comments']) fail('comments_off', 403);
        if (too_many_attempts('comment', 60, 10)) fail('rate_limited', 429);
        $text = multiline($b, 'body', 2000);
        if ($text === '') fail('text_required', 422);
        $parent = null;
        $thread = [];
        if (!empty($b['parent'])) {
            $st = db()->prepare('SELECT id, sid, anchor, user_id FROM ' . t('comments') . ' WHERE id = ? AND deck_id = ? AND parent_id IS NULL');
            $st->execute([(int)$b['parent'], $d['id']]);
            $thread = $st->fetch() ?: [];
            if (!$thread) fail('comment_not_found', 404);
            $parent = (int)$thread['id'];
        }
        $sid = $parent ? $thread['sid'] : (valid_key($b['s'] ?? '') ? $b['s'] : '');
        if (role_rank($sid === '' ? $role : page_role($acc, $sid)) < role_rank('commenter')) fail('forbidden', 403);
        record_attempt('comment');
        db()->prepare('INSERT INTO ' . t('comments') . ' (deck_id, parent_id, user_id, sid, anchor, body, created_at) VALUES (?,?,?,?,?,?,?)')
            ->execute([$d['id'], $parent, $u['id'], $sid, $parent ? '' : anchor($b['a'] ?? null), $text, now_utc()]);
        $cid = (int)db()->lastInsertId();
        // the owner and, in a thread, who started it
        foreach (array_unique([(int)$d['owner_id'], (int)($thread['user_id'] ?? 0)]) as $to) {
            if (!$to || $to === (int)$u['id']) continue;
            $row = user_row($to);
            $set = json_decode((string)($row['settings'] ?? ''), true) ?: [];
            if (!$row || $row['status'] !== 'active' || !($set['mailComments'] ?? true)) continue;
            // who can no longer see that page is not told what is said about it
            $his = deck_role($d, $row);
            if ($his === '' || ($sid !== '' && page_role(page_access($d, $row, $his), $sid) === '')) continue;
            $T = mail_t($row['ui_lang']);
            $v = ['by' => $u['name'], 'title' => $d['title']];
            send_notice($row['email'], $row['name'], $row['ui_lang'], fill($T['comment_subject'], $v), $T['comment_title'], [fill($T['comment_body'], $v), mb_substr($text, 0, 500)], app_url() . '?d=' . $d['uid'] . '&comments=1', $T['comment_button']);
        }
        send_json(['ok' => true, 'id' => $cid]);

    case 'comment.edit':
    case 'comment.delete':
    case 'comment.resolve':
        $u = writer();
        $b = body();
        [$d, $role] = require_deck($u, (string)($b['d'] ?? ''));
        $st = db()->prepare('SELECT * FROM ' . t('comments') . ' WHERE id = ? AND deck_id = ?');
        $st->execute([(int)($b['id'] ?? 0), $d['id']]);
        $c = $st->fetch();
        if (!$c) fail('comment_not_found', 404);
        $mine = (int)$c['user_id'] === (int)$u['id'];
        $here = $c['sid'] === '' ? $role : page_role(page_access($d, $u, $role), $c['sid']);
        if ($here === '') fail('comment_not_found', 404);
        if (role_rank($here) < role_rank('commenter')) fail('forbidden', 403);
        $editor = role_rank($here) >= role_rank('editor');
        if ($r === 'comment.edit') {
            $text = multiline($b, 'body', 2000);
            if (!$mine) fail('forbidden', 403);
            if ($text === '') fail('text_required', 422);
            db()->prepare('UPDATE ' . t('comments') . ' SET body = ? WHERE id = ?')->execute([$text, $c['id']]);
        } elseif ($r === 'comment.delete') {
            if (!$mine && $role !== 'owner') fail('forbidden', 403);
            db()->prepare('DELETE FROM ' . t('comments') . ' WHERE id = ?')->execute([$c['id']]);
        } else {
            if (!$mine && !$editor) fail('forbidden', 403);
            db()->prepare('UPDATE ' . t('comments') . ' SET resolved_at = ? WHERE id = ?')->execute([empty($b['on']) ? null : now_utc(), $c['id']]);
        }
        send_json(['ok' => true]);

    case 'note.list':
        $u = reader();
        [$d] = require_deck($u, (string)($_GET['d'] ?? ''));
        $st = db()->prepare('SELECT * FROM ' . t('notes') . ' WHERE deck_id = ? AND user_id = ? ORDER BY id');
        $st->execute([$d['id'], $u['id']]);
        send_json(['ok' => true, 'notes' => array_map(fn($n) => ['id' => (int)$n['id'], 's' => $n['sid'], 'a' => $n['anchor'] ? json_decode($n['anchor']) : null, 'body' => $n['body'], 'at' => iso($n['updated_at'])], $st->fetchAll())]);

    case 'note.save':
        $u = writer();
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''));
        $text = multiline($b, 'body', 4000);
        if ($text === '') fail('text_required', 422);
        $id = (int)($b['id'] ?? 0);
        if ($id) db()->prepare('UPDATE ' . t('notes') . ' SET body = ?, updated_at = ? WHERE id = ? AND user_id = ? AND deck_id = ?')->execute([$text, now_utc(), $id, $u['id'], $d['id']]);
        else {
            $st = db()->prepare('SELECT COUNT(*) FROM ' . t('notes') . ' WHERE user_id = ? AND deck_id = ?');
            $st->execute([$u['id'], $d['id']]);
            if ((int)$st->fetchColumn() >= 500) fail('too_many', 422);
            db()->prepare('INSERT INTO ' . t('notes') . ' (deck_id, user_id, sid, anchor, body, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')->execute([$d['id'], $u['id'], valid_key($b['s'] ?? '') ? $b['s'] : '', anchor($b['a'] ?? null), $text, now_utc(), now_utc()]);
            $id = (int)db()->lastInsertId();
        }
        send_json(['ok' => true, 'id' => $id]);

    case 'note.delete':
        $u = writer();
        db()->prepare('DELETE FROM ' . t('notes') . ' WHERE id = ? AND user_id = ?')->execute([(int)(body()['id'] ?? 0), $u['id']]);
        send_json(['ok' => true]);

    // ================================================================ pictures and search

    case 'media.upload':
        $u = writer();
        if (too_many_attempts('upload', 200, 60)) fail('rate_limited', 429);
        record_attempt('upload');
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_UPLOAD_BYTES) fail('image_big', 413);
        $bytes = (string)file_get_contents('php://input', false, null, 0, MAX_UPLOAD_BYTES + 1);
        if (strlen($bytes) > MAX_UPLOAD_BYTES) fail('image_big', 413);
        if ($bytes === '') fail('image_type', 422);
        send_json(['ok' => true, 'media' => store_picture((int)$u['id'], $bytes, clean_text((string)($_GET['name'] ?? ''), 120))]);

    // typefaces from file: the file is the body, the name comes in the address
    case 'font.list':
        $u = reader();
        $st = db()->prepare('SELECT id, name, bytes FROM ' . t('fonts') . ' WHERE user_id = ? ORDER BY name');
        $st->execute([$u['id']]);
        send_json(['ok' => true, 'fonts' => array_map(fn($f) => ['id' => $f['id'], 'name' => $f['name'], 'bytes' => (int)$f['bytes']], $st->fetchAll())]);

    case 'font.upload':
        $u = writer();
        if (too_many_attempts('font', 30, 60)) fail('rate_limited', 429);
        record_attempt('font');
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_FONT_BYTES) fail('font_big', 413);
        $bin = (string)file_get_contents('php://input', false, null, 0, MAX_FONT_BYTES + 1);
        send_json(['ok' => true, 'font' => store_font((int)$u['id'], $bin, (string)($_GET['name'] ?? ''))]);

    case 'font.delete':
        // presentations that use it fall back to an included typeface of the same kind
        $u = writer();
        $id = (string)(body()['id'] ?? '');
        $st = db()->prepare('DELETE FROM ' . t('fonts') . ' WHERE id = ? AND user_id = ?');
        $st->execute([$id, $u['id']]);
        if ($st->rowCount() && preg_match('/^[a-f0-9]{24}$/', $id)) @unlink(font_path($id));
        send_json(['ok' => true]);

    case 'media.video.begin':
        $u = writer();
        if (too_many_attempts('video', 40, 60)) fail('rate_limited', 429);
        record_attempt('video');
        $b = body();
        send_json(['ok' => true] + video_begin((int)$u['id'], clean_text($b['name'] ?? '', 120), (int)($b['size'] ?? 0)));

    case 'media.video.piece':
        $u = writer();
        $m = video_row((int)$u['id'], (string)($_GET['id'] ?? ''));
        $bytes = (string)file_get_contents('php://input', false, null, 0, VIDEO_PIECE + 1);
        if (strlen($bytes) > VIDEO_PIECE) fail('video_big', 413);
        send_json(['ok' => true, 'have' => video_piece($m, (int)($_GET['from'] ?? -1), $bytes)]);

    case 'media.video.end':
        $u = writer();
        $b = body();
        send_json(['ok' => true, 'media' => video_end((int)$u['id'], video_row((int)$u['id'], (string)($b['id'] ?? '')), (int)($b['w'] ?? 0), (int)($b['h'] ?? 0), clean_media($b['poster'] ?? ''))]);

    case 'media.video.drop':
        $u = writer();
        video_drop((int)$u['id'], (string)(body()['id'] ?? ''));
        send_json(['ok' => true]);

    case 'media.list':
        $u = reader();
        $st = db()->prepare('SELECT * FROM ' . t('media') . " WHERE user_id = ? AND mime <> 'upload' AND id NOT IN (SELECT poster FROM (SELECT poster FROM " . t('media') . " WHERE user_id = ? AND poster <> '') x) ORDER BY created_at DESC LIMIT 200");
        $st->execute([$u['id'], $u['id']]);
        send_json(['ok' => true, 'media' => array_map('media_out', $st->fetchAll()), ] + space_out($u, media_used((int)$u['id']), (int)config_value('quota')));

    case 'media.delete':
        $u = writer();
        $id = (string)(body()['id'] ?? '');
        $st = db()->prepare('SELECT poster FROM ' . t('media') . ' WHERE id = ? AND user_id = ?');
        $st->execute([$id, $u['id']]);
        $poster = (string)$st->fetchColumn(); // the still of a video goes with it
        $st = db()->prepare('DELETE FROM ' . t('media') . ' WHERE id IN (?, ?) AND user_id = ?');
        $st->execute([$id, $poster, $u['id']]);
        if ($st->rowCount()) delete_media_files(array_filter([$id, $poster]));
        send_json(['ok' => true]);

    case 'search':
        $u = reader();
        if (too_many_attempts('search', 300, 10)) fail('rate_limited', 429);
        record_attempt('search');
        $q = s($_GET, 'q', 100);
        if (mb_strlen($q) < 2) fail('text_required', 422);
        $res = search_media(($_GET['kind'] ?? '') === 'video' ? 'video' : 'image', (string)($_GET['source'] ?? ''), $q, max(1, min(20, (int)($_GET['page'] ?? 1))), !empty($_GET['free']));
        if (!$res) fail('search_failed', 502);
        send_json(['ok' => true] + search_public($res));

    case 'search.thumb':
        // The previews go through the server too
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
        send_json(['ok' => true, 'media' => store_picture((int)$u['id'], $bytes, mb_substr($i['title'], 0, 120), $credit), 'credit' => $credit, 'page' => $i['page'], 'video' => $i['video'] ?? null]);

    case 'media.poster':
        // The still of a YouTube or Vimeo video (shown before it plays and in the exported files)
        $u = writer();
        if (too_many_attempts('upload', 200, 60)) fail('rate_limited', 429);
        record_attempt('upload');
        $b = body();
        $id = (string)($b['vid'] ?? '');
        $bytes = null;
        if (($b['kind'] ?? '') === 'youtube' && preg_match('/^[A-Za-z0-9_-]{11}$/', $id)) {
            $bytes = http_get("https://i.ytimg.com/vi/$id/maxresdefault.jpg") ?? http_get("https://i.ytimg.com/vi/$id/hqdefault.jpg");
        } elseif (($b['kind'] ?? '') === 'vimeo' && preg_match('/^\d{6,12}$/', $id)) {
            $o = http_json('https://vimeo.com/api/oembed.json?width=1280&url=' . rawurlencode('https://vimeo.com/' . $id));
            if (!empty($o['thumbnail_url']) && preg_match('~^https://i\.vimeocdn\.com/~', (string)$o['thumbnail_url'])) $bytes = http_get((string)$o['thumbnail_url']);
        }
        if (!$bytes) fail('import_failed', 502);
        send_json(['ok' => true, 'media' => store_picture((int)$u['id'], $bytes, 'video')]);

    // ================================================================ reports

    case 'report.create':
        only('POST');
        $u = visitor();
        if ($u) require_csrf($u);
        if (too_many_attempts('report', 5, 60)) fail('rate_limited', 429);
        $b = body();
        [$d] = require_deck($u, (string)($b['d'] ?? ''));
        if (!in_array($b['reason'] ?? '', BLOCK_REASONS, true)) fail('bad_request', 422);
        record_attempt('report');
        db()->prepare('INSERT INTO ' . t('reports') . ' (deck_id, user_id, reason, note, created_at) VALUES (?,?,?,?,?)')->execute([$d['id'], $u['id'] ?? null, $b['reason'], multiline($b, 'note', 1000), now_utc()]);
        send_json(['ok' => true]);

    // ================================================================ master admin

    case 'admin.overview':
        require_master();
        $one = fn(string $sql) => (int)db()->query($sql)->fetchColumn();
        $days = db()->query('SELECT DATE(created_at) d, COUNT(*) n FROM ' . t('users') . ' WHERE created_at > UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY d')->fetchAll(PDO::FETCH_KEY_PAIR);
        $decksDays = db()->query('SELECT DATE(created_at) d, COUNT(*) n FROM ' . t('decks') . ' WHERE created_at > UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY d')->fetchAll(PDO::FETCH_KEY_PAIR);
        $series = [];
        for ($i = 29; $i >= 0; $i--) {
            $day = gmdate('Y-m-d', time() - $i * 86400);
            $series[] = ['day' => $day, 'users' => (int)($days[$day] ?? 0), 'decks' => (int)($decksDays[$day] ?? 0)];
        }
        send_json(['ok' => true, 'users' => $one('SELECT COUNT(*) FROM ' . t('users')), 'unverified' => $one('SELECT COUNT(*) FROM ' . t('users') . ' WHERE email_verified_at IS NULL'), 'blocked' => $one('SELECT COUNT(*) FROM ' . t('users') . " WHERE status = 'blocked'"),
            'active7' => $one('SELECT COUNT(DISTINCT user_id) FROM ' . t('auth_tokens') . ' WHERE last_seen_at > UTC_TIMESTAMP() - INTERVAL 7 DAY'), 'decks' => $one('SELECT COUNT(*) FROM ' . t('decks')), 'public' => $one('SELECT COUNT(*) FROM ' . t('decks') . " WHERE access = 'link' AND status = 'active'"),
            'slides' => $one('SELECT COUNT(*) FROM ' . t('slides')), 'suspended' => $one('SELECT COUNT(*) FROM ' . t('decks') . " WHERE status = 'suspended'"), 'media' => $one('SELECT COUNT(*) FROM ' . t('media')), 'bytes' => $one('SELECT COALESCE(SUM(bytes),0) FROM ' . t('media')),
            'reports' => $one('SELECT COUNT(*) FROM ' . t('reports') . " WHERE status = 'open'"), 'online' => $one('SELECT COUNT(DISTINCT client) FROM ' . t('presence') . ' WHERE seen_at > UTC_TIMESTAMP() - INTERVAL 30 SECOND'), 'series' => $series]);

    case 'admin.users':
        require_master();
        $q = '%' . addcslashes(s($_GET, 'q', 80), '%_\\') . '%';
        $f = (string)($_GET['f'] ?? '');
        $where = $f === 'blocked' ? " AND u.status = 'blocked'" : ($f === 'unverified' ? ' AND u.email_verified_at IS NULL' : '');
        $page = max(0, (int)($_GET['page'] ?? 0));
        $st = db()->prepare('SELECT u.*, (SELECT COUNT(*) FROM ' . t('decks') . ' d WHERE d.owner_id = u.id) AS n_decks, (SELECT COALESCE(SUM(m.bytes),0) FROM ' . t('media') . ' m WHERE m.user_id = u.id) AS bytes,
            (SELECT COUNT(*) FROM ' . t('reports') . ' r JOIN ' . t('decks') . " d ON d.id = r.deck_id WHERE d.owner_id = u.id) AS n_reports FROM " . t('users') . " u WHERE (u.name LIKE ? OR u.email LIKE ?)$where ORDER BY u.id DESC LIMIT 51 OFFSET " . $page * 50);
        $st->execute([$q, $q]);
        $rows = $st->fetchAll();
        send_json(['ok' => true, 'more' => count($rows) > 50, 'users' => array_map(fn($x) => ['id' => (int)$x['id'], 'name' => $x['name'], 'email' => $x['email'], 'verified' => !empty($x['email_verified_at']), 'google' => !empty($x['google_sub']), 'master' => is_master($x), 'status' => $x['status'], 'reason' => $x['block_reason'], 'note' => $x['block_note'],
            'created' => iso($x['created_at']), 'seen' => iso($x['last_login_at']), 'decks' => (int)$x['n_decks'], 'bytes' => (int)$x['bytes'], 'reports' => (int)$x['n_reports']], array_slice($rows, 0, 50))]);

    case 'admin.user':
        only('POST');
        $u = require_master();
        $b = body();
        $row = user_row((int)($b['id'] ?? 0));
        if (!$row) fail('user_not_found', 404);
        if (is_master($row)) fail('admin_protected', 403);
        $T = mail_t($row['ui_lang']);
        switch ((string)($b['do'] ?? '')) {
            case 'block':
                $reason = (string)($b['reason'] ?? '');
                if (!in_array($reason, BLOCK_REASONS, true)) fail('bad_request', 422);
                $note = multiline($b, 'note', 500);
                db()->prepare('UPDATE ' . t('users') . " SET status = 'blocked', block_reason = ?, block_note = ?, blocked_at = ? WHERE id = ?")->execute([$reason, $note, now_utc(), $row['id']]);
                db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$row['id']]);
                db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ?')->execute([$row['id']]);
                db()->prepare('DELETE FROM ' . t('presence') . ' WHERE user_id = ?')->execute([$row['id']]);
                audit($u, 'block', $row['email'], $reason . ($note !== '' ? ': ' . $note : ''));
                if (!empty($b['notify'])) send_notice($row['email'], $row['name'], $row['ui_lang'], $T['block_subject'], $T['block_title'], [fill($T['block_body'], ['reason' => $T['reason_' . $reason]]), $T['block_contact']]);
                break;
            case 'unblock':
                db()->prepare('UPDATE ' . t('users') . " SET status = 'active', block_reason = '', block_note = '', blocked_at = NULL WHERE id = ?")->execute([$row['id']]);
                audit($u, 'unblock', $row['email']);
                if (!empty($b['notify'])) send_notice($row['email'], $row['name'], $row['ui_lang'], $T['unblock_subject'], $T['unblock_title'], [$T['unblock_body']], app_url(), 'SavPresentations');
                break;
            case 'signout':
                db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$row['id']]);
                audit($u, 'signout', $row['email']);
                break;
            case 'delete':
                if (mb_strtolower(s($b, 'confirm', 190)) !== mb_strtolower($row['email'])) fail('email_mismatch', 422);
                audit($u, 'delete_user', 'user #' . $row['id']);
                delete_user((int)$row['id']);
                break;
            default:
                fail('bad_request', 422);
        }
        send_json(['ok' => true]);

    case 'admin.decks':
        require_master();
        $q = '%' . addcslashes(s($_GET, 'q', 80), '%_\\') . '%';
        $f = (string)($_GET['f'] ?? '');
        $where = $f === 'public' ? " AND d.access = 'link'" : ($f === 'suspended' ? " AND d.status = 'suspended'" : ($f === 'reported' ? ' AND EXISTS (SELECT 1 FROM ' . t('reports') . " r WHERE r.deck_id = d.id AND r.status = 'open')" : ''));
        $owner = (int)($_GET['owner'] ?? 0);
        if ($owner) $where .= ' AND d.owner_id = ' . $owner;
        $page = max(0, (int)($_GET['page'] ?? 0));
        $st = db()->prepare('SELECT d.*, u.name AS owner_name, u.email, (SELECT COUNT(*) FROM ' . t('slides') . ' s WHERE s.deck_id = d.id) AS n_slides, (SELECT COUNT(*) FROM ' . t('members') . ' m WHERE m.deck_id = d.id) AS members, (SELECT COUNT(*) FROM ' . t('reports') . " r WHERE r.deck_id = d.id AND r.status = 'open') AS n_reports
            FROM " . t('decks') . ' d JOIN ' . t('users') . " u ON u.id = d.owner_id WHERE (d.title LIKE ? OR u.email LIKE ? OR d.uid = ?)$where ORDER BY d.updated_at DESC LIMIT 51 OFFSET " . $page * 50);
        $st->execute([$q, $q, s($_GET, 'q', 80)]);
        $rows = $st->fetchAll();
        send_json(['ok' => true, 'more' => count($rows) > 50, 'decks' => array_map(fn($x) => ['uid' => $x['uid'], 'title' => $x['title'], 'owner' => $x['owner_name'], 'email' => $x['email'], 'access' => $x['access'], 'linkRole' => $x['link_role'], 'status' => $x['status'], 'note' => $x['suspend_note'], 'slides' => (int)$x['n_slides'], 'members' => (int)$x['members'], 'reports' => (int)$x['n_reports'], 'updated' => iso($x['updated_at'])], array_slice($rows, 0, 50))]);

    case 'admin.deck':
        only('POST');
        $u = require_master();
        $b = body();
        $d = deck_by_uid((string)($b['d'] ?? ''));
        if (!$d) fail('deck_not_found', 404);
        $on = ($b['do'] ?? '') === 'suspend';
        db()->prepare('UPDATE ' . t('decks') . ' SET status = ?, suspend_note = ? WHERE id = ?')->execute([$on ? 'suspended' : 'active', $on ? multiline($b, 'note', 300) : '', $d['id']]);
        audit($u, $on ? 'suspend' : 'unsuspend', $d['title'] . ' (' . $d['uid'] . ')', $on ? multiline($b, 'note', 300) : '');
        send_json(['ok' => true]);

    case 'admin.view':
        // Private presentations stay private: admins can only look at the public ones and at the reported ones, and it is written down
        $u = require_master();
        $d = deck_by_uid((string)($_GET['d'] ?? ''));
        if (!$d) fail('deck_not_found', 404);
        $st = db()->prepare('SELECT COUNT(*) FROM ' . t('reports') . ' WHERE deck_id = ?');
        $st->execute([$d['id']]);
        $reported = (int)$st->fetchColumn() > 0;
        if ($d['access'] !== 'link' && !$reported) fail('admin_private', 403); // of a public one, only the pages everybody sees
        audit($u, 'view', $d['title'] . ' (' . $d['uid'] . ')');
        send_json(['ok' => true, 'title' => $d['title'], 'meta' => json_decode($d['meta']), 'slides' => slides_for($d, $reported ? ['role' => 'owner'] : page_access($d, null, 'viewer'))]);

    case 'admin.reports':
        require_master();
        $open = ($_GET['f'] ?? 'open') !== 'closed';
        $st = db()->prepare('SELECT r.*, d.uid, d.title, d.status AS deck_status, o.id AS owner_id, o.name AS owner_name, o.email AS owner_email, o.status AS owner_status, u.email AS reporter FROM ' . t('reports') . ' r JOIN ' . t('decks') . ' d ON d.id = r.deck_id JOIN ' . t('users') . ' o ON o.id = d.owner_id LEFT JOIN ' . t('users') . ' u ON u.id = r.user_id WHERE r.status = ? ORDER BY r.id DESC LIMIT 200');
        $st->execute([$open ? 'open' : 'closed']);
        send_json(['ok' => true, 'reports' => array_map(fn($x) => ['id' => (int)$x['id'], 'reason' => $x['reason'], 'note' => $x['note'], 'at' => iso($x['created_at']), 'uid' => $x['uid'], 'title' => $x['title'], 'deckStatus' => $x['deck_status'], 'owner' => ['id' => (int)$x['owner_id'], 'name' => $x['owner_name'], 'email' => $x['owner_email'], 'status' => $x['owner_status']], 'reporter' => $x['reporter']], $st->fetchAll())]);

    case 'admin.report':
        only('POST');
        $u = require_master();
        $b = body();
        db()->prepare('UPDATE ' . t('reports') . ' SET status = ? WHERE id = ?')->execute([empty($b['close']) ? 'open' : 'closed', (int)($b['id'] ?? 0)]);
        audit($u, empty($b['close']) ? 'report_open' : 'report_close', '#' . (int)($b['id'] ?? 0));
        send_json(['ok' => true]);

    case 'admin.log':
        require_master();
        $rows = db()->query('SELECT a.*, u.name FROM ' . t('audit') . ' a LEFT JOIN ' . t('users') . ' u ON u.id = a.admin_id ORDER BY a.id DESC LIMIT 200')->fetchAll();
        send_json(['ok' => true, 'log' => array_map(fn($x) => ['at' => iso($x['created_at']), 'by' => $x['name'] ?? '', 'action' => $x['action'], 'target' => $x['target'], 'note' => $x['note']], $rows)]);

    default:
        fail('not_found', 404);
}

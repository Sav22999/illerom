<?php
/**
 * SavSplits — JSON API.  api/index.php?r=<action>
 *
 * Accounts:  the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login (and the
 *            routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *            auth.reset, auth.profile, auth.export, auth.delete
 * Groups:    splits.init, splits.prefs, splits.groups, splits.group, splits.group.create, splits.group.save,
 *            splits.group.delete, splits.group.archive, splits.group.link, splits.import
 * People:    splits.member.save, splits.member.delete, splits.member.claim (an account becomes one of the people),
 *            splits.member.leave
 * Expenses:  splits.expense.save, splits.expense.delete, splits.expense.restore, splits.log, splits.rate
 * Photos:    splits.photo.upload (the body is the image itself), splits.photo (the image, to whoever can open the group)
 * Budget:    splits.mine (the share of the account in the expenses of all its groups, its caps and keywords),
 *            splits.budget.save, splits.expense.import (the rows of a bank statement, read in the browser)
 *
 * A group is reached by its id (gid, for an account that owns it or is one of its people) or by its link (code, for
 * anybody: without an account, to look or also to add, as the owner chose). Every POST of a signed-in person needs the
 * X-CSRF-Token header (given at sign-in); a guest of a link has no session to protect.
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/splits.php';
require __DIR__ . '/../lib/photos.php';
require __DIR__ . '/../lib/budget.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavSplits API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false]);
if (!credentials()) fail('not_installed', 503);

// a photo travels as itself (the body is the image); everything else is JSON
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $r !== 'splits.photo.upload' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) fail('bad_request', 415);
remember_app_url();

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}


// ---------- One space for the whole of SavOffice: the space of SavDrive (../savdrive/lib/space.php)

require_once dirname(__DIR__, 2) . '/savdrive/lib/space.php';
const SPACE_APP = 'savsplits';

/** What a person keeps in SavSplits: the groups they own, with their expenses. It counts in their space of SavOffice. */
function space_bytes(array $u): int
{
    return split_bytes((int)$u['id']);
}

/** Whether the account $uid (the owner of the group, also when someone else is writing) can keep $more bytes more. */
function space_allows_id(int $uid, int $more): bool
{
    $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE id = ?');
    $st->execute([$uid]);
    $o = $st->fetch();
    return !$o || savspace_allows((string)$o['email'], SPACE_APP, $more, space_bytes($o));
}

/**
 * A POST about a group, by an account or by a guest of its link: a signed-in person sends the CSRF token (a page
 * elsewhere cannot write with their session); a guest is limited by address. What grows counts in the owner's space.
 */
function poster(): array
{
    only('POST');
    $u = current_user();
    if ($u) require_csrf($u);
    $b = body();
    if (!empty($b['code']) && !$u) {
        if (too_many_attempts('split_write', 400, 10)) fail('rate_limited', 429);
        record_attempt('split_write');
    }
    return $b;
}

function grows(array $a): void
{
    $len = max(0, (int)($_SERVER['CONTENT_LENGTH'] ?? 0));
    if ($len > 0 && !space_allows_id((int)$a['group']['owner_id'], $len)) fail('quota', 413);
}

/** The day of the person who asks (the copies of the repeated expenses are made up to it): one day around UTC at most. */
function today_of(array $src): string
{
    $d = valid_day($src['today'] ?? '');
    $utc = gmdate('Y-m-d');
    if (!$d) return $utc;
    $diff = (strtotime($d . ' UTC') - strtotime($utc . ' UTC')) / 86400;
    return abs($diff) <= 1 ? $d : $utc;
}

/** The group again, as the app keeps it, after a change (the access is asked again: a role may have changed). */
function send_group(array $src): void
{
    send_json(['ok' => true] + group_payload(access($src)));
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
    'name' => 'SavSplits', 'cookie' => 'savsplits', 'lang' => fn() => identity_lang(),
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
        // Everything SavSplits keeps of the account, as one JSON file: its settings and the groups it owns or belongs to
        $u = reader();
        $groups = [];
        foreach (groups_of($u) as $x) {
            $g = group_by_gid($x['id']);
            $p = group_payload(['group' => $g, 'role' => $x['owner'] ? 'owner' : 'viewer', 'member' => null, 'user' => $u, 'via' => 'account']);
            unset($p['group']['link'], $p['settle']);
            $groups[] = $p;
        }
        header('Content-Disposition: attachment; filename="savsplits-data.json"');
        send_json(['app' => 'SavSplits', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => (object)profile_prefs(profile($u)), 'budget' => out_budget(budget_row((int)$u['id'])), 'groups' => $groups]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        // the groups it owns go with it (the tables reference the account): first the files of their photos
        delete_group_photos(q('SELECT id FROM ' . t('split_groups') . ' WHERE owner_id = ?', [$u['id']])->fetchAll(PDO::FETCH_COLUMN));
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);


    // ================================================================ groups

    case 'splits.init':
        // What the app needs to start: the settings of the account and the currencies
        $u = reader();
        send_json(['ok' => true, 'prefs' => (object)profile_prefs(profile($u)), 'currencies' => CURRENCIES, 'capCats' => cap_categories((int)$u['id'])]);

    case 'splits.prefs':
        $u = writer();
        profile($u);
        $p = body()['prefs'] ?? [];
        if (!is_array($p) || strlen(json_out($p)) > 4000) fail('bad_request', 422);
        q('UPDATE ' . t('split_profiles') . ' SET prefs = ? WHERE user_id = ?', [json_out((object)$p), $u['id']]);
        send_json(['ok' => true]);

    case 'splits.groups':
        // the groups, and how many categories are over their monthly cap (month: the one of the person, YYYY-MM)
        $u = reader();
        $month = is_string($_GET['month'] ?? null) && preg_match('/^\d{4}-\d{2}$/', $_GET['month']) ? $_GET['month'] : gmdate('Y-m');
        send_json(['ok' => true, 'groups' => groups_of($u), 'capsOver' => caps_over($u, $month), 'capCats' => cap_categories((int)$u['id'])]);

    case 'splits.group':
        // One group, by its id or its link. The repeated expenses whose day has come are made now
        only('GET');
        $a = access($_GET);
        make_repeats($a['group'], today_of($_GET));
        // the deleted expenses can come back for 30 days, then they are gone
        if (random_int(1, 10) === 1) {
            q('DELETE FROM ' . t('split_expenses') . ' WHERE group_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?', [$a['group']['id'], gmdate('Y-m-d H:i:s', time() - 30 * 86400)]);
            tidy_photos((int)$a['group']['id']); // with their photos, and the photos of expenses never saved
        }
        send_json(['ok' => true] + group_payload($a));

    case 'splits.group.create':
        $u = writer();
        $g = create_group($u, body());
        send_group(['id' => $g['gid']]);

    case 'splits.group.save':
        // Name, look, notes and tables: the owner and the people with an account who may write. The currency only by
        // the owner, and only while the group has no expenses (the balances are in it)
        $b = poster();
        $a = access($b, true);
        if ($a['via'] !== 'account') fail('forbidden', 403);
        $g = $a['group'];
        $name = s($b, 'name', 80);
        if ($name === '') fail('name_required', 422);
        $cur = valid_currency($b['currency'] ?? '') ?: $g['currency'];
        if ($cur !== $g['currency']) {
            if ($a['role'] !== 'owner') fail('forbidden', 403);
            if (q('SELECT 1 FROM ' . t('split_expenses') . ' WHERE group_id = ? LIMIT 1', [$g['id']])->fetchColumn()) fail('currency_locked', 409);
        }
        $tables = array_key_exists('tables', $b) ? clean_tables($b['tables']) : jdec($g['tables']);
        // a personal group stays personal, and a shared one never becomes personal (it has, or had, other people)
        $kind = pick($b, 'kind', GROUP_KINDS, $g['kind']);
        if ($g['kind'] === 'personal' || $kind === 'personal') $kind = $g['kind'];
        q('UPDATE ' . t('split_groups') . ' SET name = ?, kind = ?, icon = ?, color = ?, currency = ?, notes = ?, tables = ? WHERE id = ?',
            [$name, $kind, pick($b, 'icon', GROUP_ICONS, $g['icon']),
                valid_color($b['color'] ?? '', $g['color']), $cur, array_key_exists('notes', $b) ? multiline($b, 'notes', 2000) : (string)$g['notes'], json_out($tables), $g['id']]);
        log_event($a, $b, 'group.edit', null, ['name' => $name]);
        send_group($b);

    case 'splits.group.delete':
        // Only the owner, with everything in it, for everybody
        $u = writer();
        $a = access(body(), true);
        if ($a['role'] !== 'owner') fail('forbidden', 403);
        delete_group_photos([(int)$a['group']['id']]);
        q('DELETE FROM ' . t('split_groups') . ' WHERE id = ?', [$a['group']['id']]);
        send_json(['ok' => true]);

    case 'splits.group.archive':
        // Archived for this account only (its person keeps the mark): the others still see it among theirs
        $u = writer();
        $b = body();
        $a = access($b);
        if (!$a['member']) fail('no_member', 409);
        q('UPDATE ' . t('split_members') . ' SET archived = ? WHERE id = ?', [!empty($b['archived']) ? 1 : 0, $a['member']['id']]);
        send_group($b);

    case 'splits.group.link':
        // The link of the group: on or off, to look or to add too, or a new one (the old one stops working)
        $u = writer();
        $b = body();
        $a = access($b, true);
        if ($a['via'] !== 'account') fail('forbidden', 403);
        $g = $a['group'];
        if ($g['kind'] === 'personal') fail('personal_group', 409);
        $code = $g['link_code'];
        if (array_key_exists('on', $b)) $code = !empty($b['on']) ? ($code ?: new_link_code()) : null;
        if (!empty($b['renew']) && $code) $code = new_link_code();
        $role = in_array($b['role'] ?? '', ['view', 'edit'], true) ? $b['role'] : $g['link_role'];
        q('UPDATE ' . t('split_groups') . ' SET link_code = ?, link_role = ? WHERE id = ?', [$code, $role, $g['id']]);
        log_event($a, $b, 'group.link', null, ['on' => (bool)$code, 'role' => $role, 'renew' => !empty($b['renew'])]);
        send_group($b);

    case 'splits.import':
        // A .savspl file becomes a new group of the account, with its people and its expenses
        $u = writer();
        $d = body()['data'] ?? null;
        if (!is_array($d) || ($d['format'] ?? '') !== 'savspl' || !is_array($d['group'] ?? null)) fail('file_invalid', 422);
        $gr = $d['group'];
        $g = create_group($u, ['name' => $gr['name'] ?? '', 'kind' => $gr['kind'] ?? '', 'icon' => $gr['icon'] ?? '', 'color' => $gr['color'] ?? '', 'currency' => $gr['currency'] ?? '',
            'notes' => $gr['notes'] ?? '', 'tables' => $gr['tables'] ?? [], 'members' => is_array($d['members'] ?? null) ? $d['members'] : []], is_array($d['expenses'] ?? null) ? $d['expenses'] : [], true);
        send_group(['id' => $g['gid']]);


    // ================================================================ people

    case 'splits.member.save':
        // A new person, or one changed: name, default share, shares in the tables, how to pay them. Whether someone with
        // an account may only look or also write: only the owner decides
        $b = poster();
        $a = access($b, true);
        $g = $a['group'];
        $members = members_of((int)$g['id']);
        $name = s($b, 'name', 80);
        if ($name === '') fail('name_required', 422);
        $mid = valid_code($b['mid'] ?? '');
        $m = null;
        foreach ($members as $x) if ($x['mid'] === $mid) $m = $x;
        if ($mid && !$m) fail('not_found', 404);
        foreach ($members as $x) if ($x['mid'] !== $mid && mb_strtolower($x['name']) === mb_strtolower($name)) fail('name_taken', 409);
        $tables = jdec($g['tables']);
        $weight = is_numeric($b['weight'] ?? null) ? max(0, min(1e6, round((float)$b['weight'], 4))) : (float)($m['weight'] ?? 1);
        $quotas = array_key_exists('quotas', $b) ? clean_quotas($b['quotas'], $tables) : jdec($m['quotas'] ?? '');
        $pay = array_key_exists('pay', $b) ? s($b, 'pay', 300) : (string)($m['pay'] ?? '');
        if ($m) {
            $role = $m['role'];
            if (in_array($b['role'] ?? '', ['editor', 'viewer'], true) && $a['role'] === 'owner') $role = $b['role'];
            $active = array_key_exists('active', $b) ? (!empty($b['active']) ? 1 : 0) : (int)$m['active'];
            q('UPDATE ' . t('split_members') . ' SET name = ?, weight = ?, quotas = ?, pay = ?, role = ?, active = ? WHERE id = ?', [$name, $weight, json_out((object)$quotas), $pay, $role, $active, $m['id']]);
            log_event($a, $b, 'member.edit', $mid, ['name' => $name, 'was' => $m['name'] !== $name ? $m['name'] : null]);
        } else {
            if ($g['kind'] === 'personal') fail('personal_group', 409);
            if (count($members) >= MAX_MEMBERS) fail('too_many_members', 409);
            grows($a);
            $mid = new_code('split_members', 'mid');
            q('INSERT INTO ' . t('split_members') . ' (mid, group_id, name, weight, quotas, pay, position, created_at) VALUES (?,?,?,?,?,?,?,?)',
                [$mid, $g['id'], $name, $weight, json_out((object)$quotas), $pay, count($members), now_utc()]);
            log_event($a, $b, 'member.add', $mid, ['name' => $name]);
        }
        send_json(['ok' => true, 'mid' => $mid] + group_payload(access($b)));

    case 'splits.member.delete':
        // A person who never paid nor owed anything goes away; one who did stays in the history, as gone (not active)
        $b = poster();
        $a = access($b, true);
        $g = $a['group'];
        $mid = valid_code($b['mid'] ?? '');
        $m = q('SELECT * FROM ' . t('split_members') . ' WHERE group_id = ? AND mid = ?', [$g['id'], $mid])->fetch();
        if (!$m) fail('not_found', 404);
        if ($m['user_id'] !== null && (int)$m['user_id'] === (int)$g['owner_id']) fail('owner_stays', 409);
        $used = (bool)q('SELECT 1 FROM ' . t('split_expenses') . ' WHERE group_id = ? AND (payers LIKE ? OR alloc LIKE ?) LIMIT 1', [$g['id'], '%"' . $mid . '"%', '%"' . $mid . '"%'])->fetchColumn();
        if ($used) q('UPDATE ' . t('split_members') . ' SET active = 0, user_id = NULL WHERE id = ?', [$m['id']]);
        else q('DELETE FROM ' . t('split_members') . ' WHERE id = ?', [$m['id']]);
        log_event($a, $b, 'member.remove', $mid, ['name' => $m['name'], 'kept' => $used]);
        send_json(['ok' => true, 'kept' => $used] + group_payload(access($b)));

    case 'splits.member.claim':
        // A signed-in account becomes one of the people (opened from the link, or a group of its own): one already there
        // and free, or a new one with its name. Then it finds the group among its own
        $u = writer();
        $b = body();
        $a = access($b);
        $g = $a['group'];
        if ($a['member']) fail('already_member', 409);
        if ($g['kind'] === 'personal') fail('personal_group', 409);
        $mid = valid_code($b['mid'] ?? '');
        if ($mid) {
            $m = q('SELECT * FROM ' . t('split_members') . ' WHERE group_id = ? AND mid = ?', [$g['id'], $mid])->fetch();
            if (!$m) fail('not_found', 404);
            if ($m['user_id'] !== null) fail('member_taken', 409);
        } else {
            if ($a['role'] === 'viewer') fail('forbidden', 403);
            $name = s($b, 'name', 80) ?: mb_substr((string)$u['name'], 0, 80);
            $members = members_of((int)$g['id']);
            if (count($members) >= MAX_MEMBERS) fail('too_many_members', 409);
            foreach ($members as $x) if (mb_strtolower($x['name']) === mb_strtolower($name)) fail('name_taken', 409);
            $mid = new_code('split_members', 'mid');
            q('INSERT INTO ' . t('split_members') . ' (mid, group_id, name, position, created_at) VALUES (?,?,?,?,?)', [$mid, $g['id'], $name, count($members), now_utc()]);
            $m = q('SELECT * FROM ' . t('split_members') . ' WHERE mid = ?', [$mid])->fetch();
        }
        q('UPDATE ' . t('split_members') . ' SET user_id = ?, role = ?, active = 1 WHERE id = ?', [$u['id'], $a['role'] === 'viewer' ? 'viewer' : 'editor', $m['id']]);
        $a['member'] = $m;
        log_event($a, $b, 'member.join', $mid, ['name' => $m['name']]);
        send_group(['id' => $g['gid']]);

    case 'splits.member.leave':
        // The account is no longer one of the people (the person and what they paid stay). The owner cannot leave
        $u = writer();
        $b = body();
        $a = access($b);
        if ($a['role'] === 'owner') fail('owner_stays', 409);
        if (!$a['member']) fail('no_member', 409);
        q('UPDATE ' . t('split_members') . ' SET user_id = NULL, archived = 0 WHERE id = ?', [$a['member']['id']]);
        log_event($a, $b, 'member.leave', $a['member']['mid'], ['name' => $a['member']['name']]);
        send_json(['ok' => true]);


    // ================================================================ expenses

    case 'splits.expense.save':
        // A new expense, or one changed (with eid): checked, and what each one paid and owes worked out (lib/splits.php)
        $b = poster();
        $a = access($b, true);
        $g = $a['group'];
        $c = clean_expense($b, $g, members_of((int)$g['id']));
        $eid = valid_code($b['eid'] ?? '');
        $who = mb_substr(who($a, $b), 0, 80);
        if ($eid) {
            $old = q('SELECT * FROM ' . t('split_expenses') . ' WHERE group_id = ? AND eid = ? AND deleted_at IS NULL', [$g['id'], $eid])->fetch();
            if (!$old) fail('not_found', 404);
            $next = null;
            if ($c['repeat_rule'] !== '') $next = $old['repeat_rule'] === $c['repeat_rule'] && $old['day'] === $c['day'] && $old['repeat_next'] ? $old['repeat_next'] : next_day($c['day'], $c['repeat_rule']);
            q('UPDATE ' . t('split_expenses') . ' SET kind = ?, title = ?, category = ?, day = ?, amount = ?, currency = ?, rate = ?, base = ?, payers = ?, split = ?, paid = ?, alloc = ?, notes = ?, repeat_rule = ?, repeat_next = ?, updated_at = ? WHERE id = ?',
                [$c['kind'], $c['title'], $c['category'], $c['day'], $c['amount'], $c['currency'], $c['rate'], $c['base'], $c['payers'], $c['split'], $c['paid'], $c['alloc'], $c['notes'], $c['repeat_rule'], $next, now_utc(), $old['id']]);
            log_event($a, $b, 'expense.edit', $eid, ['kind' => $c['kind'], 'title' => $c['title'], 'base' => $c['base'], 'was' => (int)$old['base'] !== $c['base'] ? (int)$old['base'] : null]);
        } else {
            if ((int)q('SELECT COUNT(*) FROM ' . t('split_expenses') . ' WHERE group_id = ?', [$g['id']])->fetchColumn() >= MAX_EXPENSES) fail('too_many_expenses', 409);
            grows($a);
            $eid = new_code('split_expenses', 'eid');
            q('INSERT INTO ' . t('split_expenses') . ' (eid, group_id, kind, title, category, day, amount, currency, rate, base, payers, split, paid, alloc, notes, repeat_rule, repeat_next, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                [$eid, $g['id'], $c['kind'], $c['title'], $c['category'], $c['day'], $c['amount'], $c['currency'], $c['rate'], $c['base'], $c['payers'], $c['split'], $c['paid'], $c['alloc'], $c['notes'], $c['repeat_rule'],
                    $c['repeat_rule'] ? next_day($c['day'], $c['repeat_rule']) : null, $who, now_utc(), now_utc()]);
            log_event($a, $b, 'expense.add', $eid, ['kind' => $c['kind'], 'title' => $c['title'], 'base' => $c['base']]);
        }
        if (array_key_exists('photos', $b)) attach_photos((int)$g['id'], $eid, $b['photos']);
        make_repeats($g, today_of($b));
        send_json(['ok' => true, 'eid' => $eid] + group_payload(access($b)));

    case 'splits.expense.delete':
    case 'splits.expense.restore':
        // Deleted, it stays a while and can come back (the history keeps it); restored, it counts again
        $b = poster();
        $a = access($b, true);
        $g = $a['group'];
        $del = $r === 'splits.expense.delete';
        $e = q('SELECT * FROM ' . t('split_expenses') . ' WHERE group_id = ? AND eid = ? AND deleted_at IS ' . ($del ? 'NULL' : 'NOT NULL'), [$g['id'], valid_code($b['eid'] ?? '')])->fetch();
        if (!$e) fail('not_found', 404);
        q('UPDATE ' . t('split_expenses') . ' SET deleted_at = ? WHERE id = ?', [$del ? now_utc() : null, $e['id']]);
        log_event($a, $b, $del ? 'expense.delete' : 'expense.restore', $e['eid'], ['kind' => $e['kind'], 'title' => $e['title'], 'base' => (int)$e['base']]);
        send_group($b);

    case 'splits.expense.import':
        // The rows of a bank statement, read in the browser (the file itself never comes here), as expenses of a group
        // where the account is one of the people, paid by it: for itself alone, or equally among all (rows, for)
        $u = writer();
        $b = body();
        $a = access($b, true);
        if ($a['via'] !== 'account' || !$a['member']) fail('no_member', 409);
        grows($a);
        $n = import_rows($a, is_array($b['rows'] ?? null) ? $b['rows'] : [], ($b['for'] ?? '') === 'all' ? 'all' : 'me', mb_substr(who($a, $b), 0, 80));
        log_event($a, $b, 'expense.import', null, ['n' => $n]);
        send_json(['ok' => true, 'imported' => $n] + group_payload(access($b)));

    case 'splits.mine':
        // My spending: the share of the account in the expenses of its groups (from: the first day, optional), the
        // personal budget, and the rates of the European Central Bank when the groups use more than one currency
        $u = reader();
        $from = valid_day($_GET['from'] ?? '') ?: '';
        $m = my_spending($u, $from);
        $bud = budget_row((int)$u['id']);
        $curs = array_unique(array_merge(array_column($m['groups'], 'currency'), [$bud['currency'] ?: 'EUR']));
        send_json(['ok' => true] + $m + ['budget' => out_budget($bud), 'rates' => count($curs) > 1 ? (object)(ecb_rates()['rates'] ?? []) : (object)[]]);

    case 'splits.budget.save':
        // The currency of the view, the monthly caps, the keywords of the categories, how the CSV of the bank is read
        $u = writer();
        $b = body();
        if (strlen(json_out($b)) > 120000) fail('bad_request', 413);
        send_json(['ok' => true, 'budget' => out_budget(save_budget((int)$u['id'], $b))]);

    case 'splits.photo.upload':
        // A photo for the expense being written: the body is the image (at most 5 MB). By whoever may write in the group
        only('POST');
        $u = current_user();
        if ($u) require_csrf($u);
        $a = access($_GET, true);
        if (too_many_attempts('split_photo', 120, 60)) fail('rate_limited', 429);
        record_attempt('split_photo');
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_PHOTO_BYTES) fail('photo_big', 413);
        $bytes = (string)file_get_contents('php://input', false, null, 0, MAX_PHOTO_BYTES + 1);
        if (strlen($bytes) > MAX_PHOTO_BYTES) fail('photo_big', 413);
        if ($bytes === '') fail('photo_type', 422);
        send_json(['ok' => true, 'photo' => store_photo($a['group'], $bytes)]);

    case 'splits.photo':
        // The image, to whoever can open the group (an account, or the link)
        only('GET');
        serve_photo(access($_GET), valid_pid($_GET['p'] ?? ''));

    case 'splits.log':
        // What happened in the group, newest first (the last 300)
        only('GET');
        $a = access($_GET);
        $rows = q('SELECT who, action, ref, info, created_at FROM ' . t('split_log') . ' WHERE group_id = ? ORDER BY id DESC LIMIT 300', [$a['group']['id']])->fetchAll();
        send_json(['ok' => true, 'log' => array_map(fn($x) => ['who' => $x['who'], 'action' => $x['action'], 'ref' => $x['ref'], 'info' => (object)jdec($x['info']), 'when' => iso($x['created_at'])], $rows)]);

    case 'splits.rate':
        // 1 from = ? to, from the rates of the European Central Bank (null when the bank does not have one of them)
        only('GET');
        if (empty($_GET['code'])) reader();
        else access($_GET);
        $from = valid_currency($_GET['from'] ?? '');
        $to = valid_currency($_GET['to'] ?? '');
        if (!$from || !$to) fail('bad_request', 422);
        send_json(['ok' => true, 'rate' => ecb_rate($from, $to)]);

    default:
        fail('not_found', 404);
}

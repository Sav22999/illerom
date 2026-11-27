<?php
/**
 * SavContacts — JSON API.  api/index.php?r=<action>
 *
 * Accounts:  the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login (and the
 *            routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *            auth.reset, auth.profile, auth.export, auth.delete
 * Contacts:  con.init, con.prefs, con.contact, con.contact.save, con.contact.star, con.contact.delete, con.contact.restore,
 *            con.contact.purge, con.trash.empty, con.bulk, con.photo, con.duplicates, con.merge
 * Groups:    con.group.save, con.group.delete, con.group.order
 * Files:     con.import (vCard 2.1/3.0/4.0, CSV of Google or Outlook, .savcon), con.export (vcf3, vcf4, csv, outlook, savcon)
 * SavOffice: con.search, con.birthdays — read by the other apps of the suite (SavMail, SavCalendar, SavSchedules,
 *            SavSplits, SavNewsletters…): they share the session, so a GET from their pages to ../savcontacts/api/ is
 *            made by the same signed-in person. See README.md.
 *
 * Every POST needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/contacts.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavContacts API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
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
const SPACE_APP = 'savcontacts';

/** What a person keeps in SavContacts: their contacts, with the photos. It counts in their space of SavOffice. */
function space_bytes(array $u): int
{
    return con_bytes((int)$u['id']);
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

/** A contact of this account by its cid (the trashed ones too), or 404. */
function own(array $u, $cid, bool $full = false): array
{
    $r = contact_row((int)$u['id'], valid_code($cid), $full);
    if (!$r) fail('not_found', 404);
    return $r;
}

/** The photo the app sends: a data: URL of an image (already made small by the app), re-drawn here; '' takes it away. */
function photo_in($v)
{
    if ($v === null || $v === '') return null;
    if (!is_string($v) || !preg_match('#^data:image/(jpeg|png|webp|gif);base64,#', $v)) fail('photo_type', 422);
    $p = photo_clean((string)base64_decode(substr($v, strpos($v, ',') + 1), true));
    if ($p === null) fail('photo_type', 422);
    return $p;
}

function send_contact(array $u, string $cid): void
{
    send_json(['ok' => true, 'contact' => contact_api(contact_row((int)$u['id'], $cid))]);
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
    'name' => 'SavContacts', 'cookie' => 'savcontacts', 'lang' => fn() => identity_lang(),
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
        // Everything SavContacts keeps of the account, as one JSON file: its settings, its groups and its contacts (the
        // ones in the trash too), the photos inside
        $u = reader();
        $rows = q('SELECT * FROM ' . t('con_contacts') . ' WHERE user_id = ?', [$u['id']])->fetchAll();
        header('Content-Disposition: attachment; filename="savcontacts-data.json"');
        send_json(['app' => 'SavContacts', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => (object)profile_prefs(profile($u))] + savcon_of((int)$u['id'], $rows));

    case 'auth.delete':
        // The account goes in every app that shares it; its contacts and groups with it (the tables reference the account)
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);


    // ================================================================ contacts

    case 'con.init':
        // What the app needs to start: the settings, the groups and every contact (without the photos: they come by
        // themselves, con.photo). The trash is emptied of what is older than 30 days, now and then
        $u = reader();
        $p = profile($u);
        if (random_int(1, 10) === 1) q('DELETE FROM ' . t('con_contacts') . ' WHERE user_id = ? AND deleted_at IS NOT NULL AND deleted_at < ?', [$u['id'], gmdate('Y-m-d H:i:s', time() - 30 * 86400)]);
        send_json(['ok' => true, 'prefs' => (object)profile_prefs($p), 'groups' => groups_of((int)$u['id']),
            'contacts' => array_map('contact_api', contacts_of((int)$u['id'])), 'trash' => (int)q('SELECT COUNT(*) FROM ' . t('con_contacts') . ' WHERE user_id = ? AND deleted_at IS NOT NULL', [$u['id']])->fetchColumn(),
            'max' => MAX_CONTACTS]);

    case 'con.trash':
        $u = reader();
        send_json(['ok' => true, 'contacts' => array_map('contact_api', contacts_of((int)$u['id'], true))]);

    case 'con.prefs':
        $u = writer();
        profile($u);
        $p = body()['prefs'] ?? [];
        if (!is_array($p) || strlen(json_out($p)) > 2000) fail('bad_request', 422);
        q('UPDATE ' . t('con_profiles') . ' SET prefs = ? WHERE user_id = ?', [json_out((object)array_intersect_key($p, array_flip(PREF_KEYS))), $u['id']]);
        send_json(['ok' => true]);

    case 'con.contact':
        // One contact, with the fields of its vCard that the app does not show (as they are, to look at)
        $u = reader();
        $r = own($u, $_GET['id'] ?? '', true);
        send_json(['ok' => true, 'contact' => contact_api($r), 'other' => jdec($r['other'])]);

    case 'con.contact.save':
        // A new contact, or one changed (with id). photo: a data: URL, '' to take it away, absent to leave it as it is
        $u = writer();
        $b = body();
        $c = clean_contact($b, group_ids((int)$u['id']));
        if (contact_display($c) === '') fail('name_required', 422);
        $photo = array_key_exists('photo', $b) ? photo_in($b['photo']) : false;
        $old = !empty($b['id']) ? own($u, $b['id']) : null;
        if ($old && $old['deleted_at']) fail('not_found', 404);
        if (!$old && count_contacts((int)$u['id']) >= MAX_CONTACTS) fail('too_many_contacts', 409);
        send_contact($u, store_contact((int)$u['id'], $c, $old, $photo));

    case 'con.contact.star':
        $u = writer();
        $b = body();
        $r = own($u, $b['id'] ?? '');
        q('UPDATE ' . t('con_contacts') . ' SET favorite = ?, rev = rev + 1, updated_at = ? WHERE id = ?', [!empty($b['on']) ? 1 : 0, now_utc(), $r['id']]);
        send_contact($u, $r['cid']);

    case 'con.contact.delete':
    case 'con.contact.restore':
        // To the trash (30 days) and back
        $u = writer();
        $b = body();
        $ids = array_values(array_filter(array_map('valid_code', is_array($b['ids'] ?? null) ? $b['ids'] : [$b['id'] ?? ''])));
        if (!$ids || count($ids) > 5000) fail('bad_request', 422);
        $in = implode(',', array_fill(0, count($ids), '?'));
        $del = $r === 'con.contact.delete';
        q('UPDATE ' . t('con_contacts') . ' SET deleted_at = ?, rev = rev + 1, updated_at = ? WHERE user_id = ? AND cid IN (' . $in . ')', [$del ? now_utc() : null, now_utc(), $u['id'], ...$ids]);
        send_json(['ok' => true]);

    case 'con.contact.purge':
    case 'con.trash.empty':
        // Gone for good: some contacts of the trash, or the whole trash
        $u = writer();
        $b = body();
        if ($r === 'con.trash.empty') q('DELETE FROM ' . t('con_contacts') . ' WHERE user_id = ? AND deleted_at IS NOT NULL', [$u['id']]);
        else {
            $ids = array_values(array_filter(array_map('valid_code', is_array($b['ids'] ?? null) ? $b['ids'] : [])));
            if (!$ids) fail('bad_request', 422);
            q('DELETE FROM ' . t('con_contacts') . ' WHERE user_id = ? AND deleted_at IS NOT NULL AND cid IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', [$u['id'], ...$ids]);
        }
        send_json(['ok' => true]);

    case 'con.bulk':
        // Many contacts at once: into a group or out of it, favourites or not
        $u = writer();
        $b = body();
        $ids = array_values(array_filter(array_map('valid_code', is_array($b['ids'] ?? null) ? $b['ids'] : [])));
        $do = (string)($b['do'] ?? '');
        $gid = valid_code($b['group'] ?? '');
        if (!$ids || count($ids) > 5000 || !in_array($do, ['group.add', 'group.remove', 'star', 'unstar'], true)) fail('bad_request', 422);
        if (strpos($do, 'group.') === 0 && !in_array($gid, group_ids((int)$u['id']), true)) fail('not_found', 404);
        db()->beginTransaction();
        $rows = q('SELECT id, `groups` FROM ' . t('con_contacts') . ' WHERE user_id = ? AND cid IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', [$u['id'], ...$ids])->fetchAll();
        foreach ($rows as $x) {
            if ($do === 'star' || $do === 'unstar') { q('UPDATE ' . t('con_contacts') . ' SET favorite = ?, rev = rev + 1, updated_at = ? WHERE id = ?', [$do === 'star' ? 1 : 0, now_utc(), $x['id']]); continue; }
            $g = jdec($x['groups']);
            $g = $do === 'group.add' ? array_values(array_unique([...$g, $gid])) : array_values(array_diff($g, [$gid]));
            q('UPDATE ' . t('con_contacts') . ' SET `groups` = ?, rev = rev + 1, updated_at = ? WHERE id = ?', [json_out($g), now_utc(), $x['id']]);
        }
        db()->commit();
        send_json(['ok' => true, 'contacts' => array_map('contact_api', array_values(array_filter(contacts_of((int)$u['id']), fn($c) => in_array($c['cid'], $ids, true))))]);

    case 'con.photo':
        // The picture of a contact, to the account that keeps it (also asked by the other apps of SavOffice)
        only('GET');
        $u = require_user();
        $st = q('SELECT photo FROM ' . t('con_contacts') . ' WHERE user_id = ? AND cid = ?', [$u['id'], valid_code($_GET['id'] ?? '')]);
        $img = $st->fetchColumn();
        if (!$img) { http_response_code(404); exit; }
        header('Content-Type: image/jpeg');
        header('Cache-Control: private, max-age=31536000, immutable'); // its address changes with every new picture (v=)
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'");
        echo $img;
        exit;

    case 'con.duplicates':
        $u = reader();
        send_json(['ok' => true, 'sets' => duplicates_of((int)$u['id'])]);

    case 'con.merge':
        // The contacts given become the first one (the others go to the trash)
        $u = writer();
        $ids = array_values(array_unique(array_filter(array_map('valid_code', is_array(body()['ids'] ?? null) ? body()['ids'] : []))));
        if (count($ids) < 2 || count($ids) > 20) fail('merge_two', 422);
        send_contact($u, merge_contacts($u, $ids));


    // ================================================================ groups

    case 'con.group.save':
        $u = writer();
        $b = body();
        $name = clean_str($b['name'] ?? '', 60);
        if ($name === '') fail('name_required', 422);
        $color = is_string($b['color'] ?? null) && preg_match('/^#[0-9a-f]{6}$/i', $b['color']) ? strtolower($b['color']) : null;
        $groups = groups_of((int)$u['id']);
        $gid = valid_code($b['id'] ?? '');
        foreach ($groups as $g) if ($g['gid'] !== $gid && mb_strtolower($g['name']) === mb_strtolower($name)) fail('group_taken', 409);
        if ($gid) {
            if (!in_array($gid, array_column($groups, 'gid'), true)) fail('not_found', 404);
            q('UPDATE ' . t('con_groups') . ' SET name = ?, color = COALESCE(?, color) WHERE gid = ? AND user_id = ?', [$name, $color, $gid, $u['id']]);
        } else {
            if (count($groups) >= MAX_GROUPS) fail('too_many_groups', 409);
            $gid = new_code('con_groups', 'gid');
            q('INSERT INTO ' . t('con_groups') . ' (gid, user_id, name, color, position, created_at) VALUES (?,?,?,?,?,?)', [$gid, $u['id'], $name, $color ?: GROUP_COLORS[count($groups) % count(GROUP_COLORS)], count($groups), now_utc()]);
        }
        // contacts added to the new group at once (made from a selection)
        $ids = array_values(array_filter(array_map('valid_code', is_array($b['add'] ?? null) ? $b['add'] : [])));
        foreach ($ids ? q('SELECT id, `groups` FROM ' . t('con_contacts') . ' WHERE user_id = ? AND cid IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', [$u['id'], ...$ids])->fetchAll() : [] as $x) {
            q('UPDATE ' . t('con_contacts') . ' SET `groups` = ?, rev = rev + 1, updated_at = ? WHERE id = ?', [json_out(array_values(array_unique([...jdec($x['groups']), $gid]))), now_utc(), $x['id']]);
        }
        send_json(['ok' => true, 'id' => $gid, 'groups' => groups_of((int)$u['id'])]);

    case 'con.group.delete':
        // The group goes; its contacts stay (only the label goes away from them)
        $u = writer();
        $gid = valid_code(body()['id'] ?? '');
        if (!in_array($gid, group_ids((int)$u['id']), true)) fail('not_found', 404);
        db()->beginTransaction();
        foreach (q('SELECT id, `groups` FROM ' . t('con_contacts') . ' WHERE user_id = ? AND `groups` LIKE ?', [$u['id'], '%"' . $gid . '"%'])->fetchAll() as $x) {
            q('UPDATE ' . t('con_contacts') . ' SET `groups` = ?, rev = rev + 1, updated_at = ? WHERE id = ?', [json_out(array_values(array_diff(jdec($x['groups']), [$gid]))), now_utc(), $x['id']]);
        }
        q('DELETE FROM ' . t('con_groups') . ' WHERE gid = ? AND user_id = ?', [$gid, $u['id']]);
        db()->commit();
        send_json(['ok' => true, 'groups' => groups_of((int)$u['id'])]);

    case 'con.group.order':
        $u = writer();
        $ids = array_values(array_filter(array_map('valid_code', is_array(body()['ids'] ?? null) ? body()['ids'] : [])));
        foreach ($ids as $i => $gid) q('UPDATE ' . t('con_groups') . ' SET position = ? WHERE gid = ? AND user_id = ?', [$i, $gid, $u['id']]);
        send_json(['ok' => true, 'groups' => groups_of((int)$u['id'])]);


    // ================================================================ files

    case 'con.import':
        // A file read by the app as text: a vCard (one card or many), a CSV of Google or Outlook, or a .savcon
        $u = writer();
        $b = body();
        $text = (string)($b['text'] ?? '');
        if ($text === '') fail('file_invalid', 422);
        if (strlen($text) > MAX_FILE_BYTES) fail('file_big', 413);
        if (!empty($b['base64'])) $text = (string)base64_decode($text, true); // UTF-16 files travel as they are
        $fmt = (string)($b['format'] ?? '');
        $head = ltrim(text_utf8(substr($text, 0, 4096)));
        if ($fmt === '' || $fmt === 'auto') $fmt = stripos($head, 'BEGIN:VCARD') !== false ? 'vcf' : ($head !== '' && $head[0] === '{' ? 'savcon' : 'csv');
        if ($fmt === 'vcf') $list = vcard_parse($text);
        elseif ($fmt === 'csv') $list = csv_parse($text);
        elseif ($fmt === 'savcon') $list = savcon_contacts(json_decode(text_utf8($text), true) ?: []);
        else fail('bad_request', 422);
        if (!$list) fail('file_invalid', 422);
        [$added, $updated, $skipped] = import_contacts($u, $list);
        send_json(['ok' => true, 'format' => $fmt, 'added' => $added, 'updated' => $updated, 'skipped' => $skipped]);

    case 'con.export':
        // vcf3 / vcf4 (one file, all the cards), csv (Google), outlook (CSV of Outlook), savcon; all, some (ids) or a group
        $u = reader();
        $fmt = (string)($_GET['fmt'] ?? 'vcf3');
        $ids = array_values(array_filter(array_map('valid_code', explode(',', (string)($_GET['ids'] ?? '')))));
        $rows = export_rows((int)$u['id'], $ids, valid_code($_GET['group'] ?? ''));
        $names = array_column(groups_of((int)$u['id']), 'name', 'gid');
        $base = preg_replace('/[^\p{L}\p{N} ._-]+/u', '', (string)($_GET['name'] ?? '')) ?: 'contacts';
        $send = function (string $body, string $type, string $ext) use ($base) {
            header('Content-Type: ' . $type);
            header('Content-Disposition: attachment; filename="' . rawurlencode($base) . '.' . $ext . '"; filename*=UTF-8\'\'' . rawurlencode($base) . '.' . $ext);
            header('Cache-Control: no-store');
            header('X-Content-Type-Options: nosniff');
            echo $body;
            exit;
        };
        if ($fmt === 'vcf3' || $fmt === 'vcf4') $send(implode('', array_map(fn($r) => vcard_write(row_contact($r, $names), $fmt === 'vcf4' ? '4.0' : '3.0'), $rows)), 'text/vcard; charset=utf-8', 'vcf');
        if ($fmt === 'csv' || $fmt === 'outlook') $send(csv_write(array_map(fn($r) => row_contact($r, $names), $rows), $fmt === 'outlook' ? 'outlook' : 'google'), 'text/csv; charset=utf-8', 'csv');
        if ($fmt === 'savcon') $send(json_out(savcon_of((int)$u['id'], $rows)), 'application/vnd.savcontacts.contacts+json', 'savcon');
        fail('bad_request', 422);


    // ================================================================ for the other apps of SavOffice

    case 'con.search':
        // ?q=words [&limit=10] [&group=gid] [&need=email|phone]: the contacts that match, best first (see README.md)
        $u = reader();
        $need = in_array($_GET['need'] ?? '', ['email', 'phone'], true) ? $_GET['need'] : '';
        send_json(['ok' => true, 'contacts' => search_contacts((int)$u['id'], mb_substr((string)($_GET['q'] ?? ''), 0, 100), (int)($_GET['limit'] ?? 10), valid_code($_GET['group'] ?? ''), $need),
            'groups' => array_map(fn($g) => ['id' => $g['gid'], 'name' => $g['name'], 'color' => $g['color']], groups_of((int)$u['id']))]);

    case 'con.birthdays':
        // ?from=YYYY-MM-DD&to=YYYY-MM-DD (at most 400 days): the birthdays in between, as days of those years
        $u = reader();
        $ok = fn($d) => is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : '';
        $from = $ok($_GET['from'] ?? '') ?: gmdate('Y-m-d');
        $to = $ok($_GET['to'] ?? '') ?: gmdate('Y-m-d', strtotime($from . ' UTC') + 31 * 86400);
        send_json(['ok' => true, 'birthdays' => birthdays_between((int)$u['id'], $from, $to)]);

    default:
        fail('not_found', 404);
}

<?php
/**
 * SavMail — JSON API.  api/index.php?r=<action>
 *
 * Accounts:   the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login (and the
 *             routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *             auth.reset, auth.profile, auth.export, auth.delete
 * Vault:      ml.state, ml.unlock, ml.lock, ml.reset, ml.devices, ml.device.remove, ml.recovery, ml.recovery.remove, ml.prefs
 * Mailboxes:  ml.presets, ml.discover, ml.account.test, ml.account.add, ml.account.update, ml.account.remove, ml.oauth.start, ml.oauth.callback
 * Mail:       ml.icon (the icon of a sender's domain), ml.folders, ml.list, ml.msg, ml.att, ml.flag, ml.move, ml.delete, ml.send, ml.draft
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in). Mail calls also need this browser to
 * open the vault (its device cookie): otherwise vault_locked (423) or vault_empty (409).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/vault.php';
require __DIR__ . '/../lib/imap.php';
require __DIR__ . '/../lib/smtp.php';
require __DIR__ . '/../lib/mime.php';
require __DIR__ . '/../lib/oauth.php';
require __DIR__ . '/../lib/providers.php';
require __DIR__ . '/../lib/mailbox.php';
require __DIR__ . '/../lib/icons.php';

ini_set('display_errors', '0'); // warnings go to the log, never into a JSON answer
header('X-Robots-Tag: noindex');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox");
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    if ($e instanceof MlMailError) fail('mail_' . $e->kind, 502, ['server' => $e->server]);
    error_log('SavMail API: ' . get_class($e) . ' ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});
@set_time_limit(110);

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

// ---------- SavAccount: signing in and joining an account that already exists ----------

require dirname(__DIR__, 2) . '/identity/identity.php';

/** The language of the messages of the sign-in: the app sends it with every request. */
function identity_lang(): string
{
    $h = strtolower((string)($_SERVER['HTTP_X_LANG'] ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')));
    return strpos($h, 'it') === 0 ? 'it' : 'en';
}

identity_setup([
    'name' => 'SavMail', 'cookie' => 'savmail', 'lang' => fn() => identity_lang(),
    'fail' => function (string $code, int $http): void {
        fail($code, $http);
    },
    'accepted' => fn(array $b) => !empty($b['acceptTerms']),
    'create' => fn(array $who, array $b) => new_user($who['name'] ?: explode('@', $who['email'])[0], $who['email'], '', null, ui_lang($b)),
    'writer' => fn() => writer(),
]);
identity_route($r);

// ---------- helpers of the mail ----------

function profile_prefs(array $u): array
{
    $p = q('SELECT prefs FROM ' . t('ml_profiles') . ' WHERE user_id = ?', [$u['id']])->fetchColumn();
    $x = json_decode((string)$p, true);
    return is_array($x) ? $x : [];
}

/** VK of the account on this browser, or the reason why not. */
function vault_key(array $u): string
{
    $vk = ml_vault_key($u);
    if ($vk !== null) return $vk;
    if (!ml_vault_row($u['id'])) fail('vault_empty', 409);
    fail('vault_locked', 423);
    return '';
}

/** What the app knows of the vault: its state, the mailboxes (when open), the ways to open it (when locked). */
function state_out(array $u): array
{
    $state = ml_state($u);
    $out = ['ok' => true, 'state' => $state, 'prefs' => (object)profile_prefs($u), 'oauth' => ml_oauth_ready(), 'unlock' => ml_unlock_ways($u)];
    if ($state === 'open') {
        $d = ml_vault_load($u, (string)ml_vault_key($u));
        $out['accounts'] = array_map('ml_account_out', $d['accounts']);
    }
    return $out;
}

/** {host, port, tls, user} of a mail server from the request. */
function server_in($s, string $email): array
{
    $s = is_array($s) ? $s : [];
    $host = mb_strtolower(s($s, 'host', 253));
    $port = (int)($s['port'] ?? 0);
    $tls = in_array($s['tls'] ?? '', ['ssl', 'starttls', 'none'], true) ? $s['tls'] : 'ssl';
    $user = s($s, 'user', 254) ?: $email;
    if ($host === '' || $port < 1 || $port > 65535) fail('server_invalid', 422);
    return ['host' => $host, 'port' => $port, 'tls' => $tls, 'user' => $user];
}

/** Signs in to IMAP and SMTP with these settings; the special mailboxes found. The error says which of the two failed. */
function test_account(array $u, string $vk, array &$a): array
{
    try {
        $im = ml_imap($u, $vk, $a);
        $f = ml_folders($im);
        $im->logout();
    } catch (MlMailError $e) {
        fail('mail_' . $e->kind, 422, ['where' => 'imap', 'server' => $e->server]);
    }
    try {
        $s = ml_smtp($u, $vk, $a);
        $s->close();
    } catch (MlMailError $e) {
        fail('mail_' . $e->kind, 422, ['where' => 'smtp', 'server' => $e->server]);
    }
    return $f['special'];
}

const COLORS = ['#8f6500', '#0f6e56', '#1d4e89', '#b3261e', '#5b4cf0', '#a1328c', '#0b7a87', '#c45a0c', '#4d7c0f', '#5f6660'];

/** A mailbox of the request, signed in and checked: saved in the vault (a new vault when it is the first one). */
function save_new_account(array $u, array $a, ?string $secret, bool $remember): array
{
    $state = ml_state($u);
    if ($state === 'locked') fail('vault_locked', 423);
    $vk = $state === 'open' ? (string)ml_vault_key($u) : random_bytes(32); // a new vault's key: the mailbox is tested before anything is written
    if ($state === 'open') {
        $d = ml_vault_load($u, $vk);
        if (count($d['accounts']) >= ML_MAX_ACCOUNTS) fail('too_many_accounts', 422);
        foreach ($d['accounts'] as $x) if (mb_strtolower($x['email']) === mb_strtolower($a['email'])) fail('account_exists', 409);
        if (empty($a['color'])) $a['color'] = COLORS[count($d['accounts']) % count(COLORS)];
    } elseif (empty($a['color'])) $a['color'] = COLORS[0];
    $a['special'] = test_account($u, $vk, $a);
    if ($state === 'open') ml_vault_mutate($u, $vk, function ($d) use ($a) { $d['accounts'][] = $a; return $d; });
    else $vk = ml_vault_create($u, ['v' => 1, 'accounts' => [$a]], $remember);
    if ($secret !== null && $secret !== '') ml_secret_wrap($u, $vk, 'password', $a['id'], $secret);
    return $a;
}

/** For the mail calls: VK, the vault and the mailbox named by "a". */
function mailbox(array $u, string $id): array
{
    $vk = vault_key($u);
    $d = ml_vault_load($u, $vk);
    return [$vk, ml_account($d, $id)];
}

/** Remembers the special mailboxes found, when they changed. */
function keep_special(array $u, string $vk, array $a, array $special): void
{
    if (($a['special'] ?? []) == $special) return;
    ml_vault_mutate($u, $vk, function ($d) use ($a, $special) { foreach ($d['accounts'] as &$x) if ($x['id'] === $a['id']) $x['special'] = $special; return $d; });
}

/** Addresses of the request: [{name, email}…], all valid, at most $max. */
function addrs_in($list, int $max = 100): array
{
    $out = [];
    foreach (is_array($list) ? array_slice($list, 0, $max + 1) : [] as $x) {
        $email = mb_strtolower(trim((string)(is_array($x) ? ($x['email'] ?? '') : $x)));
        $name = is_array($x) ? mb_substr(trim((string)($x['name'] ?? '')), 0, 120) : '';
        if ($email === '') continue;
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('address_invalid', 422, ['address' => mb_substr($email, 0, 120)]);
        $out[] = ['name' => $name, 'email' => $email];
    }
    if (count($out) > $max) fail('too_many_recipients', 422);
    return $out;
}

/** A forward keeps the attachments of the original: they are read again from the server (fwd: {f, uid, parts}). */
function with_forwarded(array $u, string $vk, array $a, array $b): array
{
    $fw = is_array($b['fwd'] ?? null) ? $b['fwd'] : null;
    if (!$fw || (int)($fw['uid'] ?? 0) < 1) return $b;
    $want = array_map('strval', is_array($fw['parts'] ?? null) ? $fw['parts'] : []);
    $im = ml_imap($u, $vk, $a);
    [$raw] = ml_fetch_raw($im, (string)($fw['f'] ?? 'INBOX'), (int)$fw['uid']);
    $im->logout();
    $tree = ml_parse($raw);
    $b['atts'] = is_array($b['atts'] ?? null) ? $b['atts'] : [];
    foreach (ml_content($tree)['atts'] as $x) {
        if ($want && !in_array($x['part'], $want, true)) continue;
        $p = ml_part($tree, $x['part']);
        if ($p) $b['atts'][] = ['name' => $x['name'], 'type' => $x['type'], 'data' => base64_encode($p['body'])];
    }
    return $b;
}

/** The message of a compose request, written out: [raw, Message-ID, recipients]. */
function compose(array $a, array $b, bool $draft): array
{
    $to = addrs_in($b['to'] ?? []);
    $cc = addrs_in($b['cc'] ?? []);
    $bcc = addrs_in($b['bcc'] ?? []);
    if (count($to) + count($cc) + count($bcc) > 100) fail('too_many_recipients', 422);
    if (!$draft && !$to && !$cc && !$bcc) fail('no_recipients', 422);
    $atts = [];
    $total = 0;
    foreach (is_array($b['atts'] ?? null) ? array_slice($b['atts'], 0, 40) : [] as $x) {
        $data = base64_decode((string)($x['data'] ?? ''), true);
        if ($data === false) fail('bad_request', 422);
        $total += strlen($data);
        if ($total > 20000000) fail('attachments_big', 413);
        $atts[] = ['name' => mb_substr((string)($x['name'] ?? 'file'), 0, 200), 'type' => (string)($x['type'] ?? ''), 'data' => $data];
    }
    $html = (string)($b['html'] ?? '');
    if (strlen($html) > 3000000) fail('message_big', 413);
    $html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' . ml_sanitize($html, [], true)['html'] . '</body></html>';
    [$raw, $id] = ml_build(['from' => ['name' => $a['name'] ?? '', 'email' => $a['email']], 'to' => $to, 'cc' => $cc, 'bcc' => $bcc, 'subject' => mb_substr(s($b, 'subject', 998), 0, 998),
        'html' => $html, 'text' => mb_substr((string)($b['text'] ?? ''), 0, 1000000), 'attachments' => $atts, 'inReplyTo' => s($b, 'inReplyTo', 998), 'references' => (string)($b['references'] ?? '')]);
    return [$raw, $id, array_column(array_merge($to, $cc, $bcc), 'email')];
}

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
        // What SavMail keeps of the account: the settings of the mailboxes (without passwords or tokens) and the look.
        // The messages are on the mail servers: every mail client can download them.
        $u = reader();
        $vk = ml_vault_key($u);
        $accounts = $vk ? array_map(fn($a) => array_diff_key(ml_account_out($a), ['special' => 1]), ml_vault_load($u, $vk)['accounts']) : null;
        header('Content-Disposition: attachment; filename="savmail-data.json"');
        send_json(['app' => 'SavMail', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => (object)profile_prefs($u), 'mailboxes' => $accounts, 'devices' => ml_devices($u),
            'note' => $accounts === null ? 'The mailboxes are encrypted and this browser cannot open them: open SavMail here first.' : 'Passwords and tokens are never exported.']);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        set_auth_cookie('', time() - 3600);
        ml_set_device_cookie('', false);
        send_json(['ok' => true]);

    // ================================================================ the vault

    case 'ml.state':
        $u = reader();
        send_json(state_out($u));

    case 'ml.unlock':
        // A new device: the password of one of the mailboxes, or the recovery code, opens the vault and this browser keeps it open
        $u = writer();
        $who = 'u' . $u['id'];
        if (too_many_attempts('ml_unlock', 10, 15) || too_many_attempts('ml_unlock', 20, 60, $who)) fail('rate_limited', 429);
        $secret = (string)(body()['secret'] ?? '');
        if ($secret === '' || strlen($secret) > 500) fail('unlock_wrong', 422);
        $vk = ml_unlock_with_secret($u, $secret);
        if ($vk === null) {
            record_attempt('ml_unlock');
            record_attempt('ml_unlock', $who);
            fail('unlock_wrong', 422);
        }
        ml_add_device($u, $vk, !empty(body()['remember']));
        send_json(state_out($u));

    case 'ml.lock':
        // This browser forgets the key: the next time it needs a password of a mailbox or the recovery code
        $u = writer();
        ml_forget_device($u);
        send_json(['ok' => true]);

    case 'ml.reset':
        // Everything SavMail keeps, gone: for who no longer knows any way to open it. The mailboxes stay on their servers.
        $u = writer();
        if (empty(body()['confirm'])) fail('bad_request', 422);
        ml_reset($u);
        send_json(state_out($u));

    case 'ml.devices':
        $u = reader();
        send_json(['ok' => true, 'devices' => ml_devices($u), 'unlock' => ml_unlock_ways($u)]);

    case 'ml.device.remove':
        $u = writer();
        $kid = s(body(), 'id', 32);
        if (!preg_match('/^[A-Za-z0-9_-]{16}$/', $kid)) fail('bad_request', 422);
        ml_forget_device($u, $kid);
        send_json(['ok' => true, 'devices' => ml_devices($u)]);

    case 'ml.recovery':
        // A new recovery code (the old one stops working): shown once, never kept in clear
        $u = writer();
        $vk = vault_key($u);
        $code = ml_recovery_new();
        ml_secret_wrap($u, $vk, 'recovery', 'code', ml_recovery_norm($code));
        send_json(['ok' => true, 'code' => $code, 'unlock' => ml_unlock_ways($u)]);

    case 'ml.recovery.remove':
        $u = writer();
        vault_key($u);
        ml_drop_wrap($u, 'recovery', 'code');
        send_json(['ok' => true, 'unlock' => ml_unlock_ways($u)]);

    case 'ml.prefs':
        // The look of the app (theme, density, pictures…): nothing personal, read only by the app
        $u = writer();
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 4000) fail('bad_request', 413);
        q('INSERT INTO ' . t('ml_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE prefs = VALUES(prefs)', [$u['id'], $p, now_utc()]);
        send_json(['ok' => true]);

    // ================================================================ mailboxes

    case 'ml.presets':
        reader();
        send_json(['ok' => true, 'presets' => ml_presets(), 'oauth' => ml_oauth_ready()]);

    case 'ml.discover':
        $u = writer();
        if (too_many_attempts('ml_discover', 40, 15)) fail('rate_limited', 429);
        record_attempt('ml_discover');
        send_json(['ok' => true, 'settings' => ml_discover(s(body(), 'email', 254))]);

    case 'ml.account.test':
    case 'ml.account.add':
        // test: the second step of "Add an address" — signs in to IMAP and SMTP with these settings, saves nothing.
        // add: the third step — the same check again (the server never trusts an earlier answer), then the address is kept
        // in the vault with how it looks in SavMail (name, colour, signature, the copy in Sent).
        $u = writer();
        if (too_many_attempts('ml_add', 24, 15)) fail('rate_limited', 429);
        record_attempt('ml_add');
        $b = body();
        $email = mb_strtolower(s($b, 'email', 254));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('email_invalid', 422);
        $pw = (string)($b['password'] ?? '');
        if ($pw === '' || strlen($pw) > 500) fail('mailbox_password', 422);
        $sig = (string)($b['signature'] ?? '');
        if (strlen($sig) > 20000) fail('bad_request', 413);
        $a = ['id' => ml_new_id(), 'email' => $email, 'name' => s($b, 'name', 120), 'provider' => preg_match('/^[a-z]{2,20}$/', (string)($b['provider'] ?? '')) ? $b['provider'] : 'custom',
            'auth' => 'password', 'imap' => server_in($b['imap'] ?? null, $email), 'smtp' => server_in($b['smtp'] ?? null, $email), 'secret' => $pw,
            'color' => preg_match('/^#[0-9a-f]{6}$/i', (string)($b['color'] ?? '')) ? strtolower($b['color']) : '',
            'sentCopy' => !array_key_exists('sentCopy', $b) || !empty($b['sentCopy']), 'signature' => $sig !== '' ? ml_sanitize($sig, [], true)['html'] : '', 'created' => gmdate('c')];
        if ($r === 'ml.account.test') {
            if (ml_state($u) === 'open') foreach (ml_vault_load($u, (string)ml_vault_key($u))['accounts'] as $x) if (mb_strtolower($x['email']) === $email) fail('account_exists', 409);
            $special = test_account($u, random_bytes(32), $a);
            send_json(['ok' => true, 'special' => (object)$special]);
        }
        $a = save_new_account($u, $a, $pw, !array_key_exists('remember', $b) || !empty($b['remember']));
        clear_attempts('ml_add');
        send_json(['account' => ml_account_out($a)] + state_out($u));

    case 'ml.account.update':
        // Name, colour, signature, the copy in Sent; a new password or other servers are checked by signing in first
        $u = writer();
        $b = body();
        $vk = vault_key($u);
        $d = ml_vault_load($u, $vk);
        $a = ml_account($d, s($b, 'id', 16));
        if (array_key_exists('name', $b)) $a['name'] = s($b, 'name', 120);
        if (array_key_exists('color', $b) && preg_match('/^#[0-9a-f]{6}$/i', (string)$b['color'])) $a['color'] = strtolower($b['color']);
        if (array_key_exists('signature', $b)) { $sig = (string)$b['signature']; if (strlen($sig) > 20000) fail('bad_request', 413); $a['signature'] = ml_sanitize($sig, [], true)['html']; }
        if (array_key_exists('sentCopy', $b)) $a['sentCopy'] = !empty($b['sentCopy']);
        $pw = (string)($b['password'] ?? '');
        $servers = is_array($b['imap'] ?? null) || is_array($b['smtp'] ?? null);
        if ($pw !== '' || $servers) {
            if ($pw !== '') { if (strlen($pw) > 500) fail('mailbox_password', 422); $a['secret'] = $pw; }
            if (is_array($b['imap'] ?? null)) $a['imap'] = server_in($b['imap'], $a['email']);
            if (is_array($b['smtp'] ?? null)) $a['smtp'] = server_in($b['smtp'], $a['email']);
            $a['special'] = test_account($u, $vk, $a);
        }
        ml_vault_mutate($u, $vk, function ($d) use ($a) { foreach ($d['accounts'] as &$x) if ($x['id'] === $a['id']) $x = $a; return $d; });
        if ($pw !== '' && ($a['auth'] ?? 'password') === 'password') ml_secret_wrap($u, $vk, 'password', $a['id'], $pw);
        send_json(['account' => ml_account_out($a)] + state_out($u));

    case 'ml.account.remove':
        // The mailbox leaves SavMail (its messages stay on its server). The last one leaves nothing behind.
        $u = writer();
        $vk = vault_key($u);
        $id = s(body(), 'id', 16);
        $d = ml_vault_mutate($u, $vk, function ($d) use ($id) { $d['accounts'] = array_values(array_filter($d['accounts'], fn($x) => $x['id'] !== $id)); return $d; });
        ml_drop_wrap($u, 'password', $id);
        if (!$d['accounts']) ml_reset($u);
        send_json(state_out($u));

    case 'ml.oauth.start':
        $u = writer();
        $b = body();
        if (ml_state($u) === 'locked') fail('vault_locked', 423);
        $acc = s($b, 'account', 16);
        if ($acc !== '') ml_account(ml_vault_load($u, vault_key($u)), $acc);
        send_json(['ok' => true, 'url' => ml_oauth_start($u, $acc, mb_strtolower(s($b, 'email', 254)))]);

    case 'ml.oauth.callback':
        // Microsoft comes back here (a page, not JSON): the mailbox is checked, kept in the vault, and the app opens again
        only('GET');
        header('Cache-Control: no-store');
        header('Referrer-Policy: no-referrer');
        $back = function (string $result) { header('Location: ' . app_base_path() . '#/?oauth=' . rawurlencode($result), true, 302); exit; };
        $u = current_user();
        if (!$u || $u['status'] !== 'active') $back('signed_out');
        $flow = ml_oauth_take($u, (string)($_GET['state'] ?? ''));
        if (!$flow) $back('expired');
        if (!empty($_GET['error']) || empty($_GET['code'])) $back('cancelled');
        try {
            $tok = ml_oauth_exchange((string)$_GET['code'], (string)$flow['verifier']);
        } catch (MlMailError $e) { $back('failed'); }
        if (empty($tok['email']) || empty($tok['refresh'])) $back('failed');
        $oauth = ['refresh' => $tok['refresh'], 'access' => $tok['access'], 'exp' => $tok['exp']];
        if ($flow['account'] !== '') { // signed in again: new tokens for a mailbox that is there already
            $vk = ml_vault_key($u);
            if (!$vk) $back('locked');
            $id = $flow['account'];
            ml_vault_mutate($u, $vk, function ($d) use ($id, $oauth) { foreach ($d['accounts'] as &$x) if ($x['id'] === $id) $x['oauth'] = $oauth; return $d; });
            $back('ok');
        }
        $p = ml_provider_out('outlook', $tok['email']);
        $a = ['id' => ml_new_id(), 'email' => $tok['email'], 'name' => mb_substr($tok['name'] ?? '', 0, 120), 'provider' => 'outlook', 'auth' => 'xoauth2',
            'imap' => $p['imap'], 'smtp' => $p['smtp'], 'oauth' => $oauth, 'sentCopy' => false, 'signature' => '', 'created' => gmdate('c')];
        try {
            if (ml_state($u) === 'locked') $back('locked');
            save_new_account($u, $a, null, true);
        } catch (MlMailError $e) { $back('failed'); }
        $back('ok');

    // ================================================================ the mail

    case 'ml.icon':
        // The icon of a sender's domain for the avatars, fetched by the server (the sender never sees who reads). A picture, or
        // 404; the browser keeps either (a week, a day): nothing is stored here. Always as a picture, never as a page.
        reader();
        $d = ml_icon_domain(s($_GET, 'd', 253));
        $img = $d !== '' && function_exists('curl_init') ? ml_favicon($d) : null;
        header_remove('Pragma');
        if (!$img) { header('Cache-Control: private, max-age=86400'); http_response_code(404); exit; }
        header('Content-Type: ' . $img[0]);
        header('Content-Length: ' . strlen($img[1]));
        header('Cache-Control: private, max-age=604800, immutable');
        header('X-Content-Type-Options: nosniff');
        header('Content-Disposition: inline; filename="icon"');
        echo $img[1];
        exit;

    case 'ml.folders':
        $u = reader();
        [$vk, $a] = mailbox($u, s($_GET, 'a', 16));
        $im = ml_imap($u, $vk, $a);
        $f = ml_folders($im);
        $labels = $im->has('X-GM-EXT-1'); // Gmail: its folders are labels, which can be searched inside any folder
        $im->logout();
        keep_special($u, $vk, $a, $f['special']);
        send_json(['ok' => true, 'folders' => $f['folders'], 'special' => (object)$f['special'], 'labels' => $labels]);

    case 'ml.list':
        $u = reader();
        [$vk, $a] = mailbox($u, s($_GET, 'a', 16));
        $im = ml_imap($u, $vk, $a);
        $filter = (string)($_GET['filter'] ?? '');
        if ($filter !== '' && !preg_match('/^(unread|read|flagged|att|label:.{1,500})$/s', $filter)) $filter = '';
        $res = ml_list($im, (string)($_GET['f'] ?? 'INBOX'), max(0, min(10000, (int)($_GET['page'] ?? 0))), s($_GET, 'q', 200), $filter);
        $im->logout();
        send_json(['ok' => true, 'page' => (int)($_GET['page'] ?? 0), 'pageSize' => ML_PAGE] + $res);

    case 'ml.msg':
        // The message, made safe; read means read: it is marked as seen (except a draft, opened to be written again)
        $u = reader();
        [$vk, $a] = mailbox($u, s($_GET, 'a', 16));
        $im = ml_imap($u, $vk, $a);
        $f = (string)($_GET['f'] ?? 'INBOX');
        $uid = (int)($_GET['uid'] ?? 0);
        if ($uid < 1) fail('bad_request', 422);
        [$raw, $flags] = ml_fetch_raw($im, $f, $uid);
        $m = ml_message($raw, $flags, $uid, !empty($_GET['images']));
        if (!$m['seen'] && empty($_GET['peek'])) { try { $im->store((string)$uid, '+FLAGS.SILENT', '\\Seen'); $m['seen'] = true; } catch (MlMailError $e) { /* read-only mailbox */ } }
        $im->logout();
        send_json(['ok' => true, 'message' => $m]);

    case 'ml.att':
        // An attachment, always downloaded (never shown by the browser from this address: a page in an attachment cannot run here)
        $u = reader();
        [$vk, $a] = mailbox($u, s($_GET, 'a', 16));
        $im = ml_imap($u, $vk, $a);
        [$raw] = ml_fetch_raw($im, (string)($_GET['f'] ?? 'INBOX'), (int)($_GET['uid'] ?? 0));
        $im->logout();
        $p = ml_part(ml_parse($raw), s($_GET, 'part', 40));
        if (!$p) fail('not_found', 404);
        $name = $p['filename'] !== '' ? $p['filename'] : ($p['type'] === 'message/rfc822' ? 'message.eml' : 'file');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^\x20-\x7e]|["\\\\]/', '_', $name) . '"; filename*=UTF-8\'\'' . rawurlencode($name));
        header('Content-Length: ' . strlen($p['body']));
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        echo $p['body'];
        exit;

    case 'ml.flag':
        $u = writer();
        $b = body();
        [$vk, $a] = mailbox($u, s($b, 'a', 16));
        $flag = ['seen' => '\\Seen', 'flagged' => '\\Flagged'][(string)($b['flag'] ?? '')] ?? null;
        if (!$flag) fail('bad_request', 422);
        $im = ml_imap($u, $vk, $a);
        $im->select((string)($b['f'] ?? 'INBOX'));
        $im->store(ml_uidset($b['uids'] ?? []), !empty($b['on']) ? '+FLAGS.SILENT' : '-FLAGS.SILENT', $flag);
        $im->logout();
        send_json(['ok' => true]);

    case 'ml.move':
        // To another mailbox: "to" is its name, or a role (archive, junk, inbox, trash)
        $u = writer();
        $b = body();
        [$vk, $a] = mailbox($u, s($b, 'a', 16));
        $im = ml_imap($u, $vk, $a);
        $to = (string)($b['to'] ?? '');
        if (in_array($to, ['archive', 'junk', 'trash'], true)) {
            $before = $a['special'] ?? [];
            $box = ml_role_box($im, $a, $to);
            keep_special($u, $vk, ['special' => $before] + $a, $a['special'] ?? []);
            if (!$box) fail('no_' . $to, 422);
            $to = $box;
        } elseif ($to === 'inbox') $to = 'INBOX';
        if ($to === '' || strlen($to) > 500) fail('bad_request', 422);
        $im->select((string)($b['f'] ?? 'INBOX'));
        $im->move(ml_uidset($b['uids'] ?? []), $to);
        $im->logout();
        send_json(['ok' => true]);

    case 'ml.delete':
        // To the trash; from the trash (or when there is none), gone for good
        $u = writer();
        $b = body();
        [$vk, $a] = mailbox($u, s($b, 'a', 16));
        $im = ml_imap($u, $vk, $a);
        $f = (string)($b['f'] ?? 'INBOX');
        $before = $a['special'] ?? [];
        $trash = ml_role_box($im, $a, 'trash');
        keep_special($u, $vk, ['special' => $before] + $a, $a['special'] ?? []);
        $im->select($f);
        $set = ml_uidset($b['uids'] ?? []);
        if (!$trash || $trash === $f || !empty($b['forever'])) $im->expunge($set);
        else $im->move($set, $trash);
        $im->logout();
        send_json(['ok' => true, 'forever' => !$trash || $trash === $f || !empty($b['forever'])]);

    case 'ml.send':
        $u = writer();
        $who = 'u' . $u['id'];
        if (too_many_attempts('ml_send', 300, 60, $who)) fail('rate_limited', 429);
        $b = body();
        [$vk, $a] = mailbox($u, s($b, 'a', 16));
        [$raw, $msgId, $rcpt] = compose($a, with_forwarded($u, $vk, $a, $b), false);
        $s = ml_smtp($u, $vk, $a);
        $s->send($a['email'], $rcpt, $raw);
        $s->close();
        record_attempt('ml_send', $who);
        // then, without failing the sending: a copy in Sent, the reply marked as answered, the draft removed
        $warn = '';
        try {
            $im = null;
            $needImap = !empty($a['sentCopy']) || (int)($b['replyUid'] ?? 0) > 0 || (int)($b['draftUid'] ?? 0) > 0;
            if ($needImap) $im = ml_imap($u, $vk, $a);
            if (!empty($a['sentCopy'])) {
                $before = $a['special'] ?? [];
                $sent = ml_role_box($im, $a, 'sent');
                keep_special($u, $vk, ['special' => $before] + $a, $a['special'] ?? []);
                if ($sent) $im->append($sent, $raw, '\\Seen');
            }
            if ((int)($b['replyUid'] ?? 0) > 0 && (string)($b['replyFolder'] ?? '') !== '') { $im->select((string)$b['replyFolder']); $im->store((string)(int)$b['replyUid'], '+FLAGS.SILENT', $b['forward'] ?? false ? '$Forwarded' : '\\Answered'); }
            if ((int)($b['draftUid'] ?? 0) > 0 && !empty($a['special']['drafts'])) { $im->select($a['special']['drafts']); $im->expunge((string)(int)$b['draftUid']); }
            if ($im) $im->logout();
        } catch (MlMailError $e) {
            $warn = $e->kind;
        }
        send_json(['ok' => true, 'messageId' => $msgId, 'warn' => $warn]);

    case 'ml.draft':
        // A draft in the Drafts of the mailbox (the one before it is replaced): the other mail clients see it too
        $u = writer();
        $b = body();
        [$vk, $a] = mailbox($u, s($b, 'a', 16));
        [$raw] = compose($a, with_forwarded($u, $vk, $a, $b), true);
        $im = ml_imap($u, $vk, $a);
        $before = $a['special'] ?? [];
        $box = ml_role_box($im, $a, 'drafts');
        keep_special($u, $vk, ['special' => $before] + $a, $a['special'] ?? []);
        if (!$box) fail('no_drafts', 422);
        $uid = $im->append($box, $raw, '\\Draft \\Seen');
        if ((int)($b['draftUid'] ?? 0) > 0) { try { $im->select($box); $im->expunge((string)(int)$b['draftUid']); } catch (MlMailError $e) { /* already gone */ } }
        $im->logout();
        send_json(['ok' => true, 'uid' => $uid, 'folder' => $box]);

    default:
        fail('not_found', 404);
}

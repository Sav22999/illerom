<?php
/**
 * Signing in with Google or SavAccount, and joining them to an account that already exists. Shared by the projects with
 * accounts: each API requires this file, calls identity_setup() with its own functions and then identity_route($r).
 *
 * The rules (the same as most services):
 *   - a Google account or SavAccount already linked signs in;
 *   - an address nobody has starts a new account (after accepting the privacy notice);
 *   - an address that already has an account is never joined in silence: whoever is signing in has to prove that the
 *     account is theirs, with its password, with the other way of signing in it has, or with a code sent to the address;
 *   - an account whose address was never confirmed may have been opened by anyone: who proves the address (Google and
 *     SavAccount confirm theirs) takes it, and the password and sessions it had are dropped.
 *
 * Routes (JSON unless said otherwise):
 *   GET  auth.link              what is waiting to be joined or created in this browser
 *   POST auth.link              {method: password|code|google, password|code|credential}: proves the account and joins
 *   POST auth.link.code         sends the code
 *   POST auth.link.cancel
 *   POST auth.sav.start         {mode: login|connect|confirm} -> {url} of SavAccount
 *   GET  auth.sav.callback      where SavAccount comes back (redirects to the app with ?sav=…)
 *   POST auth.sav               finishes a new account that came from SavAccount
 *   GET  auth.methods           the ways of signing in of the signed-in account
 *   POST auth.methods.link      {provider: google, credential}
 *   POST auth.methods.unlink    {provider}
 *
 * The profile picture of SavAccount (the standard "picture" claim, an address of savaccount.eu that is different for
 * every service) is kept in users.sav_picture at every sign-in or link with SavAccount and dropped when it is unlinked:
 * public_user() of the project gives it to the page as `picture` (ident_picture()), the avatar shows it.
 */

declare(strict_types=1);

const IDENT_COLUMNS = ['google' => 'google_sub', 'savaccount' => 'sav_sub'];
const IDENT_NAMES = ['google' => 'Google', 'savaccount' => 'SavAccount'];
const IDENT_MINUTES = 20;
const IDENT_TRIES = 5;

/**
 * name      name of the project                        cookie   prefix of its cookies
 * lang      fn(): 'it'|'en'                            fail     fn(string code, int http)
 * create    fn(array who, array body): int             new account: who = {sub, email, name}
 * accepted  fn(array body): bool                       privacy or terms accepted
 * extra     fn(array who): array                       more to show in the sign-up (optional)
 * after     fn(int uid, array body)                    after every sign-in (optional)
 * created   fn(array user, string provider)            after a new account (optional)
 * writer    fn(): array                                the signed-in user of a POST, CSRF checked
 * pages     [name => file]                             other pages SavAccount can come back to, like ['admin' => 'admin.html'] (optional)
 */
function identity_setup(array $cfg): void
{
    $GLOBALS['identity_cfg'] = $cfg;
}

function ident(string $key)
{
    return $GLOBALS['identity_cfg'][$key] ?? null;
}

function ident_fail(string $code, int $http = 400): void
{
    (ident('fail'))($code, $http);
    exit;
}

function ident_q(string $sql, array $args = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

/** The table of what is in progress, and the column of SavAccount: added once, without touching the schema of the project. */
function ident_schema(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if (ident_q('SELECT v FROM ' . t('meta') . " WHERE k = 'identity'")->fetchColumn() === '2') return;
    db()->exec('CREATE TABLE IF NOT EXISTS ' . t('identity') . " (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `kind` VARCHAR(10) NOT NULL COMMENT 'flow: gone to SavAccount; link: to be joined; signup: to be created',
        `token_hash` CHAR(64) NOT NULL,
        `state_hash` CHAR(64) NULL,
        `mode` VARCHAR(10) NOT NULL DEFAULT '',
        `provider` VARCHAR(12) NOT NULL DEFAULT '',
        `sub` VARCHAR(190) NOT NULL DEFAULT '',
        `email` VARCHAR(190) NOT NULL DEFAULT '',
        `name` VARCHAR(190) NOT NULL DEFAULT '',
        `user_id` INT UNSIGNED NULL,
        `nonce` VARCHAR(64) NOT NULL DEFAULT '',
        `verifier` VARCHAR(128) NOT NULL DEFAULT '',
        `picture` VARCHAR(400) NOT NULL DEFAULT '',
        `code_hash` CHAR(64) NULL,
        `code_sent_at` DATETIME NULL,
        `tries` TINYINT UNSIGNED NOT NULL DEFAULT 0,
        `created_at` DATETIME NOT NULL,
        `expires_at` DATETIME NOT NULL,
        UNIQUE KEY `uq_token` (`token_hash`), KEY `ix_state` (`state_hash`), KEY `ix_expires` (`expires_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $users = trim(t('users'), '`');
    $has = ident_q("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'sav_sub'", [$users])->fetchColumn();
    if (!$has) db()->exec('ALTER TABLE ' . t('users') . ' ADD COLUMN `sav_sub` VARCHAR(190) CHARACTER SET ascii COLLATE ascii_bin NULL, ADD UNIQUE KEY `uq_sav` (`sav_sub`)');
    // 2: the profile picture of SavAccount
    $col = fn(string $table, string $name) => (int)ident_q('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [trim(t($table), '`'), $name])->fetchColumn();
    if (!$col('users', 'sav_picture')) db()->exec('ALTER TABLE ' . t('users') . ' ADD COLUMN `sav_picture` VARCHAR(400) NULL');
    if (!$col('identity', 'picture')) db()->exec('ALTER TABLE ' . t('identity') . " ADD COLUMN `picture` VARCHAR(400) NOT NULL DEFAULT ''");
    ident_q('INSERT INTO ' . t('meta') . " (k, v) VALUES ('identity', '2') ON DUPLICATE KEY UPDATE v = '2'");
}

/** The picture of SavAccount of an account, for public_user() of the project: an address of savaccount.eu, or null. */
function ident_picture(array $u): ?string
{
    $p = (string)($u['sav_picture'] ?? '');
    return $p !== '' && !empty($u['sav_sub']) ? $p : null;
}

/** Keeps the picture SavAccount gave (none: the account has no picture there, the avatar shows the initials). */
function ident_set_picture(int $uid, ?string $url): void
{
    ident_schema();
    ident_q('UPDATE ' . t('users') . ' SET sav_picture = ? WHERE id = ?', [$url !== null && $url !== '' ? $url : null, $uid]);
}

// ---------- cookies and rows of what is in progress

function ident_cookie_name(string $which): string
{
    return ident('cookie') . '_' . $which;
}

function ident_set_cookie(string $which, string $value, int $expires): void
{
    setcookie(ident_cookie_name($which), $value, ['expires' => $expires, 'path' => app_base_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    $_COOKIE[ident_cookie_name($which)] = $value;
}

function ident_new_row(string $cookie, array $row): string
{
    ident_schema();
    ident_q('DELETE FROM ' . t('identity') . ' WHERE expires_at < UTC_TIMESTAMP()');
    ident_forget($cookie);
    $token = bin2hex(random_bytes(32));
    $row += ['token_hash' => hash('sha256', $token), 'created_at' => now_utc(), 'expires_at' => gmdate('Y-m-d H:i:s', time() + IDENT_MINUTES * 60)];
    $cols = array_keys($row);
    ident_q('INSERT INTO ' . t('identity') . ' (' . implode(', ', $cols) . ') VALUES (' . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($row));
    ident_set_cookie($cookie, $token, time() + IDENT_MINUTES * 60);
    return $token;
}

function ident_row(string $cookie): ?array
{
    $token = $_COOKIE[ident_cookie_name($cookie)] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    ident_schema();
    $row = ident_q('SELECT * FROM ' . t('identity') . ' WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()', [hash('sha256', $token)])->fetch();
    return $row && ($row['kind'] === 'flow') === ($cookie === 'sav') ? $row : null;
}

function ident_forget(string $cookie): void
{
    $row = ident_row($cookie);
    if ($row) ident_q('DELETE FROM ' . t('identity') . ' WHERE id = ?', [$row['id']]);
    if (isset($_COOKIE[ident_cookie_name($cookie)])) ident_set_cookie($cookie, '', time() - 3600);
}

function ident_user(string $sql, array $args): ?array
{
    $u = ident_q('SELECT * FROM ' . t('users') . ' WHERE ' . $sql, $args)->fetch();
    return $u ?: null;
}

// ---------- signing in

function ident_session(int $uid, array $body): string
{
    ident_forget('ident');
    if (ident('after')) (ident('after'))($uid, $body);
    ident_q('UPDATE ' . t('users') . ' SET last_login_at = ? WHERE id = ?', [now_utc(), $uid]);
    return create_auth_session($uid);
}

function ident_done(int $uid, array $body): void
{
    $csrf = ident_session($uid, $body);
    send_json(['ok' => true, 'user' => public_user(ident_user('id = ?', [$uid])), 'csrf' => $csrf]);
}

/**
 * What to do with a confirmed identity: ['in', uid], ['link', row], ['signup', null], ['disabled', null], ['other', null]
 * (the address belongs to an account linked to another Google account or SavAccount).
 */
function ident_resolve(string $provider, array $who): array
{
    ident_schema();
    $col = IDENT_COLUMNS[$provider];
    $u = ident_user("$col = ?", [$who['sub']]);
    if ($u) return $u['status'] === 'active' ? ['in', $u] : ['disabled', null];
    $u = ident_user('email = ?', [$who['email']]);
    if (!$u) return ['signup', null];
    if ($u['status'] !== 'active') return ['disabled', null];
    // Linked to another SavAccount id: with pairwise ids the id of a person changes when the app moves to another service
    // of SavAccount (the apps of SavOffice now share one), so it is joined again, after the usual proof (never in silence)
    if (!empty($u[$col]) && $provider === 'savaccount' && !empty($u['email_verified_at'])) return ['link', $u];
    if (!empty($u[$col])) return ['other', null];
    if (empty($u['email_verified_at'])) {
        // nobody ever confirmed this address: it goes to who proves it, without the password someone else may have chosen
        ident_q('UPDATE ' . t('users') . " SET $col = ?, password_hash = '', email_verified_at = ? WHERE id = ? AND $col IS NULL", [$who['sub'], now_utc(), $u['id']]);
        ident_q('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?', [$u['id']]);
        return ['in', ident_user('id = ?', [$u['id']])];
    }
    return ['link', $u];
}

/** A sign-in made with a request of the app (Google): always answers. */
function ident_sign_in(string $provider, array $who, array $body): void
{
    [$what, $u] = ident_resolve($provider, $who);
    if ($what === 'disabled') ident_fail('disabled', 403);
    if ($what === 'other') ident_fail('identity_other', 409);
    if ($what === 'in') ident_done((int)$u['id'], $body);
    if ($what === 'link') {
        ident_new_row('ident', ['kind' => 'link', 'provider' => $provider, 'sub' => $who['sub'], 'email' => $who['email'], 'name' => mb_substr($who['name'], 0, 190), 'user_id' => $u['id']]);
        send_json(['ok' => false, 'error' => 'link_needed', 'link' => ident_link_info($provider, $u)]);
    }
    ident_create($provider, $who, $body);
}

function ident_create(string $provider, array $who, array $body): void
{
    if (!(ident('accepted'))($body)) send_json(['ok' => false, 'error' => 'needs_signup'] + ident_signup_info($provider, $who));
    if (too_many_attempts('register', 5, 60)) ident_fail('rate_limited', 429);
    $uid = (ident('create'))($who, $body);
    record_attempt('register');
    ident_q('UPDATE ' . t('users') . ' SET ' . IDENT_COLUMNS[$provider] . ' = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?', [$who['sub'], now_utc(), $uid]);
    if ($provider === 'savaccount') ident_set_picture($uid, $who['picture'] ?? '');
    if (ident('created')) (ident('created'))(ident_user('id = ?', [$uid]), $provider);
    ident_done($uid, $body);
}

function ident_signup_info(string $provider, array $who): array
{
    return ['provider' => $provider, 'name' => $who['name'], 'email' => $who['email']] + (ident('extra') ? (ident('extra'))($who) : []);
}

function ident_link_info(string $provider, array $u): array
{
    return ['provider' => $provider, 'email' => $u['email'], 'methods' => [
        'password' => ($u['password_hash'] ?? '') !== '',
        'google' => !empty($u['google_sub']) && (string)config_value('google_client_id', '') !== '' && $provider !== 'google',
        // never the same provider that is being joined (an old SavAccount id cannot prove the new one)
        'savaccount' => !empty($u['sav_sub']) && sav_enabled() && $provider !== 'savaccount',
        'code' => mail_settings() !== null,
    ]];
}

/** The account has been proved: the new way of signing in is joined to it. */
function ident_join(array $row, array $u): void
{
    $col = IDENT_COLUMNS[$row['provider']];
    if (ident_user("$col = ? AND id <> ?", [$row['sub'], $u['id']])) ident_fail('identity_taken', 409);
    // a SavAccount id left by an older service of SavAccount is replaced (the account has just been proved)
    $st = ident_q('UPDATE ' . t('users') . " SET $col = ? WHERE id = ? AND ($col IS NULL OR $col = ? OR ? = 'savaccount')", [$row['sub'], $u['id'], $row['sub'], $row['provider']]);
    if (!ident_user("id = ? AND $col = ?", [$u['id'], $row['sub']])) ident_fail('identity_other', 409);
    if ($row['provider'] === 'savaccount') ident_set_picture((int)$u['id'], (string)($row['picture'] ?? ''));
    ident_forget('ident');
    ident_notice($u, $row['provider'], true);
}

/** The row to be joined and its account, counting one more try before anything is compared. */
function ident_try(): array
{
    if (too_many_attempts('login', 10, 15)) ident_fail('rate_limited', 429);
    $row = ident_row('ident');
    $u = $row && $row['kind'] === 'link' ? ident_user('id = ?', [$row['user_id']]) : null;
    if (!$u) ident_fail('link_expired', 410);
    if ($u['status'] !== 'active') ident_fail('disabled', 403);
    if (ident_q('UPDATE ' . t('identity') . ' SET tries = tries + 1 WHERE id = ? AND tries < ?', [$row['id'], IDENT_TRIES])->rowCount() !== 1) {
        ident_forget('ident');
        ident_fail('link_expired', 410);
    }
    return [$row, $u];
}

// ---------- emails

function ident_mail(array $u, string $subject, array $paragraphs, string $big = ''): void
{
    if (!mail_settings()) return;
    $p = fn(string $x, string $style) => '<p style="margin:0 0 16px;' . $style . '">' . htmlspecialchars($x, ENT_QUOTES, 'UTF-8') . '</p>';
    $blocks = [];
    foreach ($paragraphs as $i => $x) {
        $blocks[] = $p($x, $i ? 'font-size:14px;opacity:.85' : '');
        if ($i === 0 && $big !== '') $blocks[] = $p($big, 'font-size:30px;font-weight:700;letter-spacing:.18em');
    }
    queue_mail((string)$u['email'], (string)$u['name'], $subject, mail_layout((ident('lang'))(), $subject, $blocks), implode("\n\n", $big === '' ? $paragraphs : array_merge([$paragraphs[0], $big], array_slice($paragraphs, 1))));
}

function ident_notice(array $u, string $provider, bool $linked): void
{
    $app = ident('name');
    $p = IDENT_NAMES[$provider];
    $it = (ident('lang'))() === 'it';
    $subject = $linked ? ($it ? "$p collegato al tuo account $app" : "$p linked to your $app account") : ($it ? "$p scollegato dal tuo account $app" : "$p unlinked from your $app account");
    ident_mail($u, $subject, $linked
        ? [$it ? "Da ora puoi accedere a $app anche con $p." : "From now on you can also sign in to $app with $p.", $it ? 'Se non sei stato tu, accedi, scollegalo da «Metodi di accesso» e cambia la password.' : 'If it wasn’t you, sign in, unlink it under “Sign-in methods” and change your password.']
        : [$it ? "Non puoi più accedere a $app con $p." : "You can no longer sign in to $app with $p.", $it ? 'Se non sei stato tu, accedi e cambia la password.' : 'If it wasn’t you, sign in and change your password.']);
}

// ---------- SavAccount (OpenID Connect, code flow with PKCE; the secret never leaves the server)

function sav_issuer(): string
{
    return rtrim(getenv('SAVACCOUNT_ISSUER') ?: 'https://www.savaccount.eu', '/');
}

function sav_enabled(): bool
{
    return (string)config_value('savaccount_client_id', '') !== '' && (string)config_value('savaccount_client_secret', '') !== '' && function_exists('curl_init');
}

function sav_redirect_uri(): string
{
    return app_url() . 'api/?r=auth.sav.callback';
}

function ident_b64u(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/** $page: where to come back to, one of the names of 'pages' (the app itself when it is empty). */
function sav_start(string $mode, ?int $uid, string $page = ''): string
{
    $state = ident_b64u(random_bytes(32));
    $nonce = ident_b64u(random_bytes(24));
    $verifier = ident_b64u(random_bytes(48));
    ident_new_row('sav', ['kind' => 'flow', 'mode' => $mode, 'state_hash' => hash('sha256', $state), 'nonce' => $nonce, 'verifier' => $verifier, 'user_id' => $uid, 'name' => $page]);
    return sav_issuer() . '/authorize?' . http_build_query([
            'response_type' => 'code', 'client_id' => config_value('savaccount_client_id', ''), 'redirect_uri' => sav_redirect_uri(), 'scope' => 'openid profile email',
            'state' => $state, 'nonce' => $nonce, 'code_challenge' => ident_b64u(hash('sha256', $verifier, true)), 'code_challenge_method' => 'S256', 'ui_locales' => (ident('lang'))(),
        ], '', '&', PHP_QUERY_RFC3986);
}

/** Exchanges the code for the identity; null when SavAccount does not confirm it. */
function sav_identity(array $flow, string $code): ?array
{
    $id = (string)config_value('savaccount_client_id', '');
    $ch = curl_init(sav_issuer() . '/oauth/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_POSTFIELDS => http_build_query(['grant_type' => 'authorization_code', 'code' => $code, 'redirect_uri' => sav_redirect_uri(), 'code_verifier' => $flow['verifier'],
            'client_id' => $id, 'client_secret' => (string)config_value('savaccount_client_secret', '')], '', '&', PHP_QUERY_RFC3986),
    ]);
    $raw = (string)curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $d = json_decode($raw, true);
    if ($http !== 200 || !is_array($d) || !is_string($d['id_token'] ?? null)) {
        error_log(ident('name') . ' SavAccount: token endpoint answered ' . $http . ' ' . (is_array($d) ? (string)($d['error'] ?? '') : curl_error($ch)));
        return null;
    }
    // The token comes straight from SavAccount over TLS, so its claims are enough (OpenID Connect Core 3.1.3.7)
    $parts = explode('.', $d['id_token']);
    $c = count($parts) === 3 ? json_decode((string)base64_decode(strtr($parts[1], '-_', '+/')), true) : null;
    $aud = is_array($c) ? ($c['aud'] ?? null) : null;
    $ok = is_array($c) && ($c['iss'] ?? '') === sav_issuer() && ($aud === $id || $aud === [$id]) && (int)($c['exp'] ?? 0) > time() - 60
        && is_string($c['nonce'] ?? null) && hash_equals($flow['nonce'], $c['nonce'])
        && is_string($c['sub'] ?? null) && $c['sub'] !== '' && strlen($c['sub']) <= 190
        && ($c['email_verified'] ?? false) === true && filter_var($c['email'] ?? '', FILTER_VALIDATE_EMAIL);
    if (!$ok) {
        error_log(ident('name') . ' SavAccount: the ID token is not valid');
        return null;
    }
    // the picture: only an https address of SavAccount itself (it is shown as an image in the pages of the project)
    $pic = is_string($c['picture'] ?? null) ? $c['picture'] : '';
    if ($pic !== '' && (strlen($pic) > 400 || !str_starts_with($pic, sav_issuer() . '/picture/') || !filter_var($pic, FILTER_VALIDATE_URL))) $pic = '';
    return ['sub' => $c['sub'], 'email' => mb_strtolower((string)$c['email']), 'name' => trim((string)(($c['nickname'] ?? '') !== '' ? $c['nickname'] : ($c['name'] ?? ''))), 'picture' => $pic];
}

/** The page of the project with this name (for example the administration); the app itself for any other. */
function ident_page(string $name): string
{
    $pages = ident('pages') ?? [];
    return $name !== '' ? (string)($pages[$name] ?? '') : '';
}

/** Back to the app: ?sav=in|link|signup|connected|cancelled|… */
function sav_back(string $result, string $page = ''): void
{
    static $to = '';
    if ($page !== '') $to = ident_page($page);
    if ($result === '') return;
    ident_set_cookie('sav', '', time() - 3600);
    header('Cache-Control: no-store');
    header('Referrer-Policy: no-referrer');
    header('Location: ' . app_base_path() . $to . '?sav=' . $result, true, 302);
    exit;
}

function sav_callback(): void
{
    if (!sav_enabled()) sav_back('failed');
    $flow = ident_row('sav');
    $state = $_GET['state'] ?? '';
    if (!$flow || !is_string($state) || !hash_equals((string)$flow['state_hash'], hash('sha256', $state))) sav_back('expired');
    sav_back('', (string)$flow['name']);
    ident_q('DELETE FROM ' . t('identity') . ' WHERE id = ?', [$flow['id']]); // once only
    if (isset($_GET['error'])) sav_back($_GET['error'] === 'access_denied' ? 'cancelled' : 'failed');
    if (isset($_GET['iss']) && $_GET['iss'] !== sav_issuer()) sav_back('failed');
    $code = $_GET['code'] ?? '';
    $who = is_string($code) && $code !== '' && strlen($code) <= 500 ? sav_identity($flow, $code) : null;
    if (!$who) sav_back('failed');

    if ($flow['mode'] === 'connect') {
        $u = current_user();
        if (!$u || (int)$u['id'] !== (int)$flow['user_id']) sav_back('expired');
        if (ident_user('sav_sub = ? AND id <> ?', [$who['sub'], $u['id']])) sav_back('taken');
        $full = ident_user('id = ?', [$u['id']]);
        // signed in already: a SavAccount id of an older service is replaced (and the account is told, as for a new link)
        ident_q('UPDATE ' . t('users') . ' SET sav_sub = ? WHERE id = ?', [$who['sub'], $u['id']]);
        ident_set_picture((int)$u['id'], $who['picture']);
        if ($full['sav_sub'] !== $who['sub']) ident_notice($full, 'savaccount', true);
        sav_back('connected');
    }

    if ($flow['mode'] === 'confirm') { // SavAccount proves the account a Google account is to be joined to
        $row = ident_row('ident');
        $u = $row && $row['kind'] === 'link' ? ident_user('id = ? AND sav_sub = ?', [$row['user_id'], $who['sub']]) : null;
        if (!$row) sav_back('expired');
        if (!$u || $u['status'] !== 'active') sav_back('mismatch');
        $col = IDENT_COLUMNS[$row['provider']];
        if (!empty($u[$col]) || ident_user("$col = ?", [$row['sub']])) sav_back('taken');
        ident_join($row, $u);
        ident_set_picture((int)$u['id'], $who['picture']);
        ident_session((int)$u['id'], []);
        sav_back('linked');
    }

    [$what, $u] = ident_resolve('savaccount', $who);
    if ($what === 'in') {
        ident_set_picture((int)$u['id'], $who['picture']);
        ident_session((int)$u['id'], []);
        sav_back('in');
    }
    if ($what === 'disabled' || $what === 'other') sav_back($what);
    ident_new_row('ident', ['kind' => $what === 'link' ? 'link' : 'signup', 'provider' => 'savaccount', 'sub' => $who['sub'], 'email' => $who['email'], 'name' => mb_substr($who['name'], 0, 190), 'picture' => $who['picture'], 'user_id' => $u['id'] ?? null]);
    sav_back($what === 'link' ? 'link' : 'signup');
}

// ---------- routes

function identity_route(string $r): void
{
    static $routes = ['auth.link', 'auth.link.code', 'auth.link.cancel', 'auth.sav', 'auth.sav.start', 'auth.sav.callback', 'auth.methods', 'auth.methods.link', 'auth.methods.unlink'];
    if (!in_array($r, $routes, true)) return;
    $post = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
    if (!$post && !in_array($r, ['auth.link', 'auth.sav.callback', 'auth.methods'], true)) ident_fail('bad_request', 405);
    if ($post && in_array($r, ['auth.sav.callback', 'auth.methods'], true)) ident_fail('bad_request', 405);

    switch ($r) {
        case 'auth.sav.callback':
            sav_callback();

        case 'auth.sav.start':
            if (!sav_enabled()) ident_fail('sav_disabled', 400);
            if (too_many_attempts('sav', 30, 15)) ident_fail('rate_limited', 429);
            record_attempt('sav');
            $mode = (string)(body()['mode'] ?? 'login');
            if (!in_array($mode, ['login', 'connect', 'confirm'], true)) ident_fail('bad_request', 422);
            $uid = null;
            $page = is_string(body()['page'] ?? null) ? body()['page'] : '';
            if ($mode === 'connect') $uid = (int)(ident('writer'))()['id'];
            if ($mode === 'confirm') {
                $row = ident_row('ident');
                if (!$row || $row['kind'] !== 'link') ident_fail('link_expired', 410);
            }
            send_json(['ok' => true, 'url' => sav_start($mode, $uid, ident_page($page) !== '' ? $page : '')]);

        case 'auth.sav':
            $row = ident_row('ident');
            if (!$row || $row['kind'] !== 'signup') ident_fail('link_expired', 410);
            // things may have changed since: the same rules again
            ident_sign_in($row['provider'], ['sub' => $row['sub'], 'email' => $row['email'], 'name' => $row['name'], 'picture' => (string)($row['picture'] ?? '')], body());

        case 'auth.link':
            if (!$post) {
                $row = ident_row('ident');
                $u = $row && $row['kind'] === 'link' ? ident_user('id = ?', [$row['user_id']]) : null;
                send_json(['ok' => true, 'link' => $u ? ident_link_info($row['provider'], $u) : null,
                    'signup' => $row && $row['kind'] === 'signup' ? ident_signup_info($row['provider'], ['sub' => $row['sub'], 'email' => $row['email'], 'name' => $row['name']]) : null]);
            }
            $b = body();
            $method = (string)($b['method'] ?? '');
            [$row, $u] = ident_try();
            if ($method === 'password') {
                if (($u['password_hash'] ?? '') === '' || !password_verify((string)($b['password'] ?? ''), $u['password_hash'])) {
                    record_attempt('login');
                    ident_fail('bad_password', 422);
                }
            } elseif ($method === 'code') {
                $fresh = $row['code_hash'] !== null && strtotime($row['code_sent_at'] . ' UTC') > time() - 900;
                if (!$fresh || !hash_equals((string)$row['code_hash'], hash_hmac('sha256', preg_replace('/\D/', '', (string)($b['code'] ?? '')), (string)$row['token_hash']))) {
                    record_attempt('login');
                    ident_fail('bad_code', 422);
                }
            } elseif ($method === 'google') {
                if (!function_exists('verify_google_token')) ident_fail('bad_request', 422); // apps without Google (SavOffice)
                $g = verify_google_token((string)($b['credential'] ?? ''));
                if (empty($u['google_sub']) || !hash_equals((string)$u['google_sub'], (string)$g['sub'])) ident_fail('identity_mismatch', 422);
            } else ident_fail('bad_request', 422);
            clear_attempts('login');
            ident_join($row, $u);
            ident_done((int)$u['id'], $b);

        case 'auth.link.code':
            $row = ident_row('ident');
            $u = $row && $row['kind'] === 'link' ? ident_user('id = ?', [$row['user_id']]) : null;
            if (!$u) ident_fail('link_expired', 410);
            if (!mail_settings()) ident_fail('mail_off', 400);
            if (too_many_attempts('verify_mail', 5, 60) || ($row['code_sent_at'] !== null && strtotime($row['code_sent_at'] . ' UTC') > time() - 60)) ident_fail('rate_limited', 429);
            record_attempt('verify_mail');
            $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            ident_q('UPDATE ' . t('identity') . ' SET code_hash = ?, code_sent_at = ? WHERE id = ?', [hash_hmac('sha256', $code, (string)$row['token_hash']), now_utc(), $row['id']]);
            $app = ident('name');
            $p = IDENT_NAMES[$row['provider']];
            $it = (ident('lang'))() === 'it';
            ident_mail($u, $it ? "Codice per collegare $p a $app" : "Code to link $p to $app", [
                $it ? "Scrivi questo codice in $app per collegare $p al tuo account. Vale 15 minuti." : "Enter this code in $app to link $p to your account. It works for 15 minutes.",
                $it ? 'Se non sei stato tu, ignora questa email: senza il codice non succede nulla.' : 'If it wasn’t you, ignore this email: without the code nothing happens.'], $code);
            send_json(['ok' => true]);

        case 'auth.link.cancel':
            ident_forget('ident');
            send_json(['ok' => true]);

        case 'auth.methods':
            $u = current_user();
            if (!$u) ident_fail('unauthenticated', 401);
            ident_schema();
            send_json(['ok' => true] + ident_methods((int)$u['id']));

        case 'auth.methods.link':
            $me = (ident('writer'))();
            ident_schema();
            if ((body()['provider'] ?? '') !== 'google') ident_fail('bad_request', 422);
            if (!function_exists('verify_google_token')) ident_fail('bad_request', 422);
            $g = verify_google_token((string)(body()['credential'] ?? ''));
            $u = ident_user('id = ?', [$me['id']]);
            if (ident_user('google_sub = ? AND id <> ?', [$g['sub'], $u['id']])) ident_fail('identity_taken', 409);
            if (!empty($u['google_sub']) && $u['google_sub'] !== $g['sub']) ident_fail('identity_other', 409);
            ident_q('UPDATE ' . t('users') . ' SET google_sub = ? WHERE id = ?', [$g['sub'], $u['id']]);
            if (empty($u['google_sub'])) ident_notice($u, 'google', true);
            send_json(['ok' => true] + ident_methods((int)$u['id']));

        case 'auth.methods.unlink':
            $me = (ident('writer'))();
            ident_schema();
            $provider = (string)(body()['provider'] ?? '');
            if (!isset(IDENT_COLUMNS[$provider])) ident_fail('bad_request', 422);
            $col = IDENT_COLUMNS[$provider];
            $u = ident_user('id = ?', [$me['id']]);
            $other = $provider === 'google' ? 'sav_sub' : 'google_sub';
            if (($u['password_hash'] ?? '') === '' && empty($u[$other])) ident_fail('last_method', 422);
            if (!empty($u[$col])) {
                ident_q('UPDATE ' . t('users') . " SET $col = NULL" . ($provider === 'savaccount' ? ', sav_picture = NULL' : '') . ' WHERE id = ?', [$u['id']]);
                ident_notice($u, $provider, false);
            }
            send_json(['ok' => true] + ident_methods((int)$u['id']));
    }
}

function ident_methods(int $uid): array
{
    $u = ident_user('id = ?', [$uid]);
    return ['email' => $u['email'], 'password' => ($u['password_hash'] ?? '') !== '', 'google' => !empty($u['google_sub']), 'savaccount' => !empty($u['sav_sub']),
        'available' => ['google' => (string)config_value('google_client_id', '') !== '', 'savaccount' => sav_enabled()]];
}

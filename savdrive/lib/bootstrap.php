<?php
/**
 * SavDrive — shared bootstrap of the API.
 * Compatible with PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+.
 *
 * Errors are sent as codes: the app translates them (see err_* in assets/i18n.js).
 * Accounts: email + password (the address must be confirmed before the app opens) or SavAccount (../identity/). The email
 * of an account is unique and can never be changed.
 *
 * Space and activation are decided by the master admins (credentials.php), from the admin panel of the app:
 *   - every account has the default space (500 MB unless changed), or a space of its own (users.quota);
 *   - an account is activated or not (users.activated): a new one is activated at once, or waits for an admin, as the
 *     admins choose (setting default_active). An account that is not activated can sign in, sees that it is waiting and
 *     can delete itself, nothing else; its files stay where they are.
 */

declare(strict_types=1);

const APP_NAME = 'SavDrive';
const AUTH_COOKIE = 'savdrive_auth';
const SCHEMA_VERSION = 5; // 2: uploads.replace_id (an app of SavOffice saves its file back into the drive) · 3: usage (the space used by the other apps) · 4: shares, comments, nodes.created_by · 5: temporary links (temp_links, temp_items, uploads.temp_id)
const LANGS = ['en', 'it'];
const GB = 1073741824;
const DEFAULT_QUOTA = 500 * 1048576;   // 500 MB, until the admins choose another one
const MAX_QUOTA = 10240 * GB;          // what an admin can give at most as a number (10 TB)
const UNLIMITED = PHP_INT_MAX;         // a space without a limit (an admin's choice, by person)
const CHUNK_BYTES = 4194304;           // a piece of an upload (4 MB: under the usual post_max_size of PHP)
const MAX_NODES = 50000;               // files and folders of one account
const MAX_DEPTH = 30;                  // folders inside folders
const UPLOAD_HOURS = 24;               // an upload left half-way is forgotten after this
const TRASH_DAYS = 30;


// ---------- Configuration ----------

function credentials_file(): string
{
    $env = getenv('SAVDRIVE_CREDENTIALS');
    if ($env) return $env;
    $own = dirname(__DIR__) . '/credentials.php';
    // without its own file SavDrive uses the credentials of SavDocuments (database, SavAccount, admins, email), always
    // with its own tables (dr_), as SavBooks does
    return is_file($own) ? $own : dirname(__DIR__, 2) . '/savdocuments/credentials.php';
}

/** True when the credentials are borrowed from SavDocuments: then the table prefix is never theirs. */
function borrowed_credentials(): bool
{
    return !getenv('SAVDRIVE_CREDENTIALS') && !is_file(dirname(__DIR__) . '/credentials.php');
}

/** Reads credentials.php (see credentials-sample.php). Null when the app is not installed yet. */
function credentials(): ?array
{
    static $cfg = false;
    if ($cfg !== false) return $cfg;
    $file = credentials_file();
    if (!is_file($file)) return $cfg = null;
    $localhost_db = $username_db = $password_db = $database_name = null;
    $table_prefix = 'dr_';
    $debug = false;
    $mail_config = null;
    $savaccount_client_id = $savaccount_client_secret = '';
    $master_emails = [];
    $storage_dir = '';
    require $file;
    if (!$localhost_db || !$username_db || !$database_name) return $cfg = null;
    if (borrowed_credentials()) $table_prefix = 'dr_';
    return $cfg = [
        'host' => (string)$localhost_db,
        'user' => (string)$username_db,
        'pass' => (string)$password_db,
        'name' => (string)$database_name,
        'prefix' => (string)($table_prefix ?: 'dr_'),
        'debug' => (bool)$debug,
        'savaccount_client_id' => trim((string)$savaccount_client_id),
        'savaccount_client_secret' => trim((string)$savaccount_client_secret),
        'mail' => $mail_config === false ? false : (is_array($mail_config) ? $mail_config : null),
        'master_emails' => array_values(array_filter(array_map(fn($e) => mb_strtolower(trim((string)$e)), (array)$master_emails))),
        'storage' => rtrim((string)($storage_dir ?: dirname(__DIR__) . '/storage'), '/\\'),
    ];
}

function config_value(string $key, $default = null)
{
    $c = credentials();
    return $c[$key] ?? $default;
}

/** Table name with prefix, already quoted: t('users') -> `dr_users`. */
function t(string $name): string
{
    $prefix = (string)config_value('prefix', 'dr_');
    if (!preg_match('/^[A-Za-z0-9_]{0,20}$/', $prefix)) throw new RuntimeException('Invalid table prefix');
    return '`' . $prefix . $name . '`';
}

function pdo_connect(string $host, string $user, string $pass, string $name): PDO
{
    $port = 3306;
    if (preg_match('/^(.+):(\d+)$/', $host, $m)) {
        $host = $m[1];
        $port = (int)$m[2];
    }
    $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $name), $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_TIMEOUT => 10,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function db(?PDO $set = null): PDO
{
    static $pdo = null;
    if ($set) return $pdo = $set;
    if ($pdo === null) {
        $c = credentials();
        if (!$c) throw new RuntimeException('not_installed');
        $pdo = pdo_connect($c['host'], $c['user'], $c['pass'], $c['name']);
        ensure_schema();
    }
    return $pdo;
}

function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function is_https(): bool
{
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') return true;
    if (($_SERVER['SERVER_PORT'] ?? '') === '443') return true;
    return strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

/** Folder of the app (e.g. "/savdrive/"), used as the cookie path. */
function app_base_path(): string
{
    $dir = dirname(str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/')));
    if (basename($dir) === 'api') $dir = dirname($dir);
    $dir = rtrim($dir, '/');
    return $dir === '' ? '/' : $dir . '/';
}

/** Absolute URL of the app (e.g. https://www.illerom.eu/savdrive/); without a request, the one saved by the last one. */
function app_url(): string
{
    static $url = null;
    if ($url !== null) return $url;
    if (PHP_SAPI === 'cli' || !isset($_SERVER['HTTP_HOST'])) {
        $saved = '';
        try {
            $saved = (string)db()->query('SELECT v FROM ' . t('meta') . " WHERE k = 'app_url'")->fetchColumn();
        } catch (Throwable $e) { /* not installed yet */
        }
        return $url = $saved ?: 'https://www.illerom.eu/savdrive/';
    }
    $host = preg_replace('/[^a-z0-9.:-]/i', '', (string)$_SERVER['HTTP_HOST']);
    return $url = (is_https() ? 'https://' : 'http://') . $host . app_base_path();
}

/** Remembers the public address of the app for the emails sent without a request. */
function remember_app_url(): void
{
    if (PHP_SAPI === 'cli' || !isset($_SERVER['HTTP_HOST'])) return;
    $url = app_url();
    try {
        if (setting('app_url', '') !== $url) set_setting('app_url', $url);
    } catch (Throwable $e) { /* not important */
    }
}

// ---------- Settings of the whole app (chosen by the master admins), in the meta table ----------

/** All the settings, read once per request (set_setting keeps them up to date). */
function &settings_cache(): array
{
    static $all = null;
    if ($all === null) $all = array_column(db()->query('SELECT k, v FROM ' . t('meta'))->fetchAll(), 'v', 'k');
    return $all;
}

function setting(string $k, string $default = ''): string
{
    $all = &settings_cache();
    return array_key_exists($k, $all) ? (string)$all[$k] : $default;
}

function set_setting(string $k, string $v): void
{
    db()->prepare('INSERT INTO ' . t('meta') . ' (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)')->execute([$k, $v]);
    $all = &settings_cache();
    $all[$k] = $v;
}

/** The space of an account that has none of its own. */
function default_quota(): int
{
    $q = (int)setting('default_quota', (string)DEFAULT_QUOTA);
    return $q > 0 ? $q : DEFAULT_QUOTA;
}

/** Whether a new account can use the app at once, or waits for an admin. */
function default_active(): bool
{
    return setting('default_active', '1') === '1';
}

// ---------- JSON helpers ----------

function send_json($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $errorCode, int $code = 400): void
{
    if (db_in_transaction()) db()->rollBack();
    send_json(['ok' => false, 'error' => $errorCode], $code);
}

function db_in_transaction(): bool
{
    try {
        return credentials() !== null && db()->inTransaction();
    } catch (Throwable $e) {
        return false;
    }
}

function body(): array
{
    static $b = null;
    if ($b !== null) return $b;
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return $b = [];
    $d = json_decode($raw, true);
    if (!is_array($d)) fail('bad_request', 400);
    return $b = $d;
}

/** Trimmed string from the request, without control characters, cut at $max characters. */
function s(array $src, string $key, int $max = 255): string
{
    $v = $src[$key] ?? '';
    if (!is_string($v) && !is_numeric($v)) $v = '';
    $v = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string)$v) ?? '');
    return mb_substr($v, 0, $max);
}

function json_out($v): string
{
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}

// ---------- Sessions (HttpOnly cookie, only the SHA-256 of the token is stored) ----------

function set_auth_cookie(string $value, int $expires): void
{
    setcookie(AUTH_COOKIE, $value, ['expires' => $expires, 'path' => app_base_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
}

function create_auth_session(int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(24));
    $expires = time() + 60 * 60 * 24 * 30; // 30 days
    db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE expires_at < UTC_TIMESTAMP()')->execute();
    db()->prepare('INSERT INTO ' . t('auth_tokens') . ' (token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?,?)')
        ->execute([hash('sha256', $token), $userId, $csrf, now_utc(), now_utc(), gmdate('Y-m-d H:i:s', $expires)]);
    set_auth_cookie($token, $expires);
    return $csrf;
}

function destroy_auth_session(): void
{
    $token = $_COOKIE[AUTH_COOKIE] ?? '';
    if (is_string($token) && $token !== '') db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE token_hash = ?')->execute([hash('sha256', $token)]);
    set_auth_cookie('', time() - 3600);
}

function current_user(): ?array
{
    static $cached = false;
    if ($cached !== false) return $cached;
    $token = $_COOKIE[AUTH_COOKIE] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return $cached = null;
    $st = db()->prepare('SELECT u.*, a.csrf_token, a.last_seen_at AS token_seen, a.token_hash FROM ' . t('auth_tokens') . ' a
        JOIN ' . t('users') . ' u ON u.id = a.user_id WHERE a.token_hash = ? AND a.expires_at > UTC_TIMESTAMP()');
    $st->execute([hash('sha256', $token)]);
    $u = $st->fetch();
    if (!$u) return $cached = null;
    if (strtotime($u['token_seen'] . ' UTC') < time() - 300) {
        db()->prepare('UPDATE ' . t('auth_tokens') . ' SET last_seen_at = ? WHERE token_hash = ?')->execute([now_utc(), $u['token_hash']]);
    }
    unset($u['token_hash'], $u['token_seen']);
    $u['id'] = (int)$u['id'];
    return $cached = $u;
}

/** Master admin of the whole app: a confirmed account whose email is listed in credentials.php. */
function is_master(array $u): bool
{
    return !empty($u['email_verified_at']) && in_array(mb_strtolower((string)$u['email']), (array)config_value('master_emails', []), true);
}

/** Masters can always use the app; everybody else once activated. */
function is_activated(array $u): bool
{
    return !empty($u['activated']) || is_master($u);
}

/** The space of an account: its own, or the default one. */
function user_quota(array $u): int
{
    $own = email_quota((string)($u['email'] ?? ''));
    if ($own !== null) return $own;
    return isset($u['quota']) && $u['quota'] !== null && $u['quota'] !== '' ? (int)$u['quota'] : default_quota();
}

/** The space of its own a person has (by email, also without an account of SavDrive), or null = the default one. */
function email_quota(string $email): ?int
{
    if ($email === '') return null;
    $st = db()->prepare('SELECT quota FROM ' . t('quotas') . ' WHERE email = ?');
    $st->execute([mb_strtolower($email)]);
    $q = $st->fetchColumn();
    return $q === false ? null : (int)$q;
}

/** Bytes used by an account: its files (the trash too, as in every drive) and the uploads that are under way. */
function user_used(int $uid, bool $withUploads = false): int
{
    $st = db()->prepare('SELECT COALESCE(SUM(size),0) FROM ' . t('nodes') . " WHERE user_id = ? AND kind = 'file'");
    $st->execute([$uid]);
    $n = (int)$st->fetchColumn() + temp_used($uid) + array_sum(other_apps($uid));
    if ($withUploads) {
        $st = db()->prepare('SELECT COALESCE(SUM(size),0) FROM ' . t('uploads') . ' WHERE user_id = ? AND expires_at > ?');
        $st->execute([$uid, now_utc()]);
        $n += (int)$st->fetchColumn();
    }
    return $n;
}

/** The files uploaded only for temporary links (lib/temp.php): they count in the space until the link ends. */
function temp_used(int $uid): int
{
    $st = db()->prepare('SELECT COALESCE(SUM(size),0) FROM ' . t('temp_items') . ' WHERE user_id = ? AND bkey IS NOT NULL');
    $st->execute([$uid]);
    return (int)$st->fetchColumn();
}

/**
 * What the other apps of SavOffice keep for this person (the same email), as they reported it (lib/space.php): the space
 * of SavDrive is the space of the whole suite. ['savdocuments' => bytes, …]
 */
function other_apps(int $uid): array
{
    static $memo = [];
    if (isset($memo[$uid])) return $memo[$uid];
    $st = db()->prepare('SELECT g.app, g.bytes FROM ' . t('usage') . ' g JOIN ' . t('users') . " u ON u.email = g.email WHERE u.id = ? AND g.bytes > 0 AND g.app <> 'savdrive' ORDER BY g.bytes DESC");
    $st->execute([$uid]);
    return $memo[$uid] = array_map('intval', array_column($st->fetchAll(), 'bytes', 'app'));
}

/**
 * What the other apps of SavOffice keep for this person, listed (lib/space.php, savspace_catalog_save): the folder of each
 * app in My drive. ['savdocuments' => ['folders' => [[id, name, parent]], 'items' => [[id, title, folder, bytes, updated,
 * address]], 'updated' => …], …], only the apps with something in them.
 */
/** The apps whose documents have a folder in My drive (the others keep things that live only in their app: calendars, polls…). */
const OFFICE_FOLDERS = ['savdocuments', 'savspreadsheets', 'savpresentations', 'savbooks', 'savwhiteboard', 'savnotes', 'savforms'];

function office_catalogs(array $u): array
{
    try {
        $st = db()->prepare('SELECT app, catalog, updated_at FROM ' . t('office') . ' WHERE email = ? AND items > 0 ORDER BY app');
        $st->execute([mb_strtolower((string)$u['email'])]);
    } catch (PDOException $e) {
        return []; // no app has sent its list yet (the table is made by the first one)
    }
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $c = json_decode((string)$r['catalog'], true);
        if (is_array($c) && !empty($c['items']) && in_array($r['app'], OFFICE_FOLDERS, true)) $out[$r['app']] = ['folders' => $c['folders'] ?? [], 'items' => $c['items'], 'updated' => iso($r['updated_at'])];
    }
    return $out;
}

/** The folders of the apps in My drive: [{app, count, size, updated, peek: [{name, app}]}] */
function office_summary(array $u): array
{
    $out = [];
    foreach (office_catalogs($u) as $app => $c) {
        $items = $c['items'];
        usort($items, fn($a, $b) => strcmp((string)($b[4] ?? ''), (string)($a[4] ?? '')));
        $out[] = ['app' => $app, 'count' => count($c['items']), 'folders' => count($c['folders']), 'size' => array_sum(array_map(fn($d) => (int)$d[3], $c['items'])),
            'updated' => $items[0][4] ?? $c['updated'], 'peek' => array_map(fn($d) => ['name' => (string)$d[1]], array_slice($items, 0, 2))];
    }
    return $out;
}

/** The space of an account, app by app: ['savdrive' => its files, 'savdocuments' => …] */
function space_parts(int $uid): array
{
    $st = db()->prepare('SELECT COALESCE(SUM(size),0) FROM ' . t('nodes') . " WHERE user_id = ? AND kind = 'file'");
    $st->execute([$uid]);
    return array_filter(['savdrive' => (int)$st->fetchColumn() + temp_used($uid)] + other_apps($uid));
}

/** A space without a limit. */
function is_unlimited(int $q): bool
{
    return $q >= UNLIMITED;
}

function public_user(array $u): array
{
    return [
        'id' => (int)$u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'picture' => function_exists('ident_picture') ? ident_picture($u) : null, // the profile picture of SavAccount (../identity/identity.php)
        'lang' => $u['ui_lang'] ?: 'en',
        'prefs' => json_decode((string)($u['prefs'] ?? ''), true) ?: new stdClass(),
        'hasPassword' => ($u['password_hash'] ?? '') !== '',
        'savLinked' => !empty($u['sav_sub']),
        'verified' => !empty($u['email_verified_at']),
        'activated' => is_activated($u),
        'master' => is_master($u),
        'quota' => user_quota($u),
        'used' => user_used((int)$u['id']),
        'parts' => (object)space_parts((int)$u['id']),
        'unlimited' => is_unlimited(user_quota($u)),
        'mailReady' => mail_settings() !== null,
    ];
}

/** Applies the database changes of newer versions (one cheap read of the meta table per request). */
function ensure_schema(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    $c = credentials();
    if (!$c) return;
    try {
        $v = (int)db()->query('SELECT v FROM ' . t('meta') . " WHERE k = 'schema_version'")->fetchColumn();
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S02') throw $e;
        $v = 0; // credentials.php is there but the tables are not: they are created now
    }
    if ($v < SCHEMA_VERSION) {
        require_once __DIR__ . '/schema.php';
        install_schema(db(), $c['prefix']);
    }
}

/**
 * $unverifiedOk: the few calls an account can make before confirming its email or being activated (resend the link,
 * the profile, delete itself).
 */
function require_user(bool $unverifiedOk = false): array
{
    $u = current_user();
    if (!$u) fail('unauthenticated', 401);
    if ($u['status'] !== 'active') fail('disabled', 403);
    if (!$unverifiedOk && empty($u['email_verified_at'])) fail('email_unverified', 403);
    if (!$unverifiedOk && !is_activated($u)) fail('not_activated', 403);
    return $u;
}

function require_csrf(array $u): void
{
    $sent = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($sent === '' || !hash_equals((string)$u['csrf_token'], $sent)) fail('csrf', 403);
}

// ---------- Rate limiting ----------

function too_many_attempts(string $kind, int $max, int $minutes): bool
{
    $st = db()->prepare('SELECT COUNT(*) FROM ' . t('attempts') . ' WHERE kind = ? AND ip = ? AND created_at > ?');
    $st->execute([$kind, client_ip(), gmdate('Y-m-d H:i:s', time() - $minutes * 60)]);
    return (int)$st->fetchColumn() >= $max;
}

function record_attempt(string $kind): void
{
    db()->prepare('INSERT INTO ' . t('attempts') . ' (kind, ip, created_at) VALUES (?,?,?)')->execute([$kind, client_ip(), now_utc()]);
}

function clear_attempts(string $kind): void
{
    db()->prepare('DELETE FROM ' . t('attempts') . ' WHERE kind = ? AND ip = ?')->execute([$kind, client_ip()]);
}


// ---------- Small helpers ----------

/** A UTC datetime of the database as ISO 8601 for the browser. */
function iso(?string $utc): ?string
{
    return $utc ? gmdate('Y-m-d\TH:i:s\Z', strtotime($utc . ' UTC')) : null;
}

require_once __DIR__ . '/mail.php';
require_once __DIR__ . '/files.php';
require_once __DIR__ . '/access.php';
require_once __DIR__ . '/temp.php';
require_once __DIR__ . '/archive.php';

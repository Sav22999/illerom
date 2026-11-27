<?php
/**
 * SavWhiteboard — bootstrap of the API. SavWhiteboard, SavSchedules and SavCalendar are one service with three faces: the
 * same database, the same accounts (the tables of SavSchedules, prefix "sch_") and the same session, whose cookie is set
 * on the paths of all three apps (sign in once, use all). The boards keep their own tables next to them: sch_wb_*.
 * Compatible with PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+.
 *
 * Errors are sent as codes: the app translates them (see err_* in assets/i18n.js).
 * Accounts: email + password (the address must be confirmed before the app opens) or SavAccount (../identity/). No
 * Google sign-in: SavOffice is an independent European alternative. The email of an account is unique and can never be changed.
 */

declare(strict_types=1);

const APP_NAME = 'SavWhiteboard';
const AUTH_COOKIE = 'savschedules_auth';     // the same cookie of SavSchedules: one session for all
const SHARED_APPS = ['savschedules', 'savcalendar', 'savwhiteboard', 'savtasks', 'savnotes', 'savforms', 'savsplits', 'savpodcasts', 'savmail', 'savreads']; // folders next to each other that share the session
const SCHEMA_VERSION = 1;              // of the tables of SavSchedules (created here only if SavSchedules never ran)
const WB_SCHEMA_VERSION = 2;           // of the tables of the boards (2: pictures and the cache of searches)
const LANGS = ['en', 'it'];
const MAX_BOARDS = 2000;               // boards of one account (the trash included)
const MAX_BOARD_BYTES = 8000000;       // a board as JSON (strokes, texts, pictures inside it)
const MAX_THUMB_BYTES = 90000;         // the small picture of a board in the home
const MAX_UPLOAD_BYTES = 15 * 1048576; // a picture that can be sent (as in SavPresentations)
const MAX_IMAGE_BYTES = 8000000;       // what is kept of it, after it has been made smaller
const TRASH_DAYS = 30;


// ---------- Configuration ----------

/** The credentials of SavSchedules: same database, same accounts. */
function credentials_file(): string
{
    $env = getenv('SAVSCHEDULES_CREDENTIALS');
    return $env ?: dirname(__DIR__, 2) . '/savschedules/credentials.php';
}

/**
 * Reads the credentials of SavSchedules, then savwhiteboard/credentials.php when it is there (optional, see
 * credentials-sample.php): it may give SavWhiteboard its own SavAccount service. Null when nothing is installed yet.
 */
function credentials(): ?array
{
    static $cfg = false;
    if ($cfg !== false) return $cfg;
    $file = credentials_file();
    if (!is_file($file)) return $cfg = null;
    $localhost_db = $username_db = $password_db = $database_name = null;
    $table_prefix = 'sch_';
    $debug = false;
    $mail_config = null;
    $savaccount_client_id = $savaccount_client_secret = '';
    $master_emails = [];
    require $file;
    // what is only of the boards: set here, or in savwhiteboard/credentials.php (never taken from SavSchedules)
    $storage_dir = '';
    $quota_mb = 500;
    $http_user_agent = '';
    $pexels_key = $pixabay_key = '';
    $own = dirname(__DIR__) . '/credentials.php';
    if (is_file($own)) require $own;
    if (!$localhost_db || !$username_db || !$database_name) return $cfg = null;
    return $cfg = [
        'host' => (string)$localhost_db,
        'user' => (string)$username_db,
        'pass' => (string)$password_db,
        'name' => (string)$database_name,
        'prefix' => (string)($table_prefix ?: 'sch_'),
        'debug' => (bool)$debug,
        'savaccount_client_id' => trim((string)$savaccount_client_id),
        'savaccount_client_secret' => trim((string)$savaccount_client_secret),
        'mail' => $mail_config === false ? false : (is_array($mail_config) ? $mail_config : null),
        'master_emails' => array_values(array_filter(array_map(fn($e) => mb_strtolower(trim((string)$e)), (array)$master_emails))),
        'storage' => rtrim((string)$storage_dir, '/') ?: dirname(__DIR__) . '/storage',
        'quota' => max(10, (int)$quota_mb) * 1048576,
        'user_agent' => trim((string)$http_user_agent) ?: 'SavWhiteboard/1.0 (+https://www.illerom.eu/savwhiteboard/)',
        'pexels_key' => trim((string)$pexels_key),
        'pixabay_key' => trim((string)$pixabay_key),
    ];
}

function config_value(string $key, $default = null)
{
    $c = credentials();
    return $c[$key] ?? $default;
}

/** Table name with prefix, already quoted: t('users') -> `sch_users`. */
function t(string $name): string
{
    $prefix = (string)config_value('prefix', 'sch_');
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

/** Folder of the app (e.g. "/savwhiteboard/"). */
function app_base_path(): string
{
    $dir = dirname(str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/')));
    if (basename($dir) === 'api') $dir = dirname($dir);
    $dir = rtrim($dir, '/');
    return $dir === '' ? '/' : $dir . '/';
}

/**
 * Absolute URL of the app (e.g. https://www.illerom.eu/savwhiteboard/).
 * The cron scripts have no request: they use the address saved by the last web request (meta wb_app_url).
 */
function app_url(): string
{
    static $url = null;
    if ($url !== null) return $url;
    if (PHP_SAPI === 'cli' || !isset($_SERVER['HTTP_HOST']) || basename(dirname((string)($_SERVER['SCRIPT_NAME'] ?? ''))) === 'cron') {
        $saved = '';
        try {
            $saved = (string)db()->query('SELECT v FROM ' . t('meta') . " WHERE k = 'wb_app_url'")->fetchColumn();
        } catch (Throwable $e) { /* not installed yet */
        }
        return $url = $saved ?: 'https://www.illerom.eu/savwhiteboard/';
    }
    $host = preg_replace('/[^a-z0-9.:-]/i', '', (string)$_SERVER['HTTP_HOST']);
    $url = (is_https() ? 'https://' : 'http://') . $host . app_base_path();
    return $url;
}

/** Remembers the public address of the app for the cron scripts (one write a day at most). */
function remember_app_url(): void
{
    if (PHP_SAPI === 'cli' || !isset($_SERVER['HTTP_HOST'])) return;
    $url = app_url();
    try {
        $st = db()->query('SELECT v FROM ' . t('meta') . " WHERE k = 'wb_app_url'");
        if ((string)$st->fetchColumn() !== $url) {
            db()->prepare('INSERT INTO ' . t('meta') . " (k, v) VALUES ('wb_app_url', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([$url]);
        }
    } catch (Throwable $e) { /* not important */
    }
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

/** Like s() but keeps the line breaks (longer texts: terms, page intro). */
function multiline(array $src, string $key, int $max = 5000): string
{
    $v = $src[$key] ?? '';
    if (!is_string($v)) $v = '';
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $v = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '');
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

/** The folders that share the session, as cookie paths ("/savschedules/", "/savcalendar/", "/savwhiteboard/"). */
function shared_paths(): array
{
    $parent = rtrim(dirname(rtrim(app_base_path(), '/')), '/');
    return array_map(fn($a) => $parent . '/' . $a . '/', SHARED_APPS);
}

/** The session cookie on the path of each app that shares it: signing in or out here does it in all. */
function set_auth_cookie(string $value, int $expires): void
{
    foreach (shared_paths() as $path) setcookie(AUTH_COOKIE, $value, ['expires' => $expires, 'path' => $path, 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
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

/** Master admin of the whole platform: a confirmed account whose email is listed in credentials.php. */
function is_master(array $u): bool
{
    return !empty($u['email_verified_at']) && in_array(mb_strtolower((string)$u['email']), (array)config_value('master_emails', []), true);
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
        'master' => is_master($u),
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
    if ($v < 1) {
        // SavSchedules never ran on this database: its tables (the accounts) are created first, by its own schema
        require_once dirname(__DIR__, 2) . '/savschedules/lib/schema.php';
        install_schema(db(), $c['prefix']);
    }
    $wv = (int)db()->query('SELECT v FROM ' . t('meta') . " WHERE k = 'wb_schema_version'")->fetchColumn();
    if ($wv < WB_SCHEMA_VERSION) {
        require_once __DIR__ . '/schema.php';
        install_wb_schema(db(), $c['prefix']);
    }
}

/** $unverifiedOk: the few calls an account can make before confirming its email (resend the link, delete itself). */
function require_user(bool $unverifiedOk = false): array
{
    $u = current_user();
    if (!$u) fail('unauthenticated', 401);
    if ($u['status'] !== 'active') fail('disabled', 403);
    if (!$unverifiedOk && empty($u['email_verified_at'])) fail('email_unverified', 403);
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

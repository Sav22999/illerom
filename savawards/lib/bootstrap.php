<?php
/**
 * SavAwards — bootstrap of the API and of the public pages (certificate, badge, feed).
 *
 * Its own database tables (prefix "aw_" by default) and its own accounts: email + password (the address must be confirmed
 * before writing anything) or SavAccount. No Google: an awards portal of European and free software signs in without it.
 * Compatible with PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+.
 *
 * Roles (users.role):  1 member · 3 moderator · 5 administrator · 10 master administrator
 *   member         comments, favourites, own reviews, edit requests, product suggestions, People's choice votes
 *   moderator      + edits products and scores (all products, or only the ones of aw_mod_scopes), handles their
 *                  requests and reports
 *   administrator  + adds and deletes products, criteria, categories, awards editions; manages members and moderators
 *   master         + manages administrators, issues and revokes certificates
 * The addresses in $master_emails of credentials.php become master administrators once confirmed.
 *
 * Errors are sent as codes: the app translates them (err_* in assets/i18n.js).
 */

declare(strict_types=1);

const APP_NAME = 'SavAwards';
const AUTH_COOKIE = 'savawards_auth';
const SCHEMA_VERSION = 3;            // 2: products.features, certificates.kind; 3: screenshots
const LANGS = ['en'];               // the portal is in English only (the *_it columns are no longer used)
const ROLE_MEMBER = 1;
const ROLE_MOD = 3;
const ROLE_ADMIN = 5;
const ROLE_MASTER = 10;
const ROLES = [ROLE_MEMBER, ROLE_MOD, ROLE_ADMIN, ROLE_MASTER];
const MAX_LOGO_BYTES = 120000;   // a product logo, already made smaller by the app (PNG, JPEG or WebP)
const MAX_SHOTS = 10;            // screenshots of a product
const MAX_SHOT_BYTES = 900000;   // one screenshot, already made smaller by the app (1920 px at most)

// ---------- Configuration ----------

function credentials_file(): string
{
    $env = getenv('SAVAWARDS_CREDENTIALS');
    return $env ?: dirname(__DIR__) . '/credentials.php';
}

/** Reads credentials.php (see credentials-sample.php). Null when the app is not installed yet. */
function credentials(): ?array
{
    static $cfg = false;
    if ($cfg !== false) return $cfg;
    $file = credentials_file();
    if (!is_file($file)) return $cfg = null;
    $localhost_db = $username_db = $password_db = $database_name = null;
    $table_prefix = 'aw_';
    $debug = false;
    $mail_config = null;
    $savaccount_client_id = $savaccount_client_secret = '';
    $master_emails = [];
    require $file;
    if (!$localhost_db || !$username_db || !$database_name) return $cfg = null;
    return $cfg = [
        'host' => (string)$localhost_db,
        'user' => (string)$username_db,
        'pass' => (string)$password_db,
        'name' => (string)$database_name,
        'prefix' => (string)($table_prefix ?: 'aw_'),
        'debug' => (bool)$debug,
        'google_client_id' => '', // never: see the top of this file (identity.php reads it)
        'savaccount_client_id' => trim((string)$savaccount_client_id),
        'savaccount_client_secret' => trim((string)$savaccount_client_secret),
        'mail' => $mail_config === false ? false : (is_array($mail_config) ? $mail_config : null),
        'master_emails' => array_values(array_filter(array_map(fn($e) => mb_strtolower(trim((string)$e)), (array)$master_emails))),
    ];
}

function config_value(string $key, $default = null)
{
    $c = credentials();
    return $c[$key] ?? $default;
}

/** Table name with prefix, already quoted: t('users') -> `aw_users`. */
function t(string $name): string
{
    $prefix = (string)config_value('prefix', 'aw_');
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

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = credentials();
        if (!$c) throw new RuntimeException('not_installed');
        $pdo = pdo_connect($c['host'], $c['user'], $c['pass'], $c['name']);
        ensure_schema($pdo);
    }
    return $pdo;
}

/** Runs a query with its arguments. */
function q(string $sql, array $args = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st;
}

function ensure_schema(PDO $pdo): void
{
    $c = credentials();
    try {
        $v = (int)$pdo->query('SELECT v FROM ' . t('meta') . " WHERE k = 'schema_version'")->fetchColumn();
    } catch (PDOException $e) {
        if ($e->getCode() !== '42S02') throw $e;
        $v = 0;
    }
    if ($v < SCHEMA_VERSION) {
        require_once __DIR__ . '/schema.php';
        install_schema($pdo, $c['prefix'], $v);
    }
}

function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function iso(?string $utc): ?string
{
    return $utc ? gmdate('Y-m-d\TH:i:s\Z', strtotime($utc . ' UTC')) : null;
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

/** Folder of the app (e.g. "/savawards/"), also when the request is for api/ or a pretty address (c/…, badge/…). */
function app_base_path(): string
{
    $dir = dirname(str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/')));
    if (basename($dir) === 'api') $dir = dirname($dir);
    $dir = rtrim($dir, '/');
    return $dir === '' ? '/' : $dir . '/';
}

/** Absolute URL of the app (e.g. https://www.illerom.eu/savawards/). */
function app_url(): string
{
    static $url = null;
    if ($url !== null) return $url;
    if (PHP_SAPI === 'cli' || !isset($_SERVER['HTTP_HOST'])) return $url = 'https://www.illerom.eu/savawards/';
    $host = preg_replace('/[^a-z0-9.:-]/i', '', (string)$_SERVER['HTTP_HOST']);
    return $url = (is_https() ? 'https://' : 'http://') . $host . app_base_path();
}

/** The language of the request: ?lang=, the X-Lang header of the app, then the browser. */
function lang(): string
{
    return 'en'; // English only
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
    try {
        if (credentials() && db()->inTransaction()) db()->rollBack();
    } catch (Throwable $e) { /* no database */
    }
    send_json(['ok' => false, 'error' => $errorCode], $code);
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

/** Trimmed string, without control characters, cut at $max characters. */
function s(array $src, string $key, int $max = 255): string
{
    $v = $src[$key] ?? '';
    if (!is_string($v) && !is_numeric($v)) $v = '';
    $v = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string)$v) ?? '');
    return mb_substr($v, 0, $max);
}

/** Like s() but keeps the line breaks. */
function multiline(array $src, string $key, int $max = 8000): string
{
    $v = $src[$key] ?? '';
    if (!is_string($v)) $v = '';
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $v = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '');
    $v = preg_replace("/\n{3,}/", "\n\n", $v) ?? $v;
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

/** An http(s) address or ''. */
function clean_url(string $u): string
{
    $u = trim($u);
    if ($u === '') return '';
    if (!preg_match('~^https?://~i', $u)) $u = 'https://' . $u;
    return filter_var($u, FILTER_VALIDATE_URL) && preg_match('~^https?://[^/\s]+\.[^/\s]+~i', $u) ? mb_substr($u, 0, 300) : '';
}

function slugify(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['à' => 'a', 'á' => 'a', 'â' => 'a', 'ä' => 'a', 'ã' => 'a', 'å' => 'a', 'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e', 'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i',
        'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'ö' => 'o', 'õ' => 'o', 'ø' => 'o', 'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u', 'ñ' => 'n', 'ç' => 'c', 'ß' => 'ss', '+' => ' plus ', '&' => ' and ']);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s) ?? '';
    return trim(substr($s, 0, 80), '-');
}

/** The text in the language of the request, or the other one when it is empty. */
function pick(?string $it, ?string $en, ?string $l = null): string
{
    $l = $l ?? lang();
    $a = $l === 'it' ? (string)$it : (string)$en;
    return $a !== '' ? $a : ($l === 'it' ? (string)$en : (string)$it);
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
    $expires = time() + 60 * 60 * 24 * 30;
    q('DELETE FROM ' . t('auth_tokens') . ' WHERE expires_at < UTC_TIMESTAMP()');
    q('INSERT INTO ' . t('auth_tokens') . ' (token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?,?)',
        [hash('sha256', $token), $userId, $csrf, now_utc(), now_utc(), gmdate('Y-m-d H:i:s', $expires)]);
    set_auth_cookie($token, $expires);
    promote_master($userId);
    return $csrf;
}

function destroy_auth_session(): void
{
    $token = $_COOKIE[AUTH_COOKIE] ?? '';
    if (is_string($token) && $token !== '') q('DELETE FROM ' . t('auth_tokens') . ' WHERE token_hash = ?', [hash('sha256', $token)]);
    set_auth_cookie('', time() - 3600);
}

function current_user(): ?array
{
    static $cached = false;
    if ($cached !== false) return $cached;
    $token = $_COOKIE[AUTH_COOKIE] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return $cached = null;
    $u = q('SELECT u.*, a.csrf_token, a.last_seen_at AS token_seen, a.token_hash FROM ' . t('auth_tokens') . ' a
        JOIN ' . t('users') . ' u ON u.id = a.user_id WHERE a.token_hash = ? AND a.expires_at > UTC_TIMESTAMP()', [hash('sha256', $token)])->fetch();
    if (!$u) return $cached = null;
    if (strtotime($u['token_seen'] . ' UTC') < time() - 300) q('UPDATE ' . t('auth_tokens') . ' SET last_seen_at = ? WHERE token_hash = ?', [now_utc(), $u['token_hash']]);
    unset($u['token_hash'], $u['token_seen']);
    $u['id'] = (int)$u['id'];
    $u['role'] = (int)$u['role'];
    return $cached = $u;
}

/** The addresses of $master_emails become master administrators, once they are confirmed. */
function promote_master(int $uid): void
{
    $list = (array)config_value('master_emails', []);
    if (!$list) return;
    $u = q('SELECT email, email_verified_at, role FROM ' . t('users') . ' WHERE id = ?', [$uid])->fetch();
    if ($u && $u['email_verified_at'] && (int)$u['role'] < ROLE_MASTER && in_array(mb_strtolower((string)$u['email']), $list, true)) {
        q('UPDATE ' . t('users') . ' SET role = ? WHERE id = ?', [ROLE_MASTER, $uid]);
    }
}

function user_row(int $id): array
{
    return q('SELECT * FROM ' . t('users') . ' WHERE id = ?', [$id])->fetch() ?: [];
}

/** Product ids a moderator may edit; [0] = all of them. */
function mod_scope(array $u): array
{
    if ((int)$u['role'] >= ROLE_ADMIN) return [0];
    if ((int)$u['role'] < ROLE_MOD) return [];
    if (!empty($u['mod_all'])) return [0];
    return array_map('intval', q('SELECT product_id FROM ' . t('mod_scopes') . ' WHERE user_id = ?', [$u['id']])->fetchAll(PDO::FETCH_COLUMN));
}

function can_edit_product(array $u, int $productId): bool
{
    $scope = mod_scope($u);
    return in_array(0, $scope, true) || in_array($productId, $scope, true);
}

function public_user(array $u): array
{
    $u['role'] = (int)$u['role'];
    $scope = mod_scope($u);
    return [
        'id' => (int)$u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'picture' => function_exists('ident_picture') ? ident_picture($u) : null, // the profile picture of SavAccount (../identity/identity.php)
        'lang' => $u['ui_lang'] ?: 'en',
        'role' => $u['role'],
        'scope' => in_array(0, $scope, true) ? 'all' : $scope,
        'hasPassword' => ($u['password_hash'] ?? '') !== '',
        'savLinked' => !empty($u['sav_sub']),
        'verified' => !empty($u['email_verified_at']),
        'created' => iso($u['created_at'] ?? null),
    ];
}

/** $unverifiedOk: the few calls of an account whose email is not confirmed yet (resend the link, delete itself). */
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

/** A line of the audit log (what the staff changed, shown to administrators). */
function audit(?int $uid, string $action, string $type, int $id, array $detail = []): void
{
    q('INSERT INTO ' . t('audit') . ' (user_id, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,?)',
        [$uid, $action, $type, $id, $detail ? json_out($detail) : null, now_utc()]);
}

// ---------- Rate limiting ----------

function too_many_attempts(string $kind, int $max, int $minutes): bool
{
    return (int)q('SELECT COUNT(*) FROM ' . t('attempts') . ' WHERE kind = ? AND ip = ? AND created_at > ?', [$kind, client_ip(), gmdate('Y-m-d H:i:s', time() - $minutes * 60)])->fetchColumn() >= $max;
}

function record_attempt(string $kind): void
{
    q('DELETE FROM ' . t('attempts') . ' WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 86400)]); // kept 24 hours at most (privacy notice)
    q('INSERT INTO ' . t('attempts') . ' (kind, ip, created_at) VALUES (?,?,?)', [$kind, client_ip(), now_utc()]);
}

function clear_attempts(string $kind): void
{
    q('DELETE FROM ' . t('attempts') . ' WHERE kind = ? AND ip = ?', [$kind, client_ip()]);
}

/** identity.php asks for it only when Google is configured, which never happens here. */
function verify_google_token(string $credential): array
{
    fail('google_disabled', 400);
    return [];
}

require_once __DIR__ . '/mail.php';

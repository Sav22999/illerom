<?php
/**
 * GET /api/status/            every project
 * GET /api/status/?project=chess   one project
 *   {"ok": true, "status": "up", "checkedAt": "2026-11-24T22:00:00Z", "ttl": 60,
 *    "projects": {"chess": {"name", "url", "status", "services": [{"id", "name", "type", "status", "detail", "ms"}]}}}
 * status: up | degraded | down | unknown (the server could not check by itself).
 *
 * Results are kept for CACHE_TTL seconds (one real round per minute, however many visitors); ?refresh=1 renews them only
 * after REFRESH_MIN seconds. Never exposes hosts, credentials or DBMS messages: details go to the PHP error log.
 */

declare(strict_types=1);

defined('ROOT') || define('ROOT', dirname(__DIR__, 2)); // the server of php -S goes through the index of the portal
const CACHE_TTL = 60;
const REFRESH_MIN = 15;
const TIMEOUT = 5;      // seconds, per connection
const SLOW_MS = 4000;   // slower than this = degraded
const CACHE_FILE = __DIR__ . '/.cache.json';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
header('Access-Control-Allow-Origin: *');

if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'HEAD'], true)) {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method']);
    exit;
}

require ROOT . '/include/lib.php';
require ROOT . '/include/services.php';
$site = require ROOT . '/data/site.php';
$projects = require ROOT . '/data/projects.php';
$services = services($projects, require ROOT . '/data/services.php', $site);
$only = (string)($_GET['project'] ?? '');
if ($only !== '' && !in_array($only, array_column($services, 'project'), true)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'project']);
    exit;
}

function result(string $status, string $detail, ?float $ms = null): array
{
    return ['status' => $status, 'detail' => $detail, 'ms' => $ms === null ? null : (int)round($ms)];
}

function elapsed(float $start): float
{
    return (microtime(true) - $start) * 1000;
}

function log_failure(string $id, Throwable $e): void
{
    error_log("[status] $id: " . get_class($e) . ' ' . $e->getMessage());
}

function valid_prefix($prefix, string $default): string
{
    return is_string($prefix) && preg_match('/^[A-Za-z0-9_]{0,20}$/', $prefix) ? $prefix : $default;
}

function split_host(string $host, int $port = 3306): array
{
    return preg_match('/^(.+):(\d+)$/', $host, $m) ? [$m[1], (int)$m[2]] : [$host, $port];
}

// ---------- Settings of each project (read in function scope: their variables stay here) ----------

/** credentials.php of the apps with accounts. */
function app_credentials(string $dir, string $defaultPrefix): ?array
{
    static $memo = [];
    if (array_key_exists($dir, $memo)) return $memo[$dir];
    $file = ROOT . "/$dir/credentials.php";
    if (!is_file($file)) return $memo[$dir] = null;
    $localhost_db = $username_db = $password_db = $database_name = null;
    $table_prefix = $defaultPrefix;
    $mail_config = null;
    require $file;
    if (!$localhost_db || !$username_db || !$database_name) return $memo[$dir] = null;
    [$host, $port] = split_host((string)$localhost_db);
    return $memo[$dir] = [
        'host' => $host, 'port' => $port, 'name' => (string)$database_name,
        'user' => (string)$username_db, 'pass' => (string)$password_db,
        'prefix' => valid_prefix($table_prefix ?: $defaultPrefix, $defaultPrefix),
        'mail' => is_array($mail_config) ? $mail_config : null,
    ];
}

/** api/db.php of the games: it connects (and exits on failure) when included, so its values are read as text. */
function game_credentials(string $dir): ?array
{
    $src = @file_get_contents(ROOT . "/$dir/api/db.php");
    if ($src === false) return null;
    $v = [];
    foreach (['localhost_db', 'username_db', 'password_db', 'database_name'] as $name) {
        if (!preg_match('/\$' . $name . '\s*=\s*([\'"])(.*?)\1\s*;/s', $src, $m)) return null;
        $v[$name] = $m[2];
    }
    [$host, $port] = split_host($v['localhost_db']);
    return ['host' => $host, 'port' => $port, 'name' => $v['database_name'], 'user' => $v['username_db'], 'pass' => $v['password_db']];
}

function site_mail_config(): ?array
{
    $file = ROOT . '/.mail-config.php';
    $c = is_file($file) ? (require $file) : null;
    return is_array($c) && !empty($c['smtp_host']) ? $c : null;
}

/** Latest schema version an app expects, read from its source (null when it cannot be found). */
function expected_schema(string $dir): ?int
{
    $src = (string)@file_get_contents(ROOT . "/$dir/lib/bootstrap.php");
    return preg_match('/const\s+SCHEMA_VERSION\s*=\s*(\d+)\s*;/', $src, $m) ? (int)$m[1] : null;
}

// ---------- Probes ----------

/** Connects and runs $query(PDO): array result. A host that did not answer is not tried again in this round. */
function db_probe(string $id, ?array $c, callable $query): array
{
    static $deadHosts = [];
    if (!$c) return result('down', 'Not configured');
    $key = $c['host'] . ':' . $c['port'];
    if (isset($deadHosts[$key])) return result('down', 'Database not reachable');
    $start = microtime(true);
    try {
        $pdo = new PDO("mysql:host={$c['host']};port={$c['port']};dbname={$c['name']};charset=utf8mb4", $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => TIMEOUT,
        ]);
    } catch (Throwable $e) {
        log_failure($id, $e);
        $deadHosts[$key] = true;
        return result('down', 'Database not reachable', elapsed($start));
    }
    try {
        $r = $query($pdo);
    } catch (PDOException $e) {
        log_failure($id, $e);
        $missing = $e->getCode() === '42S02';
        return result('down', $missing ? 'Database tables missing' : 'Database error', elapsed($start));
    }
    $r['ms'] = (int)round(elapsed($start));
    if ($r['status'] === 'up' && $r['ms'] > SLOW_MS) {
        $r['status'] = 'degraded';
        $r['detail'] = 'Slow response';
    }
    return $r;
}

function schema_probe(string $id, ?array $c, string $dir): array
{
    return db_probe($id, $c, function (PDO $pdo) use ($c, $dir) {
        $v = (int)$pdo->query("SELECT v FROM `{$c['prefix']}meta` WHERE k = 'schema_version'")->fetchColumn();
        $expected = expected_schema($dir);
        if ($v === 0) return result('down', 'Not installed');
        // The apps update their own schema on the next request: an older version is a pending update, not an outage
        if ($expected !== null && $v < $expected) return result('degraded', "Database update pending (v$v of v$expected)");
        return result('up', "Connected · schema v$v");
    });
}

function smtp_probe(?array $m): array
{
    static $memo = [];
    if (!$m) return result('degraded', 'Not configured: no emails are sent');
    $enc = strtolower((string)($m['smtp_encryption'] ?? ''));
    $host = (string)$m['smtp_host'];
    $port = (int)($m['smtp_port'] ?? ($enc === 'ssl' ? 465 : 587));
    $key = "$enc|$host|$port";
    if (isset($memo[$key])) return $memo[$key];
    $start = microtime(true);
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
    $fp = @stream_socket_client(($enc === 'ssl' ? 'ssl://' : 'tcp://') . "$host:$port", $errno, $errstr, TIMEOUT, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        error_log("[status] smtp: $errno $errstr");
        return $memo[$key] = result('down', 'Mail server not reachable', elapsed($start));
    }
    stream_set_timeout($fp, TIMEOUT);
    $line = '';
    do {
        $line = fgets($fp, 1024);
    } while ($line !== false && substr($line, 3, 1) === '-'); // multi-line greeting: "220-..." lines, then "220 ..."
    if ($line !== false) fwrite($fp, "QUIT\r\n");
    fclose($fp);
    $ms = elapsed($start);
    if ($line === false || strpos($line, '220') !== 0) return $memo[$key] = result('down', 'Mail server not ready', $ms);
    return $memo[$key] = result($ms > SLOW_MS ? 'degraded' : 'up', $ms > SLOW_MS ? 'Slow response' : 'Mail server ready', $ms);
}

/** Fetches all the URLs in parallel. */
function http_fetch_all(array $urls): array
{
    $out = [];
    if (!$urls) return $out;
    if (!function_exists('curl_multi_init')) {
        foreach ($urls as $u) $out[$u] = ['code' => 0, 'ms' => 0, 'body' => '', 'error' => 'curl missing'];
        return $out;
    }
    $mh = curl_multi_init();
    $handles = [];
    foreach ($urls as $u) {
        $h = curl_init($u);
        curl_setopt_array($h, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => TIMEOUT,
            CURLOPT_TIMEOUT => TIMEOUT + 3,
            CURLOPT_USERAGENT => 'IlleromStatus/1.0 (+https://www.illerom.eu/en/status/)',
            CURLOPT_HTTPHEADER => ['Accept: text/html,application/json;q=0.9,*/*;q=0.8', 'Cache-Control: no-cache'],
        ]);
        curl_multi_add_handle($mh, $h);
        $handles[$u] = $h;
    }
    do {
        $st = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running && $st === CURLM_OK);
    foreach ($handles as $u => $h) {
        $out[$u] = [
            'code' => (int)curl_getinfo($h, CURLINFO_RESPONSE_CODE),
            'ms' => (float)curl_getinfo($h, CURLINFO_TOTAL_TIME) * 1000,
            'body' => (string)curl_multi_getcontent($h),
            'error' => curl_error($h),
        ];
        curl_multi_remove_handle($mh, $h);
    }
    curl_multi_close($mh);
    return $out;
}

function http_result(array $r): array
{
    if ($r['code'] === 0) return result('down', 'Not reachable', $r['ms']);
    if ($r['code'] >= 400) return result('down', 'HTTP ' . $r['code'], $r['ms']);
    if ($r['ms'] > SLOW_MS) return result('degraded', 'Slow response', $r['ms']);
    return result('up', 'Online', $r['ms']);
}

/** Same order as the apps' lib/mail.php: their own $mail_config, otherwise the settings of the site. */
function mail_settings(string $dir): ?array
{
    $c = app_credentials($dir, '')['mail'] ?? null;
    if (!is_array($c) || empty($c['smtp_host'])) $c = site_mail_config();
    return is_array($c) && !empty($c['from_email']) ? $c : null;
}

function run_checks(array $services): array
{
    $http = http_fetch_all(array_values(array_unique(array_column(array_filter($services, fn($s) => $s['type'] === 'web'), 'url'))));
    $results = [];
    foreach ($services as $s) {
        $id = $s['id'];
        try {
            switch ($s['type']) {
                case 'web':
                    // the hosting may not let the site call itself: then the browser of who looks at the page checks it
                    $r = $http[$s['url']];
                    $results[$id] = $r['code'] === 0 ? result('unknown', 'Not checked by the server') : http_result($r);
                    break;
                case 'app':
                    $results[$id] = schema_probe($id, app_credentials($s['project'], $s['prefix']), $s['project']);
                    break;
                case 'game':
                    $table = valid_prefix($s['table'], 'rooms');
                    $results[$id] = db_probe($id, game_credentials($s['project']), function (PDO $pdo) use ($table) {
                        $pdo->query("SELECT 1 FROM `$table` LIMIT 1")->fetchColumn();
                        return result('up', 'Connected');
                    });
                    break;
                case 'mail':
                    $results[$id] = smtp_probe(mail_settings($s['project']));
                    break;
            }
        } catch (Throwable $e) {
            log_failure($id, $e);
            $results[$id] = result('down', 'Check failed');
        }
    }
    return $results;
}

/** The worst of a list: down, then degraded, then up; unknown only when nothing else is known. */
function worst(array $list): string
{
    foreach (['down', 'degraded', 'up'] as $s) if (in_array($s, $list, true)) return $s;
    return 'unknown';
}

// ---------- Cache + answer ----------

$fp = @fopen(CACHE_FILE, 'c+');
if ($fp) flock($fp, LOCK_EX); // concurrent visitors wait for one round instead of starting their own
$cached = $fp && ($raw = stream_get_contents($fp)) ? json_decode($raw, true) : null;
$age = is_array($cached) && isset($cached['time']) ? time() - (int)$cached['time'] : PHP_INT_MAX;

if ($age < (isset($_GET['refresh']) ? REFRESH_MIN : CACHE_TTL) && isset($cached['results'])) {
    $time = (int)$cached['time'];
    $results = $cached['results'];
} else {
    @set_time_limit(90);
    $time = time();
    $results = run_checks($services);
    if ($fp) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode(['time' => $time, 'results' => $results]));
        fflush($fp);
    }
}
if ($fp) {
    flock($fp, LOCK_UN);
    fclose($fp);
}

$out = [];
foreach ($services as $s) {
    $k = $s['project'];
    if ($only !== '' && $k !== $only) continue;
    if (!isset($out[$k])) {
        $url = $k === 'portal' ? '/' : app_url($k, $projects[$k]);
        $out[$k] = ['name' => $k === 'portal' ? 'Illerom' : $projects[$k]['name'], 'url' => is_external($url) ? $url : $site['url'] . $url, 'status' => '', 'services' => []];
    }
    $out[$k]['services'][] = ['id' => $s['id'], 'name' => $s['en'], 'type' => $s['type']] + ($results[$s['id']] ?? result('unknown', 'Not checked yet'));
}
foreach ($out as &$p) $p['status'] = worst(array_column($p['services'], 'status'));
unset($p);

echo json_encode([
    'ok' => true,
    'status' => worst(array_column($out, 'status')),
    'checkedAt' => gmdate('Y-m-d\TH:i:s\Z', $time),
    'ttl' => CACHE_TTL,
    'projects' => $out,
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

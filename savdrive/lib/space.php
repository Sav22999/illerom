<?php
/**
 * The space of SavOffice: one for each person, the one of SavDrive.
 *
 * Every app of SavOffice keeps its own accounts and database, but a person (the same email) has ONE space: the space of
 * SavDrive (the default one chosen by its admins, 2 GB at the start, or one of the account's own). It counts what the
 * person keeps in SavDrive and in every other app, even without an account of SavDrive or with one that is not activated.
 *
 *   - each app reports how much a person keeps there: savspace_report($email, 'savdocuments', $bytes) -> table dr_usage
 *   - before a write that would go beyond the space, the app refuses it: savspace_allows($email, $app, $more)
 *   - SavDrive adds its own files to the others (savspace_used)
 *
 * Required by the APIs of the apps, which have functions of their own with common names (db(), t(), credentials()…):
 * here everything is savspace_* and has its own connection, made with the credentials of SavDrive (savdrive/credentials.php,
 * or, as SavDrive itself does, the ones of SavDocuments with the tables dr_). If SavDrive cannot be reached, nothing is
 * refused (an app must never stop working because of the space).
 */

declare(strict_types=1);

const SAVSPACE_DEFAULT = 2147483648; // 2 GB, until the admins of SavDrive choose another space

/** [PDO, prefix] of the database of SavDrive, or null. */
function savspace_db(): ?array
{
    static $c = false;
    if ($c !== false) return $c;
    $c = null;
    $env = getenv('SAVDRIVE_CREDENTIALS');
    $own = dirname(__DIR__) . '/credentials.php';
    $file = $env ?: (is_file($own) ? $own : dirname(__DIR__, 2) . '/savdocuments/credentials.php');
    if (!is_file($file)) return null;
    $read = static function (string $file): array {
        $localhost_db = $username_db = $password_db = $database_name = null;
        $table_prefix = 'dr_';
        require $file;
        return [(string)$localhost_db, (string)$username_db, (string)$password_db, (string)$database_name, (string)$table_prefix];
    };
    try {
        [$host, $user, $pass, $name, $prefix] = $read($file);
        if (!$env && !is_file($own)) $prefix = 'dr_'; // borrowed from SavDocuments: always the tables of SavDrive
        if (!$host || !$user || !$name || !preg_match('/^[A-Za-z0-9_]{0,20}$/', $prefix)) return null;
        $port = 3306;
        if (preg_match('/^(.+):(\d+)$/', $host, $m)) [$host, $port] = [$m[1], (int)$m[2]];
        $pdo = new PDO(sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $name), $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_TIMEOUT => 5,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
        $pdo->exec("CREATE TABLE IF NOT EXISTS `{$prefix}usage` (
            `email` VARCHAR(190) NOT NULL,
            `app` VARCHAR(30) NOT NULL,
            `bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `updated_at` DATETIME NOT NULL,
            PRIMARY KEY (`email`, `app`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        return $c = [$pdo, $prefix];
    } catch (Throwable $e) {
        error_log('SavOffice space: SavDrive cannot be reached: ' . $e->getMessage());
        return null;
    }
}

function savspace_q(string $sql, array $args = []): ?PDOStatement
{
    $c = savspace_db();
    if (!$c) return null;
    try {
        $st = $c[0]->prepare(str_replace('{p}', $c[1], $sql));
        $st->execute($args);
        return $st;
    } catch (PDOException $e) {
        if ($e->getCode() === '42S02') return null; // SavDrive has not created its tables yet
        error_log('SavOffice space: ' . $e->getMessage());
        return null;
    }
}

/** The space of a person: the one of their account of SavDrive, or the default one of SavDrive. */
function savspace_quota(string $email): int
{
    $email = mb_strtolower(trim($email));
    $st = savspace_q('SELECT quota FROM `{p}quotas` WHERE email = ?', [$email]);
    $q = $st ? $st->fetchColumn() : false;
    if ($q === false) { $st = savspace_q('SELECT quota FROM `{p}users` WHERE email = ?', [$email]); $q = $st ? $st->fetchColumn() : false; } // before SavDrive moved them
    if ($q !== false && $q !== null) return (int)$q;
    $st = savspace_q("SELECT v FROM `{p}meta` WHERE k = 'default_quota'");
    $d = $st ? (int)$st->fetchColumn() : 0;
    return $d > 0 ? $d : SAVSPACE_DEFAULT;
}

/** What each app keeps for a person: ['savdrive' => bytes, 'savdocuments' => bytes, …] (only what is not zero). */
function savspace_apps(string $email): array
{
    $email = mb_strtolower(trim($email));
    $out = [];
    $st = savspace_q("SELECT COALESCE(SUM(n.size),0) FROM `{p}nodes` n JOIN `{p}users` u ON u.id = n.user_id WHERE u.email = ? AND n.kind = 'file'", [$email]);
    $drive = $st ? (int)$st->fetchColumn() : 0;
    $st = savspace_q('SELECT COALESCE(SUM(p.size),0) FROM `{p}uploads` p JOIN `{p}users` u ON u.id = p.user_id WHERE u.email = ? AND p.expires_at > UTC_TIMESTAMP()', [$email]);
    $drive += $st ? (int)$st->fetchColumn() : 0;
    if ($drive) $out['savdrive'] = $drive;
    $st = savspace_q('SELECT app, bytes FROM `{p}usage` WHERE email = ? AND bytes > 0 ORDER BY bytes DESC', [$email]);
    foreach ($st ? $st->fetchAll() : [] as $r) $out[$r['app']] = (int)$r['bytes'];
    return $out;
}

/** Bytes used by a person in the whole of SavOffice; $except leaves one app out (to count it as it is now). */
function savspace_used(string $email, ?string $except = null): int
{
    $all = savspace_apps($email);
    if ($except !== null) unset($all[$except]);
    return array_sum($all);
}

/** An app tells how much a person keeps there now. */
function savspace_report(string $email, string $app, int $bytes): void
{
    $email = mb_strtolower(trim($email));
    if ($email === '' || !preg_match('/^[a-z0-9]{2,30}$/', $app)) return;
    savspace_q('INSERT INTO `{p}usage` (email, app, bytes, updated_at) VALUES (?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE bytes = VALUES(bytes), updated_at = VALUES(updated_at)', [$email, $app, max(0, $bytes)]);
}

/** When an app last reported a person (UTC timestamp), 0 = never. */
function savspace_reported(string $email, string $app): int
{
    $st = savspace_q('SELECT updated_at FROM `{p}usage` WHERE email = ? AND app = ?', [mb_strtolower(trim($email)), $app]);
    $t = $st ? $st->fetchColumn() : false;
    return $t ? (int)strtotime($t . ' UTC') : 0;
}

/**
 * Whether a person can keep $more bytes in $app. $appNow: what the app keeps for them now (null = the last reported).
 * Never refuses when SavDrive cannot be reached.
 */
function savspace_allows(string $email, string $app, int $more, ?int $appNow = null): bool
{
    if (!savspace_db()) return true;
    $all = savspace_apps($email);
    if ($appNow !== null) $all[$app] = $appNow;
    return array_sum($all) + max(0, $more) <= savspace_quota($email);
}

/** For the apps that show the space: ['used' => bytes, 'quota' => bytes, 'apps' => [...]] or null without SavDrive. */
function savspace_info(string $email): ?array
{
    if (!savspace_db()) return null;
    $apps = savspace_apps($email);
    return ['used' => array_sum($apps), 'quota' => savspace_quota($email), 'apps' => $apps];
}

/**
 * The same rule for every app, called by its writer() (every POST of a signed-in person): a write that would take the
 * person beyond their space is refused (the size of the request is what it can add); what frees space or changes nothing
 * (deleting, trash, sign-in, admin…) always passes. After the write the app reports what it keeps now ($measure), at most
 * once a minute, or at once after a big write or something deleted.
 */
function savspace_gate(array $u, string $app, string $action, callable $measure, callable $fail): void
{
    $email = (string)($u['email'] ?? '');
    if ($email === '' || !savspace_db()) return;
    $len = max(0, (int)($_SERVER['CONTENT_LENGTH'] ?? 0));
    $frees = (bool)preg_match('/^(auth|master|identity)\.|(^|\.)(delete|trash|remove|leave|empty|empty_trash|cancel|star|unstar|move|rename|logout|presence|ping|resolve|report|read|seen|visit|order|sort|prefs|profile)([._]|$)/', $action);
    if (!$frees && $len > 0 && !savspace_allows($email, $app, $len)) $fail();
    $big = $len > 65536 || preg_match('/(delete|trash|remove|empty)/', $action);
    register_shutdown_function(static function () use ($email, $app, $measure, $big) {
        try {
            if (!$big && time() - savspace_reported($email, $app) < 60) return;
            savspace_report($email, $app, (int)$measure());
        } catch (Throwable $e) { /* never in the way of the answer */
        }
    });
}

/** For auth.me and the lists of the home: keeps the count of the app up to date (at most every 10 minutes). */
function savspace_touch(array $u, string $app, callable $measure): void
{
    $email = (string)($u['email'] ?? '');
    if ($email === '' || !savspace_db() || time() - savspace_reported($email, $app) < 600) return;
    register_shutdown_function(static function () use ($email, $app, $measure) {
        try { savspace_report($email, $app, (int)$measure()); } catch (Throwable $e) { /* never in the way */ }
    });
}

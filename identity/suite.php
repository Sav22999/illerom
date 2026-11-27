<?php
/**
 * SavOffice — ONE account for all the apps of the suite. An account made in any app (email and password, or SavAccount)
 * is the account of every app; signing in or out in one app does it in all of them.
 *
 *   - The accounts are the tables of SavSchedules (its credentials.php, prefix "sch_"): users, auth_tokens (the sessions),
 *     email_tokens (links to confirm the address and to reset the password). Every app reads and writes them through t():
 *     t('users') is always these tables, whatever the prefix of the app (suite_table()).
 *   - One session cookie, SUITE_COOKIE, set on the path of every app (suite_paths()): HttpOnly, never on the rest of the site.
 *   - What belongs to one app stays in its own tables, with its own prefix (sd_documents, dr_nodes…), tied to the account by a
 *     foreign key on users.id: deleting the account deletes what it had in every app of the same database. The settings of
 *     an app live in its own table (sd_profiles, nb_profiles…), never in users.prefs, which SavSchedules and the apps that
 *     always shared its accounts use.
 *   - A few columns on the account belong to one app and are added by suite_install(): blocks by the admins (block_reason,
 *     block_note, blocked_at), the settings of SavPresentations (settings), the space and activation of SavDrive (quota,
 *     activated, activated_at), the favourite templates of SavNewsletters (fav_templates).
 *   - The accounts may live in another database of the same server (SavNewsletters): the tables are then named with their
 *     database (`db`.`sch_users`), and the same MySQL user must be able to reach both.
 *
 * Once only (the suite was in testing, 2026-11): an app that still had accounts of its own drops all its tables the first
 * time it runs with this file (suite_reset_app()), and starts again on the shared accounts.
 */
declare(strict_types=1);

if (defined('SUITE_COOKIE')) return;

const SUITE_COOKIE = 'savoffice_auth';
const SUITE_APPS = ['savbooks', 'savcalendar', 'savcontacts', 'savdiagrams', 'savdocuments', 'savdrive', 'savforms', 'savmail', 'savnewsletters',
    'savnotes', 'savphotos', 'savpodcasts', 'savpresentations', 'savreads', 'savschedules', 'savsplits', 'savspreadsheets', 'savtasks', 'savwhiteboard'];
const SUITE_TABLES = ['users', 'auth_tokens', 'email_tokens'];

/** Where the accounts are: the database and the prefix of SavSchedules. Null when SavSchedules has no credentials.php. */
function suite_accounts(): ?array
{
    static $c = false;
    if ($c !== false) return $c;
    $file = getenv('SAVSCHEDULES_CREDENTIALS') ?: dirname(__DIR__) . '/savschedules/credentials.php';
    if (!is_file($file)) return $c = null;
    $read = static function (string $file): array {
        $localhost_db = $username_db = $password_db = $database_name = null;
        $table_prefix = 'sch_';
        require $file;
        return [(string)$database_name, (string)($table_prefix ?: 'sch_')];
    };
    [$db, $prefix] = $read($file);
    if (!preg_match('/^[A-Za-z0-9_]{1,20}$/', $prefix) || !preg_match('/^[A-Za-z0-9_$-]{1,64}$/', $db)) return $c = null;
    return $c = ['db' => $db, 'prefix' => $prefix];
}

/** An account table seen from an app whose own database is $appDb: `sch_users`, or `db`.`sch_users` in another database. */
function suite_table(string $name, string $appDb): string
{
    $a = suite_accounts();
    if (!$a) throw new RuntimeException('SavOffice: the accounts need savschedules/credentials.php');
    $t = '`' . $a['prefix'] . $name . '`';
    return $appDb !== '' && $a['db'] !== $appDb ? '`' . $a['db'] . '`.' . $t : $t;
}

/** [database or null for the current one, table] of a name made by suite_table() or t(), for information_schema. */
function suite_table_parts(string $quoted): array
{
    $parts = array_map(fn($x) => trim($x, '`'), explode('`.`', $quoted));
    return count($parts) === 2 ? [$parts[0], $parts[1]] : [null, $parts[0]];
}

/** The paths of the session cookie: every app of the suite, next to the one asking ("/savdocuments/", "/savtasks/"…). */
function suite_paths(string $appBase): array
{
    $parent = rtrim(dirname(rtrim($appBase, '/')), '/');
    return array_map(fn($a) => $parent . '/' . $a . '/', SUITE_APPS);
}

/** The cookie of the session on every app of the suite. */
function suite_set_cookie(string $value, int $expires, string $appBase, bool $secure): void
{
    foreach (suite_paths($appBase) as $path) setcookie(SUITE_COOKIE, $value, ['expires' => $expires, 'path' => $path, 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax']);
}

/**
 * The account tables, when no app made them yet (the same as SavSchedules makes them), and the columns some apps keep on
 * the account. Cheap when everything is there: one read of information_schema.
 */
function suite_install(PDO $pdo, string $appDb): void
{
    $a = suite_accounts();
    if (!$a) throw new RuntimeException('SavOffice: the accounts need savschedules/credentials.php');
    $p = $a['prefix'];
    $u = suite_table('users', $appDb);
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $pdo->exec("CREATE TABLE IF NOT EXISTS $u (
        `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(80) NOT NULL,
        `email` VARCHAR(190) NOT NULL,
        `email_verified_at` DATETIME NULL,
        `password_hash` VARCHAR(255) NOT NULL DEFAULT '',
        `google_sub` VARCHAR(64) NULL,
        `ui_lang` VARCHAR(5) NOT NULL DEFAULT 'en',
        `prefs` TEXT NULL,
        `status` ENUM('active','disabled','blocked') NOT NULL DEFAULT 'active',
        `created_at` DATETIME NOT NULL,
        `last_login_at` DATETIME NULL,
        UNIQUE KEY `uq_email` (`email`),
        UNIQUE KEY `uq_google` (`google_sub`)
    ) $e");
    $pdo->exec('CREATE TABLE IF NOT EXISTS ' . suite_table('auth_tokens', $appDb) . " (
        `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
        `user_id` INT UNSIGNED NOT NULL,
        `csrf_token` CHAR(48) NOT NULL,
        `created_at` DATETIME NOT NULL,
        `last_seen_at` DATETIME NOT NULL,
        `expires_at` DATETIME NOT NULL,
        KEY `ix_user` (`user_id`),
        CONSTRAINT `fk_{$p}tok_user` FOREIGN KEY (`user_id`) REFERENCES $u (`id`) ON DELETE CASCADE
    ) $e");
    $pdo->exec('CREATE TABLE IF NOT EXISTS ' . suite_table('email_tokens', $appDb) . " (
        `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
        `user_id` INT UNSIGNED NOT NULL,
        `purpose` VARCHAR(10) NOT NULL DEFAULT 'verify',
        `created_at` DATETIME NOT NULL,
        `expires_at` DATETIME NOT NULL,
        KEY `ix_user` (`user_id`),
        CONSTRAINT `fk_{$p}etok_user` FOREIGN KEY (`user_id`) REFERENCES $u (`id`) ON DELETE CASCADE
    ) $e");
    // the columns of single apps, and the "blocked" status of SavPresentations
    [$db, $table] = suite_table_parts($u);
    $st = $pdo->prepare('SELECT column_name, column_type FROM information_schema.columns WHERE table_schema = COALESCE(?, DATABASE()) AND table_name = ?');
    $st->execute([$db, $table]);
    $have = [];
    foreach ($st->fetchAll(PDO::FETCH_NUM) as [$name, $type]) $have[strtolower($name)] = strtolower($type);
    $want = [
        'block_reason' => "VARCHAR(20) NOT NULL DEFAULT ''",
        'block_note' => "VARCHAR(500) NOT NULL DEFAULT ''",
        'blocked_at' => 'DATETIME NULL',
        'settings' => 'TEXT NULL',
        'activated' => 'TINYINT(1) NULL',
        'activated_at' => 'DATETIME NULL',
        'quota' => 'BIGINT UNSIGNED NULL',
        'fav_templates' => "VARCHAR(1000) NOT NULL DEFAULT '[]'",
    ];
    $add = [];
    foreach ($want as $name => $def) if (!isset($have[$name])) $add[] = "ADD COLUMN `$name` $def";
    if (isset($have['status']) && strpos($have['status'], "'blocked'") === false) $add[] = "MODIFY `status` ENUM('active','disabled','blocked') NOT NULL DEFAULT 'active'";
    if ($add) $pdo->exec("ALTER TABLE $u " . implode(', ', $add));
}

/**
 * Once only: an app that still has accounts of its own (its table "<prefix>users") drops ALL its tables, the accounts and
 * everything they had, so that it starts again on the shared accounts. True when it did.
 */
function suite_reset_app(PDO $pdo, string $prefix): bool
{
    $a = suite_accounts();
    if (!$a || $prefix === '' || $prefix === $a['prefix'] || !preg_match('/^[A-Za-z0-9_]{1,20}$/', $prefix)) return false;
    $like = $pdo->quote(addcslashes($prefix, '_%\\') . '%');
    if (!$pdo->query('SHOW TABLES LIKE ' . $pdo->quote(addcslashes($prefix, '_%\\') . 'users'))->fetchColumn()) return false;
    $tables = $pdo->query("SHOW TABLES LIKE $like")->fetchAll(PDO::FETCH_COLUMN);
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    try {
        foreach ($tables as $t) if (strpos((string)$t, $prefix) === 0) $pdo->exec('DROP TABLE IF EXISTS `' . str_replace('`', '', (string)$t) . '`');
    } finally {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
    }
    error_log("SavOffice: the tables $prefix* were dropped, the app now uses the accounts of the suite");
    return true;
}

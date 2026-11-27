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

/* ---------- SavOffice for Mac: signing in in the browser, the session back to the app ----------
 *
 * Passkeys (Touch ID, the iCloud Keychain) work only in the browsers Apple allows, not inside SavOffice for Mac. So the
 * app can sign in in the browser and get the session back:
 *   1. the app opens  <SavSchedules>/api/?r=auth.handoff&n=<nonce>  in the browser (the nonce: random, known only to it);
 *   2. signed in there already: a code for one use (SUITE_HANDOFF_MINUTES) is made and the page opens
 *      savoffice://signed-in?code=…&n=…  (the app); not signed in: off to SavAccount, and back here when it is done;
 *   3. the app sends the code and its nonce to  auth.handoff.redeem  and gets a session of its own (its own cookie).
 * The session itself never travels: only the code, which works once, for minutes, with the nonce of who asked for it.
 * Called by the API of SavSchedules (the owner of the accounts): it uses its db(), t(), current_user(), body()…
 */
const SUITE_HANDOFF_COOKIE = 'savoffice_handoff';
const SUITE_HANDOFF_MINUTES = 3;

function suite_handoff_install(): void
{
    $a = suite_accounts();
    $p = $a ? $a['prefix'] : 'sch_';
    db()->exec('CREATE TABLE IF NOT EXISTS ' . t('handoffs') . " (
        `code_hash` CHAR(64) NOT NULL PRIMARY KEY,
        `user_id` INT UNSIGNED NOT NULL,
        `nonce` CHAR(64) NOT NULL,
        `created_at` DATETIME NOT NULL,
        `expires_at` DATETIME NOT NULL,
        KEY `ix_expires` (`expires_at`),
        CONSTRAINT `fk_{$p}hand_user` FOREIGN KEY (`user_id`) REFERENCES " . t('users') . ' (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    db()->exec('DELETE FROM ' . t('handoffs') . ' WHERE expires_at < UTC_TIMESTAMP()');
}

/** GET auth.handoff (in the browser). $savStart(): the address of SavAccount to sign in, coming back here. */
function suite_handoff(callable $savStart, bool $savEnabled): void
{
    $n = (string)($_GET['n'] ?? ($_COOKIE[SUITE_HANDOFF_COOKIE] ?? ''));
    if (!preg_match('/^[a-f0-9]{32,64}$/', $n)) suite_handoff_page('expired');
    $cookie = fn(string $v, int $exp) => setcookie(SUITE_HANDOFF_COOKIE, $v, ['expires' => $exp, 'path' => app_base_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    $cookie($n, time() + 15 * 60); // remembered while SavAccount asks who you are
    $u = current_user();
    if ($u && $u['status'] === 'active' && !empty($u['email_verified_at'])) {
        suite_handoff_install();
        $code = bin2hex(random_bytes(32));
        db()->prepare('INSERT INTO ' . t('handoffs') . ' (code_hash, user_id, nonce, created_at, expires_at) VALUES (?,?,?,?,?)')
            ->execute([hash('sha256', $code), (int)$u['id'], $n, now_utc(), gmdate('Y-m-d H:i:s', time() + SUITE_HANDOFF_MINUTES * 60)]);
        $cookie('', time() - 3600);
        suite_handoff_page('ready', 'savoffice://signed-in?code=' . $code . '&n=' . $n);
    }
    $sav = (string)($_GET['sav'] ?? '');
    if ($sav === 'signup' || $sav === 'link') suite_handoff_page('finish', app_base_path() . '?sav=' . $sav); // a new account, or one to join: in the app
    if ($sav !== '' && $sav !== 'in') suite_handoff_page($sav === 'cancelled' ? 'cancelled' : 'failed');
    if (!$savEnabled) suite_handoff_page('failed');
    header('Cache-Control: no-store');
    header('Location: ' . $savStart(), true, 302);
    exit;
}

/** POST auth.handoff.redeem {code, n} (from the app): a session of its own, once. */
function suite_handoff_redeem(): void
{
    if (too_many_attempts('handoff', 20, 15)) fail('rate_limited', 429);
    record_attempt('handoff');
    $b = body();
    $code = (string)($b['code'] ?? '');
    $n = (string)($b['n'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $code) || !preg_match('/^[a-f0-9]{32,64}$/', $n)) fail('expired', 410);
    suite_handoff_install();
    $st = db()->prepare('SELECT h.user_id, h.nonce, u.status FROM ' . t('handoffs') . ' h JOIN ' . t('users') . ' u ON u.id = h.user_id WHERE h.code_hash = ? AND h.expires_at > UTC_TIMESTAMP()');
    $st->execute([hash('sha256', $code)]);
    $row = $st->fetch();
    db()->prepare('DELETE FROM ' . t('handoffs') . ' WHERE code_hash = ?')->execute([hash('sha256', $code)]); // once, right or wrong
    if (!$row || !hash_equals((string)$row['nonce'], $n)) fail('expired', 410);
    if ($row['status'] !== 'active') fail('disabled', 403);
    $csrf = create_auth_session((int)$row['user_id']);
    send_json(['ok' => true, 'csrf' => $csrf]);
}

/** The page of the browser: open SavOffice, finish the sign-in in the app, or what went wrong. */
function suite_handoff_page(string $state, string $link = ''): void
{
    $it = stripos((string)($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? ''), 'it') === 0;
    $L = fn(string $i, string $e) => htmlspecialchars($it ? $i : $e, ENT_QUOTES, 'UTF-8');
    $retry = htmlspecialchars(app_base_path() . 'api/?r=auth.handoff', ENT_QUOTES, 'UTF-8');
    $href = htmlspecialchars($link, ENT_QUOTES, 'UTF-8');
    $texts = [
        'ready' => [$L('Accesso fatto', 'Signed in'), $L('Torna a SavOffice: sei dentro in tutte le app. Puoi chiudere questa scheda.', 'Go back to SavOffice: you are in every app. You can close this tab.'), $L('Apri SavOffice', 'Open SavOffice')],
        'finish' => [$L('Ancora un passo', 'One more step'), $L('Completa l’accesso qui, poi premi «Torna a SavOffice».', 'Finish signing in here, then press “Back to SavOffice”.'), $L('Completa l’accesso', 'Finish signing in')],
        'cancelled' => [$L('Accesso annullato', 'Sign-in cancelled'), $L('Puoi riprovare quando vuoi.', 'You can try again whenever you like.'), ''],
        'expired' => [$L('Richiesta scaduta', 'Request expired'), $L('Torna a SavOffice e premi di nuovo «Accedi con SavAccount».', 'Go back to SavOffice and press “Sign in with SavAccount” again.'), ''],
        'failed' => [$L('Non è riuscito', 'It did not work'), $L('Riprova tra poco.', 'Try again in a moment.'), ''],
    ][$state] ?? [$L('Non è riuscito', 'It did not work'), '', ''];
    http_response_code($state === 'expired' ? 410 : 200);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    $go = $state === 'ready' ? '<meta http-equiv="refresh" content="0;url=' . $href . '">' : '';
    $main = $texts[2] !== '' ? '<a class="b" href="' . $href . '">' . $texts[2] . '</a>' : '';
    $again = in_array($state, ['finish', 'cancelled', 'failed'], true) ? '<a class="b' . ($state === 'finish' ? ' o' : '') . '" href="' . $retry . '">' . ($state === 'finish' ? $L('Torna a SavOffice', 'Back to SavOffice') : $L('Riprova', 'Try again')) . '</a>' : '';
    echo '<!doctype html><html lang="' . ($it ? 'it' : 'en') . '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' . $go
        . '<title>SavOffice</title><style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 -apple-system,system-ui,sans-serif;background:light-dark(#f6f4f9,#121016);color:light-dark(#1b1724,#ece8f3)}'
        . 'main{width:min(26rem,calc(100% - 2rem));padding:2rem;border-radius:20px;background:light-dark(#fff,#1b1820);box-shadow:0 18px 40px rgb(30 20 50/.12);text-align:center}'
        . 'img{width:56px;height:56px}h1{font-size:1.4rem;margin:.6rem 0 .3rem}p{margin:0 0 1.2rem;color:light-dark(#625b70,#a39cb0)}'
        . '.b{display:block;margin:.5rem 0 0;padding:.8rem 1rem;border-radius:12px;background:#6a3fe0;color:#fff;text-decoration:none;font-weight:600}.b.o{background:none;color:inherit;border:1px solid light-dark(#e2ddea,#2f2a37)}</style></head>'
        . '<body><main><img src="/savoffice/icons/favicon.svg" alt=""><h1>' . $texts[0] . '</h1><p>' . $texts[1] . '</p>' . $main . $again . '</main></body></html>';
    exit;
}

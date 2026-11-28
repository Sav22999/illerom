<?php
/**
 * SavDrive — database tables (all prefixed, default "dr_"). Every statement is idempotent: the API creates the tables
 * by itself the first time it answers.
 *
 * meta         schema version and the settings of the admins: default_quota (bytes), default_active (1 | 0), app_url
 * (accounts)   the ones of the whole suite (../../identity/suite.php, t('users')); on the account: quota (bytes of its own,
 *              NULL = the default) and activated: it can use the app (an admin decides; NULL = not seen here yet, the
 *              default of new accounts is applied at its first visit)
 * profiles     the settings of the app of each account (prefs: JSON)
 * nodes        files and folders of an account, as a tree (parent_id NULL = My drive). A file is kept on disk under
 *              <storage>/<user_id>/<bkey>; share_token: a link anyone can open (files only)
 * shares       the levels of other people (by email) on a file or folder, inherited below until another row (lib/access.php)
 * comments     comments on a file or folder, by whoever can comment on it
 * usage        what each other app of SavOffice keeps for a person (by email), reported by the app (lib/space.php):
 *              one space for the whole suite, the space of SavDrive
 * quotas       the space of its own of a person (by email: also people who use other apps without an account here)
 * uploads      uploads under way, in pieces: what was received is in <storage>/<user_id>/<id>.part; replace_id: the file
 *              they become the new content of (an app of SavOffice saving back), instead of a new file; vault_id: the
 *              file of the Vault they fill (lib/vault.php); temp_id: the temporary link it is uploaded for (the file
 *              becomes an item of that link, never a node)
 * vault_keys   the Vault of an account: how the browser unlocks it (digits of the PIN, salt, iterations, the master key
 *              wrapped with the PIN and with the recovery password; a reset under way) — the server never sees the PIN
 *              (lib/vault.php)
 * vault_nodes  files and folders of the Vault, names encrypted in the browser (meta); the files on disk are encrypted too
 * temp_links   temporary links (lib/temp.php): a token anyone can open until expires_at, with an optional password,
 *              limit of downloads, notice to the owner at each download and message; ready = 0 while its files upload
 * temp_items   what a temporary link gives: a file or folder of the drive (node_id, it stays when the link ends) or a
 *              file uploaded only for the link (bkey, under <storage>/<user_id>/, deleted with the link, counted in the space)
 * reports      a public link (a share link or a temporary link) that a visitor reported as illegal or against the terms
 *              (DSA art. 16); content_kind is 'share' | 'temp' and content_id the node or the temporary link
 * audit        what the master admins did (blocks, report decisions)
 *              reports and audit are the two shared tables of ../../identity/moderation.php, used by every app
 */

declare(strict_types=1);

function schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    // the accounts are the ones of the whole suite (t('users'), ../../identity/suite.php): deleting one deletes what it had here
    $fk = fn(string $name, string $col, string $table, string $on = 'CASCADE') => "CONSTRAINT `fk_{$p}{$name}` FOREIGN KEY (`$col`) REFERENCES " . ($table === 'users' ? t('users') : "`{$p}$table`") . " (`id`) ON DELETE $on";
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}meta` (
            `k` VARCHAR(40) NOT NULL PRIMARY KEY,
            `v` VARCHAR(255) NOT NULL
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            " . $fk('prof_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}attempts` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `kind` VARCHAR(20) NOT NULL,
            `ip` VARCHAR(45) NOT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_kind_ip` (`kind`, `ip`, `created_at`)
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}nodes` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `uid` CHAR(16) NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `parent_id` INT UNSIGNED NULL,
            `kind` ENUM('folder','file') NOT NULL,
            `name` VARCHAR(255) NOT NULL,
            `mime` VARCHAR(100) NOT NULL DEFAULT '',
            `size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `bkey` CHAR(32) NULL,
            `color` VARCHAR(7) NOT NULL DEFAULT '',
            `starred` TINYINT(1) NOT NULL DEFAULT 0,
            `share_token` CHAR(32) NULL,
            `trashed_at` DATETIME NULL,
            `trash_root` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            `opened_at` DATETIME NULL,
            `created_by` INT UNSIGNED NULL,
            UNIQUE KEY `uq_uid` (`uid`),
            UNIQUE KEY `uq_share` (`share_token`),
            KEY `ix_parent` (`user_id`, `parent_id`, `trashed_at`),
            KEY `ix_user_kind` (`user_id`, `kind`),
            " . $fk('node_user', 'user_id', 'users') . ",
            " . $fk('node_parent', 'parent_id', 'nodes') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}shares` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `node_id` INT UNSIGNED NOT NULL,
            `email` VARCHAR(190) NOT NULL,
            `role` ENUM('none','view','read','comment','write','move','delete') NOT NULL DEFAULT 'read',
            `created_by` INT UNSIGNED NULL,
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_node_email` (`node_id`, `email`),
            KEY `ix_email` (`email`),
            " . $fk('sha_node', 'node_id', 'nodes') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}comments` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `node_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `body` TEXT NOT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_node` (`node_id`),
            " . $fk('com_node', 'node_id', 'nodes') . ",
            " . $fk('com_user', 'user_id', 'users', 'SET NULL') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}usage` (
            `email` VARCHAR(190) NOT NULL,
            `app` VARCHAR(30) NOT NULL,
            `bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `updated_at` DATETIME NOT NULL,
            PRIMARY KEY (`email`, `app`)
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}quotas` (
            `email` VARCHAR(190) NOT NULL PRIMARY KEY,
            `quota` BIGINT UNSIGNED NOT NULL,
            `updated_at` DATETIME NOT NULL
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}uploads` (
            `id` CHAR(32) NOT NULL PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `parent_id` INT UNSIGNED NULL,
            `name` VARCHAR(255) NOT NULL,
            `mime` VARCHAR(100) NOT NULL DEFAULT '',
            `size` BIGINT UNSIGNED NOT NULL,
            `received` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `replace_id` INT UNSIGNED NULL,
            `vault_id` INT UNSIGNED NULL,
            `temp_id` INT UNSIGNED NULL,
            `created_at` DATETIME NOT NULL,
            `expires_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`),
            " . $fk('upl_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}vault_keys` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `kdf` VARCHAR(20) NOT NULL,
            `digits` TINYINT UNSIGNED NOT NULL DEFAULT 6,
            `iterations` INT UNSIGNED NOT NULL,
            `salt` VARCHAR(64) NOT NULL,
            `wrap_pass` VARCHAR(400) NOT NULL,
            `wrap_recovery` VARCHAR(400) NULL,
            `proof` CHAR(64) NOT NULL,
            `reset_started` DATETIME NULL,
            `reset_at` DATETIME NULL,
            `reset_notice` TINYINT UNSIGNED NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            " . $fk('vk_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}vault_nodes` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `uid` CHAR(16) NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `parent_id` INT UNSIGNED NULL,
            `kind` ENUM('folder','file') NOT NULL,
            `meta` TEXT NOT NULL,
            `size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `bkey` CHAR(32) NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_uid` (`uid`),
            KEY `ix_parent` (`user_id`, `parent_id`),
            " . $fk('vn_user', 'user_id', 'users') . ",
            " . $fk('vn_parent', 'parent_id', 'vault_nodes') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}temp_links` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `token` CHAR(32) NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `mode` ENUM('upload','drive') NOT NULL,
            `message` TEXT NULL,
            `pass_hash` VARCHAR(255) NULL,
            `max_downloads` INT UNSIGNED NULL,
            `downloads` INT UNSIGNED NOT NULL DEFAULT 0,
            `notify` TINYINT(1) NOT NULL DEFAULT 0,
            `ready` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            `expires_at` DATETIME NOT NULL,
            `last_download_at` DATETIME NULL,
            `notified_at` DATETIME NULL,
            UNIQUE KEY `uq_token` (`token`),
            KEY `ix_user` (`user_id`, `expires_at`),
            KEY `ix_expires` (`expires_at`),
            " . $fk('tl_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}temp_items` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `link_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `node_id` INT UNSIGNED NULL,
            `name` VARCHAR(255) NOT NULL DEFAULT '',
            `mime` VARCHAR(100) NOT NULL DEFAULT '',
            `size` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `bkey` CHAR(32) NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_link` (`link_id`),
            KEY `ix_user` (`user_id`),
            KEY `ix_node` (`node_id`),
            " . $fk('ti_link', 'link_id', 'temp_links') . ",
            " . $fk('ti_user', 'user_id', 'users') . ",
            " . $fk('ti_node', 'node_id', 'nodes') . "
        ) $e",
    ];
    // reports of public links and the admin audit log (../../identity/moderation.php) are added separately, best-effort, by
    // install_schema(): a host that cannot create them must not block the rest of the app.
}

function install_schema(PDO $pdo, string $prefix): void
{
    // once only: the tables of the time when this app had accounts of its own go, then the accounts of the suite are there
    suite_reset_app($pdo, $prefix);
    suite_install($pdo, (string)(credentials()['name'] ?? ''));
    foreach (schema_statements($prefix) as $sql) $pdo->exec($sql);
    // the moderation tables (reports + audit) are optional: if a host cannot create them, the app keeps working without them
    try {
        // the first draft of reports (its own columns) is replaced by the shared moderation table (content_kind/content_id)
        if ($pdo->query("SHOW TABLES LIKE '{$prefix}reports'")->fetch() && $pdo->query("SHOW COLUMNS FROM `{$prefix}reports` LIKE 'category'")->fetch()) $pdo->exec("DROP TABLE `{$prefix}reports`");
        foreach (moderation_schema($prefix) as $sql) $pdo->exec($sql);
    } catch (Throwable $e) {
        error_log('SavDrive moderation schema not installed: ' . $e->getMessage());
    }
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}uploads` LIKE 'replace_id'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}uploads` ADD COLUMN `replace_id` INT UNSIGNED NULL AFTER `received`");
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}uploads` LIKE 'vault_id'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}uploads` ADD COLUMN `vault_id` INT UNSIGNED NULL AFTER `replace_id`");
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}uploads` LIKE 'temp_id'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}uploads` ADD COLUMN `temp_id` INT UNSIGNED NULL AFTER `replace_id`");
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}nodes` LIKE 'created_by'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}nodes` ADD COLUMN `created_by` INT UNSIGNED NULL AFTER `opened_at`");
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)SCHEMA_VERSION]);
}

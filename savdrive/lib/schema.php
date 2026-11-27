<?php
/**
 * SavDrive — database tables (all prefixed, default "dr_"). Every statement is idempotent: the API creates the tables
 * by itself the first time it answers.
 *
 * meta         schema version and the settings of the admins: default_quota (bytes), default_active (1 | 0), app_url
 * users        accounts (email unique and never changed); quota: bytes of its own (NULL = the default); activated: it
 *              can use the app (an admin decides, or the default of new accounts)
 * nodes        files and folders of an account, as a tree (parent_id NULL = My drive). A file is kept on disk under
 *              <storage>/<user_id>/<bkey>; share_token: a link anyone can open (files only)
 * shares       the levels of other people (by email) on a file or folder, inherited below until another row (lib/access.php)
 * comments     comments on a file or folder, by whoever can comment on it
 * usage        what each other app of SavOffice keeps for a person (by email), reported by the app (lib/space.php):
 *              one space for the whole suite, the space of SavDrive
 * quotas       the space of its own of a person (by email: also people who use other apps without an account here)
 * uploads      uploads under way, in pieces: what was received is in <storage>/<user_id>/<id>.part; replace_id: the file
 *              they become the new content of (an app of SavOffice saving back), instead of a new file; temp_id: the
 *              temporary link it is uploaded for (the file becomes an item of that link, never a node)
 * temp_links   temporary links (lib/temp.php): a token anyone can open until expires_at, with an optional password,
 *              limit of downloads, notice to the owner at each download and message; ready = 0 while its files upload
 * temp_items   what a temporary link gives: a file or folder of the drive (node_id, it stays when the link ends) or a
 *              file uploaded only for the link (bkey, under <storage>/<user_id>/, deleted with the link, counted in the space)
 */

declare(strict_types=1);

function schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $fk = fn(string $name, string $col, string $table, string $on = 'CASCADE') => "CONSTRAINT `fk_{$p}{$name}` FOREIGN KEY (`$col`) REFERENCES `{$p}$table` (`id`) ON DELETE $on";
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}meta` (
            `k` VARCHAR(40) NOT NULL PRIMARY KEY,
            `v` VARCHAR(255) NOT NULL
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}users` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(80) NOT NULL,
            `email` VARCHAR(190) NOT NULL,
            `email_verified_at` DATETIME NULL,
            `password_hash` VARCHAR(255) NOT NULL DEFAULT '',
            `google_sub` VARCHAR(64) NULL,
            `ui_lang` VARCHAR(5) NOT NULL DEFAULT 'en',
            `prefs` TEXT NULL,
            `status` ENUM('active','disabled') NOT NULL DEFAULT 'active',
            `activated` TINYINT(1) NOT NULL DEFAULT 1,
            `activated_at` DATETIME NULL,
            `quota` BIGINT UNSIGNED NULL,
            `created_at` DATETIME NOT NULL,
            `last_login_at` DATETIME NULL,
            UNIQUE KEY `uq_email` (`email`),
            UNIQUE KEY `uq_google` (`google_sub`),
            KEY `ix_activated` (`activated`)
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}auth_tokens` (
            `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `csrf_token` CHAR(48) NOT NULL,
            `created_at` DATETIME NOT NULL,
            `last_seen_at` DATETIME NOT NULL,
            `expires_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`),
            " . $fk('tok_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}email_tokens` (
            `token_hash` CHAR(64) NOT NULL PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `purpose` VARCHAR(10) NOT NULL DEFAULT 'verify',
            `created_at` DATETIME NOT NULL,
            `expires_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`),
            " . $fk('etok_user', 'user_id', 'users') . "
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
            `temp_id` INT UNSIGNED NULL,
            `created_at` DATETIME NOT NULL,
            `expires_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`),
            " . $fk('upl_user', 'user_id', 'users') . "
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
}

function install_schema(PDO $pdo, string $prefix): void
{
    foreach (schema_statements($prefix) as $sql) $pdo->exec($sql);
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}uploads` LIKE 'replace_id'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}uploads` ADD COLUMN `replace_id` INT UNSIGNED NULL AFTER `received`");
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}uploads` LIKE 'temp_id'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}uploads` ADD COLUMN `temp_id` INT UNSIGNED NULL AFTER `replace_id`");
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}nodes` LIKE 'created_by'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}nodes` ADD COLUMN `created_by` INT UNSIGNED NULL AFTER `opened_at`");
    // 3: the spaces of their own move to quotas (by email), where the other apps read them too
    $pdo->exec("INSERT IGNORE INTO `{$prefix}quotas` (email, quota, updated_at) SELECT email, quota, UTC_TIMESTAMP() FROM `{$prefix}users` WHERE quota IS NOT NULL");
    $pdo->exec("UPDATE `{$prefix}users` SET quota = NULL WHERE quota IS NOT NULL");
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)SCHEMA_VERSION]);
}

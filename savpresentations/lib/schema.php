<?php
/**
 * SavPresentations — database tables (all prefixed, default "sp_"). Every statement is idempotent: the tables are
 * created at the first request with a valid credentials.php.
 *
 * (accounts)     the ones of the whole suite (../../identity/suite.php, t('users')); status blocked = see block_reason;
 *                settings: the settings of SavPresentations of the account
 * folders        folders of each person (parent_id for subfolders)
 * decks          presentations: meta = {format, theme, opts}; access private|link; seq = number of the last change
 * slides         one row each: sid (made by the browser), pos (order), data = {layout, bg, els: {id: element}, …}
 * ops            the recent changes of each presentation, read by the other people who have it open (kept 2 days)
 * presence       who has a presentation open right now, where and what they have selected
 * members        people a presentation is shared with, and their role; invites = the same for people without account
 * links          single-use links: the first signed-in person who opens one gets its role
 * comments       comments on a slide or on one of its elements (visible to who can open the presentation)
 * notes          personal notes: only their author ever sees them
 * page_rules     what someone can do on a single page, when it differs from the presentation; who: '*' (whoever has no
 *                rule of their own), 'u:<id>' or 'e:<email>' (invited, no account yet); role none = the page does not exist
 * versions       copies of a presentation over time (automatic, at most one every half hour, or saved by hand)
 * media          pictures and videos (files in the storage folder), served by their random id
 * reports        abuse reported by the people who saw a presentation
 * audit          what the master admins did
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
        "CREATE TABLE IF NOT EXISTS `{$p}attempts` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `kind` VARCHAR(20) NOT NULL,
            `ip` VARCHAR(45) NOT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_kind_ip` (`kind`, `ip`, `created_at`)
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}folders` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `parent_id` INT UNSIGNED NULL,
            `name` VARCHAR(80) NOT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`),
            " . $fk('fol_user', 'user_id', 'users') . ",
            " . $fk('fol_parent', 'parent_id', 'folders') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}decks` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `uid` CHAR(22) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            `owner_id` INT UNSIGNED NOT NULL,
            `folder_id` INT UNSIGNED NULL,
            `title` VARCHAR(150) NOT NULL,
            `meta` MEDIUMTEXT NOT NULL,
            `thumb` MEDIUMTEXT NULL,
            `access` ENUM('private','link') NOT NULL DEFAULT 'private',
            `link_role` ENUM('viewer','commenter','editor') NOT NULL DEFAULT 'viewer',
            `is_template` TINYINT(1) NOT NULL DEFAULT 0,
            `status` ENUM('active','trashed','suspended') NOT NULL DEFAULT 'active',
            `suspend_note` VARCHAR(300) NOT NULL DEFAULT '',
            `seq` INT UNSIGNED NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            `trashed_at` DATETIME NULL,
            UNIQUE KEY `uq_uid` (`uid`),
            KEY `ix_owner` (`owner_id`, `status`, `updated_at`),
            " . $fk('deck_owner', 'owner_id', 'users') . ",
            " . $fk('deck_folder', 'folder_id', 'folders', 'SET NULL') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}slides` (
            `deck_id` INT UNSIGNED NOT NULL,
            `sid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            `pos` DOUBLE NOT NULL,
            `data` MEDIUMTEXT NOT NULL,
            PRIMARY KEY (`deck_id`, `sid`),
            " . $fk('sl_deck', 'deck_id', 'decks') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}ops` (
            `deck_id` INT UNSIGNED NOT NULL,
            `seq` INT UNSIGNED NOT NULL,
            `client` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `op` MEDIUMTEXT NOT NULL,
            `created_at` DATETIME NOT NULL,
            PRIMARY KEY (`deck_id`, `seq`),
            KEY `ix_time` (`created_at`),
            " . $fk('op_deck', 'deck_id', 'decks') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}presence` (
            `deck_id` INT UNSIGNED NOT NULL,
            `client` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `state` VARCHAR(600) NOT NULL DEFAULT '',
            `seen_at` DATETIME NOT NULL,
            PRIMARY KEY (`deck_id`, `client`),
            " . $fk('pr_deck', 'deck_id', 'decks') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}members` (
            `deck_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `role` ENUM('viewer','commenter','editor') NOT NULL DEFAULT 'viewer',
            `folder_id` INT UNSIGNED NULL,
            `created_at` DATETIME NOT NULL,
            PRIMARY KEY (`deck_id`, `user_id`),
            KEY `ix_user` (`user_id`),
            " . $fk('mem_deck', 'deck_id', 'decks') . ",
            " . $fk('mem_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}invites` (
            `deck_id` INT UNSIGNED NOT NULL,
            `email` VARCHAR(190) NOT NULL,
            `role` ENUM('viewer','commenter','editor') NOT NULL DEFAULT 'viewer',
            `created_at` DATETIME NOT NULL,
            PRIMARY KEY (`deck_id`, `email`),
            KEY `ix_email` (`email`),
            " . $fk('inv_deck', 'deck_id', 'decks') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}links` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `deck_id` INT UNSIGNED NOT NULL,
            `token_hash` CHAR(64) NOT NULL,
            `role` ENUM('viewer','commenter','editor') NOT NULL DEFAULT 'viewer',
            `label` VARCHAR(60) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            `expires_at` DATETIME NOT NULL,
            `used_by` INT UNSIGNED NULL,
            `used_at` DATETIME NULL,
            UNIQUE KEY `uq_token` (`token_hash`),
            KEY `ix_deck` (`deck_id`),
            " . $fk('lnk_deck', 'deck_id', 'decks') . ",
            " . $fk('lnk_user', 'used_by', 'users', 'SET NULL') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}comments` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `deck_id` INT UNSIGNED NOT NULL,
            `parent_id` INT UNSIGNED NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `sid` VARCHAR(16) NOT NULL DEFAULT '',
            `anchor` VARCHAR(200) NOT NULL DEFAULT '',
            `body` VARCHAR(2000) NOT NULL,
            `resolved_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_deck` (`deck_id`),
            " . $fk('com_deck', 'deck_id', 'decks') . ",
            " . $fk('com_parent', 'parent_id', 'comments') . ",
            " . $fk('com_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}notes` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `deck_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `sid` VARCHAR(16) NOT NULL DEFAULT '',
            `anchor` VARCHAR(200) NOT NULL DEFAULT '',
            `body` VARCHAR(4000) NOT NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            KEY `ix_deck_user` (`deck_id`, `user_id`),
            " . $fk('not_deck', 'deck_id', 'decks') . ",
            " . $fk('not_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}page_rules` (
            `deck_id` INT UNSIGNED NOT NULL,
            `sid` VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            `who` VARCHAR(192) NOT NULL,
            `role` ENUM('none','viewer','commenter','editor') NOT NULL,
            PRIMARY KEY (`deck_id`, `who`, `sid`),
            " . $fk('pgr_deck', 'deck_id', 'decks') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}versions` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `deck_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `label` VARCHAR(80) NOT NULL DEFAULT '',
            `title` VARCHAR(150) NOT NULL,
            `meta` MEDIUMTEXT NOT NULL,
            `slides` MEDIUMTEXT NOT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_deck` (`deck_id`, `id`),
            " . $fk('ver_deck', 'deck_id', 'decks') . ",
            " . $fk('ver_user', 'user_id', 'users', 'SET NULL') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}media` (
            `id` CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `mime` VARCHAR(20) NOT NULL,
            `width` SMALLINT UNSIGNED NOT NULL,
            `height` SMALLINT UNSIGNED NOT NULL,
            `bytes` INT UNSIGNED NOT NULL,
            `name` VARCHAR(120) NOT NULL DEFAULT '',
            `credit` VARCHAR(300) NOT NULL DEFAULT '',
            `poster` CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`, `created_at`),
            " . $fk('med_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}fonts` (
            `id` CHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `name` VARCHAR(60) NOT NULL,
            `mime` VARCHAR(20) NOT NULL,
            `bytes` INT UNSIGNED NOT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`),
            " . $fk('font_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}reports` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `deck_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `reason` VARCHAR(20) NOT NULL,
            `note` VARCHAR(1000) NOT NULL DEFAULT '',
            `status` ENUM('open','closed') NOT NULL DEFAULT 'open',
            `created_at` DATETIME NOT NULL,
            KEY `ix_status` (`status`, `created_at`),
            " . $fk('rep_deck', 'deck_id', 'decks') . ",
            " . $fk('rep_user', 'user_id', 'users', 'SET NULL') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}audit` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `admin_id` INT UNSIGNED NULL,
            `action` VARCHAR(30) NOT NULL,
            `target` VARCHAR(190) NOT NULL DEFAULT '',
            `note` VARCHAR(500) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            KEY `ix_time` (`created_at`)
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}cache` (
            `k` CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
            `v` MEDIUMTEXT NOT NULL,
            `expires_at` DATETIME NOT NULL,
            KEY `ix_exp` (`expires_at`)
        ) $e",
    ];
}

function install_schema(PDO $pdo, string $prefix): void
{
    // once only: the tables of the time when this app had accounts of its own go, then the accounts of the suite are there
    suite_reset_app($pdo, $prefix);
    suite_install($pdo, (string)(credentials()['name'] ?? ''));
    foreach (schema_statements($prefix) as $sql) $pdo->exec($sql);
    // columns added after the first version
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}media` LIKE 'poster'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}media` ADD `poster` CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '' AFTER `credit`");
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")
        ->execute([(string)SCHEMA_VERSION]);
}

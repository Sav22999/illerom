<?php
/**
 * SavPresentations — database tables (all prefixed, default "sp_"). Every statement is idempotent: the tables are
 * created at the first request with a valid credentials.php.
 *
 * users          accounts (email unique and never changed); status blocked = see block_reason
 * folders        folders of each person (parent_id for subfolders)
 * decks          presentations: meta = {format, theme, opts}; access private|link; seq = number of the last change
 * slides         one row each: sid (made by the browser), pos (order), data = {layout, bg, els: {id: element}, …}
 * ops            the recent changes of each presentation, read by the other people who have it open (kept 2 days)
 * presence       who has a presentation open right now, where and what they have selected
 * members        people a presentation is shared with, and their role; invites = the same for people without account
 * links          single-use links: the first signed-in person who opens one gets its role
 * comments       comments on a slide or on one of its elements (visible to who can open the presentation)
 * notes          personal notes: only their author ever sees them
 * media          pictures (files in the storage folder), served by their random id
 * reports        abuse reported by the people who saw a presentation
 * audit          what the master admins did
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
            `settings` TEXT NOT NULL,
            `status` ENUM('active','blocked') NOT NULL DEFAULT 'active',
            `block_reason` VARCHAR(20) NOT NULL DEFAULT '',
            `block_note` VARCHAR(500) NOT NULL DEFAULT '',
            `blocked_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            `last_login_at` DATETIME NULL,
            UNIQUE KEY `uq_email` (`email`),
            UNIQUE KEY `uq_google` (`google_sub`)
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
            `kind` VARCHAR(10) NOT NULL DEFAULT 'verify',
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
        "CREATE TABLE IF NOT EXISTS `{$p}media` (
            `id` CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `mime` VARCHAR(20) NOT NULL,
            `width` SMALLINT UNSIGNED NOT NULL,
            `height` SMALLINT UNSIGNED NOT NULL,
            `bytes` INT UNSIGNED NOT NULL,
            `name` VARCHAR(120) NOT NULL DEFAULT '',
            `credit` VARCHAR(300) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`, `created_at`),
            " . $fk('med_user', 'user_id', 'users') . "
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
    foreach (schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")
        ->execute([(string)SCHEMA_VERSION]);
}

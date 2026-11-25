<?php
/**
 * SavDocuments — database tables (all prefixed, default "sd_"). Every statement is idempotent: the API creates the tables
 * by itself the first time it answers.
 *
 * users       accounts (email unique and never changed); prefs: JSON of the global settings of the editor
 * folders     folders of an account (they only order its own documents)
 * documents   doc: JSON {settings, blocks: [{id, h, v}]}; rev grows by one at every change
 * ops         the last changes of each document, read by the people who have it open
 * shares      people with access: an account, or an address that has no account yet
 * invites     single-use links: the first signed-in person who opens one gets access
 * visits      when an account last opened a document, and whether it starred it
 * comments    comments and personal notes (private = 1: only its author sees it)
 * versions    copies of a document over time
 * images      pictures of a document, served only to who can open it
 * presence    who has a document open now
 * reports     abuse reports, read by the master admins
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
            `block_reason` VARCHAR(20) NOT NULL DEFAULT '',
            `block_note` VARCHAR(300) NOT NULL DEFAULT '',
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
        "CREATE TABLE IF NOT EXISTS `{$p}folders` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `name` VARCHAR(80) NOT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`),
            " . $fk('fol_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}documents` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `pid` CHAR(20) NOT NULL,
            `owner_id` INT UNSIGNED NOT NULL,
            `folder_id` INT UNSIGNED NULL,
            `title` VARCHAR(160) NOT NULL,
            `doc` MEDIUMTEXT NOT NULL,
            `preview` TEXT NULL,
            `rev` INT UNSIGNED NOT NULL DEFAULT 1,
            `words` INT UNSIGNED NOT NULL DEFAULT 0,
            `visibility` ENUM('private','link') NOT NULL DEFAULT 'private',
            `link_role` ENUM('viewer','commenter','editor') NOT NULL DEFAULT 'viewer',
            `status` ENUM('active','suspended') NOT NULL DEFAULT 'active',
            `deleted_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            `updated_by` INT UNSIGNED NULL,
            UNIQUE KEY `uq_pid` (`pid`),
            KEY `ix_owner` (`owner_id`, `deleted_at`),
            " . $fk('doc_owner', 'owner_id', 'users') . ",
            " . $fk('doc_folder', 'folder_id', 'folders', 'SET NULL') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}ops` (
            `doc_id` INT UNSIGNED NOT NULL,
            `rev` INT UNSIGNED NOT NULL,
            `client` CHAR(12) NOT NULL,
            `ops` MEDIUMTEXT NOT NULL,
            `created_at` DATETIME NOT NULL,
            PRIMARY KEY (`doc_id`, `rev`),
            " . $fk('ops_doc', 'doc_id', 'documents') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}shares` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `doc_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `email` VARCHAR(190) NOT NULL,
            `role` ENUM('viewer','commenter','editor') NOT NULL DEFAULT 'viewer',
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_doc_email` (`doc_id`, `email`),
            KEY `ix_user` (`user_id`),
            KEY `ix_email` (`email`),
            " . $fk('sha_doc', 'doc_id', 'documents') . ",
            " . $fk('sha_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}invites` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `doc_id` INT UNSIGNED NOT NULL,
            `token_hash` CHAR(64) NOT NULL,
            `role` ENUM('viewer','commenter','editor') NOT NULL DEFAULT 'viewer',
            `created_at` DATETIME NOT NULL,
            `expires_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_token` (`token_hash`),
            " . $fk('inv_doc', 'doc_id', 'documents') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}visits` (
            `user_id` INT UNSIGNED NOT NULL,
            `doc_id` INT UNSIGNED NOT NULL,
            `opened_at` DATETIME NULL,
            `starred` TINYINT(1) NOT NULL DEFAULT 0,
            PRIMARY KEY (`user_id`, `doc_id`),
            " . $fk('vis_user', 'user_id', 'users') . ",
            " . $fk('vis_doc', 'doc_id', 'documents') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}comments` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `doc_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `parent_id` INT UNSIGNED NULL,
            `private` TINYINT(1) NOT NULL DEFAULT 0,
            `block` VARCHAR(12) NOT NULL DEFAULT '',
            `quote` VARCHAR(300) NOT NULL DEFAULT '',
            `body` TEXT NOT NULL,
            `resolved` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            KEY `ix_doc` (`doc_id`),
            " . $fk('com_doc', 'doc_id', 'documents') . ",
            " . $fk('com_user', 'user_id', 'users') . ",
            " . $fk('com_parent', 'parent_id', 'comments') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}versions` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `doc_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `name` VARCHAR(80) NOT NULL DEFAULT '',
            `title` VARCHAR(160) NOT NULL,
            `doc` MEDIUMTEXT NOT NULL,
            `words` INT UNSIGNED NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            KEY `ix_doc` (`doc_id`, `created_at`),
            " . $fk('ver_doc', 'doc_id', 'documents') . ",
            " . $fk('ver_user', 'user_id', 'users', 'SET NULL') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}images` (
            `id` CHAR(24) NOT NULL PRIMARY KEY,
            `doc_id` INT UNSIGNED NOT NULL,
            `mime` VARCHAR(20) NOT NULL,
            `bytes` INT UNSIGNED NOT NULL,
            `data` MEDIUMBLOB NOT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_doc` (`doc_id`),
            " . $fk('img_doc', 'doc_id', 'documents') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}presence` (
            `doc_id` INT UNSIGNED NOT NULL,
            `client` CHAR(12) NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `block` VARCHAR(12) NOT NULL DEFAULT '',
            `seen_at` DATETIME NOT NULL,
            PRIMARY KEY (`doc_id`, `client`),
            " . $fk('pre_doc', 'doc_id', 'documents') . ",
            " . $fk('pre_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}reports` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `doc_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `reason` VARCHAR(20) NOT NULL,
            `note` VARCHAR(1000) NOT NULL DEFAULT '',
            `status` ENUM('open','closed') NOT NULL DEFAULT 'open',
            `created_at` DATETIME NOT NULL,
            KEY `ix_status` (`status`),
            " . $fk('rep_doc', 'doc_id', 'documents') . ",
            " . $fk('rep_user', 'user_id', 'users', 'SET NULL') . "
        ) $e",
    ];
}

function install_schema(PDO $pdo, string $prefix): void
{
    foreach (schema_statements($prefix) as $sql) $pdo->exec($sql);
    if (!$pdo->query("SHOW COLUMNS FROM `{$prefix}documents` LIKE 'preview'")->fetch()) $pdo->exec("ALTER TABLE `{$prefix}documents` ADD COLUMN `preview` TEXT NULL AFTER `doc`");
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)SCHEMA_VERSION]);
}

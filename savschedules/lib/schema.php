<?php
/**
 * SavSchedules — database tables (all prefixed, default "sch_"). Every statement is idempotent: the API creates the
 * tables by itself the first time it answers.
 *
 * users       accounts (email unique and never changed); prefs: JSON of the settings of the app
 * schedules   one poll or one sheet of slots; settings: JSON (who may answer, deadline, hidden answers…)
 * options     the dates of a poll or the slots of a sheet: a time in UTC (starts_at, ends_at) or a whole day (day)
 * responses   one per person who answered: an account, or a name (and an email) without an account; edit_hash is the
 *             SHA-256 of the private key that lets that person change or withdraw the answer
 * choices     what each answer says of each option: 2 yes (or a place taken), 1 if need be
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
        "CREATE TABLE IF NOT EXISTS `{$p}schedules` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `pid` CHAR(12) NOT NULL,
            `owner_id` INT UNSIGNED NOT NULL,
            `kind` ENUM('poll','slots') NOT NULL DEFAULT 'poll',
            `title` VARCHAR(160) NOT NULL,
            `descr` TEXT NULL,
            `place` VARCHAR(200) NOT NULL DEFAULT '',
            `settings` TEXT NOT NULL,
            `final_option_id` INT UNSIGNED NULL,
            `status` ENUM('open','closed','suspended') NOT NULL DEFAULT 'open',
            `starred` TINYINT(1) NOT NULL DEFAULT 0,
            `seen_at` DATETIME NULL,
            `deleted_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_pid` (`pid`),
            KEY `ix_owner` (`owner_id`, `deleted_at`),
            " . $fk('sch_owner', 'owner_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}options` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `schedule_id` INT UNSIGNED NOT NULL,
            `starts_at` DATETIME NULL,
            `ends_at` DATETIME NULL,
            `day` DATE NULL,
            `label` VARCHAR(120) NOT NULL DEFAULT '',
            `capacity` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
            KEY `ix_schedule` (`schedule_id`, `starts_at`, `day`),
            " . $fk('opt_sch', 'schedule_id', 'schedules') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}responses` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `schedule_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `name` VARCHAR(80) NOT NULL,
            `email` VARCHAR(190) NOT NULL DEFAULT '',
            `note` VARCHAR(500) NOT NULL DEFAULT '',
            `edit_hash` CHAR(64) NOT NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            KEY `ix_schedule` (`schedule_id`),
            UNIQUE KEY `uq_edit` (`edit_hash`),
            KEY `ix_user` (`user_id`),
            " . $fk('res_sch', 'schedule_id', 'schedules') . ",
            " . $fk('res_user', 'user_id', 'users', 'SET NULL') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}choices` (
            `response_id` INT UNSIGNED NOT NULL,
            `option_id` INT UNSIGNED NOT NULL,
            `value` TINYINT UNSIGNED NOT NULL DEFAULT 2,
            PRIMARY KEY (`response_id`, `option_id`),
            KEY `ix_option` (`option_id`, `value`),
            " . $fk('cho_res', 'response_id', 'responses') . ",
            " . $fk('cho_opt', 'option_id', 'options') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}reports` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `schedule_id` INT UNSIGNED NOT NULL,
            `reason` VARCHAR(20) NOT NULL,
            `note` VARCHAR(1000) NOT NULL DEFAULT '',
            `status` ENUM('open','closed') NOT NULL DEFAULT 'open',
            `created_at` DATETIME NOT NULL,
            KEY `ix_status` (`status`),
            " . $fk('rep_sch', 'schedule_id', 'schedules') . "
        ) $e",
    ];
}

function install_schema(PDO $pdo, string $prefix): void
{
    foreach (schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)SCHEMA_VERSION]);
}

<?php
/**
 * SavContacts — its tables, next to the ones of SavSchedules (same prefix, "sch_con_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * con_profiles  one per account that opened SavContacts: its settings (sorting, how names are shown, theme)
 * con_groups    the groups (labels) of an account: a name and a colour. A contact can be in many of them
 * con_contacts  a contact: the parts of the name, company and role, the birthday ("YYYY-MM-DD", or "--MM-DD" when the
 *               year is not known, as vCard writes it), notes, and the lists as JSON: emails, phones, addresses, websites
 *               ([{label, value}] — an address is {label, street, city, region, code, country}), groups ([gid…]) and
 *               "other" (the fields of a vCard that the app does not show: kept as they are, so a contact goes out as it
 *               came in). uid is the UID of its vCard (the same one goes back out: phones and other apps recognise it);
 *               rev grows at every change (the ETag of a future CardDAV); search holds the words to find it (lowercase,
 *               without accents) for the API the other apps of SavOffice use. Deleted ones stay 30 days (deleted_at).
 *               The photo is kept here, already small (a JPEG of 512 px at most, without its metadata). dav_name: the
 *               name a CardDAV client gave the card when it made it ("<something>.vcf"); null for the others, whose name
 *               is their UID (see dav/index.php).
 * con_app_passwords  the passwords of the devices that sync through CardDAV (phones, Thunderbird): a name, the hash of
 *               the password (shown once, when it is made), when it was last used. A device signs in with the email of
 *               the account and one of them; deleting it cuts that device off.
 * con_tombstones the contacts gone for good (deleted from the trash, or after 30 days), so that a phone that syncs
 *               learns they went away (sync-collection). Kept 90 days: an older sync token means syncing everything again.
 */

declare(strict_types=1);

function con_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}con_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}conp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}con_groups` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `gid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `name` VARCHAR(60) NOT NULL,
            `color` CHAR(7) CHARACTER SET ascii NOT NULL DEFAULT '#4338ca',
            `position` SMALLINT NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_gid` (`gid`),
            KEY `ix_user` (`user_id`, `position`),
            CONSTRAINT `fk_{$p}cong_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}con_contacts` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `cid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `uid` VARCHAR(190) NOT NULL,
            `prefix` VARCHAR(40) NOT NULL DEFAULT '',
            `first` VARCHAR(100) NOT NULL DEFAULT '',
            `middle` VARCHAR(100) NOT NULL DEFAULT '',
            `last` VARCHAR(100) NOT NULL DEFAULT '',
            `suffix` VARCHAR(40) NOT NULL DEFAULT '',
            `nickname` VARCHAR(100) NOT NULL DEFAULT '',
            `company` VARCHAR(160) NOT NULL DEFAULT '',
            `department` VARCHAR(160) NOT NULL DEFAULT '',
            `title` VARCHAR(160) NOT NULL DEFAULT '',
            `birthday` VARCHAR(10) CHARACTER SET ascii NOT NULL DEFAULT '',
            `emails` TEXT NULL,
            `phones` TEXT NULL,
            `addresses` TEXT NULL,
            `urls` TEXT NULL,
            `groups` TEXT NULL,
            `notes` TEXT NULL,
            `other` MEDIUMTEXT NULL,
            `favorite` TINYINT(1) NOT NULL DEFAULT 0,
            `photo` MEDIUMBLOB NULL,
            `photo_rev` INT UNSIGNED NOT NULL DEFAULT 0,
            `search` TEXT NULL,
            `rev` INT UNSIGNED NOT NULL DEFAULT 1,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            `deleted_at` DATETIME NULL,
            UNIQUE KEY `uq_cid` (`cid`),
            KEY `ix_user` (`user_id`, `deleted_at`),
            KEY `ix_uid` (`user_id`, `uid`),
            CONSTRAINT `fk_{$p}conc_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}con_app_passwords` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `name` VARCHAR(60) NOT NULL,
            `hash` VARCHAR(255) NOT NULL,
            `created_at` DATETIME NOT NULL,
            `last_used_at` DATETIME NULL,
            KEY `ix_user` (`user_id`),
            CONSTRAINT `fk_{$p}conap_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}con_tombstones` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `uid` VARCHAR(190) NOT NULL,
            `dav_name` VARCHAR(190) NULL,
            `deleted_at` DATETIME NOT NULL,
            KEY `ix_user` (`user_id`, `deleted_at`),
            CONSTRAINT `fk_{$p}conts_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
    ];
}

function install_con_schema(PDO $pdo, string $prefix): void
{
    foreach (con_schema_statements($prefix) as $sql) $pdo->exec($sql);
    // version 2: the name a CardDAV client gave a card (added only when missing: MySQL 5.7 has no ADD COLUMN IF NOT EXISTS)
    $has = $pdo->query("SHOW COLUMNS FROM `{$prefix}con_contacts` LIKE 'dav_name'")->fetch();
    if (!$has) $pdo->exec("ALTER TABLE `{$prefix}con_contacts` ADD COLUMN `dav_name` VARCHAR(190) NULL AFTER `uid`, ADD KEY `ix_dav` (`user_id`, `dav_name`)");
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('con_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)CON_SCHEMA_VERSION]);
}

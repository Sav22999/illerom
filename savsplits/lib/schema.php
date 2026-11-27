<?php
/**
 * SavSplits — its tables, next to the ones of SavSchedules (same prefix, "sch_split_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * split_profiles  one per account that opened SavSplits: its settings
 * split_groups    a group that shares expenses (a trip, a flat, a couple, a condominium…): its currency (every balance is
 *                 in it), its kind (the template it started from), the tables of shares (JSON [{id, name}]: the
 *                 thousandths of a condominium, or any other key), and its link: whoever has it opens the group without
 *                 an account, to look (view) or to add expenses too (edit). rev grows at every change.
 * split_members   a person of a group: a name, and the account joined to it (user_id, optional: an account sees the
 *                 groups it owns and those where it is a member). weight: the default share of the "by shares"
 *                 split; quotas: the share in each table (JSON {table id: number}); pay: how to pay them (an IBAN, a
 *                 PayPal.me link… written by the group); active = 0 once they left (kept for the history).
 * split_expenses  an expense (who paid, how it is split), a transfer (someone pays someone back) or an income (money the
 *                 group received, split like an expense). amount is in minor units of its currency (cents), rate turns
 *                 it into the currency of the group (base). payers {member: minor units of the expense}, split {mode,
 *                 parts, table}; paid and alloc are what each one paid and owes in minor units of the group, worked out
 *                 when it is saved, so that the balances are only sums: balance = Σ paid − Σ alloc (always 0 in total).
 *                 A repeated expense (repeat: week, month, quarter, year) makes its copies by itself when the group is
 *                 opened (repeat_next: the next day to make). Deleted ones stay 30 days (deleted_at), so they can come back.
 * split_log       what happened in a group, who did it and when (the last 3000 of each group)
 * split_rates     the rates of the European Central Bank (1 euro = rate), asked at most every 6 hours
 * split_photos    the photos attached to an expense (a receipt, a bill): re-encoded as JPEG without their metadata, kept
 *                 as files in the storage folder (lib/photos.php) and served by their random id to whoever can open the
 *                 group. eid is NULL while the expense being written is not saved yet (forgotten ones go after a day)
 */

declare(strict_types=1);

function split_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}split_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}splitp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}split_groups` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `gid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `owner_id` INT UNSIGNED NOT NULL,
            `name` VARCHAR(80) NOT NULL,
            `kind` VARCHAR(12) CHARACTER SET ascii NOT NULL DEFAULT 'generic',
            `icon` VARCHAR(32) CHARACTER SET ascii NOT NULL DEFAULT '',
            `color` CHAR(7) CHARACTER SET ascii NOT NULL DEFAULT '#1a7f37',
            `currency` CHAR(3) CHARACTER SET ascii NOT NULL DEFAULT 'EUR',
            `notes` TEXT NULL,
            `tables` TEXT NULL,
            `link_code` CHAR(16) CHARACTER SET ascii NULL,
            `link_role` ENUM('view','edit') NOT NULL DEFAULT 'edit',
            `rev` INT UNSIGNED NOT NULL DEFAULT 1,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_gid` (`gid`),
            UNIQUE KEY `uq_link` (`link_code`),
            KEY `ix_owner` (`owner_id`),
            CONSTRAINT `fk_{$p}splitg_owner` FOREIGN KEY (`owner_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}split_members` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `mid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `group_id` INT UNSIGNED NOT NULL,
            `name` VARCHAR(80) NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `role` ENUM('editor','viewer') NOT NULL DEFAULT 'editor',
            `weight` DECIMAL(12,4) NOT NULL DEFAULT 1,
            `quotas` TEXT NULL,
            `pay` VARCHAR(300) NOT NULL DEFAULT '',
            `active` TINYINT(1) NOT NULL DEFAULT 1,
            `archived` TINYINT(1) NOT NULL DEFAULT 0,
            `position` SMALLINT NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_mid` (`mid`),
            KEY `ix_group` (`group_id`, `position`),
            KEY `ix_user` (`user_id`),
            CONSTRAINT `fk_{$p}splitm_group` FOREIGN KEY (`group_id`) REFERENCES `{$p}split_groups` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}splitm_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE SET NULL
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}split_expenses` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `eid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `group_id` INT UNSIGNED NOT NULL,
            `kind` ENUM('expense','transfer','income') NOT NULL DEFAULT 'expense',
            `title` VARCHAR(120) NOT NULL DEFAULT '',
            `category` VARCHAR(24) CHARACTER SET ascii NOT NULL DEFAULT '',
            `day` DATE NOT NULL,
            `amount` BIGINT NOT NULL,
            `currency` CHAR(3) CHARACTER SET ascii NOT NULL,
            `rate` DECIMAL(24,10) NOT NULL DEFAULT 1,
            `base` BIGINT NOT NULL,
            `payers` TEXT NOT NULL,
            `split` TEXT NOT NULL,
            `paid` TEXT NOT NULL,
            `alloc` TEXT NOT NULL,
            `notes` TEXT NULL,
            `repeat_rule` VARCHAR(8) CHARACTER SET ascii NOT NULL DEFAULT '',
            `repeat_next` DATE NULL,
            `repeat_of` CHAR(10) CHARACTER SET ascii NULL,
            `created_by` VARCHAR(80) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            `deleted_at` DATETIME NULL,
            UNIQUE KEY `uq_eid` (`eid`),
            KEY `ix_group` (`group_id`, `deleted_at`, `day`),
            KEY `ix_repeat` (`group_id`, `repeat_next`),
            CONSTRAINT `fk_{$p}splite_group` FOREIGN KEY (`group_id`) REFERENCES `{$p}split_groups` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}split_log` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `group_id` INT UNSIGNED NOT NULL,
            `who` VARCHAR(80) NOT NULL DEFAULT '',
            `user_id` INT UNSIGNED NULL,
            `action` VARCHAR(24) CHARACTER SET ascii NOT NULL,
            `ref` CHAR(10) CHARACTER SET ascii NULL,
            `info` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_group` (`group_id`, `id`),
            CONSTRAINT `fk_{$p}splitl_group` FOREIGN KEY (`group_id`) REFERENCES `{$p}split_groups` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}split_photos` (
            `pid` CHAR(32) CHARACTER SET ascii NOT NULL PRIMARY KEY,
            `group_id` INT UNSIGNED NOT NULL,
            `eid` CHAR(10) CHARACTER SET ascii NULL,
            `width` SMALLINT UNSIGNED NOT NULL,
            `height` SMALLINT UNSIGNED NOT NULL,
            `bytes` INT UNSIGNED NOT NULL,
            `position` TINYINT UNSIGNED NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            KEY `ix_group` (`group_id`, `eid`),
            CONSTRAINT `fk_{$p}splitph_group` FOREIGN KEY (`group_id`) REFERENCES `{$p}split_groups` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}split_rates` (
            `currency` CHAR(3) CHARACTER SET ascii NOT NULL PRIMARY KEY,
            `rate` DECIMAL(24,10) NOT NULL,
            `day` DATE NULL,
            `asked_at` DATETIME NOT NULL
        ) $e",
    ];
}

function install_split_schema(PDO $pdo, string $prefix): void
{
    foreach (split_schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('split_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)SPLIT_SCHEMA_VERSION]);
}

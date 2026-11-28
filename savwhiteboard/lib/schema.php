<?php
/**
 * SavWhiteboard — its tables, next to the ones of SavSchedules (same prefix, "sch_wb_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * wb_profiles  one per account that opened the boards: its settings (tool, colours, sizes, theme…)
 * wb_boards    a board: its look (settings: background, pattern…), its items (a JSON array, in the order they are drawn:
 *              strokes, shapes, texts, notes, pictures) and a small picture for the home. version grows at every save;
 *              trashed_at: in the trash (deleted for good after TRASH_DAYS by cron/cleanup.php)
 * wb_media     a picture of an account (uploaded or found with the search), kept as a file in the storage folder and
 *              served by its random id; boards point to it as "m:<id>"
 * wb_shares    the people a board is shared with (editor or viewer) · wb_here: who is on a board now, window by window
 * wb_cache     results of the searches of free pictures, for 12 hours (the import only accepts what a search found)
 */

declare(strict_types=1);

function wb_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}wb_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}wbp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}wb_boards` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `bid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `title` VARCHAR(160) NOT NULL DEFAULT '',
            `settings` TEXT NULL,
            `items` LONGTEXT NULL,
            `thumb` MEDIUMTEXT NULL,
            `n_items` INT UNSIGNED NOT NULL DEFAULT 0,
            `bytes` INT UNSIGNED NOT NULL DEFAULT 0,
            `version` INT UNSIGNED NOT NULL DEFAULT 1,
            `trashed_at` DATETIME NULL,
            `opened_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_bid` (`bid`),
            KEY `ix_user` (`user_id`, `trashed_at`, `updated_at`),
            KEY `ix_trash` (`trashed_at`),
            CONSTRAINT `fk_{$p}wbb_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}wb_media` (
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
            CONSTRAINT `fk_{$p}wbm_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        // the people a board is shared with (the owner is wb_boards.user_id): they can edit it, or only look at it
        "CREATE TABLE IF NOT EXISTS `{$p}wb_shares` (
            `board_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `role` VARCHAR(10) NOT NULL DEFAULT 'editor',
            `created_at` DATETIME NOT NULL,
            PRIMARY KEY (`board_id`, `user_id`),
            KEY `ix_user` (`user_id`),
            CONSTRAINT `fk_{$p}wbs_board` FOREIGN KEY (`board_id`) REFERENCES `{$p}wb_boards` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}wbs_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        // who has a board open now (the last time each one asked for news): their faces on the board
        // who is on a board now, one row for each window open on it (the same person on a tablet and a computer: two rows)
        "DROP TABLE IF EXISTS `{$p}wb_presence`",
        "CREATE TABLE IF NOT EXISTS `{$p}wb_here` (
            `board_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `client` CHAR(16) NOT NULL,
            `seen_at` DATETIME NOT NULL,
            PRIMARY KEY (`board_id`, `user_id`, `client`),
            KEY `ix_{$p}wbh_seen` (`board_id`, `seen_at`),
            CONSTRAINT `fk_{$p}wbh_board` FOREIGN KEY (`board_id`) REFERENCES `{$p}wb_boards` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}wbh_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}wb_cache` (
            `k` CHAR(64) CHARACTER SET ascii NOT NULL PRIMARY KEY,
            `v` MEDIUMTEXT NOT NULL,
            `expires_at` DATETIME NOT NULL,
            KEY `ix_exp` (`expires_at`)
        ) $e",
    ];
}

function install_wb_schema(PDO $pdo, string $prefix): void
{
    foreach (wb_schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('wb_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)WB_SCHEMA_VERSION]);
}

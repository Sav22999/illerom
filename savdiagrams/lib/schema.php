<?php
/**
 * SavDiagrams — its tables, next to the ones of SavSchedules (same prefix, "sch_dg_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * dg_profiles  one per account that opened the diagrams: its settings (last shape, styles, theme…)
 * dg_diagrams  a diagram: its look (settings: background, grid…), its items (a JSON array, in the order they are drawn:
 *              shapes and connectors) and a small picture for the home. version grows at every save;
 *              trashed_at: in the trash (deleted for good after TRASH_DAYS by cron/cleanup.php)
 */

declare(strict_types=1);

function dg_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}dg_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}dgp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}dg_diagrams` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `did` CHAR(10) CHARACTER SET ascii NOT NULL,
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
            UNIQUE KEY `uq_did` (`did`),
            KEY `ix_user` (`user_id`, `trashed_at`, `updated_at`),
            KEY `ix_trash` (`trashed_at`),
            CONSTRAINT `fk_{$p}dgd_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
    ];
}

function install_dg_schema(PDO $pdo, string $prefix): void
{
    foreach (dg_schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('dg_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)DG_SCHEMA_VERSION]);
}

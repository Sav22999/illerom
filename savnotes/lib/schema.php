<?php
/**
 * SavNotes — its tables, next to the ones of SavSchedules (same prefix, "sch_nb_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * nb_profiles   one per account that opened the notebooks: its settings (tools, colours, sizes, theme…)
 * nb_notebooks  a notebook: its look (settings: cover, size of the sheets, paper of new sheets…) and its sheets (a JSON
 *               array, in order: each sheet has its paper, its typed text and its items drawn by hand). version grows at
 *               every save; trashed_at: in the trash (deleted for good after TRASH_DAYS by cron/cleanup.php)
 */

declare(strict_types=1);

function nb_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}nb_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}nbp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}nb_notebooks` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `nid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `title` VARCHAR(160) NOT NULL DEFAULT '',
            `settings` TEXT NULL,
            `sheets` LONGTEXT NULL,
            `n_sheets` INT UNSIGNED NOT NULL DEFAULT 0,
            `bytes` INT UNSIGNED NOT NULL DEFAULT 0,
            `version` INT UNSIGNED NOT NULL DEFAULT 1,
            `trashed_at` DATETIME NULL,
            `opened_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_nid` (`nid`),
            KEY `ix_user` (`user_id`, `trashed_at`, `updated_at`),
            KEY `ix_trash` (`trashed_at`),
            CONSTRAINT `fk_{$p}nbn_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
    ];
}

function install_nb_schema(PDO $pdo, string $prefix): void
{
    foreach (nb_schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('nb_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)NB_SCHEMA_VERSION]);
}

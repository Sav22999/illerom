<?php
/**
 * SavForms — its tables, next to the ones of SavSchedules, SavCalendar and SavTasks (same prefix, "sch_form_…"): the
 * accounts are the users of SavSchedules. Every statement is idempotent: the API creates the tables by itself the first
 * time it answers.
 *
 * form_profiles   one per account that opened SavForms: its settings
 * form_forms      a form: title, description, the questions (content, JSON: see clean_questions() in lib/forms.php), its
 *                 look (theme, JSON), its settings (JSON), whether it takes answers (accepting), when it opens and closes
 *                 (opens_at, closes_at: UTC; tz: the zone they were chosen in), whether the deadline shows in SavCalendar
 *                 (in_calendar), how many answers it has (responses, kept with every answer) and when the owner last
 *                 looked at them (seen_at: the answers after it are "new")
 * form_responses  one set of answers: answers (JSON, by question id), the account that answered (only when the form asks
 *                 for it), the address given, the score of a quiz, a secret to change it later (edit_hash: SHA-256 of
 *                 the token given to who answered, when the form allows it) and the SHA-256 of the address that sent it
 *                 with a daily salt (only to slow down floods, never shown)
 */

declare(strict_types=1);

function form_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}form_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}formp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}form_forms` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `fid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `title` VARCHAR(200) NOT NULL DEFAULT '',
            `descr` TEXT NULL,
            `content` MEDIUMTEXT NULL,
            `theme` TEXT NULL,
            `settings` TEXT NULL,
            `accepting` TINYINT(1) NOT NULL DEFAULT 1,
            `opens_at` DATETIME NULL,
            `closes_at` DATETIME NULL,
            `tz` VARCHAR(64) NOT NULL DEFAULT 'UTC',
            `in_calendar` TINYINT(1) NOT NULL DEFAULT 1,
            `responses` INT UNSIGNED NOT NULL DEFAULT 0,
            `last_response_at` DATETIME NULL,
            `seen_at` DATETIME NULL,
            `starred` TINYINT(1) NOT NULL DEFAULT 0,
            `archived` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_fid` (`fid`),
            KEY `ix_user` (`user_id`, `updated_at`),
            KEY `ix_closes` (`closes_at`),
            CONSTRAINT `fk_{$p}formf_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}form_responses` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `rid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `form_id` INT UNSIGNED NOT NULL,
            `user_id` INT UNSIGNED NULL,
            `name` VARCHAR(80) NOT NULL DEFAULT '',
            `email` VARCHAR(190) NOT NULL DEFAULT '',
            `answers` MEDIUMTEXT NULL,
            `score` DECIMAL(8,2) NULL,
            `max_score` DECIMAL(8,2) NULL,
            `seconds` INT UNSIGNED NULL,
            `edit_hash` CHAR(64) CHARACTER SET ascii NULL,
            `ip_hash` CHAR(64) CHARACTER SET ascii NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_rid` (`rid`),
            KEY `ix_form` (`form_id`, `created_at`),
            KEY `ix_user` (`form_id`, `user_id`),
            KEY `ix_edit` (`edit_hash`),
            CONSTRAINT `fk_{$p}formr_form` FOREIGN KEY (`form_id`) REFERENCES `{$p}form_forms` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}formr_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE SET NULL
        ) $e",
    ];
}

function install_form_schema(PDO $pdo, string $prefix): void
{
    foreach (form_schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('form_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)FORM_SCHEMA_VERSION]);
}

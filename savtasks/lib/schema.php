<?php
/**
 * SavTasks — its tables, next to the ones of SavSchedules and SavCalendar (same prefix, "sch_task_…"): the accounts are the
 * users of SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * task_profiles  one per account that opened SavTasks: its settings
 * task_lists     a list of its own: shown as a list, as a board (kanban), as a Gantt chart (start → due on a timeline) or as a
 *                table; or a list of habits (view habits: things to do on some days, each day ticked on its own) columns: the columns of the board, as JSON
 *                [{id, name, done}] (a column marked done ticks the tasks moved into it). The first list of an account
 *                is its inbox (inbox = 1), which cannot be deleted
 * task_items     a task: title, notes, a checklist (subtasks, JSON), priority, star, labels (JSON), its column on the
 *                board, a start day (start_date, optional: the bar of the Gantt goes from it to the due day), a due day
 *                with an optional wall-clock time in a time zone (due_at: the same moment in UTC, for
 *                the reminders and the calendar), a reminder (remind_at, UTC; reminded_at once the email went), a
 *                repetition (rrule, RFC 5545 subset: when it is ticked the next one is planned), and the links made
 *                by the actions with the other apps: an event of SavCalendar (cal_eid) and a schedule of SavSchedules
 *                (sch_pid). A habit keeps the days it was done in log (JSON, the last 400) and its days in rrule
 * task_time      the time tracked: a timer (running = 1, from start_at; one at most per account) or a span of work
 *                written by hand (a day, from–to or only a length in seconds), with a note and whether it is billable.
 *                It belongs to a task (task_id) and so to its list, or only to a list (list_id): a list is the project
 *                or the client, with its hourly rate (task_lists.rate, optional). The title of the task is kept, so
 *                the time stays readable once the task is deleted
 */

declare(strict_types=1);

function task_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}task_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}taskp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}task_lists` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `lid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `name` VARCHAR(120) NOT NULL,
            `color` CHAR(7) CHARACTER SET ascii NOT NULL DEFAULT '#0b7a87',
            `icon` VARCHAR(32) CHARACTER SET ascii NOT NULL DEFAULT '',
            `view` ENUM('list','board','gantt','table','habits') NOT NULL DEFAULT 'list',
            `columns` TEXT NULL,
            `inbox` TINYINT(1) NOT NULL DEFAULT 0,
            `archived` TINYINT(1) NOT NULL DEFAULT 0,
            `position` SMALLINT NOT NULL DEFAULT 0,
            `rate` DECIMAL(10,2) NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_lid` (`lid`),
            KEY `ix_user` (`user_id`, `position`),
            CONSTRAINT `fk_{$p}taskl_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}task_items` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `tid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `list_id` INT UNSIGNED NOT NULL,
            `title` VARCHAR(255) NOT NULL DEFAULT '',
            `notes` TEXT NULL,
            `checklist` TEXT NULL,
            `tags` VARCHAR(600) NOT NULL DEFAULT '',
            `priority` TINYINT UNSIGNED NOT NULL DEFAULT 0,
            `starred` TINYINT(1) NOT NULL DEFAULT 0,
            `col` VARCHAR(12) CHARACTER SET ascii NOT NULL DEFAULT '',
            `position` INT NOT NULL DEFAULT 0,
            `start_date` DATE NULL,
            `due_date` DATE NULL,
            `due_time` TIME NULL,
            `due_at` DATETIME NULL,
            `tz` VARCHAR(64) NOT NULL DEFAULT 'UTC',
            `remind_at` DATETIME NULL,
            `reminded_at` DATETIME NULL,
            `rrule` VARCHAR(200) NOT NULL DEFAULT '',
            `log` TEXT NULL,
            `done_at` DATETIME NULL,
            `cal_eid` CHAR(10) CHARACTER SET ascii NULL,
            `sch_pid` CHAR(12) CHARACTER SET ascii NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_tid` (`tid`),
            KEY `ix_list` (`list_id`, `done_at`, `position`),
            KEY `ix_due` (`due_date`),
            KEY `ix_remind` (`remind_at`, `reminded_at`),
            CONSTRAINT `fk_{$p}taski_list` FOREIGN KEY (`list_id`) REFERENCES `{$p}task_lists` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}task_time` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `eid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `list_id` INT UNSIGNED NULL,
            `task_id` INT UNSIGNED NULL,
            `title` VARCHAR(255) NOT NULL DEFAULT '',
            `note` VARCHAR(500) NOT NULL DEFAULT '',
            `day` DATE NOT NULL,
            `start_at` DATETIME NULL,
            `end_at` DATETIME NULL,
            `seconds` INT UNSIGNED NOT NULL DEFAULT 0,
            `running` TINYINT(1) NOT NULL DEFAULT 0,
            `billable` TINYINT(1) NOT NULL DEFAULT 0,
            `tz` VARCHAR(64) NOT NULL DEFAULT 'UTC',
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_eid` (`eid`),
            KEY `ix_user_day` (`user_id`, `day`),
            KEY `ix_running` (`user_id`, `running`),
            KEY `ix_task` (`task_id`),
            CONSTRAINT `fk_{$p}taskt_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}taskt_list` FOREIGN KEY (`list_id`) REFERENCES `{$p}task_lists` (`id`) ON DELETE SET NULL,
            CONSTRAINT `fk_{$p}taskt_task` FOREIGN KEY (`task_id`) REFERENCES `{$p}task_items` (`id`) ON DELETE SET NULL
        ) $e",
    ];
}

function install_task_schema(PDO $pdo, string $prefix): void
{
    foreach (task_schema_statements($prefix) as $sql) $pdo->exec($sql);
    // version 2, on tables made by version 1: the start day and the Gantt view
    $has = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{$prefix}task_items' AND COLUMN_NAME = 'start_date'")->fetchColumn();
    if (!$has) $pdo->exec("ALTER TABLE `{$prefix}task_items` ADD COLUMN `start_date` DATE NULL AFTER `position`");
    // version 3: the table, the habits and the days they were done
    $has = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{$prefix}task_items' AND COLUMN_NAME = 'log'")->fetchColumn();
    if (!$has) $pdo->exec("ALTER TABLE `{$prefix}task_items` ADD COLUMN `log` TEXT NULL AFTER `rrule`");
    $pdo->exec("ALTER TABLE `{$prefix}task_lists` MODIFY `view` ENUM('list','board','gantt','table','habits') NOT NULL DEFAULT 'list'");
    // version 4: the time tracked (its table is made above) and the hourly rate of a list (the project or the client)
    $has = (int)$pdo->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{$prefix}task_lists' AND COLUMN_NAME = 'rate'")->fetchColumn();
    if (!$has) $pdo->exec("ALTER TABLE `{$prefix}task_lists` ADD COLUMN `rate` DECIMAL(10,2) NULL AFTER `position`");
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('task_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)TASK_SCHEMA_VERSION]);
}

<?php
/**
 * SavCalendar — its tables, next to the ones of SavSchedules (same prefix, "sch_cal_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * cal_profiles   one per account that opened the calendar: its settings, and the private link of the feed with everything
 * cal_calendars  a calendar of its own (kind local) or a subscription to a calendar somewhere else (kind sub: a link to an
 *                .ics file, read again every few hours; its events are read-only here). feed_token: the private link
 *                that lets other calendars (Google, Outlook, Apple…) show this one
 * cal_events     an event: a time in UTC (starts_at, ends_at) planned in a time zone (tz), or whole days (all_day, the
 *                dates kept as midnight, the end excluded); a repetition (rrule, RFC 5545) with its exceptions (exdates);
 *                a changed occurrence is a row of its own with the same uid and the original start in recur_id
 */

declare(strict_types=1);

function cal_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $fk = fn(string $name, string $col, string $table, string $on = 'CASCADE') => "CONSTRAINT `fk_{$p}{$name}` FOREIGN KEY (`$col`) REFERENCES `{$p}$table` (`id`) ON DELETE $on";
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}cal_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `feed_token` CHAR(32) CHARACTER SET ascii NULL,
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_feed` (`feed_token`),
            CONSTRAINT `fk_{$p}calp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}cal_calendars` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `cid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `kind` ENUM('local','sub') NOT NULL DEFAULT 'local',
            `name` VARCHAR(120) NOT NULL,
            `color` CHAR(7) CHARACTER SET ascii NOT NULL DEFAULT '#c93a2f',
            `descr` VARCHAR(500) NOT NULL DEFAULT '',
            `tz` VARCHAR(64) NOT NULL DEFAULT 'UTC',
            `url` VARCHAR(1000) NOT NULL DEFAULT '',
            `visible` TINYINT(1) NOT NULL DEFAULT 1,
            `position` SMALLINT NOT NULL DEFAULT 0,
            `feed_token` CHAR(32) CHARACTER SET ascii NULL,
            `refreshed_at` DATETIME NULL,
            `fetch_error` VARCHAR(40) NOT NULL DEFAULT '',
            `etag` VARCHAR(250) NOT NULL DEFAULT '',
            `last_modified` VARCHAR(100) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_cid` (`cid`),
            UNIQUE KEY `uq_feed` (`feed_token`),
            KEY `ix_user` (`user_id`, `position`),
            KEY `ix_refresh` (`kind`, `refreshed_at`),
            " . $fk('calc_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}cal_events` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `eid` CHAR(10) CHARACTER SET ascii NOT NULL,
            `calendar_id` INT UNSIGNED NOT NULL,
            `uid` VARCHAR(255) NOT NULL,
            `recur_id` DATETIME NULL,
            `title` VARCHAR(255) NOT NULL DEFAULT '',
            `descr` TEXT NULL,
            `place` VARCHAR(255) NOT NULL DEFAULT '',
            `url` VARCHAR(500) NOT NULL DEFAULT '',
            `all_day` TINYINT(1) NOT NULL DEFAULT 0,
            `starts_at` DATETIME NOT NULL,
            `ends_at` DATETIME NOT NULL,
            `tz` VARCHAR(64) NOT NULL DEFAULT 'UTC',
            `rrule` VARCHAR(500) NOT NULL DEFAULT '',
            `rrule_until` DATETIME NULL,
            `exdates` TEXT NULL,
            `status` ENUM('confirmed','tentative','cancelled') NOT NULL DEFAULT 'confirmed',
            `busy` TINYINT(1) NOT NULL DEFAULT 1,
            `color` CHAR(7) CHARACTER SET ascii NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_eid` (`eid`),
            KEY `ix_cal_time` (`calendar_id`, `starts_at`),
            KEY `ix_cal_uid` (`calendar_id`, `uid`(100)),
            " . $fk('cale_cal', 'calendar_id', 'cal_calendars') . "
        ) $e",
    ];
}

function install_cal_schema(PDO $pdo, string $prefix): void
{
    foreach (cal_schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('cal_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)CAL_SCHEMA_VERSION]);
}

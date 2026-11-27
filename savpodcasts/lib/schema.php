<?php
/**
 * SavPodcasts — its tables, next to the ones of SavSchedules (same prefix, "sch_pod_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * pod_profiles  one per account that opened SavPodcasts: its settings (speed, skips, theme…)
 * pod_feeds     a podcast, as read from its RSS feed: shared by every account that follows or opened it (the feed is
 *               public, so it is read once for everybody). checked_at: the last time the feed was asked for; fetched_at:
 *               the last time it really changed. extra: JSON with what is seldom needed (funding links, podcast:guid…)
 * pod_episodes  the episodes of a feed (one row per item with an audio enclosure); the audio is never copied: it plays from
 *               the address the publisher gives (audio)
 * pod_subs      the podcasts an account follows; seen_at: when it last opened the podcast (the "new" episodes are the ones
 *               after it); settings: JSON {speed, skip} for that podcast only
 * pod_states    what an account did with an episode: the position reached, played to the end, starred
 * pod_queue     the episodes to play next, in order
 * pod_cache     answers of the open catalogues (fyyd, Podcast Index), kept a little to be gentle with them
 */

declare(strict_types=1);

function pod_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}pod_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}podp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}pod_feeds` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `url` VARCHAR(2048) NOT NULL,
            `url_hash` CHAR(40) CHARACTER SET ascii NOT NULL,
            `title` VARCHAR(300) NOT NULL DEFAULT '',
            `author` VARCHAR(300) NOT NULL DEFAULT '',
            `descr` TEXT NULL,
            `link` VARCHAR(2048) NOT NULL DEFAULT '',
            `image` VARCHAR(2048) NOT NULL DEFAULT '',
            `lang` VARCHAR(16) NOT NULL DEFAULT '',
            `cats` VARCHAR(255) NOT NULL DEFAULT '',
            `explicit` TINYINT(1) NOT NULL DEFAULT 0,
            `extra` TEXT NULL,
            `etag` VARCHAR(255) NOT NULL DEFAULT '',
            `modified` VARCHAR(64) NOT NULL DEFAULT '',
            `n_episodes` INT UNSIGNED NOT NULL DEFAULT 0,
            `latest_at` DATETIME NULL,
            `subs` INT UNSIGNED NOT NULL DEFAULT 0,
            `fails` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
            `error` VARCHAR(40) NOT NULL DEFAULT '',
            `checked_at` DATETIME NULL,
            `fetched_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_url` (`url_hash`),
            KEY `ix_check` (`subs`, `checked_at`)
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}pod_episodes` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `feed_id` INT UNSIGNED NOT NULL,
            `guid_hash` CHAR(40) CHARACTER SET ascii NOT NULL,
            `title` VARCHAR(300) NOT NULL DEFAULT '',
            `summary` VARCHAR(400) NOT NULL DEFAULT '',
            `descr` MEDIUMTEXT NULL,
            `pub_at` DATETIME NULL,
            `duration` INT UNSIGNED NOT NULL DEFAULT 0,
            `audio` VARCHAR(2048) NOT NULL,
            `audio_type` VARCHAR(80) NOT NULL DEFAULT '',
            `audio_bytes` BIGINT UNSIGNED NOT NULL DEFAULT 0,
            `image` VARCHAR(2048) NOT NULL DEFAULT '',
            `link` VARCHAR(2048) NOT NULL DEFAULT '',
            `season` SMALLINT UNSIGNED NULL,
            `episode` INT UNSIGNED NULL,
            `kind` VARCHAR(10) NOT NULL DEFAULT 'full',
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_guid` (`feed_id`, `guid_hash`),
            KEY `ix_feed` (`feed_id`, `pub_at`),
            CONSTRAINT `fk_{$p}pode_feed` FOREIGN KEY (`feed_id`) REFERENCES `{$p}pod_feeds` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}pod_subs` (
            `user_id` INT UNSIGNED NOT NULL,
            `feed_id` INT UNSIGNED NOT NULL,
            `settings` TEXT NULL,
            `seen_at` DATETIME NULL,
            `added_at` DATETIME NOT NULL,
            PRIMARY KEY (`user_id`, `feed_id`),
            KEY `ix_feed` (`feed_id`),
            CONSTRAINT `fk_{$p}pods_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}pods_feed` FOREIGN KEY (`feed_id`) REFERENCES `{$p}pod_feeds` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}pod_states` (
            `user_id` INT UNSIGNED NOT NULL,
            `episode_id` INT UNSIGNED NOT NULL,
            `pos` INT UNSIGNED NOT NULL DEFAULT 0,
            `dur` INT UNSIGNED NOT NULL DEFAULT 0,
            `done` TINYINT(1) NOT NULL DEFAULT 0,
            `starred` TINYINT(1) NOT NULL DEFAULT 0,
            `played_at` DATETIME NULL,
            `updated_at` DATETIME NOT NULL,
            PRIMARY KEY (`user_id`, `episode_id`),
            KEY `ix_recent` (`user_id`, `updated_at`),
            KEY `ix_episode` (`episode_id`),
            CONSTRAINT `fk_{$p}podst_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}podst_ep` FOREIGN KEY (`episode_id`) REFERENCES `{$p}pod_episodes` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}pod_queue` (
            `user_id` INT UNSIGNED NOT NULL,
            `episode_id` INT UNSIGNED NOT NULL,
            `sort` INT NOT NULL DEFAULT 0,
            `added_at` DATETIME NOT NULL,
            PRIMARY KEY (`user_id`, `episode_id`),
            KEY `ix_order` (`user_id`, `sort`),
            KEY `ix_episode` (`episode_id`),
            CONSTRAINT `fk_{$p}podq_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}podq_ep` FOREIGN KEY (`episode_id`) REFERENCES `{$p}pod_episodes` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}pod_cache` (
            `k` CHAR(40) CHARACTER SET ascii NOT NULL PRIMARY KEY,
            `v` MEDIUMTEXT NOT NULL,
            `at` DATETIME NOT NULL,
            KEY `ix_at` (`at`)
        ) $e",
    ];
}

function install_pod_schema(PDO $pdo, string $prefix): void
{
    foreach (pod_schema_statements($prefix) as $sql) $pdo->exec($sql);
    // 2: a position sent at the very end could arrive after "played" and undo it: those episodes are played
    $pdo->exec("UPDATE `{$prefix}pod_states` SET done = 1, pos = 0 WHERE done = 0 AND dur > 0 AND pos >= dur - 2");
    // the key that signs the addresses of the pictures (api/?r=img): only pictures the app itself named can be fetched
    $pdo->prepare("INSERT IGNORE INTO `{$prefix}meta` (k, v) VALUES ('pod_img_key', ?)")->execute([bin2hex(random_bytes(32))]);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('pod_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)POD_SCHEMA_VERSION]);
}

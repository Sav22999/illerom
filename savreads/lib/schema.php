<?php
/**
 * SavReads — its tables, next to the ones of SavSchedules (same prefix, "sch_rd_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * rd_profiles    one per account that opened SavReads: its settings (font, size, theme of the reader…)
 * rd_articles    what an account saved to read later: the address, what the server read of the page (title, author,
 *                date, picture, the clean text as a small set of HTML), where the reading got to (progress, 0…1),
 *                tags, star, archive. status: pending (still to be read from the Internet: an import, a page that was
 *                busy) · ready · failed (the page could not be read: the address stays, with what was known of it)
 * rd_highlights  the passages marked in an article: the words (quote) with a little of the text before and after them
 *                (prefix, suffix) to find them again, where they start in the text, a colour and a note
 * rd_feeds       a feed (RSS, Atom or JSON Feed), shared by every account that follows it (it is public, so it is read
 *                once for everybody); checked_at: the last time it was asked for, fetched_at: the last time it changed
 * rd_items       the articles of a feed, as the feed gives them (the newest FEED_KEEP of each feed are kept)
 * rd_subs        the feeds an account follows: its own name for it, its folder, and read_before (what came out before
 *                it counts as read: "mark all as read" moves it forward)
 * rd_states      the articles of a feed an account read (or marked as unread again after read_before)
 */

declare(strict_types=1);

function rd_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}rd_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}rdp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}rd_articles` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `url` VARCHAR(2048) NOT NULL,
            `url_hash` CHAR(40) CHARACTER SET ascii NOT NULL,
            `title` VARCHAR(400) NOT NULL DEFAULT '',
            `author` VARCHAR(300) NOT NULL DEFAULT '',
            `site` VARCHAR(200) NOT NULL DEFAULT '',
            `lang` VARCHAR(16) NOT NULL DEFAULT '',
            `image` VARCHAR(2048) NOT NULL DEFAULT '',
            `excerpt` VARCHAR(500) NOT NULL DEFAULT '',
            `content` MEDIUMTEXT NULL,
            `words` INT UNSIGNED NOT NULL DEFAULT 0,
            `published_at` DATETIME NULL,
            `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
            `error` VARCHAR(40) NOT NULL DEFAULT '',
            `tries` TINYINT UNSIGNED NOT NULL DEFAULT 0,
            `archived` TINYINT(1) NOT NULL DEFAULT 0,
            `starred` TINYINT(1) NOT NULL DEFAULT 0,
            `progress` DECIMAL(5,4) NOT NULL DEFAULT 0,
            `tags` VARCHAR(600) NOT NULL DEFAULT '',
            `note` TEXT NULL,
            `source` VARCHAR(20) NOT NULL DEFAULT 'url',
            `added_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            `read_at` DATETIME NULL,
            `archived_at` DATETIME NULL,
            UNIQUE KEY `uq_url` (`user_id`, `url_hash`),
            KEY `ix_list` (`user_id`, `archived`, `added_at`),
            KEY `ix_star` (`user_id`, `starred`),
            KEY `ix_pending` (`status`, `tries`),
            CONSTRAINT `fk_{$p}rda_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}rd_highlights` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `article_id` INT UNSIGNED NOT NULL,
            `quote` TEXT NOT NULL,
            `prefix` VARCHAR(80) NOT NULL DEFAULT '',
            `suffix` VARCHAR(80) NOT NULL DEFAULT '',
            `start` INT UNSIGNED NOT NULL DEFAULT 0,
            `color` VARCHAR(12) NOT NULL DEFAULT 'yellow',
            `note` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            KEY `ix_article` (`article_id`, `start`),
            KEY `ix_user` (`user_id`, `created_at`),
            CONSTRAINT `fk_{$p}rdh_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}rdh_art` FOREIGN KEY (`article_id`) REFERENCES `{$p}rd_articles` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}rd_feeds` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `url` VARCHAR(2048) NOT NULL,
            `url_hash` CHAR(40) CHARACTER SET ascii NOT NULL,
            `title` VARCHAR(300) NOT NULL DEFAULT '',
            `link` VARCHAR(2048) NOT NULL DEFAULT '',
            `descr` VARCHAR(600) NOT NULL DEFAULT '',
            `icon` VARCHAR(2048) NOT NULL DEFAULT '',
            `kind` VARCHAR(8) NOT NULL DEFAULT '',
            `etag` VARCHAR(255) NOT NULL DEFAULT '',
            `modified` VARCHAR(64) NOT NULL DEFAULT '',
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
        "CREATE TABLE IF NOT EXISTS `{$p}rd_items` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `feed_id` INT UNSIGNED NOT NULL,
            `guid_hash` CHAR(40) CHARACTER SET ascii NOT NULL,
            `title` VARCHAR(400) NOT NULL DEFAULT '',
            `author` VARCHAR(300) NOT NULL DEFAULT '',
            `link` VARCHAR(2048) NOT NULL DEFAULT '',
            `summary` VARCHAR(500) NOT NULL DEFAULT '',
            `content` MEDIUMTEXT NULL,
            `words` INT UNSIGNED NOT NULL DEFAULT 0,
            `image` VARCHAR(2048) NOT NULL DEFAULT '',
            `pub_at` DATETIME NOT NULL,
            `created_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_guid` (`feed_id`, `guid_hash`),
            KEY `ix_feed` (`feed_id`, `pub_at`),
            KEY `ix_pub` (`pub_at`),
            CONSTRAINT `fk_{$p}rdi_feed` FOREIGN KEY (`feed_id`) REFERENCES `{$p}rd_feeds` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}rd_subs` (
            `user_id` INT UNSIGNED NOT NULL,
            `feed_id` INT UNSIGNED NOT NULL,
            `title` VARCHAR(300) NOT NULL DEFAULT '',
            `folder` VARCHAR(80) NOT NULL DEFAULT '',
            `read_before` DATETIME NOT NULL,
            `added_at` DATETIME NOT NULL,
            PRIMARY KEY (`user_id`, `feed_id`),
            KEY `ix_feed` (`feed_id`),
            CONSTRAINT `fk_{$p}rds_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}rds_feed` FOREIGN KEY (`feed_id`) REFERENCES `{$p}rd_feeds` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}rd_states` (
            `user_id` INT UNSIGNED NOT NULL,
            `item_id` INT UNSIGNED NOT NULL,
            `is_read` TINYINT(1) NOT NULL DEFAULT 1,
            `updated_at` DATETIME NOT NULL,
            PRIMARY KEY (`user_id`, `item_id`),
            KEY `ix_item` (`item_id`),
            CONSTRAINT `fk_{$p}rdst_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE,
            CONSTRAINT `fk_{$p}rdst_item` FOREIGN KEY (`item_id`) REFERENCES `{$p}rd_items` (`id`) ON DELETE CASCADE
        ) $e",
    ];
}

function install_rd_schema(PDO $pdo, string $prefix): void
{
    foreach (rd_schema_statements($prefix) as $sql) $pdo->exec($sql);
    // the key that signs the addresses of the pictures (api/?r=img): only pictures the app itself named can be fetched
    $pdo->prepare("INSERT IGNORE INTO `{$prefix}meta` (k, v) VALUES ('rd_img_key', ?)")->execute([bin2hex(random_bytes(32))]);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('rd_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)RD_SCHEMA_VERSION]);
}

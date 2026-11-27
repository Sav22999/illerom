<?php
/**
 * SavMail — its tables, next to the ones of SavSchedules (same prefix, "sch_ml_…"): the accounts are the users of
 * SavSchedules. Every statement is idempotent: the API creates the tables by itself the first time it answers.
 *
 * Nothing here can be read without a key that the server does not keep (see lib/vault.php):
 *   ml_vaults    one per account: the mailboxes (servers, user names, passwords or tokens, signatures), encrypted as one
 *                block with the key of the account (XChaCha20-Poly1305). No address, no server name is ever in clear.
 *   ml_keys      the key of the account, locked once for every way of opening it: a device (its secret lives only in a
 *                cookie of that browser), the password of a mailbox (Argon2id) or a recovery code (Argon2id).
 *   ml_profiles  the look of the app (theme, density…): nothing personal.
 *   ml_oauth     a sign-in with Microsoft in progress (a few minutes at most): state and PKCE verifier, nothing else.
 * Messages are never kept: they stay on the mail server and pass through the API only while they are shown or sent.
 */

declare(strict_types=1);

function ml_schema_statements(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}ml_vaults` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `data` MEDIUMTEXT NOT NULL,
            `version` INT UNSIGNED NOT NULL DEFAULT 1,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}mlv_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}ml_keys` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `kind` VARCHAR(10) CHARACTER SET ascii NOT NULL,
            `kid` VARCHAR(32) CHARACTER SET ascii NOT NULL,
            `wrap` VARCHAR(255) CHARACTER SET ascii NOT NULL,
            `salt` VARCHAR(32) CHARACTER SET ascii NULL,
            `label` VARCHAR(80) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            `used_at` DATETIME NULL,
            UNIQUE KEY `uq_key` (`user_id`, `kind`, `kid`),
            CONSTRAINT `fk_{$p}mlk_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}ml_profiles` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `prefs` TEXT NULL,
            `created_at` DATETIME NOT NULL,
            CONSTRAINT `fk_{$p}mlp_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}ml_oauth` (
            `state` CHAR(43) CHARACTER SET ascii NOT NULL PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `verifier` CHAR(64) CHARACTER SET ascii NOT NULL,
            `account` VARCHAR(16) CHARACTER SET ascii NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            KEY `ix_created` (`created_at`),
            CONSTRAINT `fk_{$p}mlo_user` FOREIGN KEY (`user_id`) REFERENCES `{$p}users` (`id`) ON DELETE CASCADE
        ) $e",
    ];
}

function install_ml_schema(PDO $pdo, string $prefix): void
{
    foreach (ml_schema_statements($prefix) as $sql) $pdo->exec($sql);
    $pdo->prepare("INSERT INTO `{$prefix}meta` (k, v) VALUES ('ml_schema_version', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)")->execute([(string)ML_SCHEMA_VERSION]);
}

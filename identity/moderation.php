<?php
/**
 * Shared moderation for the SavOffice apps (Digital Services Act). Each app includes this file and gets, with the same code
 * everywhere: a table of reports of public content, an admin audit log, and helpers to act on a report and to block an
 * account. Blocking is suite-wide: it sets status = 'blocked' on the shared accounts table (../identity/suite.php), so a
 * blocked account cannot use any app.
 *
 * How an app wires it:
 *   - schema.php: merge moderation_schema($prefix) into its CREATE statements (two tables, <prefix>reports and <prefix>audit);
 *   - a PUBLIC endpoint (no account, rate-limited) that turns its own public token/link into the content it points to and
 *     calls mod_report(); the reports table is content-agnostic (content_kind + content_id + token + owner_id), so every app
 *     stores reports the same way and turns them back into its own content when a master reviews or acts on one;
 *   - MASTER endpoints that call mod_reports_list / mod_report_get / mod_report_seen / mod_report_resolve and, to act on the
 *     account behind a report, mod_block_account / mod_unblock_account; every such action is written to the audit log.
 *
 * It uses db(), t(), now_utc() and is_master() from the app's bootstrap, and t('users') from the suite: include it after
 * bootstrap. It never sends email itself (the texts live in each app's mail.php); the app sends the notice after acting.
 */

declare(strict_types=1);

// What a visitor can pick when reporting public content; the exact one is kept, the app's UI shows the labels.
const REPORT_REASONS = ['illegal', 'csam', 'copyright', 'malware', 'privacy', 'abuse', 'spam', 'phishing', 'other'];
// Why an account is blocked (suite-wide). Matches the block_reason column of the shared accounts table.
const MOD_BLOCK_REASONS = ['spam', 'phishing', 'abuse', 'illegal', 'copyright', 'csam', 'other'];

/** The two tables an app adds to its own schema (prefixed like the rest): reports of public content and the admin audit log. */
function moderation_schema(string $p): array
{
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    return [
        "CREATE TABLE IF NOT EXISTS `{$p}reports` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `content_kind` VARCHAR(20) NOT NULL,
            `content_id` INT UNSIGNED NULL,
            `token` CHAR(32) NULL,
            `owner_id` INT UNSIGNED NULL,
            `reason` VARCHAR(20) NOT NULL DEFAULT 'other',
            `note` VARCHAR(1000) NOT NULL DEFAULT '',
            `reporter_email` VARCHAR(190) NULL,
            `reporter_ip` VARCHAR(45) NULL,
            `status` ENUM('open','closed') NOT NULL DEFAULT 'open',
            `action` VARCHAR(60) NOT NULL DEFAULT '',
            `resolution` VARCHAR(1000) NOT NULL DEFAULT '',
            `resolved_by` INT UNSIGNED NULL,
            `resolved_at` DATETIME NULL,
            `seen_at` DATETIME NULL,
            `created_at` DATETIME NOT NULL,
            KEY `ix_status` (`status`, `created_at`),
            KEY `ix_token` (`token`),
            KEY `ix_owner` (`owner_id`)
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}audit` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `admin_id` INT UNSIGNED NULL,
            `action` VARCHAR(30) NOT NULL,
            `target` VARCHAR(190) NOT NULL DEFAULT '',
            `note` VARCHAR(500) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            KEY `ix_time` (`created_at`)
        ) $e",
    ];
}

/** Write a line to the admin audit log. $admin is the master's account row (id used). */
function mod_audit(array $admin, string $action, string $target = '', string $note = ''): void
{
    db()->prepare('INSERT INTO ' . t('audit') . ' (admin_id, action, target, note, created_at) VALUES (?,?,?,?,?)')
        ->execute([$admin['id'] ?? null, $action, mb_substr($target, 0, 190), mb_substr($note, 0, 500), now_utc()]);
}

/**
 * Record a report of public content. $content: ['kind' => string, 'id' => int|null, 'token' => string|null,
 * 'owner_id' => int|null]. Returns the new report id.
 */
function mod_report(array $content, string $reason, string $note = '', ?string $email = null, ?string $ip = null): int
{
    $reason = in_array($reason, REPORT_REASONS, true) ? $reason : 'other';
    db()->prepare('INSERT INTO ' . t('reports') . ' (content_kind, content_id, token, owner_id, reason, note, reporter_email, reporter_ip, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,\'open\',?)')
        ->execute([(string)($content['kind'] ?? ''), $content['id'] ?? null, $content['token'] ?? null, $content['owner_id'] ?? null,
            $reason, mb_substr($note, 0, 1000), ($email !== null && $email !== '') ? $email : null, $ip, now_utc()]);
    return (int)db()->lastInsertId();
}

function mod_report_get(int $id): ?array
{
    try {
        $st = db()->prepare('SELECT * FROM ' . t('reports') . ' WHERE id = ?');
        $st->execute([$id]);
        return $st->fetch() ?: null;
    } catch (Throwable $e) { // the moderation tables may not be installed on this host
        return null;
    }
}

/** Note that a master looked at the content of a reported item (the privacy notices promise this is logged). */
function mod_report_seen(int $id): void
{
    db()->prepare('UPDATE ' . t('reports') . ' SET seen_at = ? WHERE id = ?')->execute([now_utc(), $id]);
}

/** How many reports are waiting for review (for the admin badge and the overview). 0 if the table is not installed. */
function mod_open_count(): int
{
    try {
        return (int)db()->query('SELECT COUNT(*) FROM ' . t('reports') . " WHERE status = 'open'")->fetchColumn();
    } catch (Throwable $e) {
        return 0;
    }
}

/** The reports to review (open | resolved | all), newest first, as raw rows. Empty if the table is not installed. */
function mod_reports(string $show = 'open', int $limit = 500): array
{
    $where = $show === 'open' ? "WHERE status = 'open'" : ($show === 'resolved' ? "WHERE status <> 'open'" : '');
    try {
        return db()->query('SELECT * FROM ' . t('reports') . ' ' . $where . " ORDER BY status = 'open' DESC, created_at DESC LIMIT " . (int)$limit)->fetchAll();
    } catch (Throwable $e) {
        return [];
    }
}

/** Close a report with the decision taken. $action is a short machine summary of what was done; $resolution the reason. */
function mod_report_resolve(array $admin, int $id, string $action, string $resolution = ''): void
{
    db()->prepare('UPDATE ' . t('reports') . " SET status = 'closed', action = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?")
        ->execute([mb_substr($action, 0, 60), mb_substr($resolution, 0, 1000), $admin['id'] ?? null, now_utc(), $id]);
    mod_audit($admin, 'report_close', 'report #' . $id, $action . ($resolution !== '' ? ': ' . $resolution : ''));
}

/**
 * Block an account across the whole suite (the shared accounts table). Signs it out everywhere and audits it. Returns false
 * for a master or a missing account (never block a master). The app sends the notice email after, if the account wants one.
 */
function mod_block_account(array $admin, array $row, string $reason, string $note = ''): bool
{
    if (!$row || is_master($row)) return false;
    $reason = in_array($reason, MOD_BLOCK_REASONS, true) ? $reason : 'other';
    db()->prepare('UPDATE ' . t('users') . " SET status = 'blocked', block_reason = ?, block_note = ?, blocked_at = ? WHERE id = ?")
        ->execute([$reason, mb_substr($note, 0, 500), now_utc(), $row['id']]);
    db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$row['id']]);
    mod_audit($admin, 'block', (string)($row['email'] ?? ('user #' . $row['id'])), $reason . ($note !== '' ? ': ' . $note : ''));
    return true;
}

function mod_unblock_account(array $admin, array $row): bool
{
    if (!$row) return false;
    db()->prepare('UPDATE ' . t('users') . " SET status = 'active', block_reason = '', block_note = '', blocked_at = NULL WHERE id = ?")->execute([$row['id']]);
    mod_audit($admin, 'unblock', (string)($row['email'] ?? ('user #' . $row['id'])));
    return true;
}

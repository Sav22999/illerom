<?php
/**
 * SavDrive — temporary links ("File temporaneo"): files sent to somebody for a while, as with WeTransfer.
 *
 * A link (temp_links) gives one or more items (temp_items):
 *   mode "upload"  files uploaded only for the link (upload.start with temp: the link id). They live on disk next to the
 *                  other files of the account (<storage>/<user id>/<bkey>), are not nodes (nothing of the drive shows
 *                  them), count in the space while the link lasts and are deleted for real when it ends.
 *   mode "drive"   files and folders already in the drive (node_id). When the link ends only the link goes; the files stay.
 * A link ends when it expires (expires_at), when the downloads reach max_downloads, or when its owner revokes it. Ended
 * links are cleaned up when they are reached (lazy: the public page, the list of the owner, the space) and by
 * cron/cleanup.php; until then they already answer "gone". Options: a password (password_hash; the page sends the
 * password once and gets a key, an HMAC of the token with the hash, that the download addresses carry), a limit of
 * downloads, an email to the owner at each download (at most one a minute), a message for who receives it.
 * The public page is #/t/<token> (api: tmp.info, tmp.unlock, tmp.get, tmp.zip), without an account.
 */

declare(strict_types=1);

const TEMP_MAX_DAYS = 365;      // the furthest expiry a link can have
const TEMP_MAX_ITEMS = 500;     // files (or files and folders of the drive) of one link
const TEMP_MAX_LINKS = 200;     // active links of one account
const TEMP_MESSAGE_MAX = 1000;  // characters of the message
const TEMP_PRESETS = ['1h' => 3600, '1d' => 86400, '7d' => 7 * 86400, '30d' => 30 * 86400];

/** The expiry asked by the app: a preset (1h, 1d, 7d, 30d) or a date and time (ISO 8601, in the future). UTC. */
function temp_expiry($preset, $at): string
{
    if (is_string($preset) && isset(TEMP_PRESETS[$preset])) return gmdate('Y-m-d H:i:s', time() + TEMP_PRESETS[$preset]);
    $ts = is_string($at) && $at !== '' ? strtotime($at) : false;
    if ($ts === false || $ts <= time() + 60) fail('temp_expiry', 422);
    if ($ts > time() + TEMP_MAX_DAYS * 86400) fail('temp_expiry_far', 422);
    return gmdate('Y-m-d H:i:s', $ts);
}

function new_temp_token(): string
{
    return bin2hex(random_bytes(16));
}

/** A link that is over: expired, or without downloads left (it is ended when it is reached). */
function temp_over(array $l): bool
{
    return strtotime($l['expires_at'] . ' UTC') <= time() || ($l['max_downloads'] !== null && (int)$l['downloads'] >= (int)$l['max_downloads']);
}

/** The link of a token, with the state of its owner; null when there is none (or the owner cannot use SavDrive). */
function temp_by_token(string $tok): ?array
{
    if (!preg_match('/^[a-f0-9]{32}$/', $tok)) return null;
    $st = db()->prepare('SELECT l.*, u.name owner, u.email owner_email, u.ui_lang owner_lang, u.status ustatus, u.activated FROM ' . t('temp_links') . ' l JOIN ' . t('users') . ' u ON u.id = l.user_id WHERE l.token = ?');
    $st->execute([$tok]);
    $l = $st->fetch();
    if (!$l || $l['ustatus'] !== 'active' || !(int)$l['activated']) return null;
    return $l;
}

/** A link of this account (by id), or "not found". */
function own_temp(array $u, $id): array
{
    $st = db()->prepare('SELECT * FROM ' . t('temp_links') . ' WHERE id = ? AND user_id = ?');
    $st->execute([(int)$id, $u['id']]);
    $l = $st->fetch();
    if (!$l) fail('not_found', 404);
    return $l;
}

/**
 * What a link gives now: [{id, name, kind, size, mime, files, node?, bkey?}]. Files and folders of the drive in the
 * trash are left out (they come back if they are restored while the link lasts); a folder counts what is inside it.
 */
function temp_items(array $l): array
{
    $st = db()->prepare('SELECT i.id, i.name iname, i.mime imime, i.size isize, i.bkey, i.node_id, n.uid, n.kind, n.name nname, n.mime nmime, n.size nsize, n.bkey nbkey, n.trashed_at, n.updated_at
        FROM ' . t('temp_items') . ' i LEFT JOIN ' . t('nodes') . ' n ON n.id = i.node_id WHERE i.link_id = ? ORDER BY i.id');
    $st->execute([$l['id']]);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        if ($r['node_id'] === null) {
            $out[] = ['id' => (int)$r['id'], 'name' => $r['iname'], 'kind' => 'file', 'size' => (int)$r['isize'], 'mime' => $r['imime'], 'files' => 1, 'bkey' => $r['bkey']];
            continue;
        }
        if ($r['uid'] === null || $r['trashed_at'] !== null) continue;
        $x = ['id' => (int)$r['id'], 'name' => $r['nname'], 'kind' => $r['kind'], 'size' => (int)$r['nsize'], 'mime' => $r['nmime'], 'files' => 1, 'node' => (int)$r['node_id'], 'bkey' => $r['nbkey'], 'time' => $r['updated_at']];
        if ($r['kind'] === 'folder') {
            $ids = implode(',', subtree_ids((int)$l['user_id'], (int)$r['node_id']));
            $s = db()->prepare('SELECT COUNT(*) c, COALESCE(SUM(size),0) b FROM ' . t('nodes') . " WHERE user_id = ? AND id IN ($ids) AND kind = 'file' AND trashed_at IS NULL");
            $s->execute([$l['user_id']]);
            $c = $s->fetch();
            $x['files'] = (int)$c['c'];
            $x['size'] = (int)$c['b'];
        }
        $out[] = $x;
    }
    return $out;
}

/** The files of a ZIP of these items (lib/zipstream.php): the folders with what they contain, under their name. */
function temp_entries(array $l, array $items): array
{
    $owner = (int)$l['user_id'];
    $entries = [];
    foreach ($items as $it) {
        if ($it['kind'] === 'file') {
            if ($it['bkey']) $entries[] = ['name' => $it['name'], 'path' => blob_path($owner, (string)$it['bkey']), 'size' => $it['size'], 'time' => $it['time'] ?? $l['created_at']];
            continue;
        }
        $ids = implode(',', subtree_ids($owner, $it['node']));
        $st = db()->prepare('SELECT id, parent_id, kind, name, size, bkey, updated_at FROM ' . t('nodes') . " WHERE user_id = ? AND id IN ($ids) AND trashed_at IS NULL");
        $st->execute([$owner]);
        $rows = [];
        foreach ($st->fetchAll() as $n) $rows[(int)$n['id']] = $n;
        foreach ($rows as $n) {
            if ($n['kind'] !== 'file' || !$n['bkey']) continue;
            $parts = [$n['name']];
            for ($p = (int)$n['parent_id'], $i = 0; $p && isset($rows[$p]) && $i <= MAX_DEPTH; $p = (int)$rows[$p]['parent_id'], $i++) array_unshift($parts, $rows[$p]['name']);
            $entries[] = ['name' => implode('/', $parts), 'path' => blob_path($owner, (string)$n['bkey']), 'size' => (int)$n['size'], 'time' => $n['updated_at']];
        }
    }
    usort($entries, fn($a, $b) => strcmp($a['name'], $b['name']));
    return $entries;
}

/** The name of a link for people: its only item, or "first and N more". */
function temp_title(array $items): string
{
    if (!$items) return '';
    return count($items) === 1 ? (string)$items[0]['name'] : $items[0]['name'] . ' +' . (count($items) - 1);
}

/** Ends a link: the files uploaded for it are deleted from the disk; the files of the drive stay. */
function temp_delete(array $l): void
{
    $uid = (int)$l['user_id'];
    $st = db()->prepare('SELECT bkey FROM ' . t('temp_items') . ' WHERE link_id = ? AND bkey IS NOT NULL');
    $st->execute([$l['id']]);
    $keys = $st->fetchAll(PDO::FETCH_COLUMN);
    // uploads still under way for it
    $st = db()->prepare('SELECT id FROM ' . t('uploads') . ' WHERE temp_id = ?');
    $st->execute([$l['id']]);
    $parts = $st->fetchAll(PDO::FETCH_COLUMN);
    db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE temp_id = ?')->execute([$l['id']]);
    db()->prepare('DELETE FROM ' . t('temp_links') . ' WHERE id = ?')->execute([$l['id']]); // its items go with it (foreign key)
    foreach ($keys as $k) if (preg_match('/^[a-f0-9]{32}$/', (string)$k)) @unlink(blob_path($uid, (string)$k));
    foreach ($parts as $p) if (preg_match('/^[a-f0-9]{32}$/', (string)$p)) @unlink(storage_dir($uid) . "/$p.part");
}

/**
 * Ends the links that are over: expired, out of downloads, uploads never finished (UPLOAD_HOURS), or (mode drive) with
 * nothing left of the drive. $uid: only those of one account (lazy, when its space or its list is read).
 */
function temp_purge(?int $uid = null, int $limit = 50): int
{
    $T = t('temp_links');
    $where = "(l.expires_at < ? OR (l.max_downloads IS NOT NULL AND l.downloads >= l.max_downloads) OR (l.ready = 0 AND l.created_at < ?)
        OR (l.ready = 1 AND NOT EXISTS (SELECT 1 FROM " . t('temp_items') . ' i WHERE i.link_id = l.id)))';
    $st = db()->prepare("SELECT l.* FROM $T l WHERE $where" . ($uid ? ' AND l.user_id = ' . (int)$uid : '') . ' LIMIT ' . (int)$limit);
    $st->execute([now_utc(), gmdate('Y-m-d H:i:s', time() - UPLOAD_HOURS * 3600)]);
    $n = 0;
    foreach ($st->fetchAll() as $l) { temp_delete($l); $n++; }
    return $n;
}

/** The key the download addresses of a link with a password carry (it changes if the password changes). */
function temp_key(array $l): string
{
    return $l['pass_hash'] ? substr(hash_hmac('sha256', 'temp|' . $l['token'], (string)$l['pass_hash']), 0, 40) : '';
}

function temp_unlocked(array $l, string $key): bool
{
    return !$l['pass_hash'] || hash_equals(temp_key($l), $key);
}

/**
 * Counts one download (only the start of one: the next pieces of a resumed download or of a video are free). False when
 * the link has no downloads left. The owner gets an email when they asked for it (at most one a minute); the last
 * download allowed ends the link once it is sent.
 */
function temp_count(array $l): bool
{
    $range = (string)($_SERVER['HTTP_RANGE'] ?? '');
    if ($range !== '' && !preg_match('/^bytes=0-/', $range)) return true;
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') return true;
    $st = db()->prepare('UPDATE ' . t('temp_links') . ' SET downloads = downloads + 1, last_download_at = ? WHERE id = ? AND (max_downloads IS NULL OR downloads < max_downloads)');
    $st->execute([now_utc(), $l['id']]);
    if (!$st->rowCount()) return false;
    $done = (int)$l['downloads'] + 1;
    if ((int)$l['notify'] && (!$l['notified_at'] || strtotime($l['notified_at'] . ' UTC') < time() - 60)) {
        db()->prepare('UPDATE ' . t('temp_links') . ' SET notified_at = ? WHERE id = ?')->execute([now_utc(), $l['id']]);
        $lang = in_array($l['owner_lang'] ?? '', LANGS, true) ? $l['owner_lang'] : 'en';
        $T = mail_t($lang);
        $name = temp_title(temp_items($l));
        $count = $l['max_downloads'] !== null ? fill($T['temp_count_of'], ['n' => $done, 'max' => (int)$l['max_downloads']]) : fill($T['temp_count'], ['n' => $done]);
        send_notice((string)$l['owner_email'], (string)$l['owner'], $lang, fill($T['temp_subject'], ['name' => $name]), $T['temp_title'],
            [$l['owner'] ? fill($T['hello'], ['name' => $l['owner']]) : $T['hello_plain'], fill($T['temp_body'], ['name' => $name, 'count' => $count])], app_url() . '#/temp', $T['temp_button']);
    }
    if ($l['max_downloads'] !== null && $done >= (int)$l['max_downloads']) {
        // the last one: the link ends after this answer (the file being sent is still open, so it arrives whole)
        $id = (int)$l['id'];
        register_shutdown_function(function () use ($id) {
            $st = db()->prepare('SELECT * FROM ' . t('temp_links') . ' WHERE id = ?');
            $st->execute([$id]);
            if ($row = $st->fetch()) temp_delete($row);
        });
    }
    return true;
}

/** A link for its owner (the list of "Temporary"). */
function temp_out(array $l): array
{
    $items = temp_items($l);
    return [
        'id' => (int)$l['id'],
        'token' => $l['token'],
        'mode' => $l['mode'],
        'title' => temp_title($items),
        'items' => array_map(fn($i) => ['name' => $i['name'], 'kind' => $i['kind'], 'size' => $i['size'], 'mime' => $i['mime']], $items),
        'size' => array_sum(array_column($items, 'size')),
        'files' => array_sum(array_column($items, 'files')),
        'message' => $l['message'],
        'password' => $l['pass_hash'] !== null,
        'maxDownloads' => $l['max_downloads'] === null ? null : (int)$l['max_downloads'],
        'downloads' => (int)$l['downloads'],
        'notify' => (bool)$l['notify'],
        'created' => iso($l['created_at']),
        'expires' => iso($l['expires_at']),
        'lastDownload' => iso($l['last_download_at']),
    ];
}

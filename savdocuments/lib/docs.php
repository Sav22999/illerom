<?php
/** SavDocuments — documents: who can open them, how changes are applied, versions. */

declare(strict_types=1);

require_once __DIR__ . '/clean.php';

function role_rank(string $r): int
{
    $i = array_search($r, ROLES, true);
    return $i === false ? -1 : (int)$i;
}

function doc_by_pid(string $pid, bool $lock = false): ?array
{
    if (!preg_match('/^[A-Za-z0-9]{20}$/', $pid)) return null;
    $st = db()->prepare('SELECT d.*, (SELECT status FROM ' . t('users') . ' o WHERE o.id = d.owner_id) AS owner_status FROM ' . t('documents') . ' d WHERE pid = ?' . ($lock ? ' FOR UPDATE' : ''));
    $st->execute([$pid]);
    $d = $st->fetch();
    return $d ?: null;
}

function new_pid(): string
{
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    $s = '';
    for ($i = 0; $i < 20; $i++) $s .= $abc[random_int(0, strlen($abc) - 1)];
    return $s;
}

/** Role of a person (null: not signed in) on a document, or null when it cannot open it. */
function doc_role(array $d, ?array $u): ?string
{
    if ($u && ($u['status'] !== 'active' || empty($u['email_verified_at']))) $u = null;
    if ($d['status'] !== 'active' || ($d['owner_status'] ?? 'active') !== 'active') return null;
    if ($u && (int)$d['owner_id'] === (int)$u['id']) return 'owner';
    if ($d['deleted_at']) return null;
    $role = null;
    if ($u) {
        $st = db()->prepare('SELECT role FROM ' . t('shares') . ' WHERE doc_id = ? AND user_id = ?');
        $st->execute([$d['id'], $u['id']]);
        $role = $st->fetchColumn() ?: null;
    }
    if ($d['visibility'] === 'link') {
        $link = $u ? (string)$d['link_role'] : 'viewer'; // commenting and editing need an account
        if ($role === null || role_rank($link) > role_rank($role)) $role = $link;
    }
    return $role;
}

/** The document and the role, or a 404 that does not say whether the document exists. */
function require_doc(?array $u, string $pid, string $min, bool $lock = false): array
{
    $d = doc_by_pid($pid, $lock);
    $role = $d ? doc_role($d, $u) : null;
    if (!$d || $role === null) {
        if ($d && $d['status'] !== 'active' && $u && (int)$d['owner_id'] === (int)$u['id']) fail('doc_suspended', 403);
        fail($u ? 'doc_not_found' : 'doc_signin', $u ? 404 : 401);
    }
    if (role_rank($role) < role_rank($min)) fail('forbidden', 403);
    return [$d, $role];
}

function doc_data(array $d): array
{
    $doc = json_decode((string)$d['doc'], true);
    return is_array($doc) && isset($doc['blocks']) ? $doc : clean_doc([]);
}

function out_meta(array $d, ?string $role, array $extra = []): array
{
    return array_merge(['id' => $d['pid'], 'title' => $d['title'], 'role' => $role, 'folder' => $d['folder_id'] !== null ? (int)$d['folder_id'] : null, 'rev' => (int)$d['rev'], 'words' => (int)$d['words'],
        'visibility' => $d['visibility'], 'linkRole' => $d['link_role'], 'deleted' => iso($d['deleted_at']), 'created' => iso($d['created_at']), 'updated' => iso($d['updated_at'])], $extra);
}

function clean_title($t): string
{
    $t = is_string($t) ? trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $t) ?? '') : '';
    return mb_substr($t, 0, 160);
}

function create_doc(int $uid, string $title, array $doc, ?int $folder): array
{
    $st = db()->prepare('SELECT COUNT(*) FROM ' . t('documents') . ' WHERE owner_id = ?');
    $st->execute([$uid]);
    if ((int)$st->fetchColumn() >= MAX_USER_DOCS) fail('too_many_docs', 422);
    $json = json_out($doc);
    if (strlen($json) > MAX_DOC_BYTES) fail('doc_too_big', 413);
    if ($folder !== null) own_folder($uid, $folder);
    $pid = new_pid();
    db()->prepare('INSERT INTO ' . t('documents') . ' (pid, owner_id, folder_id, title, doc, words, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$pid, $uid, $folder, $title, $json, doc_words($doc), now_utc(), now_utc(), $uid]);
    return doc_by_pid($pid);
}

function own_folder(int $uid, int $id): array
{
    $st = db()->prepare('SELECT * FROM ' . t('folders') . ' WHERE id = ? AND user_id = ?');
    $st->execute([$id, $uid]);
    $f = $st->fetch();
    if (!$f) fail('folder_not_found', 404);
    return $f;
}

/** Copies the images of a document to another one and returns the document with the new ids. */
function copy_images(array $doc, int $fromDoc, int $toDoc, int $owner): array
{
    $json = json_out($doc['blocks']);
    foreach (doc_images($doc) as $old) {
        $st = db()->prepare('SELECT mime, bytes FROM ' . t('images') . ' WHERE id = ? AND doc_id = ?');
        $st->execute([$old, $fromDoc]);
        $img = $st->fetch();
        if (!$img) continue;
        check_image_quota($owner, (int)$img['bytes']);
        $new = bin2hex(random_bytes(12));
        db()->prepare('INSERT INTO ' . t('images') . ' (id, doc_id, mime, bytes, data, created_at) SELECT ?, ?, mime, bytes, data, ? FROM ' . t('images') . ' WHERE id = ?')->execute([$new, $toDoc, now_utc(), $old]);
        $json = str_replace($old, $new, $json);
    }
    $doc['blocks'] = json_decode($json, true);
    return $doc;
}

function check_image_quota(int $owner, int $bytes): void
{
    $st = db()->prepare('SELECT COALESCE(SUM(i.bytes),0) FROM ' . t('images') . ' i JOIN ' . t('documents') . ' d ON d.id = i.doc_id WHERE d.owner_id = ?');
    $st->execute([$owner]);
    if ((int)$st->fetchColumn() + $bytes > MAX_USER_IMAGE_BYTES) fail('image_quota', 413);
}

/** Saves a real image (checked by its bytes, never by its name) and returns its id. */
function store_image(array $d, string $bin): string
{
    if ($bin === '' || strlen($bin) > MAX_IMAGE_BYTES) fail('image_too_big', 413);
    $info = @getimagesizefromstring($bin);
    $mimes = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_GIF => 'image/gif', IMAGETYPE_WEBP => 'image/webp'];
    if (!$info || !isset($mimes[$info[2]]) || $info[0] > 12000 || $info[1] > 12000) fail('image_invalid', 422);
    check_image_quota((int)$d['owner_id'], strlen($bin));
    $id = bin2hex(random_bytes(12));
    db()->prepare('INSERT INTO ' . t('images') . ' (id, doc_id, mime, bytes, data, created_at) VALUES (?,?,?,?,?,?)')->execute([$id, $d['id'], $mimes[$info[2]], strlen($bin), $bin, now_utc()]);
    return $id;
}

/**
 * Applies the changes of one browser to the document (already locked). Changes work on whole blocks:
 *   {t:'set', id, h, v}   new content; v = version it started from. If someone else changed the block meanwhile it is
 *                         refused and the current content goes back: the browser merges and tries again
 *   {t:'ins', id, after, h}, {t:'del', id}, {t:'mov', id, after}   after '' = at the beginning
 *   {t:'settings', s}, {t:'title', title}
 * Returns [applied operations, refused blocks].
 */
function apply_ops(array &$doc, string &$title, array $ops): array
{
    $pos = [];
    $reindex = function () use (&$doc, &$pos) {
        $pos = [];
        foreach ($doc['blocks'] as $i => $b) $pos[$b['id']] = $i;
    };
    $reindex();
    $done = [];
    $refused = [];
    foreach (array_slice($ops, 0, 5000) as $op) {
        if (!is_array($op)) continue;
        $type = $op['t'] ?? '';
        $id = $op['id'] ?? '';
        if (in_array($type, ['set', 'ins', 'del', 'mov'], true) && !valid_block_id($id)) continue;
        $after = isset($op['after']) && valid_block_id($op['after']) ? $op['after'] : '';
        if ($type === 'set') {
            $h = clean_block($op['h'] ?? '');
            if ($h === '') continue;
            if (!isset($pos[$id])) { // deleted by someone else while it was being written: it comes back
                $doc['blocks'][] = ['id' => $id, 'h' => $h, 'v' => 1];
                $pos[$id] = count($doc['blocks']) - 1;
                $done[] = ['t' => 'ins', 'id' => $id, 'after' => $doc['blocks'][max(0, count($doc['blocks']) - 2)]['id'], 'h' => $h, 'v' => 1];
                continue;
            }
            $b = &$doc['blocks'][$pos[$id]];
            if ((int)($op['v'] ?? 0) !== (int)$b['v']) {
                $refused[] = ['id' => $id, 'h' => $b['h'], 'v' => (int)$b['v']];
                unset($b);
                continue;
            }
            $b['h'] = $h;
            $b['v'] = (int)$b['v'] + 1;
            $done[] = ['t' => 'set', 'id' => $id, 'h' => $h, 'v' => $b['v']];
            unset($b);
        } elseif ($type === 'ins') {
            if (isset($pos[$id])) continue;
            $h = clean_block($op['h'] ?? '');
            if ($h === '') continue;
            $at = $after === '' ? 0 : (isset($pos[$after]) ? $pos[$after] + 1 : count($doc['blocks']));
            array_splice($doc['blocks'], $at, 0, [['id' => $id, 'h' => $h, 'v' => 1]]);
            $reindex();
            $done[] = ['t' => 'ins', 'id' => $id, 'after' => $at === 0 ? '' : $doc['blocks'][$at - 1]['id'], 'h' => $h, 'v' => 1];
        } elseif ($type === 'del') {
            if (!isset($pos[$id]) || count($doc['blocks']) < 2) continue;
            array_splice($doc['blocks'], $pos[$id], 1);
            $reindex();
            $done[] = ['t' => 'del', 'id' => $id];
        } elseif ($type === 'mov') {
            if (!isset($pos[$id]) || $after === $id) continue;
            $b = array_splice($doc['blocks'], $pos[$id], 1);
            $reindex();
            $at = $after === '' ? 0 : (isset($pos[$after]) ? $pos[$after] + 1 : count($doc['blocks']));
            array_splice($doc['blocks'], $at, 0, $b);
            $reindex();
            $done[] = ['t' => 'mov', 'id' => $id, 'after' => $at === 0 ? '' : $doc['blocks'][$at - 1]['id']];
        } elseif ($type === 'settings') {
            $doc['settings'] = clean_settings($op['s'] ?? []);
            $done[] = ['t' => 'settings', 's' => $doc['settings']];
        } elseif ($type === 'title') {
            $tt = clean_title($op['title'] ?? '');
            if ($tt === '') continue;
            $title = $tt;
            $done[] = ['t' => 'title', 'title' => $tt];
        }
    }
    return [$done, $refused];
}

/** Writes the changed document and its operations; returns the new revision. Call inside a transaction, document locked. */
function save_ops(array $d, array $doc, string $title, array $done, string $client, int $uid): int
{
    $json = json_out($doc);
    if (strlen($json) > MAX_DOC_BYTES) fail('doc_too_big', 413);
    $rev = (int)$d['rev'] + 1;
    db()->prepare('UPDATE ' . t('documents') . ' SET doc = ?, title = ?, rev = ?, words = ?, updated_at = ?, updated_by = ? WHERE id = ?')->execute([$json, $title, $rev, doc_words($doc), now_utc(), $uid, $d['id']]);
    db()->prepare('INSERT INTO ' . t('ops') . ' (doc_id, rev, client, ops, created_at) VALUES (?,?,?,?,?)')->execute([$d['id'], $rev, $client, json_out($done), now_utc()]);
    if ($rev % 50 === 0) db()->prepare('DELETE FROM ' . t('ops') . ' WHERE doc_id = ? AND rev < ?')->execute([$d['id'], $rev - KEEP_OPS]);
    return $rev;
}

/** Keeps a copy of the document as it is now. Automatic copies: at most one every 10 minutes. */
function keep_version(array $d, int $uid, string $name = ''): void
{
    if ($name === '') {
        $st = db()->prepare('SELECT MAX(created_at) FROM ' . t('versions') . ' WHERE doc_id = ?');
        $st->execute([$d['id']]);
        $last = $st->fetchColumn();
        if ($last && strtotime($last . ' UTC') > time() - 600) return;
    }
    db()->prepare('INSERT INTO ' . t('versions') . ' (doc_id, user_id, name, title, doc, words, created_at) VALUES (?,?,?,?,?,?,?)')->execute([$d['id'], $uid, $name, $d['title'], $d['doc'], $d['words'], now_utc()]);
    // the oldest automatic ones leave first
    $st = db()->prepare('SELECT id FROM ' . t('versions') . ' WHERE doc_id = ? ORDER BY (name <> \'\') DESC, id DESC LIMIT 1000 OFFSET ' . KEEP_VERSIONS);
    $st->execute([$d['id']]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) db()->prepare('DELETE FROM ' . t('versions') . ' WHERE id = ?')->execute([$id]);
}

/** Shares and invitations sent to an address become those of the account that confirms it. */
function claim_shares(array $u): void
{
    if (empty($u['email_verified_at'])) return;
    db()->prepare('UPDATE ' . t('shares') . ' SET user_id = ? WHERE email = ? AND user_id IS NULL')->execute([$u['id'], $u['email']]);
}

function names_of(array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) return [];
    $st = db()->prepare('SELECT id, name FROM ' . t('users') . ' WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
    $st->execute($ids);
    return array_column($st->fetchAll(), 'name', 'id');
}

// ---------------------------------------------------------------- free images (Openverse and Wikimedia Commons)

const WIKIMEDIA_RE = '#^https://(upload|thumb)\.wikimedia\.org/[A-Za-z0-9%/_.,()!~*\'+:-]+$#';

function http_get(string $url, int $maxBytes, int $timeout = 12): ?string
{
    if (!function_exists('curl_init')) return null;
    $buf = '';
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => 'DocumentEditor/1.0',
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$buf, $maxBytes) {
            $buf .= $chunk;
            return strlen($buf) > $maxBytes ? 0 : strlen($chunk);
        }]);
    $ok = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return $ok && $code === 200 ? $buf : null;
}

function search_images(string $q, int $page): array
{
    $out = [];
    $raw = http_get('https://api.openverse.org/v1/images/?' . http_build_query(['q' => $q, 'page' => $page, 'page_size' => 20, 'license_type' => 'commercial,modification', 'mature' => 'false']), 2000000);
    foreach (json_decode((string)$raw, true)['results'] ?? [] as $r) {
        if (!preg_match('/^[a-f0-9-]{36}$/', (string)($r['id'] ?? ''))) continue;
        $lic = strtolower((string)($r['license'] ?? ''));
        $out[] = ['src' => 'ov:' . $r['id'], 'thumb' => 'https://api.openverse.org/v1/images/' . $r['id'] . '/thumb/', 'title' => mb_substr((string)($r['title'] ?? ''), 0, 120), 'author' => mb_substr((string)($r['creator'] ?? ''), 0, 80),
            'license' => in_array($lic, ['cc0', 'pdm'], true) ? ($lic === 'cc0' ? 'CC0' : 'Public domain') : 'CC ' . strtoupper($lic) . ' ' . ($r['license_version'] ?? ''), 'page' => (string)($r['foreign_landing_url'] ?? ''), 'from' => 'Openverse'];
    }
    $raw = http_get('https://commons.wikimedia.org/w/api.php?' . http_build_query(['action' => 'query', 'format' => 'json', 'generator' => 'search', 'gsrsearch' => $q . ' filetype:bitmap', 'gsrnamespace' => 6, 'gsrlimit' => 12,
            'gsroffset' => ($page - 1) * 12, 'prop' => 'imageinfo', 'iiprop' => 'url|extmetadata', 'iiurlwidth' => 1600, 'iiextmetadatafilter' => 'LicenseShortName|Artist']), 2000000);
    foreach (json_decode((string)$raw, true)['query']['pages'] ?? [] as $p) {
        $i = $p['imageinfo'][0] ?? null;
        $url = strtok((string)($i['thumburl'] ?? ''), '?') ?: '';
        if (!$i || !preg_match(WIKIMEDIA_RE, $url)) continue;
        $lic = trim(strip_tags((string)($i['extmetadata']['LicenseShortName']['value'] ?? '')));
        if (!preg_match('/^(cc0|cc by(-sa)? |public domain)/i', $lic)) continue;
        $out[] = ['src' => 'wm:' . $url, 'thumb' => preg_replace('#/\d+px-#', '/330px-', $url), 'title' => mb_substr(preg_replace('/^File:|\.\w+$/', '', (string)$p['title']), 0, 120), 'author' => mb_substr(trim(html_entity_decode(strip_tags((string)($i['extmetadata']['Artist']['value'] ?? '')))), 0, 80),
            'license' => $lic, 'page' => (string)($i['descriptionurl'] ?? ''), 'from' => 'Wikimedia Commons'];
    }
    return $out;
}

function fetch_free_image(string $src): string
{
    if (preg_match('/^ov:([a-f0-9-]{36})$/', $src, $m)) $url = 'https://api.openverse.org/v1/images/' . $m[1] . '/thumb/?full_size=true';
    elseif (strpos($src, 'wm:') === 0 && preg_match(WIKIMEDIA_RE, substr($src, 3))) $url = substr($src, 3);
    else fail('image_invalid', 422);
    $bin = http_get($url, MAX_IMAGE_BYTES + 1, 20);
    if ($bin === null) fail('image_fetch', 502);
    return $bin;
}

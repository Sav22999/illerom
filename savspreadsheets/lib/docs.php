<?php
/** SavSpreadsheets — workbooks ("documents" in the database, as in SavDocuments): who can open them, saving, versions. How changes are applied: lib/clean.php. */

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
    return is_array($doc) && isset($doc['sheets']) ? $doc : clean_doc([]);
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
    db()->prepare('INSERT INTO ' . t('documents') . ' (pid, owner_id, folder_id, title, doc, preview, words, created_at, updated_at, updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
        ->execute([$pid, $uid, $folder, $title, $json, doc_preview($doc), doc_words($doc), now_utc(), now_utc(), $uid]);
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

/** Writes the changed document and its operations; returns the new revision. Call inside a transaction, document locked. */
function save_ops(array $d, array $doc, string $title, array $done, string $client, int $uid): int
{
    $json = json_out($doc);
    if (strlen($json) > MAX_DOC_BYTES) fail('doc_too_big', 413);
    $rev = (int)$d['rev'] + 1;
    db()->prepare('UPDATE ' . t('documents') . ' SET doc = ?, preview = ?, title = ?, rev = ?, words = ?, updated_at = ?, updated_by = ? WHERE id = ?')->execute([$json, doc_preview($doc), $title, $rev, doc_words($doc), now_utc(), $uid, $d['id']]);
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

// ---------------------------------------------------------------- what each person receives

/**
 * The workbook as a person may see it. The owner gets it whole. The others: no sheet that is hidden for them, and for
 * each sheet only what they can do on it ("my") and the protected ranges with "mine" (whether they may change them),
 * never the rules nor the emails in them.
 */
function doc_for(array $doc, string $role, ?array $u): array
{
    if ($role === 'owner') return $doc;
    $out = [];
    foreach ($doc['sheets'] as $s) {
        $sr = sheet_role($s, $role, $u);
        if ($sr === 'none') continue;
        $s['my'] = $sr;
        $s['protect'] = array_map(fn($x) => ['id' => $x['id'], 'r' => $x['r'], 'out' => !empty($x['out']), 'note' => $x['note'] ?? '', 'mine' => role_rank($sr) >= role_rank('editor') && !protect_binds($x, $u)], $s['protect'] ?? []);
        unset($s['perm']);
        $out[] = $s;
    }
    $doc['sheets'] = $out;
    return $doc;
}

/** The ids of the sheets that do not exist for a person. */
function hidden_sheets(array $doc, string $role, ?array $u): array
{
    if ($role === 'owner') return [];
    $out = [];
    foreach ($doc['sheets'] as $s) if (sheet_role($s, $role, $u) === 'none') $out[] = $s['id'];
    return $out;
}

/** Does any sheet have rules or protected ranges? (then the copies for the others are made on the fly) */
function has_rules(array $doc): bool
{
    foreach ($doc['sheets'] as $s) if ((array)($s['perm'] ?? []) || ($s['protect'] ?? [])) return true;
    return false;
}

/** The changes of the others, as this person may receive them. */
function ops_for(array $ops, array $doc, string $role, ?array $u): array
{
    if ($role === 'owner') return $ops;
    $hidden = array_flip(hidden_sheets($doc, $role, $u));
    $out = [];
    foreach ($ops as $o) {
        $sid = in_array($o['t'] ?? '', ['cells', 'shift'], true) ? ($o['s'] ?? '') : ($o['id'] ?? '');
        if ($sid !== '' && isset($hidden[$sid])) continue;
        // the rules changed: everybody reads the workbook again, with what they may now see and do
        if (($o['t'] ?? '') === 'sheet' && (isset($o['p']['perm']) || isset($o['p']['protect']))) { $out[] = ['t' => 'reload']; continue; }
        if (($o['t'] ?? '') === 'addsheet') { $one = doc_for(['settings' => [], 'sheets' => [$o['sheet']]], $role, $u)['sheets']; if (!$one) continue; $o['sheet'] = $one[0]; }
        $out[] = $o;
    }
    return $out;
}

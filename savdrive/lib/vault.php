<?php
/**
 * SavDrive — the Vault: a place of the drive where everything is encrypted in the browser (end to end).
 *
 * The server never sees a key, a name or a byte in clear: it keeps what the browser sends (assets/vault.js) and gives it
 * back. Nothing here can be previewed, searched, shared or opened in another app, and nothing appears in My drive,
 * Recent, the search or SavPhotos; the files count in the space like every other file.
 *
 *   vault_keys   one row per account: how the browser derives the key from the PIN (digits: 6 or 8, kdf, iterations,
 *                salt), the master key wrapped with that key (wrap_pass) and, if the person wanted it, with a recovery key
 *                (wrap_recovery); proof: the SHA-256 of a value only the master key gives (HKDF "auth"), asked for every
 *                change, so a stolen session alone cannot empty or lock the Vault
 *   vault_nodes  files and folders as a tree; meta: the name (and, for a file, its type, size and own key) encrypted
 *                with the master key; size: the bytes kept on disk (encrypted, a little more than the file); a file is
 *                kept as <storage>/<user id>/<bkey> like the others; bkey NULL: an upload still under way
 *
 * Routes (api/?r=vault.*): vault.state, vault.list, vault.get (GET: the encrypted bytes), vault.setup, vault.rekey,
 * vault.folder, vault.rename, vault.move, vault.delete, vault.upload (then upload.chunk, as every upload), vault.reset.
 * Every POST needs X-CSRF-Token and, once the Vault exists, X-Vault-Proof (except vault.reset, which asks for the
 * password of the account instead: it is the way out when the PIN is lost).
 *
 * A PIN of a few digits is easy to try out by whoever holds the database (offline, without limits): the Vault keeps what it
 * holds away from people who reach the files on disk, a backup or a session, and from the admins in the normal course of
 * things, but against the operator of the server only a long PIN (8 digits) and PBKDF2 slow the guessing down.
 */

declare(strict_types=1);

const VAULT_MAX_NODES = 20000;
const VAULT_META_MAX = 8000;       // characters of an encrypted name (base64)
const VAULT_WRAP_MAX = 400;        // characters of a wrapped key (base64)

/** Bytes the Vault of an account keeps on disk (they count in the space). */
function vault_bytes(int $uid): int
{
    try {
        $st = db()->prepare('SELECT COALESCE(SUM(size),0) FROM ' . t('vault_nodes') . " WHERE user_id = ? AND kind = 'file' AND bkey IS NOT NULL");
        $st->execute([$uid]);
        return (int)$st->fetchColumn();
    } catch (PDOException $e) {
        return 0; // before the tables of version 6
    }
}

function vault_keys(int $uid): ?array
{
    $st = db()->prepare('SELECT * FROM ' . t('vault_keys') . ' WHERE user_id = ?');
    $st->execute([$uid]);
    return $st->fetch() ?: null;
}

/** A value made in the browser: base64, at most $max characters. */
function vault_b64(array $b, string $key, int $max, bool $optional = false): ?string
{
    $v = $b[$key] ?? null;
    if ($optional && ($v === null || $v === '')) return null;
    if (!is_string($v) || $v === '' || strlen($v) > $max || !preg_match('#^[A-Za-z0-9+/]+={0,2}$#', $v)) fail('bad_request', 422);
    return $v;
}

/** The writes of an existing Vault need the proof (the browser has the master key, i.e. it was unlocked). */
function vault_proof(array $u): array
{
    $k = vault_keys((int)$u['id']);
    if (!$k) fail('vault_none', 409);
    $p = (string)($_SERVER['HTTP_X_VAULT_PROOF'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $p) || !hash_equals((string)$k['proof'], hash('sha256', $p))) fail('vault_locked', 403);
    return $k;
}

function vault_node(array $u, $uid, ?string $kind = null): array
{
    if (!is_string($uid) || !preg_match('/^[A-Za-z0-9]{16}$/', $uid)) fail('not_found', 404);
    $st = db()->prepare('SELECT * FROM ' . t('vault_nodes') . ' WHERE uid = ? AND user_id = ?');
    $st->execute([$uid, $u['id']]);
    $n = $st->fetch();
    if (!$n || ($kind && $n['kind'] !== $kind) || ($n['kind'] === 'file' && !$n['bkey'])) fail('not_found', 404);
    return $n;
}

/** A folder of the Vault, or null for its top. */
function vault_folder(array $u, $uid): ?array
{
    return $uid === null || $uid === '' ? null : vault_node($u, $uid, 'folder');
}

function vault_out(array $n, array $ids = []): array
{
    return ['id' => $n['uid'], 'kind' => $n['kind'], 'parent' => $n['parent_id'] ? ($ids[(int)$n['parent_id']] ?? null) : null, 'meta' => $n['meta'],
        'size' => (int)$n['size'], 'created' => iso($n['created_at']), 'updated' => iso($n['updated_at'])];
}

function vault_space(array $u): array
{
    $row = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE id = ?');
    $row->execute([$u['id']]);
    $row = $row->fetch() ?: $u;
    return ['used' => user_used((int)$u['id']), 'quota' => user_quota($row), 'unlimited' => is_unlimited(user_quota($row)), 'parts' => (object)space_parts((int)$u['id']), 'vault' => vault_bytes((int)$u['id'])];
}

/** The ids of a folder and of everything inside it. */
function vault_subtree(int $uid, int $id): array
{
    $all = [$id];
    $level = [$id];
    for ($d = 0; $level && $d <= MAX_DEPTH + 1; $d++) {
        $st = db()->prepare('SELECT id FROM ' . t('vault_nodes') . ' WHERE user_id = ? AND parent_id IN (' . implode(',', $level) . ')');
        $st->execute([$uid]);
        $level = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        $all = array_merge($all, $level);
    }
    return array_values(array_unique($all));
}

function vault_depth(int $uid, ?int $id): int
{
    $d = 0;
    while ($id && $d <= MAX_DEPTH + 1) {
        $st = db()->prepare('SELECT parent_id FROM ' . t('vault_nodes') . ' WHERE id = ? AND user_id = ?');
        $st->execute([$id, $uid]);
        $p = $st->fetchColumn();
        $id = $p ? (int)$p : null;
        $d++;
    }
    return $d;
}

/** Deletes rows (and what is inside the folders, by the foreign key) and their files on disk. */
function vault_delete_forever(int $uid, array $ids): void
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) return;
    $all = [];
    foreach ($ids as $id) $all = array_merge($all, vault_subtree($uid, $id));
    $in = implode(',', array_unique($all));
    $st = db()->prepare('SELECT bkey FROM ' . t('vault_nodes') . " WHERE user_id = ? AND id IN ($in) AND bkey IS NOT NULL");
    $st->execute([$uid]);
    $keys = $st->fetchAll(PDO::FETCH_COLUMN);
    db()->prepare('DELETE FROM ' . t('vault_nodes') . ' WHERE user_id = ? AND id IN (' . implode(',', $ids) . ')')->execute([$uid]);
    foreach ($keys as $k) @unlink(blob_path($uid, (string)$k));
}

/** The last piece of an upload of the Vault has arrived (called by upload.chunk, inside its transaction). */
function vault_upload_done(array $u, array $up, string $part): void
{
    $st = db()->prepare('SELECT * FROM ' . t('vault_nodes') . " WHERE id = ? AND user_id = ? AND kind = 'file' AND bkey IS NULL FOR UPDATE");
    $st->execute([$up['vault_id'], $u['id']]);
    $n = $st->fetch();
    if (!$n) {
        db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE id = ?')->execute([$up['id']]);
        db()->commit();
        @unlink($part);
        fail('upload_gone', 410);
    }
    $key = new_key();
    if (!@rename($part, blob_path((int)$u['id'], $key))) throw new RuntimeException('cannot store the file');
    db()->prepare('UPDATE ' . t('vault_nodes') . ' SET bkey = ?, size = ?, updated_at = ? WHERE id = ?')->execute([$key, $up['size'], now_utc(), $n['id']]);
    db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE id = ?')->execute([$up['id']]);
    db()->commit();
    $n = vault_node($u, (string)$n['uid']);
    $parent = null;
    if ($n['parent_id']) {
        $p = db()->prepare('SELECT uid FROM ' . t('vault_nodes') . ' WHERE id = ?');
        $p->execute([$n['parent_id']]);
        $parent = $p->fetchColumn() ?: null;
    }
    send_json(['ok' => true, 'done' => true, 'item' => ['parent' => $parent] + vault_out($n)] + vault_space($u));
}

function vault_route(string $r): void
{
    $T = t('vault_nodes');
    switch ($r) {

        case 'vault.state':
            // Whether the Vault exists and what the browser needs to unlock it (nothing of this opens it without the PIN)
            $u = reader();
            $k = vault_keys((int)$u['id']);
            $st = db()->prepare("SELECT COUNT(*) FROM $T WHERE user_id = ? AND (kind = 'folder' OR bkey IS NOT NULL)");
            $st->execute([$u['id']]);
            send_json(['ok' => true, 'setup' => (bool)$k, 'count' => (int)$st->fetchColumn(), 'chunk' => CHUNK_BYTES,
                'key' => $k ? ['kdf' => $k['kdf'], 'digits' => (int)$k['digits'], 'iterations' => (int)$k['iterations'], 'salt' => $k['salt'], 'wrapPass' => $k['wrap_pass'], 'wrapRecovery' => $k['wrap_recovery'], 'created' => iso($k['created_at']), 'updated' => iso($k['updated_at'])] : null] + vault_space($u));

        case 'vault.setup':
            // {kdf, digits, iterations, salt, wrapPass, wrapRecovery?, proof}: the first time; the browser made everything
            $u = writer();
            if (vault_keys((int)$u['id'])) fail('vault_exists', 409);
            $b = body();
            $kdf = (string)($b['kdf'] ?? '');
            $it = (int)($b['iterations'] ?? 0);
            $digits = (int)($b['digits'] ?? 0);
            if ($kdf !== 'pbkdf2-sha256' || $it < 100000 || $it > 10000000 || !in_array($digits, [6, 8], true)) fail('bad_request', 422);
            $proof = (string)($b['proof'] ?? '');
            if (!preg_match('/^[a-f0-9]{64}$/', $proof)) fail('bad_request', 422);
            db()->prepare('INSERT INTO ' . t('vault_keys') . ' (user_id, kdf, digits, iterations, salt, wrap_pass, wrap_recovery, proof, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([$u['id'], $kdf, $digits, $it, vault_b64($b, 'salt', 64), vault_b64($b, 'wrapPass', VAULT_WRAP_MAX), vault_b64($b, 'wrapRecovery', VAULT_WRAP_MAX, true), hash('sha256', $proof), now_utc(), now_utc()]);
            send_json(['ok' => true]);

        case 'vault.rekey':
            // A new PIN ({digits, iterations, salt, wrapPass}) and/or recovery key ({wrapRecovery}: a new one, or null =
            // none): the master key and the files stay the same
            $u = writer();
            vault_proof($u);
            $b = body();
            $set = [];
            $args = [];
            if (isset($b['wrapPass'])) {
                $it = (int)($b['iterations'] ?? 0);
                $digits = (int)($b['digits'] ?? 0);
                if ($it < 100000 || $it > 10000000 || !in_array($digits, [6, 8], true)) fail('bad_request', 422);
                array_push($set, 'digits = ?', 'iterations = ?', 'salt = ?', 'wrap_pass = ?');
                array_push($args, $digits, $it, vault_b64($b, 'salt', 64), vault_b64($b, 'wrapPass', VAULT_WRAP_MAX));
            }
            if (array_key_exists('wrapRecovery', $b)) {
                $set[] = 'wrap_recovery = ?';
                $args[] = vault_b64($b, 'wrapRecovery', VAULT_WRAP_MAX, true);
            }
            if (!$set) fail('bad_request', 422);
            $args[] = now_utc();
            $args[] = $u['id'];
            db()->prepare('UPDATE ' . t('vault_keys') . ' SET ' . implode(', ', $set) . ', updated_at = ? WHERE user_id = ?')->execute($args);
            send_json(['ok' => true]);

        case 'vault.reset':
            // The whole Vault, for ever (a lost PIN): the password of the account, when it has one
            $u = writer();
            $row = db()->prepare('SELECT password_hash FROM ' . t('users') . ' WHERE id = ?');
            $row->execute([$u['id']]);
            $hash = (string)$row->fetchColumn();
            if ($hash !== '' && !password_verify((string)(body()['password'] ?? ''), $hash)) fail('bad_password', 422);
            $st = db()->prepare("SELECT id FROM $T WHERE user_id = ? AND parent_id IS NULL");
            $st->execute([$u['id']]);
            vault_delete_forever((int)$u['id'], $st->fetchAll(PDO::FETCH_COLUMN));
            $st = db()->prepare('SELECT id FROM ' . t('uploads') . ' WHERE user_id = ? AND vault_id IS NOT NULL');
            $st->execute([$u['id']]);
            foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) @unlink(storage_dir((int)$u['id']) . "/$id.part");
            db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE user_id = ? AND vault_id IS NOT NULL')->execute([$u['id']]);
            db()->prepare('DELETE FROM ' . t('vault_keys') . ' WHERE user_id = ?')->execute([$u['id']]);
            send_json(['ok' => true] + vault_space($u));

        case 'vault.list':
            // Everything of the Vault at once: only the browser can read the names, so it builds the tree itself
            $u = reader();
            // uploads cancelled or left half-way (their row in uploads is gone): their places go too
            db()->prepare("DELETE n FROM $T n LEFT JOIN " . t('uploads') . " p ON p.vault_id = n.id WHERE n.user_id = ? AND n.kind = 'file' AND n.bkey IS NULL AND p.id IS NULL AND n.created_at < ?")
                ->execute([$u['id'], gmdate('Y-m-d H:i:s', time() - 120)]);
            $st = db()->prepare("SELECT * FROM $T WHERE user_id = ? AND (kind = 'folder' OR bkey IS NOT NULL) ORDER BY id");
            $st->execute([$u['id']]);
            $rows = $st->fetchAll();
            $ids = array_column($rows, 'uid', 'id');
            send_json(['ok' => true, 'items' => array_map(fn($n) => vault_out($n, $ids), $rows)] + vault_space($u));

        case 'vault.folder':
            // {parent, meta}
            $u = writer();
            vault_proof($u);
            $b = body();
            $parent = vault_folder($u, $b['parent'] ?? null);
            $meta = vault_b64($b, 'meta', VAULT_META_MAX);
            if (vault_depth((int)$u['id'], $parent ? (int)$parent['id'] : null) >= MAX_DEPTH) fail('too_deep', 422);
            $c = db()->prepare("SELECT COUNT(*) FROM $T WHERE user_id = ?");
            $c->execute([$u['id']]);
            if ((int)$c->fetchColumn() >= VAULT_MAX_NODES) fail('too_many', 422);
            $uid = new_uid();
            db()->prepare("INSERT INTO $T (uid, user_id, parent_id, kind, meta, created_at, updated_at) VALUES (?,?,?,'folder',?,?,?)")
                ->execute([$uid, $u['id'], $parent ? $parent['id'] : null, $meta, now_utc(), now_utc()]);
            send_json(['ok' => true, 'item' => ['parent' => $parent ? $parent['uid'] : null] + vault_out(vault_node($u, $uid))]);

        case 'vault.rename':
            // {id, meta}: the name is encrypted again in the browser
            $u = writer();
            vault_proof($u);
            $n = vault_node($u, body()['id'] ?? '');
            db()->prepare("UPDATE $T SET meta = ?, updated_at = ? WHERE id = ?")->execute([vault_b64(body(), 'meta', VAULT_META_MAX), now_utc(), $n['id']]);
            send_json(['ok' => true]);

        case 'vault.move':
            // {ids, to}: never into itself or a folder inside it
            $u = writer();
            vault_proof($u);
            $b = body();
            $to = vault_folder($u, $b['to'] ?? null);
            $ids = $b['ids'] ?? [];
            if (!is_array($ids) || !$ids || count($ids) > 500) fail('bad_request', 422);
            $nodes = array_map(fn($id) => vault_node($u, $id), array_values(array_unique(array_filter($ids, 'is_string'))));
            foreach ($nodes as $n) {
                if ($to && $n['kind'] === 'folder' && in_array((int)$to['id'], vault_subtree((int)$u['id'], (int)$n['id']), true)) fail('move_inside', 422);
            }
            $up = db()->prepare("UPDATE $T SET parent_id = ?, updated_at = ? WHERE id = ?");
            foreach ($nodes as $n) $up->execute([$to ? $to['id'] : null, now_utc(), $n['id']]);
            send_json(['ok' => true]);

        case 'vault.delete':
            // {ids}: at once and for ever (the Vault has no trash: nothing of it is ever seen outside it)
            $u = writer();
            vault_proof($u);
            $ids = body()['ids'] ?? [];
            if (!is_array($ids) || !$ids || count($ids) > 500) fail('bad_request', 422);
            $nodes = array_map(fn($id) => vault_node($u, $id), array_values(array_unique(array_filter($ids, 'is_string'))));
            vault_delete_forever((int)$u['id'], array_map(fn($n) => (int)$n['id'], $nodes));
            send_json(['ok' => true] + vault_space($u));

        case 'vault.upload':
            // {parent, meta, size}: the place of the file, then its encrypted pieces go to upload.chunk; the space is
            // checked before anything travels, as for every upload
            $u = writer();
            vault_proof($u);
            if (too_many_attempts('upload', 2000, 60)) fail('rate_limited', 429);
            record_attempt('upload');
            $b = body();
            $parent = vault_folder($u, $b['parent'] ?? null);
            $meta = vault_b64($b, 'meta', VAULT_META_MAX);
            $size = (int)($b['size'] ?? -1);
            if ($size < 16) fail('bad_request', 422); // every encrypted file has at least its tag
            $row = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE id = ?');
            $row->execute([$u['id']]);
            $quota = user_quota($row->fetch());
            if (user_used((int)$u['id'], true) + $size > $quota) send_json(['ok' => false, 'error' => 'quota', 'used' => user_used((int)$u['id']), 'quota' => $quota], 413);
            $c = db()->prepare("SELECT COUNT(*) FROM $T WHERE user_id = ?");
            $c->execute([$u['id']]);
            if ((int)$c->fetchColumn() >= VAULT_MAX_NODES) fail('too_many', 422);
            $uid = new_uid();
            db()->prepare("INSERT INTO $T (uid, user_id, parent_id, kind, meta, size, created_at, updated_at) VALUES (?,?,?,'file',?,?,?,?)")
                ->execute([$uid, $u['id'], $parent ? $parent['id'] : null, $meta, $size, now_utc(), now_utc()]);
            $vid = (int)db()->lastInsertId();
            $id = new_key();
            db()->prepare('INSERT INTO ' . t('uploads') . " (id, user_id, parent_id, name, mime, size, vault_id, created_at, expires_at) VALUES (?,?,NULL,'vault','application/octet-stream',?,?,?,?)")
                ->execute([$id, $u['id'], $size, $vid, now_utc(), gmdate('Y-m-d H:i:s', time() + UPLOAD_HOURS * 3600)]);
            if (@file_put_contents(storage_dir((int)$u['id']) . "/$id.part", '') === false) throw new RuntimeException('storage not writable');
            send_json(['ok' => true, 'upload' => $id, 'chunk' => CHUNK_BYTES]);

        case 'vault.get':
            // The encrypted bytes of a file (only its owner): the browser decrypts them
            $u = current_user();
            if (!$u || $u['status'] !== 'active' || !is_activated($u)) { http_response_code(404); exit; }
            only('GET');
            $n = vault_node($u, (string)($_GET['id'] ?? ''), 'file');
            stream_file(blob_path((int)$u['id'], (string)$n['bkey']), 'vault-' . $n['uid'] . '.bin', 'application/octet-stream', false);
    }
    fail('not_found', 404);
}

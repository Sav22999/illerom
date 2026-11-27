<?php
/**
 * SavDrive — who can do what with a file or folder of somebody else.
 *
 * The owner of a file or folder can do everything. Other people get a level (a row of `shares`, by email: also people
 * without an account yet), from the weakest:
 *   view     sees that it exists, cannot open it (nor see what a folder contains)
 *   read     opens and downloads it
 *   comment  read + comments
 *   write    comment + uploads, new folders and files, renames, new contents
 *   move     write + moves things inside the shared folder
 *   delete   move + puts things into the trash (of the owner)
 *   none     no access: excludes a person here (and below) from what they would get from a folder above
 *
 * A level given on a folder holds for everything inside it, at any depth, until a level for the same person on a folder
 * (or file) below changes it: the nearest one wins. So "A, B and C on folder 1, but not B on folder 1.1" is a row for B
 * with `none` on 1.1. Only the owner manages the levels. What people create inside a folder of somebody else belongs to
 * the owner of the folder (and counts in their space); `created_by` says who made it.
 */

declare(strict_types=1);

const LEVELS = ['view' => 1, 'read' => 2, 'comment' => 3, 'write' => 4, 'move' => 5, 'delete' => 6, 'owner' => 9];
const SHARE_ROLES = ['none', 'view', 'read', 'comment', 'write', 'move', 'delete'];

function level(?string $role): int
{
    return $role === null ? 0 : (LEVELS[$role] ?? 0);
}

/** The level of a person on a file or folder: 'owner', one of the levels, or null (no access, or only through other ways). */
function node_role(array $u, array $n): ?string
{
    if ((int)$n['user_id'] === (int)$u['id']) return 'owner';
    static $memo = [];
    $email = mb_strtolower((string)$u['email']);
    $key = $email . '|' . $n['id'];
    if (array_key_exists($key, $memo)) return $memo[$key];
    $cur = $n;
    for ($i = 0; $cur && $i <= MAX_DEPTH + 1; $i++) {
        $st = db()->prepare('SELECT role FROM ' . t('shares') . ' WHERE node_id = ? AND email = ?');
        $st->execute([$cur['id'], $email]);
        $role = $st->fetchColumn();
        if ($role !== false) return $memo[$key] = ($role === 'none' ? null : (string)$role);
        if ($cur['parent_id'] === null) break;
        $st = db()->prepare('SELECT * FROM ' . t('nodes') . ' WHERE id = ?');
        $st->execute([$cur['parent_id']]);
        $cur = $st->fetch() ?: null;
    }
    return $memo[$key] = null;
}

/**
 * The levels of a person in the whole tree of an owner: [node id => role], only where they have one. One pass from the
 * top: each node has its own row, or the level of its folder.
 */
function tree_roles(array $u, int $ownerId): array
{
    $email = mb_strtolower((string)$u['email']);
    $st = db()->prepare('SELECT s.node_id, s.role FROM ' . t('shares') . ' s JOIN ' . t('nodes') . ' n ON n.id = s.node_id WHERE s.email = ? AND n.user_id = ?');
    $st->execute([$email, $ownerId]);
    $own = array_column($st->fetchAll(), 'role', 'node_id');
    if (!$own) return [];
    $st = db()->prepare('SELECT id, parent_id FROM ' . t('nodes') . ' WHERE user_id = ? AND trashed_at IS NULL');
    $st->execute([$ownerId]);
    $kids = [];
    foreach ($st->fetchAll() as $r) $kids[(int)$r['parent_id']][] = (int)$r['id'];
    $out = [];
    $walk = function (int $id, ?string $inherited, int $depth) use (&$walk, &$kids, &$own, &$out): void {
        $role = array_key_exists($id, $own) ? $own[$id] : $inherited;
        if ($role !== null && $role !== 'none') $out[$id] = $role;
        if ($depth <= MAX_DEPTH) foreach ($kids[$id] ?? [] as $k) $walk($k, $role, $depth + 1);
    };
    foreach ($kids[0] ?? [] as $top) $walk($top, null, 0);
    return $out;
}

/** A file or folder the person can reach with at least $need ('view', 'read', … or 'owner'); otherwise "not found". */
function reach_node(array $u, $uid, string $need = 'read', ?string $kind = null): array
{
    $n = is_string($uid) ? node_by_uid($uid) : null;
    if (!$n || ($kind && $n['kind'] !== $kind)) fail('not_found', 404);
    $role = node_role($u, $n);
    if ($role === null) fail('not_found', 404);
    if (level($role) < level($need)) fail('forbidden', 403);
    if ($role !== 'owner' && !owner_active((int)$n['user_id'])) fail('not_found', 404);
    $n['role'] = $role;
    return $n;
}

/** The folder a request points to, with at least $need: null = My drive of the person (always theirs). */
function reach_folder(array $u, $uid, string $need = 'write'): ?array
{
    if ($uid === null || $uid === '' || $uid === 'root') return null;
    $f = reach_node($u, $uid, $need, 'folder');
    if ($f['trashed_at']) fail('in_trash', 409);
    return $f;
}

/** The owner of what is shared can still use SavDrive (a deactivated account shares nothing). */
function owner_active(int $ownerId): bool
{
    static $memo = [];
    if (!isset($memo[$ownerId])) {
        $st = db()->prepare('SELECT status, activated FROM ' . t('users') . ' WHERE id = ?');
        $st->execute([$ownerId]);
        $o = $st->fetch();
        $memo[$ownerId] = $o && $o['status'] === 'active' && (int)$o['activated'] === 1;
    }
    return $memo[$ownerId];
}

/** Names of accounts by id (for "shared by", "uploaded by", comments). */
function names_by_id(array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids))));
    if (!$ids) return [];
    return array_column(db()->query('SELECT id, name FROM ' . t('users') . ' WHERE id IN (' . implode(',', $ids) . ')')->fetchAll(), 'name', 'id');
}

/** How many people have a level of their own on each of these nodes (for the "shared" mark of the owner). */
function share_counts(array $nodeIds): array
{
    $nodeIds = array_values(array_unique(array_map('intval', $nodeIds)));
    if (!$nodeIds) return [];
    $st = db()->query('SELECT node_id, COUNT(*) c FROM ' . t('shares') . " WHERE role <> 'none' AND node_id IN (" . implode(',', $nodeIds) . ') GROUP BY node_id');
    return array_map('intval', array_column($st->fetchAll(), 'c', 'node_id'));
}

/**
 * The people of a file or folder, for its owner: those with a level of their own here, and those who get one from a
 * folder above (with the folder it comes from). [email => {email, name, role, here, from}]
 */
function node_people(array $n): array
{
    $chain = array_reverse(node_path($n)); // this node first, then up to My drive
    $out = [];
    foreach ($chain as $i => $c) {
        $st = db()->prepare('SELECT s.email, s.role, u.name FROM ' . t('shares') . ' s LEFT JOIN ' . t('users') . ' u ON u.email = s.email WHERE s.node_id = ? ORDER BY s.id');
        $st->execute([$c['id']]);
        foreach ($st->fetchAll() as $r) {
            if (isset($out[$r['email']])) continue; // a nearer level already decides
            $out[$r['email']] = ['email' => $r['email'], 'name' => $r['name'], 'role' => $r['role'], 'here' => $i === 0, 'from' => $i === 0 ? null : ['id' => $c['uid'], 'name' => $c['name']]];
        }
    }
    return array_values($out);
}

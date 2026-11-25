<?php
/**
 * SavPresentations — presentations: who can do what, the changes (ops) and how they are applied.
 *
 * Every edit is a small "op" and the server numbers them (decks.seq): everybody applies them in that order, so all the
 * copies end up the same. Ops: deck.set {p}, slide.add {s, pos, d}, slide.del {s}, slide.move {s, pos}, slide.set {s, p},
 * el.add {s, e, el}, el.set {s, e, p}, el.del {s, e}. Two people changing different fields of the same element both win;
 * on the same field the last one wins. The same rules are in assets/model.js.
 */

declare(strict_types=1);

require_once __DIR__ . '/clean.php';

const PRESENCE_SECONDS = 25;

function role_rank(string $role): int
{
    $i = array_search($role, ROLES, true);
    return $i === false ? -1 : $i;
}

function deck_by_uid(string $uid): ?array
{
    if (!preg_match('/^[A-Za-z0-9]{22}$/', $uid)) return null;
    $st = db()->prepare('SELECT d.*, u.status AS owner_status, u.name AS owner_name FROM ' . t('decks') . ' d JOIN ' . t('users') . ' u ON u.id = d.owner_id WHERE d.uid = ?');
    $st->execute([$uid]);
    return $st->fetch() ?: null;
}

/** The role of a person (or of an anonymous visitor: null) on a presentation; '' = none. */
function deck_role(array $d, ?array $u): string
{
    $role = '';
    if ($u) {
        if ((int)$d['owner_id'] === (int)$u['id']) return 'owner';
        $st = db()->prepare('SELECT role FROM ' . t('members') . ' WHERE deck_id = ? AND user_id = ?');
        $st->execute([$d['id'], $u['id']]);
        $role = (string)$st->fetchColumn();
    }
    if ($d['access'] === 'link') {
        // without an account one can only look: comments and changes always have a name
        $link = $u && !empty($u['email_verified_at']) ? (string)$d['link_role'] : 'viewer';
        if (role_rank($link) > role_rank($role)) $role = $link;
    }
    return $role;
}

/** The presentation and the role of who asks, or the right error. $u null = anonymous visitor. */
function require_deck(?array $u, string $uid, string $min = 'viewer'): array
{
    $d = deck_by_uid($uid);
    if (!$d) fail('deck_not_found', 404);
    $role = deck_role($d, $u);
    if ($role === '') fail($u ? 'deck_no_access' : 'deck_sign_in', $u ? 403 : 401);
    if ($d['status'] === 'suspended') fail('deck_suspended', 403);
    if ($d['owner_status'] !== 'active') fail('deck_suspended', 403);
    if ($d['status'] === 'trashed' && $role !== 'owner') fail('deck_not_found', 404);
    if (role_rank($role) < role_rank($min)) fail('forbidden', 403);
    if ($d['status'] === 'trashed' && role_rank($min) > 0) fail('deck_trashed', 409);
    return [$d, $role];
}

/** The order of a slide: a slide dropped between two others halves the distance, so it keeps 8 decimals (assets/model.js renumbers when they end). */
function slide_pos($v): ?float
{
    return is_numeric($v) && is_finite((float)$v) && abs((float)$v) < 100000 ? round((float)$v, 8) : null;
}

function new_uid(): string
{
    $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    $s = '';
    for ($i = 0; $i < 22; $i++) $s .= $abc[random_int(0, strlen($abc) - 1)];
    return $s;
}

function deck_slides(int $deckId): array
{
    $st = db()->prepare('SELECT sid, pos, data FROM ' . t('slides') . ' WHERE deck_id = ? ORDER BY pos, sid');
    $st->execute([$deckId]);
    $out = [];
    foreach ($st->fetchAll() as $s) $out[] = ['sid' => $s['sid'], 'pos' => (float)$s['pos'], 'd' => json_decode($s['data'])]; // objects stay objects
    return $out;
}

/** Creates a presentation from what the browser (or a copy) built: [{sid, pos, d}]. */
function create_deck(int $ownerId, string $title, array $meta, array $slides, ?int $folderId, bool $template = false): string
{
    $uid = new_uid();
    $own = !db_in_transaction();
    if ($own) db()->beginTransaction();
    db()->prepare('INSERT INTO ' . t('decks') . ' (uid, owner_id, folder_id, title, meta, is_template, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
        ->execute([$uid, $ownerId, $folderId, $title, json_out($meta), $template ? 1 : 0, now_utc(), now_utc()]);
    $id = (int)db()->lastInsertId();
    $st = db()->prepare('INSERT INTO ' . t('slides') . ' (deck_id, sid, pos, data) VALUES (?,?,?,?)');
    $seen = [];
    foreach ($slides as $i => $s) {
        $sid = (string)($s['sid'] ?? '');
        if (!valid_key($sid) || isset($seen[$sid]) || count($seen) >= MAX_SLIDES) continue;
        $seen[$sid] = true;
        $json = slide_json(clean_slide($s['d'] ?? []));
        if (strlen($json) > MAX_SLIDE_BYTES) fail('slide_too_big', 413);
        $st->execute([$id, $sid, $i + 1, $json]);
    }
    if ($own) db()->commit();
    return $uid;
}

/**
 * Applies the ops of one browser in order, numbers and stores them. Returns the new seq.
 * The row of the presentation is locked meanwhile, so two people saving at once wait for each other.
 */
function apply_ops(array $deck, array $u, string $client, array $ops): int
{
    $db = db();
    $db->beginTransaction();
    $st = $db->prepare('SELECT seq, meta, title FROM ' . t('decks') . ' WHERE id = ? FOR UPDATE');
    $st->execute([$deck['id']]);
    $row = $st->fetch();
    $seq = (int)$row['seq'];
    $meta = json_decode($row['meta'], true) ?: [];
    $title = $row['title'];
    $metaDirty = false;
    $slides = []; // loaded ones: sid => data or false (missing)
    $dirty = [];
    $load = $db->prepare('SELECT data FROM ' . t('slides') . ' WHERE deck_id = ? AND sid = ?');
    $get = function (string $sid) use (&$slides, $load, $deck) {
        if (!array_key_exists($sid, $slides)) {
            $load->execute([$deck['id'], $sid]);
            $raw = $load->fetchColumn();
            $slides[$sid] = $raw === false ? false : (json_decode((string)$raw, true) ?: ['els' => []]);
        }
        return $slides[$sid];
    };
    $log = [];
    foreach (array_slice($ops, 0, 500) as $op) {
        if (!is_array($op)) continue;
        $k = (string)($op['k'] ?? '');
        $sid = (string)($op['s'] ?? '');
        $eid = (string)($op['e'] ?? '');
        if ($k !== 'deck.set' && !valid_key($sid)) continue;
        if (strpos($k, 'el.') === 0 && !valid_key($eid)) continue;
        $clean = null;
        switch ($k) {
            case 'deck.set':
                $p = is_array($op['p'] ?? null) ? $op['p'] : [];
                $out = [];
                if (isset($p['title'])) {
                    $title = mb_substr(trim(clean_text($p['title'], 150)), 0, 150) ?: $title;
                    $out['title'] = $title;
                }
                foreach (['format', 'theme', 'opts'] as $key) {
                    if (!isset($p[$key]) || !is_array($p[$key])) continue;
                    // options are merged one by one, format and theme are replaced
                    $meta[$key] = $key === 'opts' ? array_merge((array)($meta['opts'] ?? []), $p[$key]) : $p[$key];
                    $c = clean_meta($meta);
                    $meta = json_decode(json_out($c), true);
                    $out[$key] = $c[$key];
                }
                if ($out) {
                    $metaDirty = true;
                    $clean = ['k' => $k, 'p' => $out];
                }
                break;
            case 'slide.add':
                $pos = slide_pos($op["pos"] ?? null);
                if ($pos === null) break;
                $cnt = $db->prepare('SELECT COUNT(*) FROM ' . t('slides') . ' WHERE deck_id = ?');
                $cnt->execute([$deck['id']]);
                if ((int)$cnt->fetchColumn() >= MAX_SLIDES) break;
                $d = clean_slide($op['d'] ?? []);
                $slides[$sid] = $d;
                $db->prepare('INSERT INTO ' . t('slides') . ' (deck_id, sid, pos, data) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE pos = VALUES(pos), data = VALUES(data)')->execute([$deck['id'], $sid, $pos, slide_json($d)]);
                unset($dirty[$sid]);
                $clean = ['k' => $k, 's' => $sid, 'pos' => $pos, 'd' => $d['els'] ? $d : ['els' => new stdClass()] + $d];
                break;
            case 'slide.del':
                $db->prepare('DELETE FROM ' . t('slides') . ' WHERE deck_id = ? AND sid = ?')->execute([$deck['id'], $sid]);
                $slides[$sid] = false;
                unset($dirty[$sid]);
                $clean = ['k' => $k, 's' => $sid];
                break;
            case 'slide.move':
                $pos = slide_pos($op["pos"] ?? null);
                if ($pos === null) break;
                $db->prepare('UPDATE ' . t('slides') . ' SET pos = ? WHERE deck_id = ? AND sid = ?')->execute([$pos, $deck['id'], $sid]);
                $clean = ['k' => $k, 's' => $sid, 'pos' => $pos];
                break;
            case 'slide.set':
                $d = $get($sid);
                $p = clean_fields($op['p'] ?? [], SLIDE_FIELDS);
                if ($d === false || !$p) break;
                $slides[$sid] = drop_nulls(array_merge($d, $p));
                $dirty[$sid] = true;
                $clean = ['k' => $k, 's' => $sid, 'p' => $p];
                break;
            case 'el.add':
                $d = $get($sid);
                $el = clean_element($op['el'] ?? []);
                if ($d === false || !$el || count($d['els']) >= 300) break;
                $slides[$sid]['els'][$eid] = $el;
                $dirty[$sid] = true;
                $clean = ['k' => $k, 's' => $sid, 'e' => $eid, 'el' => $el];
                break;
            case 'el.set':
                $d = $get($sid);
                $p = clean_fields($op['p'] ?? [], ELEMENT_FIELDS);
                unset($p['t']);
                foreach (['x', 'y', 'w', 'h'] as $must) if (array_key_exists($must, $p) && $p[$must] === null) unset($p[$must]);
                if ($d === false || !isset($d['els'][$eid]) || !$p) break;
                $slides[$sid]['els'][$eid] = drop_nulls(array_merge($d['els'][$eid], $p));
                $dirty[$sid] = true;
                $clean = ['k' => $k, 's' => $sid, 'e' => $eid, 'p' => $p];
                break;
            case 'el.del':
                $d = $get($sid);
                if ($d === false) break;
                unset($slides[$sid]['els'][$eid]);
                $dirty[$sid] = true;
                $clean = ['k' => $k, 's' => $sid, 'e' => $eid];
                break;
        }
        if ($clean) $log[] = $clean;
    }
    $up = $db->prepare('UPDATE ' . t('slides') . ' SET data = ? WHERE deck_id = ? AND sid = ?');
    foreach (array_keys($dirty) as $sid) {
        $sid = (string)$sid;
        if ($slides[$sid] === false) continue;
        $json = slide_json($slides[$sid]);
        if (strlen($json) > MAX_SLIDE_BYTES) fail('slide_too_big', 413);
        $up->execute([$json, $deck['id'], $sid]);
    }
    $ins = $db->prepare('INSERT INTO ' . t('ops') . ' (deck_id, seq, client, user_id, op, created_at) VALUES (?,?,?,?,?,?)');
    foreach ($log as $op) $ins->execute([$deck['id'], ++$seq, $client, $u['id'], json_out($op), now_utc()]);
    if ($log) $db->prepare('UPDATE ' . t('decks') . ' SET seq = ?, updated_at = ?, title = ?' . ($metaDirty ? ', meta = ?' : '') . ' WHERE id = ?')
        ->execute(array_merge([$seq, now_utc(), $title], $metaDirty ? [json_out(clean_meta($meta))] : [], [$deck['id']]));
    $db->commit();
    return $seq;
}

/** The ops after $since; null when some of them were already cleaned up (the browser reloads the presentation). */
function ops_since(int $deckId, int $since, int $seq): ?array
{
    if ($since >= $seq) return [];
    $st = db()->prepare('SELECT seq, client, op FROM ' . t('ops') . ' WHERE deck_id = ? AND seq > ? ORDER BY seq LIMIT 1000');
    $st->execute([$deckId, $since]);
    $rows = $st->fetchAll();
    if (!$rows || (int)$rows[0]['seq'] !== $since + 1) return null;
    return array_map(fn($r) => ['n' => (int)$r['seq'], 'c' => $r['client'], 'o' => json_decode($r['op'])], $rows);
}

function touch_presence(int $deckId, string $client, ?array $u, $state): void
{
    $s = is_array($state) ? ['s' => valid_key($state['s'] ?? '') ? $state['s'] : '', 'sel' => array_values(array_filter(array_slice((array)($state['sel'] ?? []), 0, 12), 'valid_key')), 'ed' => valid_key($state['ed'] ?? '') ? $state['ed'] : '',
        'x' => clean_num($state['x'] ?? null, -20000, 20000), 'y' => clean_num($state['y'] ?? null, -20000, 20000)] : [];
    db()->prepare('INSERT INTO ' . t('presence') . ' (deck_id, client, user_id, state, seen_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), state = VALUES(state), seen_at = VALUES(seen_at)')
        ->execute([$deckId, $client, $u['id'] ?? null, json_out($s ?: new stdClass()), now_utc()]);
}

function presence_list(int $deckId, string $client): array
{
    $st = db()->prepare('SELECT p.client, p.state, p.user_id, u.name FROM ' . t('presence') . ' p LEFT JOIN ' . t('users') . ' u ON u.id = p.user_id WHERE p.deck_id = ? AND p.client <> ? AND p.seen_at > ? ORDER BY p.seen_at DESC LIMIT 40');
    $st->execute([$deckId, $client, gmdate('Y-m-d H:i:s', time() - PRESENCE_SECONDS)]);
    return array_map(fn($r) => ['c' => $r['client'], 'u' => $r['user_id'] ? (int)$r['user_id'] : 0, 'name' => $r['name'] ?? '', 'color' => $r['user_id'] ? user_color((int)$r['user_id']) : '#8a93ab', 'st' => json_decode($r['state'])], $st->fetchAll());
}

/** A presentation in the lists (home, admin). */
function deck_card(array $d, string $role): array
{
    $meta = json_decode($d['meta'], true) ?: [];
    return ['uid' => $d['uid'], 'title' => $d['title'], 'role' => $role, 'owner' => $d['owner_name'] ?? '', 'folder' => isset($d['my_folder']) ? (int)$d['my_folder'] : null, 'access' => $d['access'], 'template' => (bool)$d['is_template'],
        'status' => $d['status'], 'updated' => iso($d['updated_at']), 'created' => iso($d['created_at']), 'trashed' => iso($d['trashed_at']), 'shared' => isset($d['members']) ? (int)$d['members'] : 0,
        'format' => $meta['format'] ?? null, 'theme' => $meta['theme'] ?? null, 'slides' => isset($d['n_slides']) ? (int)$d['n_slides'] : null,
        'first' => isset($d['first_slide']) ? json_decode((string)$d['first_slide']) : null];
}

/** Invitations sent to this address become memberships (called at sign-in, the address is confirmed). */
function accept_invites(array $u): void
{
    if (empty($u['email_verified_at'])) return;
    $st = db()->prepare('SELECT deck_id, role FROM ' . t('invites') . ' WHERE email = ?');
    $st->execute([mb_strtolower((string)$u['email'])]);
    foreach ($st->fetchAll() as $i) add_member((int)$i['deck_id'], (int)$u['id'], $i['role']);
    db()->prepare('DELETE FROM ' . t('invites') . ' WHERE email = ?')->execute([mb_strtolower((string)$u['email'])]);
}

/** Adds someone, never lowering the role they already have. */
function add_member(int $deckId, int $userId, string $role): void
{
    $st = db()->prepare('SELECT owner_id FROM ' . t('decks') . ' WHERE id = ?');
    $st->execute([$deckId]);
    if ((int)$st->fetchColumn() === $userId) return;
    $st = db()->prepare('SELECT role FROM ' . t('members') . ' WHERE deck_id = ? AND user_id = ?');
    $st->execute([$deckId, $userId]);
    $old = (string)$st->fetchColumn();
    if ($old !== '' && role_rank($old) >= role_rank($role)) return;
    db()->prepare('INSERT INTO ' . t('members') . ' (deck_id, user_id, role, created_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE role = VALUES(role)')->execute([$deckId, $userId, $role, now_utc()]);
}

<?php
/**
 * SavDiagrams — diagrams and what they may contain.
 *
 * A diagram is {title, settings, items}. settings: {bg, grid, gs, snap, view}. items is the list of what is drawn, in order
 * (the last one on top). Every item has an id (made by the browser) and a type t:
 *   node   a shape: k (rect | round | diamond | ellipse | para | cyl | doc | note | person | cloud | text), x y w h, text,
 *          f fill ('' = none), c border ('' = none), s border width, d dash ('' | dash | dot), tc colour of the text, fs size,
 *          ff (sans | serif | mono | hand), b bold, i italic, al (left | center | right), va (top | middle | bottom)
 *   edge   a connector: a and b are its two ends, each {n: id of a node, p: side (t | r | b | l, '' = the nearest)} or a
 *          free point {x, y}; r route (straight | elbow | curve), c colour, s width, d dash, sa / ea the heads at the start
 *          and at the end (none | arrow | open | diamond | circle | bar), text (its label), fs, tc
 * Both may have g (the id of their group) and lk (locked). The same list lives in assets/model.js (clean): keep them in
 * step. Coordinates are in units of the diagram, unlimited.
 *
 * Saving sends changes, not the whole diagram: put (items new or changed), del (ids), order (the ids in the new order,
 * only when it changed). Two tabs of the same account can both save: each item is the last version that arrived.
 */

declare(strict_types=1);

const DG_SHAPES = ['rect', 'round', 'diamond', 'ellipse', 'para', 'cyl', 'doc', 'note', 'person', 'cloud', 'text'];
const DG_ROUTES = ['straight', 'elbow', 'curve'];
const DG_HEADS = ['none', 'arrow', 'open', 'diamond', 'circle', 'bar'];
const DG_SIDES = ['', 't', 'r', 'b', 'l'];
const DG_DASH = ['', 'dash', 'dot'];
const DG_FONTS = ['sans', 'serif', 'mono', 'hand'];
const DG_ALIGN = ['left', 'center', 'right'];
const DG_VALIGN = ['top', 'middle', 'bottom'];
const DG_MAX_ITEMS = 20000;

if (!function_exists('q')) {
    function q(string $sql, array $args = []): PDOStatement
    {
        $st = db()->prepare($sql);
        $st->execute($args);
        return $st;
    }
}

function new_code(string $table, string $col): string
{
    $abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    do {
        $p = '';
        for ($i = 0; $i < 10; $i++) $p .= $abc[random_int(0, strlen($abc) - 1)];
    } while (q('SELECT 1 FROM ' . t($table) . " WHERE $col = ?", [$p])->fetchColumn());
    return $p;
}

function valid_code($v): string
{
    return is_string($v) && preg_match('/^[a-z0-9]{10}$/', $v) ? $v : '';
}

function valid_color($v, string $default = ''): string
{
    return is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtolower($v) : $default;
}

/** A number of the diagram: finite, rounded to 2 decimals, inside ±$max. */
function dg_num($v, float $min = -1e7, float $max = 1e7, float $default = 0): float
{
    if (!is_int($v) && !is_float($v) && !(is_string($v) && is_numeric($v))) return $default;
    $f = (float)$v;
    if (!is_finite($f)) return $default;
    return round(max($min, min($max, $f)), 2);
}

function dg_pick($v, array $list, string $default): string
{
    return is_string($v) && in_array($v, $list, true) ? $v : $default;
}

function dg_text($v, int $max): string
{
    if (!is_string($v)) return '';
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    return mb_substr(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '', 0, $max);
}

function dg_id($v): string
{
    return is_string($v) && preg_match('/^[A-Za-z0-9_-]{1,24}$/', $v) ? $v : '';
}

// ------------------------------------------------------------------ what a diagram may contain

function clean_settings($s): array
{
    $s = is_array($s) ? $s : [];
    $out = [
        'bg' => valid_color($s['bg'] ?? '', '#ffffff'),
        'grid' => !array_key_exists('grid', $s) || !empty($s['grid']),
        'gs' => dg_num($s['gs'] ?? 20, 5, 100, 20),
        'snap' => !array_key_exists('snap', $s) || !empty($s['snap']),
    ];
    if (isset($s['view']) && is_array($s['view'])) $out['view'] = ['x' => dg_num($s['view']['x'] ?? 0), 'y' => dg_num($s['view']['y'] ?? 0), 'z' => dg_num($s['view']['z'] ?? 1, .05, 20, 1)];
    return $out;
}

/** One end of a connector: a node and its side, or a free point. */
function clean_end($e): array
{
    if (is_array($e) && dg_id($e['n'] ?? null) !== '') return ['n' => dg_id($e['n']), 'p' => dg_pick($e['p'] ?? '', DG_SIDES, '')];
    $e = is_array($e) ? $e : [];
    return ['x' => dg_num($e['x'] ?? 0), 'y' => dg_num($e['y'] ?? 0)];
}

/** One item as the browser sent it, cleaned; null when it is not an item. */
function clean_item($i): ?array
{
    if (!is_array($i)) return null;
    $id = dg_id($i['id'] ?? null);
    if ($id === '') return null;
    $t = $i['t'] ?? '';
    $common = [];
    if (dg_id($i['g'] ?? null) !== '') $common['g'] = dg_id($i['g']);
    if (!empty($i['lk'])) $common['lk'] = true;
    if ($t === 'node') {
        return ['id' => $id, 't' => 'node', 'k' => dg_pick($i['k'] ?? '', DG_SHAPES, 'rect'),
            'x' => dg_num($i['x'] ?? 0), 'y' => dg_num($i['y'] ?? 0), 'w' => dg_num($i['w'] ?? 120, 4, 1e5, 120), 'h' => dg_num($i['h'] ?? 60, 4, 1e5, 60),
            'text' => dg_text($i['text'] ?? '', 5000), 'f' => valid_color($i['f'] ?? '', ''), 'c' => valid_color($i['c'] ?? '', ''), 's' => dg_num($i['s'] ?? 2, 0, 24, 2),
            'd' => dg_pick($i['d'] ?? '', DG_DASH, ''), 'tc' => valid_color($i['tc'] ?? '', '#1c1c1c'), 'fs' => dg_num($i['fs'] ?? 16, 6, 400, 16),
            'ff' => dg_pick($i['ff'] ?? '', DG_FONTS, 'sans'), 'b' => !empty($i['b']), 'i' => !empty($i['i']),
            'al' => dg_pick($i['al'] ?? '', DG_ALIGN, 'center'), 'va' => dg_pick($i['va'] ?? '', DG_VALIGN, 'middle')] + $common;
    }
    if ($t === 'edge') {
        return ['id' => $id, 't' => 'edge', 'a' => clean_end($i['a'] ?? null), 'b' => clean_end($i['b'] ?? null), 'r' => dg_pick($i['r'] ?? '', DG_ROUTES, 'elbow'),
            'c' => valid_color($i['c'] ?? '', '#1c1c1c'), 's' => dg_num($i['s'] ?? 2, .5, 24, 2), 'd' => dg_pick($i['d'] ?? '', DG_DASH, ''),
            'sa' => dg_pick($i['sa'] ?? '', DG_HEADS, 'none'), 'ea' => dg_pick($i['ea'] ?? '', DG_HEADS, 'arrow'),
            'text' => dg_text($i['text'] ?? '', 1000), 'fs' => dg_num($i['fs'] ?? 14, 6, 200, 14), 'tc' => valid_color($i['tc'] ?? '', '#1c1c1c')] + $common;
    }
    return null;
}

function clean_items($list): array
{
    $out = [];
    $seen = [];
    foreach (is_array($list) ? $list : [] as $i) {
        $c = clean_item($i);
        if (!$c || isset($seen[$c['id']])) continue;
        $seen[$c['id']] = true;
        $out[] = $c;
        if (count($out) >= DG_MAX_ITEMS) break;
    }
    return $out;
}

function clean_title($v, string $lang): string
{
    $t = s(['t' => $v], 't', 160);
    return $t !== '' ? $t : ($lang === 'it' ? 'Diagramma senza titolo' : 'Untitled diagram');
}

/** The small picture of the home: a data: URL of a PNG, JPEG or WebP, not too big; '' otherwise. */
function clean_thumb($v): ?string
{
    if ($v === null) return null;
    if (!is_string($v) || $v === '') return '';
    return strlen($v) <= MAX_THUMB_BYTES && preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$#', $v) ? $v : '';
}

// ------------------------------------------------------------------ diagrams

/** The settings of the diagrams of an account (created the first time). */
function profile(array $u): array
{
    $p = q('SELECT * FROM ' . t('dg_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('dg_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], '{}', now_utc()]);
        $p = q('SELECT * FROM ' . t('dg_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    return $p;
}

function profile_prefs(array $p): array
{
    $x = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($x) ? $x : [];
}

/** A diagram of the account (trashed ones too when $trashed); fails with not_found otherwise. */
function own_diagram(array $u, $did, bool $trashed = false, bool $lock = false): array
{
    $did = valid_code($did);
    if ($did === '') fail('not_found', 404);
    $b = q('SELECT * FROM ' . t('dg_diagrams') . ' WHERE did = ? AND user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$did, $u['id']])->fetch();
    if (!$b || (!$trashed && $b['trashed_at'])) fail('not_found', 404);
    return $b;
}

/** A diagram for the list of the home: no items. */
function out_diagram_card(array $b): array
{
    $s = json_decode((string)$b['settings'], true) ?: [];
    return ['id' => $b['did'], 'title' => $b['title'], 'bg' => $s['bg'] ?? '#ffffff', 'thumb' => (string)$b['thumb'], 'items' => (int)$b['n_items'], 'bytes' => (int)$b['bytes'],
        'version' => (int)$b['version'], 'trashed' => iso($b['trashed_at']), 'opened' => iso($b['opened_at']), 'created' => iso($b['created_at']), 'updated' => iso($b['updated_at'])];
}

function out_diagram(array $b): array
{
    return out_diagram_card($b) + ['settings' => clean_settings(json_decode((string)$b['settings'], true)), 'list' => json_decode((string)$b['items'], true) ?: []];
}

function diagrams_of(int $uid): array
{
    return q('SELECT id, did, title, settings, thumb, n_items, bytes, version, trashed_at, opened_at, created_at, updated_at FROM ' . t('dg_diagrams') . ' WHERE user_id = ? ORDER BY updated_at DESC', [$uid])->fetchAll();
}

function create_diagram(array $u, string $title, array $settings, array $items, string $thumb = ''): array
{
    if ((int)q('SELECT COUNT(*) FROM ' . t('dg_diagrams') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_DIAGRAMS) fail('too_many', 422);
    $json = json_out($items);
    if (strlen($json) > MAX_DIAGRAM_BYTES) fail('diagram_big', 413);
    $did = new_code('dg_diagrams', 'did');
    q('INSERT INTO ' . t('dg_diagrams') . ' (did, user_id, title, settings, items, thumb, n_items, bytes, version, opened_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)',
        [$did, $u['id'], $title, json_out(clean_settings($settings)), $json, $thumb, count($items), strlen($json), now_utc(), now_utc(), now_utc()]);
    return own_diagram($u, $did);
}

/** Applies the changes of a save to the list of items: put (new or changed), del (ids), order (ids). */
function apply_changes(array $items, array $put, array $del, ?array $order): array
{
    $pos = [];
    foreach ($items as $n => $i) $pos[$i['id']] = $n;
    foreach ($put as $p) {
        if (isset($pos[$p['id']])) $items[$pos[$p['id']]] = $p;
        else { $pos[$p['id']] = count($items); $items[] = $p; }
    }
    if ($del) {
        $gone = array_flip($del);
        $items = array_values(array_filter($items, fn($i) => !isset($gone[$i['id']])));
    }
    if ($order) {
        $by = [];
        foreach ($items as $i) $by[$i['id']] = $i;
        $out = [];
        foreach ($order as $id) if (is_string($id) && isset($by[$id])) { $out[] = $by[$id]; unset($by[$id]); }
        $items = array_merge($out, array_values($by)); // what the order did not name (added by another tab) stays on top
    }
    return $items;
}

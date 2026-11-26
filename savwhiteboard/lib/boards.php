<?php
/**
 * SavWhiteboard — boards and what they may contain.
 *
 * A board is {title, settings, items}. settings: {bg, pat, gap, pc, view}. items is the list of what is drawn, in order
 * (the last one on top). Every item has an id (made by the browser) and a type t:
 *   stroke  a line by hand: tool (pen | pencil | marker), c colour, s size, p = [x, y, pressure, x, y, pressure, …]
 *   shape   k (rect | ellipse | diamond | triangle | line | arrow), x y w h (w and h may be negative for lines), c, s, f fill, d dashed
 *   text    x y, w (wrapping width, 0 = as long as the lines), text, c, fs size, ff (sans | serif | mono | hand), al, b bold
 *   note    a sticky note: x y w h, text, f paper, c ink, fs
 *   image   x y w h, src (m:<id>, a picture of the account kept by lib/media.php; or a data: URL of a PNG, JPEG, WebP or GIF)
 * The same list lives in assets/model.js (clean): keep them in step. Coordinates are in units of the board, unlimited.
 *
 * Saving sends changes, not the whole board: put (items new or changed), del (ids), order (the ids in the new order, only
 * when it changed). Two tabs of the same account can both save: each item is the last version that arrived.
 */

declare(strict_types=1);

const WB_TOOLS = ['pen', 'pencil', 'marker'];
const WB_SHAPES = ['rect', 'ellipse', 'diamond', 'triangle', 'line', 'arrow'];
const WB_FONTS = ['sans', 'serif', 'mono', 'hand'];
const WB_ALIGN = ['left', 'center', 'right'];
const WB_PATTERNS = ['none', 'dots', 'grid', 'lines', 'iso', 'staff', 'tab', 'mm', 'hex']; // the same list as assets/model.js PATTERNS
const WB_MAX_ITEMS = 50000;
const WB_MAX_POINTS = 60000;           // numbers of one stroke (20000 points)

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

/** A number of the board: finite, rounded to 2 decimals, inside ±$max. */
function wb_num($v, float $min = -1e7, float $max = 1e7, float $default = 0): float
{
    if (!is_int($v) && !is_float($v) && !(is_string($v) && is_numeric($v))) return $default;
    $f = (float)$v;
    if (!is_finite($f)) return $default;
    return round(max($min, min($max, $f)), 2);
}

function wb_pick($v, array $list, string $default): string
{
    return is_string($v) && in_array($v, $list, true) ? $v : $default;
}

function wb_text($v, int $max): string
{
    if (!is_string($v)) return '';
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    return mb_substr(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '', 0, $max);
}

// ------------------------------------------------------------------ what a board may contain

function clean_settings($s): array
{
    $s = is_array($s) ? $s : [];
    $out = [
        'bg' => valid_color($s['bg'] ?? '', '#ffffff'),
        'pat' => wb_pick($s['pat'] ?? '', WB_PATTERNS, 'dots'),
        'gap' => wb_num($s['gap'] ?? 24, 8, 160, 24),
        'pc' => valid_color($s['pc'] ?? '', ''),
    ];
    if (isset($s['view']) && is_array($s['view'])) $out['view'] = ['x' => wb_num($s['view']['x'] ?? 0), 'y' => wb_num($s['view']['y'] ?? 0), 'z' => wb_num($s['view']['z'] ?? 1, .05, 20, 1)];
    return $out;
}

/** One item as the browser sent it, cleaned; null when it is not an item. */
function clean_item($i): ?array
{
    if (!is_array($i)) return null;
    $id = $i['id'] ?? '';
    if (!is_string($id) || !preg_match('/^[A-Za-z0-9_-]{1,24}$/', $id)) return null;
    $t = $i['t'] ?? '';
    $box = fn() => ['x' => wb_num($i['x'] ?? 0), 'y' => wb_num($i['y'] ?? 0), 'w' => wb_num($i['w'] ?? 0), 'h' => wb_num($i['h'] ?? 0)];
    switch ($t) {
        case 'stroke':
            $p = $i['p'] ?? null;
            if (!is_array($p) || count($p) < 3 || count($p) > WB_MAX_POINTS) return null;
            $pts = [];
            foreach (array_values($p) as $n => $v) $pts[] = $n % 3 === 2 ? wb_num($v, 0, 1, .5) : wb_num($v);
            $pts = array_slice($pts, 0, count($pts) - count($pts) % 3);
            return ['id' => $id, 't' => 'stroke', 'tool' => wb_pick($i['tool'] ?? '', WB_TOOLS, 'pen'), 'c' => valid_color($i['c'] ?? '', '#1c1c1c'), 's' => wb_num($i['s'] ?? 4, .5, 400, 4), 'p' => $pts];
        case 'shape':
            $k = wb_pick($i['k'] ?? '', WB_SHAPES, 'rect');
            $b = $box();
            if ($k !== 'line' && $k !== 'arrow') { $b['w'] = abs($b['w']); $b['h'] = abs($b['h']); }
            return ['id' => $id, 't' => 'shape', 'k' => $k] + $b + ['c' => valid_color($i['c'] ?? '', '#1c1c1c'), 's' => wb_num($i['s'] ?? 4, .5, 200, 4), 'f' => valid_color($i['f'] ?? '', ''), 'd' => !empty($i['d'])];
        case 'text':
            return ['id' => $id, 't' => 'text', 'x' => wb_num($i['x'] ?? 0), 'y' => wb_num($i['y'] ?? 0), 'w' => wb_num($i['w'] ?? 0, 0, 1e5), 'text' => wb_text($i['text'] ?? '', 20000),
                'c' => valid_color($i['c'] ?? '', '#1c1c1c'), 'fs' => wb_num($i['fs'] ?? 28, 4, 2000, 28), 'ff' => wb_pick($i['ff'] ?? '', WB_FONTS, 'sans'), 'al' => wb_pick($i['al'] ?? '', WB_ALIGN, 'left'), 'b' => !empty($i['b'])];
        case 'note':
            $b = $box();
            return ['id' => $id, 't' => 'note', 'x' => $b['x'], 'y' => $b['y'], 'w' => max(20, abs($b['w'])), 'h' => max(20, abs($b['h'])), 'text' => wb_text($i['text'] ?? '', 5000),
                'f' => valid_color($i['f'] ?? '', '#fff3a3'), 'c' => valid_color($i['c'] ?? '', '#1c1c1c'), 'fs' => wb_num($i['fs'] ?? 22, 4, 400, 22)];
        case 'image':
            $src = $i['src'] ?? '';
            // a picture of the account (m:<id>, uploaded or found with the search) or, from older boards, the picture itself
            if (!is_string($src) || !(preg_match('/^m:[a-f0-9]{32}$/', $src) || (strlen($src) <= 4000000 && preg_match('#^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$#', $src)))) return null;
            $b = $box();
            return ['id' => $id, 't' => 'image', 'x' => $b['x'], 'y' => $b['y'], 'w' => max(1, abs($b['w'])), 'h' => max(1, abs($b['h'])), 'src' => $src];
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
        if (count($out) >= WB_MAX_ITEMS) break;
    }
    return $out;
}

function clean_title($v, string $lang): string
{
    $t = s(['t' => $v], 't', 160);
    return $t !== '' ? $t : ($lang === 'it' ? 'Lavagna senza titolo' : 'Untitled board');
}

/** The small picture of the home: a data: URL of a PNG, JPEG or WebP, not too big; '' otherwise. */
function clean_thumb($v): ?string
{
    if ($v === null) return null;
    if (!is_string($v) || $v === '') return '';
    return strlen($v) <= MAX_THUMB_BYTES && preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$#', $v) ? $v : '';
}

// ------------------------------------------------------------------ boards

/** The settings of the boards of an account (created the first time). */
function profile(array $u): array
{
    $p = q('SELECT * FROM ' . t('wb_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('wb_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], '{}', now_utc()]);
        $p = q('SELECT * FROM ' . t('wb_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    return $p;
}

function profile_prefs(array $p): array
{
    $x = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($x) ? $x : [];
}

/** A board of the account (trashed ones too when $trashed); fails with not_found otherwise. */
function own_board(array $u, $bid, bool $trashed = false, bool $lock = false): array
{
    $bid = valid_code($bid);
    if ($bid === '') fail('not_found', 404);
    $b = q('SELECT * FROM ' . t('wb_boards') . ' WHERE bid = ? AND user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$bid, $u['id']])->fetch();
    if (!$b || (!$trashed && $b['trashed_at'])) fail('not_found', 404);
    return $b;
}

/** A board for the list of the home: no items. */
function out_board_card(array $b): array
{
    $s = json_decode((string)$b['settings'], true) ?: [];
    return ['id' => $b['bid'], 'title' => $b['title'], 'bg' => $s['bg'] ?? '#ffffff', 'pat' => $s['pat'] ?? 'dots', 'thumb' => (string)$b['thumb'], 'items' => (int)$b['n_items'], 'bytes' => (int)$b['bytes'],
        'version' => (int)$b['version'], 'trashed' => iso($b['trashed_at']), 'opened' => iso($b['opened_at']), 'created' => iso($b['created_at']), 'updated' => iso($b['updated_at'])];
}

function out_board(array $b): array
{
    return out_board_card($b) + ['settings' => clean_settings(json_decode((string)$b['settings'], true)), 'list' => json_decode((string)$b['items'], true) ?: []];
}

function boards_of(int $uid): array
{
    return q('SELECT id, bid, title, settings, thumb, n_items, bytes, version, trashed_at, opened_at, created_at, updated_at FROM ' . t('wb_boards') . ' WHERE user_id = ? ORDER BY updated_at DESC', [$uid])->fetchAll();
}

function create_board(array $u, string $title, array $settings, array $items, string $thumb = ''): array
{
    if ((int)q('SELECT COUNT(*) FROM ' . t('wb_boards') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_BOARDS) fail('too_many', 422);
    $json = json_out($items);
    if (strlen($json) > MAX_BOARD_BYTES) fail('board_big', 413);
    $bid = new_code('wb_boards', 'bid');
    q('INSERT INTO ' . t('wb_boards') . ' (bid, user_id, title, settings, items, thumb, n_items, bytes, version, opened_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)',
        [$bid, $u['id'], $title, json_out(clean_settings($settings)), $json, $thumb, count($items), strlen($json), now_utc(), now_utc(), now_utc()]);
    return own_board($u, $bid);
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

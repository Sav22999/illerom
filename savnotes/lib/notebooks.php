<?php
/**
 * SavNotes — notebooks and what they may contain.
 *
 * A notebook is {title, settings, sheets}. settings: {cover, size, orient, font, tsize, flow (v | h: the sheets one under the other, or side by side like a book), scroll (free | snap: it stops on whole sheets), paper {bg, pat, gap, pc}, view}.
 * sheets is the list of its sheets, in order. Every sheet has an id (made by the browser), its paper (bg, pat, gap, pc),
 * doc (the typed text: a small set of HTML, see clean_doc) and items, what is drawn by hand, in order (the last on top):
 *   stroke  a line by hand: tool (pen | pencil | marker), c colour, s size, p = [x, y, pressure, x, y, pressure, …]
 *   shape   k (rect | ellipse | diamond | triangle | line | arrow), x y w h (w and h may be negative for lines), c, s, f fill, d dashed
 *   image   x y w h, src (a data: URL of a PNG, JPEG, WebP or GIF picture)
 * The same list lives in assets/model.js (clean…): keep them in step. Coordinates are units of the page (A4 = 794 × 1123).
 *
 * Saving sends changes, not the whole notebook: sheets (new sheets, or a new paper or typed text: without their items),
 * drop (ids of sheets gone), order (the ids of the sheets, only when it changed), put ([sheet, item] new or changed),
 * del ([sheet, item id]) and iorder ([sheet, ids]: the items of a sheet in a new order). Two tabs can both save: each
 * sheet and item is the last version that arrived.
 */

declare(strict_types=1);

const NB_TOOLS = ['pen', 'pencil', 'marker'];
const NB_SHAPES = ['rect', 'ellipse', 'diamond', 'triangle', 'line', 'arrow'];
const NB_FONTS = ['sans', 'serif', 'mono', 'hand'];
const NB_PATTERNS = ['none', 'dots', 'grid', 'lines', 'ruled', 'cornell', 'iso', 'staff', 'tab', 'mm', 'hex']; // the same list as assets/model.js PATTERNS
const NB_SIZES = ['a4', 'a5', 'letter', 'square', 'wide'];
const NB_MAX_SHEETS = 500;
const NB_MAX_ITEMS = 20000;            // items of one sheet
const NB_MAX_POINTS = 60000;           // numbers of one stroke (20000 points)
const NB_MAX_DOC = 200000;             // typed text of one sheet, as HTML
const NB_COVER = '#7b5434';

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

function valid_id($v): bool
{
    return is_string($v) && preg_match('/^[A-Za-z0-9_-]{1,24}$/', $v) === 1;
}

/** A number of a sheet: finite, rounded to 2 decimals, inside [$min, $max]. */
function nb_num($v, float $min = -2e4, float $max = 2e4, float $default = 0): float
{
    if (!is_int($v) && !is_float($v) && !(is_string($v) && is_numeric($v))) return $default;
    $f = (float)$v;
    if (!is_finite($f)) return $default;
    return round(max($min, min($max, $f)), 2);
}

function nb_pick($v, array $list, string $default): string
{
    return is_string($v) && in_array($v, $list, true) ? $v : $default;
}

// ------------------------------------------------------------------ what a notebook may contain

function clean_paper($p): array
{
    $p = is_array($p) ? $p : [];
    return ['bg' => valid_color($p['bg'] ?? '', '#ffffff'), 'pat' => nb_pick($p['pat'] ?? '', NB_PATTERNS, 'lines'), 'gap' => nb_num($p['gap'] ?? 30, 8, 80, 30), 'pc' => valid_color($p['pc'] ?? '', '')];
}

function clean_settings($s): array
{
    $s = is_array($s) ? $s : [];
    $out = [
        'cover' => valid_color($s['cover'] ?? '', NB_COVER),
        'size' => nb_pick($s['size'] ?? '', NB_SIZES, 'a4'),
        'orient' => nb_pick($s['orient'] ?? '', ['p', 'l'], 'p'),
        'font' => nb_pick($s['font'] ?? '', NB_FONTS, 'sans'),
        'tsize' => nb_pick($s['tsize'] ?? '', ['s', 'm', 'l'], 'm'),
        'flow' => nb_pick($s['flow'] ?? '', ['v', 'h'], 'v'),
        'scroll' => nb_pick($s['scroll'] ?? '', ['free', 'snap'], 'free'),
        'paper' => clean_paper($s['paper'] ?? []),
    ];
    if (isset($s['view']) && is_array($s['view'])) $out['view'] = ['z' => nb_num($s['view']['z'] ?? 1, .1, 6, 1), 'at' => (int)nb_num($s['view']['at'] ?? 0, 0, 1000, 0)];
    return $out;
}

/** One item as the browser sent it, cleaned; null when it is not an item. */
function clean_item($i): ?array
{
    if (!is_array($i) || !valid_id($i['id'] ?? null)) return null;
    $id = $i['id'];
    $box = fn() => ['x' => nb_num($i['x'] ?? 0), 'y' => nb_num($i['y'] ?? 0), 'w' => nb_num($i['w'] ?? 0), 'h' => nb_num($i['h'] ?? 0)];
    switch ($i['t'] ?? '') {
        case 'stroke':
            $p = $i['p'] ?? null;
            if (!is_array($p) || count($p) < 3 || count($p) > NB_MAX_POINTS) return null;
            $pts = [];
            foreach (array_values($p) as $n => $v) $pts[] = $n % 3 === 2 ? nb_num($v, 0, 1, .5) : nb_num($v);
            $pts = array_slice($pts, 0, count($pts) - count($pts) % 3);
            return ['id' => $id, 't' => 'stroke', 'tool' => nb_pick($i['tool'] ?? '', NB_TOOLS, 'pen'), 'c' => valid_color($i['c'] ?? '', '#1c1c1c'), 's' => nb_num($i['s'] ?? 3, .3, 200, 3), 'p' => $pts];
        case 'shape':
            $k = nb_pick($i['k'] ?? '', NB_SHAPES, 'rect');
            $b = $box();
            if ($k !== 'line' && $k !== 'arrow') { $b['w'] = abs($b['w']); $b['h'] = abs($b['h']); }
            return ['id' => $id, 't' => 'shape', 'k' => $k] + $b + ['c' => valid_color($i['c'] ?? '', '#1c1c1c'), 's' => nb_num($i['s'] ?? 3, .3, 100, 3), 'f' => valid_color($i['f'] ?? '', ''), 'd' => !empty($i['d'])];
        case 'image':
            $src = $i['src'] ?? '';
            if (!is_string($src) || strlen($src) > 4000000 || !preg_match('#^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$#', $src)) return null;
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
        if (count($out) >= NB_MAX_ITEMS) break;
    }
    return $out;
}

/** A style attribute of the typed text: only colours, alignment, bold, italic and lines (the same list as assets/model.js). */
function clean_style(string $css): string
{
    $color = '/^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]{3,20})$/i';
    $ok = [
        'color' => $color, 'background-color' => $color, 'text-align' => '/^(left|center|right|justify|start|end)$/',
        'font-weight' => '/^(bold|normal|[1-9]00)$/', 'font-style' => '/^(italic|normal)$/',
        'text-decoration' => '/^((underline|line-through|none)\s*)+$/', 'text-decoration-line' => '/^((underline|line-through|none)\s*)+$/',
    ];
    $out = [];
    foreach (explode(';', $css) as $part) {
        if (!preg_match('/^\s*([a-z-]+)\s*:\s*(.+?)\s*$/i', $part, $m)) continue;
        $k = strtolower($m[1]);
        $v = preg_replace('/\s*!important$/', '', strtolower($m[2]));
        if (isset($ok[$k]) && strlen($v) < 60 && preg_match($ok[$k], $v)) $out[] = "$k: $v";
    }
    return implode('; ', $out);
}

/**
 * The typed text of a sheet: only a small set of tags and attributes stays (the same list as cleanDoc in assets/model.js).
 * Tags that are not allowed are unwrapped (their text stays); scripts, styles, frames and the like go with what is inside.
 */
function clean_doc($html): string
{
    if (!is_string($html) || trim($html) === '') return '';
    if (strlen($html) > NB_MAX_DOC * 2) $html = mb_substr($html, 0, NB_MAX_DOC * 2);
    if (!class_exists('DOMDocument')) return htmlspecialchars(strip_tags($html), ENT_NOQUOTES, 'UTF-8');
    $tags = ['p', 'div', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'span', 'a', 'hr', 'sub', 'sup', 'mark'];
    $drop = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'head', 'title', 'meta', 'link', 'img', 'video', 'audio', 'canvas', 'form', 'input', 'button', 'select', 'textarea'];
    $styled = ['p', 'div', 'h1', 'h2', 'h3', 'li', 'span', 'mark', 'blockquote', 'b', 'strong', 'i', 'em', 'u', 's'];
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><html><body><div id="r">' . $html . '</div></body></html>', LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    $root = $doc->getElementById('r');
    if (!$root) return '';
    $walk = function (DOMNode $node) use (&$walk, $tags, $drop, $styled) {
        foreach (iterator_to_array($node->childNodes) as $n) {
            if ($n->nodeType === XML_TEXT_NODE) continue;
            if ($n->nodeType !== XML_ELEMENT_NODE) { $node->removeChild($n); continue; }
            /** @var DOMElement $n */
            $tag = strtolower($n->nodeName);
            if (in_array($tag, $drop, true)) { $node->removeChild($n); continue; }
            $walk($n);
            if (!in_array($tag, $tags, true) || ($tag === 'span' && !$n->hasAttribute('style'))) {
                while ($n->firstChild) $node->insertBefore($n->firstChild, $n);
                $node->removeChild($n);
                continue;
            }
            foreach (iterator_to_array($n->attributes) as $a) {
                $k = strtolower($a->nodeName);
                $v = (string)$a->nodeValue;
                if ($k === 'style' && in_array($tag, $styled, true)) { $st = clean_style($v); if ($st !== '') $n->setAttribute('style', $st); else $n->removeAttribute('style'); }
                elseif ($k === 'href' && $tag === 'a' && preg_match('#^(https?:|mailto:)#i', trim($v))) $n->setAttribute('href', trim($v));
                elseif ($k === 'data-checked' && $tag === 'li') $n->setAttribute('data-checked', $v === '1' ? '1' : '0');
                elseif ($k === 'class' && $tag === 'ul' && preg_match('/\bchk\b/', $v)) $n->setAttribute('class', 'chk');
                else $n->removeAttribute($a->nodeName);
            }
            if ($tag === 'a') { $n->setAttribute('rel', 'noopener noreferrer'); $n->setAttribute('target', '_blank'); }
            if ($tag === 'span' && !$n->hasAttribute('style')) {
                while ($n->firstChild) $node->insertBefore($n->firstChild, $n);
                $node->removeChild($n);
            }
        }
    };
    $walk($root);
    $out = '';
    foreach ($root->childNodes as $c) $out .= $doc->saveHTML($c);
    $out = trim($out);
    if (preg_match('#^(<p>(<br>)?</p>|<br>)?$#', $out)) return '';
    return strlen($out) > NB_MAX_DOC ? '' : $out;
}

/** The paper and typed text of a sheet (without its items); null when it is not a sheet. */
function clean_sheet_meta($s): ?array
{
    if (!is_array($s) || !valid_id($s['id'] ?? null)) return null;
    return ['id' => $s['id']] + clean_paper($s) + ['doc' => clean_doc($s['doc'] ?? '')];
}

/** Whole sheets (a new notebook, a file opened from the device). */
function clean_sheets($list): array
{
    $out = [];
    $seen = [];
    foreach (is_array($list) ? $list : [] as $s) {
        $c = clean_sheet_meta($s);
        if (!$c || isset($seen[$c['id']])) continue;
        $seen[$c['id']] = true;
        $c['items'] = clean_items($s['items'] ?? []);
        $out[] = $c;
        if (count($out) >= NB_MAX_SHEETS) break;
    }
    return $out;
}

function clean_title($v, string $lang): string
{
    $t = s(['t' => $v], 't', 160);
    return $t !== '' ? $t : ($lang === 'it' ? 'Quaderno senza titolo' : 'Untitled notebook');
}

// ------------------------------------------------------------------ notebooks

/** The settings of the notebooks of an account (created the first time). */
function profile(array $u): array
{
    $p = q('SELECT * FROM ' . t('nb_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('nb_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], '{}', now_utc()]);
        $p = q('SELECT * FROM ' . t('nb_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    return $p;
}

function profile_prefs(array $p): array
{
    $x = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($x) ? $x : [];
}

/** A notebook of the account (trashed ones too when $trashed); fails with not_found otherwise. */
function own_notebook(array $u, $nid, bool $trashed = false, bool $lock = false): array
{
    $nid = valid_code($nid);
    if ($nid === '') fail('not_found', 404);
    $b = q('SELECT * FROM ' . t('nb_notebooks') . ' WHERE nid = ? AND user_id = ?' . ($lock ? ' FOR UPDATE' : ''), [$nid, $u['id']])->fetch();
    if (!$b || (!$trashed && $b['trashed_at'])) fail('not_found', 404);
    return $b;
}

/** A notebook for the list of the home: no sheets, only what the cover shows. */
function out_notebook_card(array $b): array
{
    $s = clean_settings(json_decode((string)$b['settings'], true));
    return ['id' => $b['nid'], 'title' => $b['title'], 'cover' => $s['cover'], 'size' => $s['size'], 'orient' => $s['orient'], 'paper' => $s['paper'], 'sheets' => (int)$b['n_sheets'], 'bytes' => (int)$b['bytes'],
        'version' => (int)$b['version'], 'trashed' => iso($b['trashed_at']), 'opened' => iso($b['opened_at']), 'created' => iso($b['created_at']), 'updated' => iso($b['updated_at'])];
}

function out_notebook(array $b): array
{
    return out_notebook_card($b) + ['settings' => clean_settings(json_decode((string)$b['settings'], true)), 'list' => json_decode((string)$b['sheets'], true) ?: []];
}

function notebooks_of(int $uid): array
{
    return q('SELECT id, nid, title, settings, n_sheets, bytes, version, trashed_at, opened_at, created_at, updated_at FROM ' . t('nb_notebooks') . ' WHERE user_id = ? ORDER BY updated_at DESC', [$uid])->fetchAll();
}

function create_notebook(array $u, string $title, array $settings, array $sheets): array
{
    if ((int)q('SELECT COUNT(*) FROM ' . t('nb_notebooks') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_NOTEBOOKS) fail('too_many', 422);
    $settings = clean_settings($settings);
    if (!$sheets) $sheets = [['id' => substr(bin2hex(random_bytes(8)), 0, 12)] + $settings['paper'] + ['doc' => '', 'items' => []]];
    $json = json_out($sheets);
    if (strlen($json) > MAX_NOTEBOOK_BYTES) fail('notebook_big', 413);
    $nid = new_code('nb_notebooks', 'nid');
    q('INSERT INTO ' . t('nb_notebooks') . ' (nid, user_id, title, settings, sheets, n_sheets, bytes, version, opened_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)',
        [$nid, $u['id'], $title, json_out($settings), $json, count($sheets), strlen($json), now_utc(), now_utc(), now_utc()]);
    return own_notebook($u, $nid);
}

/**
 * Applies the changes of a save to the sheets. $metas: new or changed sheets (paper, typed text); $drop: ids of sheets
 * gone; $order: ids of the sheets; $put: [sheet id, item]; $del: [sheet id, item id]; $iorder: [sheet id, item ids].
 */
function apply_changes(array $sheets, array $metas, array $drop, ?array $order, array $put, array $del, array $iorder): array
{
    $pos = [];
    foreach ($sheets as $n => $s) $pos[$s['id']] = $n;
    foreach ($metas as $m) {
        if (isset($pos[$m['id']])) $sheets[$pos[$m['id']]] = $m + ['items' => $sheets[$pos[$m['id']]]['items'] ?? []];
        elseif (count($sheets) < NB_MAX_SHEETS) { $pos[$m['id']] = count($sheets); $sheets[] = $m + ['items' => []]; }
    }
    // items, sheet by sheet: an index of the ids of each sheet that is touched
    $idx = [];
    $at = function (string $sid, string $iid) use (&$sheets, &$idx, $pos): ?int {
        if (!isset($pos[$sid])) return null;
        if (!isset($idx[$sid])) { $idx[$sid] = []; foreach ($sheets[$pos[$sid]]['items'] as $n => $i) $idx[$sid][$i['id']] = $n; }
        return $idx[$sid][$iid] ?? -1;
    };
    foreach ($put as [$sid, $item]) {
        $n = $at($sid, $item['id']);
        if ($n === null) continue;
        $s = &$sheets[$pos[$sid]];
        if ($n >= 0) $s['items'][$n] = $item;
        elseif (count($s['items']) < NB_MAX_ITEMS) { $idx[$sid][$item['id']] = count($s['items']); $s['items'][] = $item; }
        unset($s);
    }
    $gone = [];
    foreach ($del as [$sid, $iid]) if (isset($pos[$sid])) $gone[$sid][$iid] = true;
    foreach ($gone as $sid => $ids) $sheets[$pos[$sid]]['items'] = array_values(array_filter($sheets[$pos[$sid]]['items'], fn($i) => !isset($ids[$i['id']])));
    foreach ($iorder as [$sid, $ids]) {
        if (!isset($pos[$sid])) continue;
        $by = [];
        foreach ($sheets[$pos[$sid]]['items'] as $i) $by[$i['id']] = $i;
        $out = [];
        foreach ($ids as $id) if (is_string($id) && isset($by[$id])) { $out[] = $by[$id]; unset($by[$id]); }
        $sheets[$pos[$sid]]['items'] = array_merge($out, array_values($by)); // what the order did not name (added by another tab) stays on top
    }
    if ($drop) {
        $d = array_flip($drop);
        $sheets = array_values(array_filter($sheets, fn($s) => !isset($d[$s['id']])));
    }
    if ($order) {
        $by = [];
        foreach ($sheets as $s) $by[$s['id']] = $s;
        $out = [];
        foreach ($order as $id) if (is_string($id) && isset($by[$id])) { $out[] = $by[$id]; unset($by[$id]); }
        $sheets = array_merge($out, array_values($by)); // sheets added by another tab go at the end
    }
    if (!$sheets) $sheets = [['id' => substr(bin2hex(random_bytes(8)), 0, 12)] + clean_paper([]) + ['doc' => '', 'items' => []]];
    return $sheets;
}

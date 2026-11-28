<?php
/**
 * SavSpreadsheets — what a workbook may contain. Everything the browsers send passes from here before it is stored:
 * only known fields, with their limits, survive. The same lists live in assets/model.js (clean…): keep them in step.
 *
 * A workbook is {settings, sheets}. A sheet:
 *   id      4–12 letters and digits (made by the browser), never changes
 *   name    what the tab says (60 characters, none of  [ ] : * ? / \ )
 *   color   of the tab ("" none) · hidden · grid (false: no grid lines)
 *   cells   {"A1": cell}: v the value (text, number, true/false; for a formula the last result), f the formula ("=…"),
 *           s the style (see clean_cell_style)
 *   cols    {"A": {w: width in px, h: hidden, s: style of the whole column}} · rows {"1": {h: height in px, x: hidden, s}}
 *   freeze  {r, c}: rows and columns that stay still · merges ["A1:B2", …]
 *   cf      conditional formats [{r: range, k: kind, a, b, s: style}] · dv data validation [{r, k, list, a, b}]
 *   charts  [{id, k: kind, r: range, x, y, w, h, title, legend, head}] · filter {r: range, h: {"C": [hidden values]}}
 *   perm    who may do what on this sheet, when it differs from the workbook: {"email" | "*": none | viewer | commenter | editor}
 *           ("*": whoever has no rule of their own; none: for that person the sheet does not exist). Only the owner sets it
 *   protect cells only some people may change: [{id, r: range, out, who, editors: [emails], users: [emails], note}]
 *           out: the whole sheet but r is protected (instead of r) · who "all": for everybody but the editors,
 *           "some": only for the users (everybody else may change them) · the owner always may
 * Who receives what: lib/docs.php doc_for (the rules and the protected ranges never reach anyone but the owner).
 * Dates and times are numbers (days since 30 December 1899, as in every spreadsheet) with a date format.
 */

declare(strict_types=1);

const CELL_KEY_RE = '/^([A-Z]{1,2})([1-9][0-9]{0,5})$/';
const RANGE_RE = '/^([A-Z]{1,2})([1-9][0-9]{0,5})(:([A-Z]{1,2})([1-9][0-9]{0,5}))?$/';
const COLOR_RE = '/^#[0-9a-f]{6}$/i';
const FONTS = ['sans', 'serif', 'mono', 'round', 'hand', 'narrow'];
const BORDER_KINDS = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'];
const CF_KINDS = ['gt', 'lt', 'ge', 'le', 'eq', 'ne', 'between', 'text', 'empty', 'filled', 'dup', 'top', 'scale', 'bars', 'formula'];
const DV_KINDS = ['list', 'number', 'int', 'date', 'text', 'check'];
const CHART_KINDS = ['column', 'bar', 'line', 'area', 'pie', 'donut', 'scatter', 'stacked'];

/** Column letters → number (A = 1, ZZ = 702); 0 when it is not a column. */
function col_num(string $c): int
{
    $n = 0;
    foreach (str_split($c) as $ch) $n = $n * 26 + (ord($ch) - 64);
    return $n >= 1 && $n <= MAX_COLS ? $n : 0;
}

function col_name(int $n): string
{
    $s = '';
    while ($n > 0) {
        $m = ($n - 1) % 26;
        $s = chr(65 + $m) . $s;
        $n = intdiv($n - 1, 26);
    }
    return $s;
}

/** "B7" → [7, 2] (row, column), or null. */
function cell_pos($k): ?array
{
    if (!is_string($k) || !preg_match(CELL_KEY_RE, $k, $m)) return null;
    $c = col_num($m[1]);
    $r = (int)$m[2];
    return $c && $r <= MAX_ROWS ? [$r, $c] : null;
}

function valid_cell_key($k): bool
{
    return cell_pos($k) !== null;
}

function valid_range($v): string
{
    if (!is_string($v) || !preg_match(RANGE_RE, $v, $m)) return '';
    if (!cell_pos($m[1] . $m[2]) || (!empty($m[3]) && !cell_pos($m[4] . $m[5]))) return '';
    return $v;
}

function valid_block_id($id): bool
{
    return is_string($id) && preg_match('/^[a-z0-9]{4,12}$/', $id) === 1;
}

/** Where a comment or a person is: "<sheet>!A1". */
function valid_anchor($v): bool
{
    return is_string($v) && preg_match('/^([a-z0-9]{4,12})!([A-Z]{1,2}[1-9][0-9]{0,5})$/', $v, $m) === 1 && valid_cell_key($m[2]);
}

function clean_text($v, int $max): string
{
    if (!is_string($v)) return '';
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    return mb_substr($v, 0, $max);
}

function clean_color($v): string
{
    return is_string($v) && preg_match(COLOR_RE, $v) ? strtolower($v) : '';
}

function clean_num($v, float $min, float $max, ?float $def = null): ?float
{
    if (!is_int($v) && !is_float($v) && !(is_string($v) && is_numeric($v))) return $def;
    $f = (float)$v;
    if (!is_finite($f)) return $def;
    return max($min, min($max, $f));
}

/** A border: "thin #1c1c1c". */
function clean_border($v): string
{
    if (!is_string($v) || !preg_match('/^([a-z]+) (#[0-9a-f]{6})$/i', $v, $m) || !in_array($m[1], BORDER_KINDS, true)) return '';
    return $m[1] . ' ' . strtolower($m[2]);
}

/**
 * The look of a cell (or of a whole row or column): b bold, i italic, u underline, k strike, c colour, bg background,
 * ff typeface, fz size (pt), ha horizontal alignment (l c r), va vertical (t m b), w wrap, nf number format,
 * bt br bb bl borders, ind indent (0–10), rot rotation (-90…90).
 */
function clean_cell_style($s): array
{
    if (!is_array($s)) return [];
    $o = [];
    foreach (['b', 'i', 'u', 'k', 'w'] as $k) if (!empty($s[$k])) $o[$k] = 1;
    foreach (['c', 'bg'] as $k) if (($c = clean_color($s[$k] ?? '')) !== '') $o[$k] = $c;
    if (in_array($s['ff'] ?? '', FONTS, true)) $o['ff'] = $s['ff'];
    if (($n = clean_num($s['fz'] ?? null, 6, 72)) !== null) $o['fz'] = round($n, 1);
    if (in_array($s['ha'] ?? '', ['l', 'c', 'r'], true)) $o['ha'] = $s['ha'];
    if (in_array($s['va'] ?? '', ['t', 'm', 'b'], true)) $o['va'] = $s['va'];
    // a number format is shown as text, never as markup: only its length and control characters matter
    $nf = clean_text($s['nf'] ?? '', 60);
    if ($nf !== '' && $nf !== 'General') $o['nf'] = $nf;
    foreach (['bt', 'br', 'bb', 'bl'] as $k) if (($b = clean_border($s[$k] ?? '')) !== '') $o[$k] = $b;
    if (($n = clean_num($s['ind'] ?? null, 0, 10)) !== null && $n > 0) $o['ind'] = (int)$n;
    if (($n = clean_num($s['rot'] ?? null, -90, 90)) !== null && $n != 0) $o['rot'] = (int)$n;
    return $o;
}

/** One cell; null when it is empty (no value, no formula, no style). */
function clean_cell($c): ?array
{
    if (!is_array($c)) return null;
    $o = [];
    $v = $c['v'] ?? null;
    if (is_bool($v)) $o['v'] = $v;
    elseif (is_int($v) || is_float($v)) { if (is_finite((float)$v)) $o['v'] = $v + 0; }
    elseif (is_string($v) && $v !== '') $o['v'] = clean_text($v, MAX_TEXT);
    $f = clean_text($c['f'] ?? '', MAX_FORMULA);
    if ($f !== '' && $f[0] === '=' && strlen($f) > 1) $o['f'] = $f;
    $s = clean_cell_style($c['s'] ?? null);
    if ($s) $o['s'] = $s;
    return $o ?: null;
}

function clean_sheet_name($v, string $def): string
{
    $n = trim(preg_replace('/[\[\]:*?\/\\\\\x00-\x1F\x7F]/u', '', is_string($v) ? $v : '') ?? '');
    $n = mb_substr($n, 0, 60);
    return $n !== '' ? $n : $def;
}

/** Widths, heights, hidden ones and the look of whole columns or rows. */
function clean_lines($m, bool $cols): array
{
    $out = [];
    if (!is_array($m)) return $out;
    foreach (array_slice($m, 0, $cols ? MAX_COLS : 20000, true) as $k => $x) {
        $k = (string)$k;
        if ($cols ? !col_num($k) || !preg_match('/^[A-Z]{1,2}$/', $k) : !preg_match('/^[1-9][0-9]{0,5}$/', $k) || (int)$k > MAX_ROWS) continue;
        if (!is_array($x)) continue;
        $o = [];
        $size = clean_num($x[$cols ? 'w' : 'h'] ?? null, $cols ? 16 : 12, $cols ? 1200 : 800);
        if ($size !== null) $o[$cols ? 'w' : 'h'] = (int)round($size);
        if (!empty($x['x'])) $o['x'] = 1; // hidden
        $s = clean_cell_style($x['s'] ?? null);
        if ($s) $o['s'] = $s;
        if ($o) $out[$k] = $o;
    }
    return $out;
}

function clean_ranges($v, int $max): array
{
    $out = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, $max) as $r) if (($r = valid_range($r)) !== '' && strpos($r, ':') !== false) $out[] = $r;
    return array_values(array_unique($out));
}

function clean_cf($v): array
{
    $out = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, 100) as $x) {
        if (!is_array($x) || ($r = valid_range($x['r'] ?? '')) === '' || !in_array($x['k'] ?? '', CF_KINDS, true)) continue;
        $o = ['r' => $r, 'k' => $x['k'], 'a' => clean_text(is_scalar($x['a'] ?? null) ? (string)$x['a'] : '', 200), 'b' => clean_text(is_scalar($x['b'] ?? null) ? (string)$x['b'] : '', 200), 's' => clean_cell_style($x['s'] ?? null)];
        foreach (['c1', 'c2', 'c3'] as $k) if (($c = clean_color($x[$k] ?? '')) !== '') $o[$k] = $c; // colour scales and bars
        $out[] = $o;
    }
    return $out;
}

function clean_dv($v): array
{
    $out = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, 100) as $x) {
        if (!is_array($x) || ($r = valid_range($x['r'] ?? '')) === '' || !in_array($x['k'] ?? '', DV_KINDS, true)) continue;
        $list = [];
        foreach (array_slice(is_array($x['list'] ?? null) ? $x['list'] : [], 0, 200) as $i) if (is_scalar($i) && ($t = clean_text((string)$i, 200)) !== '') $list[] = $t;
        $out[] = ['r' => $r, 'k' => $x['k'], 'list' => $list, 'a' => clean_text(is_scalar($x['a'] ?? null) ? (string)$x['a'] : '', 60), 'b' => clean_text(is_scalar($x['b'] ?? null) ? (string)$x['b'] : '', 60), 'strict' => !empty($x['strict']), 'arrow' => ($x['arrow'] ?? true) !== false, 'hover' => ($x['hover'] ?? true) !== false, 'sel' => !empty($x['sel']), 'suggest' => ($x['suggest'] ?? true) !== false, 'tri' => !empty($x['tri'])];
    }
    return $out;
}

function clean_charts($v): array
{
    $out = [];
    $seen = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, 50) as $x) {
        if (!is_array($x) || !valid_block_id($x['id'] ?? null) || isset($seen[$x['id']]) || ($r = valid_range($x['r'] ?? '')) === '' || !in_array($x['k'] ?? '', CHART_KINDS, true)) continue;
        $seen[$x['id']] = true;
        $o = ['id' => $x['id'], 'k' => $x['k'], 'r' => $r, 'x' => (int)clean_num($x['x'] ?? 0, 0, 200000, 0), 'y' => (int)clean_num($x['y'] ?? 0, 0, 2000000, 0),
            'w' => (int)clean_num($x['w'] ?? 480, 160, 2000, 480), 'h' => (int)clean_num($x['h'] ?? 300, 120, 1400, 300), 'title' => clean_text($x['title'] ?? '', 120),
            'legend' => !array_key_exists('legend', $x) || !empty($x['legend']), 'head' => !array_key_exists('head', $x) || !empty($x['head']), 'rows' => !empty($x['rows'])];
        if (($c = clean_color($x['color'] ?? '')) !== '') $o['color'] = $c;
        $out[] = $o;
    }
    return $out;
}

function clean_filter($v): ?array
{
    if (!is_array($v) || ($r = valid_range($v['r'] ?? '')) === '') return null;
    $h = [];
    foreach (array_slice(is_array($v['h'] ?? null) ? $v['h'] : [], 0, MAX_COLS, true) as $c => $vals) {
        if (!col_num((string)$c) || !is_array($vals)) continue;
        $list = [];
        foreach (array_slice($vals, 0, 2000) as $x) if (is_scalar($x)) $list[] = clean_text((string)$x, 200);
        if ($list) $h[(string)$c] = $list;
    }
    $o = ['r' => $r, 'h' => (object)$h];
    if (preg_match('/^[A-Z]{1,2}$/', (string)($v['sort'] ?? '')) && col_num($v['sort'])) $o['sort'] = $v['sort'];
    $o['desc'] = !empty($v['desc']);
    return $o;
}

const SHEET_ROLES = ['none', 'viewer', 'commenter', 'editor'];

function clean_email($v): string
{
    $e = is_string($v) ? mb_strtolower(trim($v)) : '';
    return $e !== '' && mb_strlen($e) <= 190 && filter_var($e, FILTER_VALIDATE_EMAIL) ? $e : '';
}

/** The rules of a sheet: {"email" | "*": role}. */
function clean_perm($v): array
{
    $out = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, 300, true) as $k => $role) {
        $k = $k === '*' ? '*' : clean_email((string)$k);
        if ($k !== '' && in_array($role, SHEET_ROLES, true)) $out[$k] = $role;
    }
    return $out;
}

/** Protected ranges: [{id, r, out, who, editors, users, note}]. */
function clean_protect($v): array
{
    $out = [];
    $seen = [];
    foreach (array_slice(is_array($v) ? $v : [], 0, 100) as $x) {
        if (!is_array($x) || ($r = valid_range($x['r'] ?? '')) === '') continue;
        $id = valid_block_id($x['id'] ?? null) && !isset($seen[$x['id']]) ? $x['id'] : substr(bin2hex(random_bytes(5)), 0, 8);
        $seen[$id] = true;
        $list = function ($v) {
            $o = [];
            foreach (array_slice(is_array($v) ? $v : [], 0, 300) as $e) if (($e = clean_email($e)) !== '') $o[] = $e;
            return array_values(array_unique($o));
        };
        $out[] = ['id' => $id, 'r' => $r, 'out' => !empty($x['out']), 'who' => ($x['who'] ?? '') === 'some' ? 'some' : 'all',
            'editors' => $list($x['editors'] ?? null), 'users' => $list($x['users'] ?? null), 'note' => clean_text($x['note'] ?? '', 200)];
    }
    return $out;
}

/** The parts of a sheet that are not cells (a sheet op patches some of them). */
function clean_sheet_props(array $p, ?array $only = null): array
{
    $o = [];
    $want = fn($k) => $only === null || in_array($k, $only, true);
    if ($want('name') && array_key_exists('name', $p)) $o['name'] = clean_sheet_name($p['name'], 'Sheet');
    if ($want('color') && array_key_exists('color', $p)) $o['color'] = clean_color($p['color']);
    if ($want('hidden') && array_key_exists('hidden', $p)) $o['hidden'] = !empty($p['hidden']);
    if ($want('grid') && array_key_exists('grid', $p)) $o['grid'] = $p['grid'] !== false;
    if ($want('cols') && array_key_exists('cols', $p)) $o['cols'] = (object)clean_lines($p['cols'], true);
    if ($want('rows') && array_key_exists('rows', $p)) $o['rows'] = (object)clean_lines($p['rows'], false);
    if ($want('freeze') && array_key_exists('freeze', $p)) {
        $f = is_array($p['freeze']) ? $p['freeze'] : [];
        $o['freeze'] = ['r' => (int)clean_num($f['r'] ?? 0, 0, 100, 0), 'c' => (int)clean_num($f['c'] ?? 0, 0, 50, 0)];
    }
    if ($want('merges') && array_key_exists('merges', $p)) $o['merges'] = clean_ranges($p['merges'], 3000);
    if ($want('cf') && array_key_exists('cf', $p)) $o['cf'] = clean_cf($p['cf']);
    if ($want('dv') && array_key_exists('dv', $p)) $o['dv'] = clean_dv($p['dv']);
    if ($want('charts') && array_key_exists('charts', $p)) $o['charts'] = clean_charts($p['charts']);
    if ($want('filter') && array_key_exists('filter', $p)) $o['filter'] = clean_filter($p['filter']);
    if ($want('perm') && array_key_exists('perm', $p)) $o['perm'] = (object)clean_perm($p['perm']);
    if ($want('protect') && array_key_exists('protect', $p)) $o['protect'] = clean_protect($p['protect']);
    return $o;
}

const SHEET_PROPS = ['name', 'color', 'hidden', 'grid', 'cols', 'rows', 'freeze', 'merges', 'cf', 'dv', 'charts', 'filter', 'perm', 'protect'];
const RULE_PROPS = ['perm', 'protect']; // only the owner changes them

function clean_cells($m): array
{
    $out = [];
    if (!is_array($m)) return $out;
    $n = 0;
    foreach ($m as $k => $c) {
        if (++$n > 500000) break;
        if (!valid_cell_key((string)$k)) continue;
        $c = clean_cell($c);
        if ($c) $out[(string)$k] = $c;
    }
    return $out;
}

/** A whole sheet (a new one, a file opened from the device, a restored version). */
function clean_sheet($s, int $n): ?array
{
    if (!is_array($s)) return null;
    $id = valid_block_id($s['id'] ?? null) ? $s['id'] : substr(bin2hex(random_bytes(5)), 0, 8);
    $p = clean_sheet_props($s + ['name' => '', 'color' => '', 'hidden' => false, 'grid' => true, 'cols' => [], 'rows' => [], 'freeze' => [], 'merges' => [], 'cf' => [], 'dv' => [], 'charts' => [], 'filter' => null, 'perm' => [], 'protect' => []]);
    if ($p['name'] === 'Sheet') $p['name'] = 'Sheet' . $n;
    return ['id' => $id] + $p + ['cells' => (object)clean_cells($s['cells'] ?? [])];
}

function clean_settings($s): array
{
    $s = is_array($s) ? $s : [];
    return [
        // the language of the workbook: decimal separator, names of days and months, the language of the functions
        'lang' => is_string($s['lang'] ?? null) && preg_match('/^[a-z]{2}(-[A-Z]{2})?$/', $s['lang']) ? $s['lang'] : 'en',
        'currency' => in_array($s['currency'] ?? '', ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'SEK', 'PLN'], true) ? $s['currency'] : 'EUR',
        'font' => in_array($s['font'] ?? '', FONTS, true) ? $s['font'] : 'sans',
        'fontSize' => clean_num($s['fontSize'] ?? null, 7, 24, 10),
        'accent' => clean_color($s['accent'] ?? '') ?: '#4d7c0f',
        'active' => valid_block_id($s['active'] ?? null) ? $s['active'] : '',
        // what who only reads (or comments) may do
        'noComments' => !empty($s['noComments']), 'noDownload' => !empty($s['noDownload']), 'noCopy' => !empty($s['noCopy']),
    ];
}

/** A whole workbook (new, from a file, from a template, a restored version). */
function clean_doc($doc): array
{
    $doc = is_array($doc) ? $doc : [];
    $sheets = [];
    $seen = [];
    foreach (array_slice(is_array($doc['sheets'] ?? null) ? $doc['sheets'] : [], 0, MAX_SHEETS) as $i => $s) {
        $c = clean_sheet($s, $i + 1);
        if (!$c || isset($seen[$c['id']])) continue;
        $seen[$c['id']] = true;
        $sheets[] = $c;
    }
    if (!$sheets) $sheets[] = clean_sheet(['name' => 'Sheet1'], 1);
    return ['settings' => clean_settings($doc['settings'] ?? []), 'sheets' => $sheets];
}

/** How many cells hold something. */
function doc_words(array $doc): int
{
    $n = 0;
    foreach ($doc['sheets'] as $s) foreach ((array)$s['cells'] as $c) if (isset($c['v']) || isset($c['f'])) $n++;
    return $n;
}

// ---------------------------------------------------------------- changes

/** Moves cells, rows or columns when some are added (n > 0) or removed (n < 0) at $at (1-based). */
function shift_key(string $k, string $axis, int $at, int $n): ?string
{
    $p = cell_pos($k);
    if (!$p) return null;
    [$r, $c] = $p;
    $x = $axis === 'r' ? $r : $c;
    if ($x >= $at) {
        if ($n < 0 && $x < $at - $n) return null; // removed
        $x += $n;
    }
    if ($x < 1 || $x > ($axis === 'r' ? MAX_ROWS : MAX_COLS)) return null;
    return $axis === 'r' ? col_name($c) . $x : col_name($x) . $r;
}

function shift_range(string $rg, string $axis, int $at, int $n): ?string
{
    $parts = explode(':', $rg);
    $a = cell_pos($parts[0]);
    $b = cell_pos($parts[1] ?? $parts[0]);
    if (!$a || !$b) return null;
    $i = $axis === 'r' ? 0 : 1;
    $lo = $a[$i];
    $hi = $b[$i];
    $move = function (int $x, bool $end) use ($at, $n) {
        if ($x < $at) return $x;
        if ($n < 0 && $x < $at - $n) return $end ? $at - 1 : $at; // inside what was removed: the edge comes to the cut
        return $x + $n;
    };
    $lo2 = $move($lo, false);
    $hi2 = $move($hi, true);
    if ($hi2 < $lo2) return null;
    $a[$i] = $lo2;
    $b[$i] = $hi2;
    $s = col_name($a[1]) . $a[0];
    return isset($parts[1]) ? $s . ':' . col_name($b[1]) . $b[0] : $s;
}

function shift_sheet(array &$sh, string $axis, int $at, int $n): void
{
    $cells = [];
    foreach ((array)$sh['cells'] as $k => $c) if (($k2 = shift_key((string)$k, $axis, $at, $n)) !== null) $cells[$k2] = $c;
    $sh['cells'] = (object)$cells;
    $key = $axis === 'r' ? 'rows' : 'cols';
    $lines = [];
    foreach ((array)$sh[$key] as $k => $x) {
        $i = $axis === 'r' ? (int)$k : col_num((string)$k);
        if ($i >= $at) {
            if ($n < 0 && $i < $at - $n) continue;
            $i += $n;
        }
        if ($i < 1 || $i > ($axis === 'r' ? MAX_ROWS : MAX_COLS)) continue;
        $lines[$axis === 'r' ? (string)$i : col_name($i)] = $x;
    }
    $sh[$key] = (object)$lines;
    $sh['merges'] = array_values(array_filter(array_map(fn($m) => shift_range($m, $axis, $at, $n), $sh['merges']), fn($m) => $m !== null && strpos($m, ':') !== false && explode(':', $m)[0] !== explode(':', $m)[1]));
    foreach (['cf', 'dv', 'charts', 'protect'] as $k) $sh[$k] = array_values(array_filter(array_map(function ($x) use ($axis, $at, $n) { $r = shift_range($x['r'], $axis, $at, $n); if ($r === null) return null; $x['r'] = $r; return $x; }, $sh[$k] ?? [])));
    if ($sh['filter']) {
        $r = shift_range($sh['filter']['r'], $axis, $at, $n);
        $sh['filter'] = $r === null ? null : ['r' => $r] + $sh['filter'];
    }
}

/**
 * Applies the changes of one browser to the workbook (already locked). The last change that arrives wins:
 *   {t:'cells', s, m: {A1: cell | null}}       cells written or emptied (null)
 *   {t:'shift', s, a: 'r'|'c', at, n}           rows or columns added (n > 0) or removed (n < 0) from at; formulas are
 *                                               rewritten by the browser, in the same changes, right after
 *   {t:'sheet', id, p: {…}}                     some parts of a sheet (name, colour, widths, merges, charts, rules…)
 *   {t:'addsheet', id, after, sheet}, {t:'delsheet', id}, {t:'movsheet', id, after}   after '' = first
 *   {t:'settings', s}, {t:'title', title}
 * $who: ['role' => role on the workbook, 'u' => the account] (null: the owner). What the rules of a sheet or a protected
 * range do not allow is refused: [{t:'cells', s, m: {A1: the cell as it is}}] to put back, or [{t:'reload'}].
 * Returns [applied operations, refused ones].
 */
function apply_ops(array &$doc, string &$title, array $ops, ?array $who = null): array
{
    $docRole = $who['role'] ?? 'owner';
    $u = $who['u'] ?? null;
    $owner = $docRole === 'owner';
    $pos = [];
    $reindex = function () use (&$doc, &$pos) {
        $pos = [];
        foreach ($doc['sheets'] as $i => $s) $pos[$s['id']] = $i;
    };
    $reindex();
    $done = [];
    $refused = [];
    $reload = false;
    $role = fn(string $sid) => $owner ? 'owner' : sheet_role($doc['sheets'][$pos[$sid]], $docRole, $u);
    $editsSheet = fn(string $sid) => role_rank($role($sid)) >= role_rank('editor');
    $editsBook = role_rank($docRole) >= role_rank('editor');
    // a whole batch with a shift that is not allowed is refused: the formulas rewritten after it would land in the wrong place
    foreach ($ops as $op) {
        if (!$owner && is_array($op) && ($op['t'] ?? '') === 'shift' && isset($pos[$op['s'] ?? '']) && (!$editsSheet($op['s']) || locked_ranges($doc['sheets'][$pos[$op['s']]], $u))) return [[], [['t' => 'reload']]];
    }
    foreach (array_slice($ops, 0, 5000) as $op) {
        if (!is_array($op)) continue;
        $type = $op['t'] ?? '';
        $sid = $type === 'cells' || $type === 'shift' ? ($op['s'] ?? '') : ($op['id'] ?? '');
        if (in_array($type, ['cells', 'shift', 'sheet', 'delsheet', 'movsheet'], true) && !isset($pos[$sid])) continue;
        $after = isset($op['after']) && valid_block_id($op['after']) ? $op['after'] : '';
        if ($type === 'cells') {
            $m = is_array($op['m'] ?? null) ? $op['m'] : [];
            $sh = &$doc['sheets'][$pos[$sid]];
            $cells = (array)$sh['cells'];
            $sr = $role($sid);
            if ($sr === 'none') { unset($sh); continue; } // a sheet that does not exist for this person: nothing, not even what is in it
            $out = [];
            $back = [];
            $n = 0;
            foreach ($m as $k => $c) {
                if (++$n > 200000) break;
                $k = (string)$k;
                $p = cell_pos($k);
                if (!$p) continue;
                if (!$owner && !can_edit_cell($sh, $sr, $u, $p[0], $p[1])) { $back[$k] = $cells[$k] ?? null; continue; }
                $c = clean_cell($c);
                if ($c) $cells[$k] = $c; else unset($cells[$k]);
                $out[$k] = $c;
            }
            $sh['cells'] = (object)$cells;
            unset($sh);
            if ($out) $done[] = ['t' => 'cells', 's' => $sid, 'm' => (object)$out];
            if ($back) $refused[] = ['t' => 'cells', 's' => $sid, 'm' => (object)$back];
        } elseif ($type === 'shift') {
            $axis = ($op['a'] ?? '') === 'c' ? 'c' : 'r';
            $max = $axis === 'r' ? MAX_ROWS : MAX_COLS;
            $at = (int)clean_num($op['at'] ?? 0, 1, $max, 1);
            $n = (int)clean_num($op['n'] ?? 0, -$max, $max, 0);
            if ($n === 0) continue;
            shift_sheet($doc['sheets'][$pos[$sid]], $axis, $at, $n);
            $done[] = ['t' => 'shift', 's' => $sid, 'a' => $axis, 'at' => $at, 'n' => $n];
        } elseif ($type === 'sheet') {
            $p = clean_sheet_props(is_array($op['p'] ?? null) ? $op['p'] : [], $owner ? SHEET_PROPS : array_diff(SHEET_PROPS, RULE_PROPS));
            if (!$p) continue;
            if (!$owner && !$editsSheet($sid)) { $reload = true; continue; }
            $doc['sheets'][$pos[$sid]] = array_merge($doc['sheets'][$pos[$sid]], $p);
            $done[] = ['t' => 'sheet', 'id' => $sid, 'p' => $p];
        } elseif ($type === 'addsheet') {
            if (!valid_block_id($sid) || isset($pos[$sid]) || count($doc['sheets']) >= MAX_SHEETS) continue;
            if (!$owner && !$editsBook) { $reload = true; continue; }
            $src = is_array($op['sheet'] ?? null) ? $op['sheet'] : [];
            if (!$owner) unset($src['perm'], $src['protect']);
            $sh = clean_sheet(['id' => $sid] + $src, count($doc['sheets']) + 1);
            $at = $after === '' ? 0 : (isset($pos[$after]) ? $pos[$after] + 1 : count($doc['sheets']));
            array_splice($doc['sheets'], $at, 0, [$sh]);
            $reindex();
            $done[] = ['t' => 'addsheet', 'id' => $sid, 'after' => $at === 0 ? '' : $doc['sheets'][$at - 1]['id'], 'sheet' => $sh];
        } elseif ($type === 'delsheet') {
            if (count($doc['sheets']) < 2) continue;
            $sh = $doc['sheets'][$pos[$sid]];
            if (!$owner && (!$editsSheet($sid) || (array)($sh['perm'] ?? []) || ($sh['protect'] ?? []))) { $reload = true; continue; }
            array_splice($doc['sheets'], $pos[$sid], 1);
            $reindex();
            $done[] = ['t' => 'delsheet', 'id' => $sid];
        } elseif ($type === 'movsheet') {
            if ($after === $sid) continue;
            if (!$owner && !$editsSheet($sid)) { $reload = true; continue; }
            $b = array_splice($doc['sheets'], $pos[$sid], 1);
            $reindex();
            $at = $after === '' ? 0 : (isset($pos[$after]) ? $pos[$after] + 1 : count($doc['sheets']));
            array_splice($doc['sheets'], $at, 0, $b);
            $reindex();
            $done[] = ['t' => 'movsheet', 'id' => $sid, 'after' => $at === 0 ? '' : $doc['sheets'][$at - 1]['id']];
        } elseif ($type === 'settings') {
            if (!$owner && !$editsBook) { $reload = true; continue; }
            $doc['settings'] = clean_settings($op['s'] ?? []);
            $done[] = ['t' => 'settings', 's' => $doc['settings']];
        } elseif ($type === 'title') {
            if (!$owner && !$editsBook) continue;
            $tt = clean_title($op['title'] ?? '');
            if ($tt === '') continue;
            $title = $tt;
            $done[] = ['t' => 'title', 'title' => $tt];
        }
    }
    if ($reload) $refused[] = ['t' => 'reload'];
    return [$done, $refused];
}

// ---------------------------------------------------------------- rules of sheets and cells

/**
 * What a person can do on a sheet: the rule with their email, else the one for everybody ("*"), else what they can do
 * on the workbook. Without an account, at most reading. The owner can always do everything.
 */
function sheet_role(array $sheet, string $docRole, ?array $u): string
{
    if ($docRole === 'owner') return 'owner';
    $perm = (array)($sheet['perm'] ?? []);
    $email = $u ? mb_strtolower((string)$u['email']) : '';
    $rule = $email !== '' && isset($perm[$email]) ? $perm[$email] : ($perm['*'] ?? null);
    if ($rule === null) return $docRole;
    if ($rule === 'none') return 'none';
    return $u ? $rule : 'viewer';
}

/** May this person change this cell (rules of the sheet and protected ranges)? */
function can_edit_cell(array $sheet, string $sheetRole, ?array $u, int $r, int $c): bool
{
    if ($sheetRole === 'owner') return true;
    if (role_rank($sheetRole) < role_rank('editor')) return false;
    foreach ($sheet['protect'] ?? [] as $x) {
        if (!protect_binds($x, $u) || !($g = range_box($x['r']))) continue;
        $in = $r >= $g[0] && $r <= $g[2] && $c >= $g[1] && $c <= $g[3];
        if ($in !== !empty($x['out'])) return false; // inside a protected range, or outside the range left free
    }
    return true;
}

/** Does a protected range hold for this person? ("all": everybody but its editors; "some": only its users) */
function protect_binds(array $x, ?array $u): bool
{
    $email = $u ? mb_strtolower((string)$u['email']) : '';
    return ($x['who'] ?? 'all') === 'some' ? in_array($email, $x['users'] ?? [], true) : !in_array($email, $x['editors'] ?? [], true);
}

/** Are there protected ranges this person may not change? */
function locked_ranges(array $sheet, ?array $u): bool
{
    foreach ($sheet['protect'] ?? [] as $x) if (protect_binds($x, $u)) return true;
    return false;
}

/** "B2:D9" → [r1, c1, r2, c2] */
function range_box(string $rg): ?array
{
    $parts = explode(':', $rg);
    $a = cell_pos($parts[0]);
    $b = cell_pos($parts[1] ?? $parts[0]);
    return $a && $b ? [min($a[0], $b[0]), min($a[1], $b[1]), max($a[0], $b[0]), max($a[1], $b[1])] : null;
}

/** The top left corner of the first sheet, for the small picture in the home: 24 rows, 10 columns, short texts. */
function doc_preview(array $doc): string
{
    $sh = null;
    foreach ($doc['sheets'] as $s) if (empty($s['hidden'])) { $sh = $s; break; }
    $sh = $sh ?: $doc['sheets'][0];
    $cells = [];
    foreach ((array)$sh['cells'] as $k => $c) {
        $p = cell_pos((string)$k);
        if (!$p || $p[0] > 24 || $p[1] > 10) continue;
        $x = [];
        if (isset($c['v'])) $x['v'] = is_string($c['v']) ? mb_substr($c['v'], 0, 40) : $c['v'];
        if (isset($c['s'])) $x['s'] = array_intersect_key($c['s'], ['b' => 1, 'i' => 1, 'c' => 1, 'bg' => 1, 'ha' => 1, 'nf' => 1, 'fz' => 1, 'bb' => 1]);
        if ($x) $cells[(string)$k] = $x;
    }
    $cols = array_intersect_key((array)$sh['cols'], array_flip(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']));
    $json = json_out(['settings' => $doc['settings'], 'name' => $sh['name'], 'sheets' => count($doc['sheets']), 'cells' => (object)$cells, 'cols' => (object)$cols, 'grid' => $sh['grid'] ?? true, 'merges' => array_slice($sh['merges'], 0, 40)]);
    return strlen($json) < 60000 ? $json : json_out(['settings' => $doc['settings'], 'name' => $sh['name'], 'sheets' => count($doc['sheets']), 'cells' => new stdClass(), 'cols' => new stdClass()]);
}

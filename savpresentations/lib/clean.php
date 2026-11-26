<?php
/**
 * SavPresentations — cleaning of everything the browsers send: presentations, slides, elements, rich text.
 * Every value is rebuilt field by field: unknown keys are dropped, numbers clamped, colours and addresses checked,
 * rich text reduced to a few safe tags. The browser cleans rich text again before showing it (assets/richtext.js).
 * Keep ELEMENT_FIELDS in step with assets/model.js.
 */

declare(strict_types=1);

const SHAPES = ['rect', 'round', 'ellipse', 'triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'parallelogram', 'trapezoid', 'star', 'star4', 'burst', 'arrow', 'arrow2', 'chevron', 'homeplate', 'plus', 'heart', 'cloud', 'speech', 'ring', 'half', 'quarter', 'arch', 'drop', 'blob', 'blob2', 'wave', 'moon', 'frame', 'line'];
const FONT_IDS = ['@head', '@body', 'inter', 'poppins', 'montserrat', 'opensans', 'sourcesans', 'fredoka', 'lora', 'merriweather', 'playfair', 'baskerville', 'garamond', 'ptserif', 'mono', 'niconne',
    'roboto', 'lato', 'nunito', 'raleway', 'worksans', 'dmsans', 'manrope', 'firasans', 'plexsans', 'notosans', 'rubik', 'oswald', 'bebas', 'crimson', 'sourceserif', 'plexserif', 'notoserif', 'plexmono', 'caveat', 'dancing'];

/** A typeface: an included one, "b:slug" of Bunny Fonts or "f:id" of a file kept in an account (listed in meta.fonts). */
function valid_font($v): bool
{
    return is_string($v) && (in_array($v, FONT_IDS, true) || preg_match('/^(b:[a-z0-9][a-z0-9-]{0,59}|f:[a-f0-9]{24})$/', $v));
}
const COLOR_TOKENS = ['@bg', '@fg', '@muted', '@accent', '@accent2', '@surface', '@onaccent'];
const ANIMS = ['', 'fade', 'up', 'left', 'zoom'];
const TRANSITIONS = ['', 'none', 'fade', 'slide', 'push', 'zoom'];

// field => [kind, …limits]
const ELEMENT_FIELDS = [
    't' => ['enum', ['text', 'image', 'video', 'shape', 'chart', 'table', 'icon']], 'g' => ['key'], 'cell' => ['num', 0, 23], 'cr' => ['rect'],
    'x' => ['num', -20000, 20000], 'y' => ['num', -20000, 20000], 'w' => ['num', 1, 20000], 'h' => ['num', 1, 20000],
    'r' => ['num', -360, 360], 'z' => ['num', -1000000, 1000000], 'o' => ['num', 0, 1],
    'lock' => ['bool'], 'name' => ['text', 60], 'link' => ['url'], 'anim' => ['enum', ANIMS], 'ph' => ['text', 80],
    'role' => ['enum', ['title', 'subtitle', 'heading', 'body', 'caption', 'quote', 'big', 'label', '']],
    'html' => ['rich'],
    'font' => ['font'], 'size' => ['num', 4, 800], 'color' => ['color'], 'align' => ['enum', ['left', 'center', 'right', 'justify']],
    'va' => ['enum', ['top', 'middle', 'bottom']], 'lh' => ['num', 0.6, 4], 'ls' => ['num', -20, 100],
    'bold' => ['bool'], 'italic' => ['bool'], 'under' => ['bool'], 'caps' => ['bool'], 'pad' => ['num', 0, 400],
    'fill' => ['fill'], 'stroke' => ['color'], 'sw' => ['num', 0, 200], 'dash' => ['enum', ['', 'dash', 'dot']],
    'rad' => ['num', 0, 2000], 'shadow' => ['num', 0, 3],
    'shape' => ['enum', SHAPES], 'h1' => ['enum', ['', 'arrow', 'dot']], 'h2' => ['enum', ['', 'arrow', 'dot']],
    'src' => ['media'], 'fit' => ['enum', ['cover', 'contain']], 'fx' => ['num', 0, 1], 'fy' => ['num', 0, 1], 'zoom' => ['num', 1, 8],
    'flip' => ['bool'], 'mask' => ['enum', SHAPES], 'alt' => ['text', 300], 'credit' => ['text', 300], 'creditUrl' => ['url'], 'cite' => ['enum', ['', 'in', 'below']],
    'ct' => ['enum', ['bar', 'stack', 'hbar', 'line', 'area', 'pie', 'donut', 'radar', 'scatter']], 'chart' => ['chart'], 'legend' => ['bool'], 'vals' => ['bool'],
    'cells' => ['cells'], 'hd' => ['bool'], 'zebra' => ['bool'], 'ic' => ['text', 30],
    'kind' => ['enum', ['youtube', 'vimeo', 'file']], 'vid' => ['video'], 'poster' => ['media'], 'auto' => ['bool'], 'loop' => ['bool'], 'mute' => ['bool'], 'start' => ['num', 0, 86400],
];
const SLIDE_FIELDS = [
    'layout' => ['enum', ['', 'cover', 'section', 'title-body', 'two-cols', 'three-cards', 'statement', 'quote', 'image-left', 'image-right', 'image-full', 'number', 'numbers', 'timeline', 'compare', 'gallery', 'list', 'agenda', 'closing', 'blank', 'caption', 'chart', 'table', 'steps', 'swot', 'team', 'icons', 'big-image', 'checklist', 'certificate', 'menu', 'quiz', 'contacts', 'pricing']],
    'variant' => ['enum', ['content', 'cover', 'section', 'plain']],
    'bg' => ['bg'], 'name' => ['text', 60], 'grid' => ['grid'], 'notes' => ['text', 8000], 'tr' => ['enum', TRANSITIONS], 'hide' => ['bool'],
];

function clean_num($v, float $min, float $max): ?float
{
    if (!is_numeric($v)) return null;
    $v = (float)$v;
    if (!is_finite($v)) return null;
    return round(max($min, min($max, $v)), 4);
}

function clean_text($v, int $max): string
{
    if (!is_string($v) && !is_numeric($v)) return '';
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', str_replace(["\r\n", "\r"], "\n", (string)$v)) ?? '';
    return mb_substr($v, 0, $max);
}

function clean_color($v): ?string
{
    if (!is_string($v)) return null;
    if ($v === '' || in_array($v, COLOR_TOKENS, true)) return $v;
    return preg_match('/^#[0-9a-f]{6}([0-9a-f]{2})?$/i', $v) ? strtolower($v) : null;
}

/** A fill: a colour, '' (none) or a gradient "g|angle|colour|colour". */
function clean_fill($v): ?string
{
    if (is_string($v) && strpos($v, 'g|') === 0) {
        $p = explode('|', $v);
        if (count($p) !== 4) return null;
        $a = clean_num($p[1], 0, 360);
        $c1 = clean_color($p[2]);
        $c2 = clean_color($p[3]);
        return $a === null || !$c1 || !$c2 ? null : "g|$a|$c1|$c2";
    }
    return clean_color($v);
}

function clean_link($v): string
{
    $v = trim(clean_text($v, 1000));
    return preg_match('~^(https?://|mailto:)[^\s<>"\x27]+$~i', $v) || preg_match('~^#s:[A-Za-z0-9_-]{4,16}$~', $v) ? $v : '';
}

function clean_media($v): string
{
    return is_string($v) && preg_match('~^m:[a-f0-9]{32}$~', $v) ? $v : '';
}

/** YouTube/Vimeo ids, an uploaded video or the https address of a video file. */
function clean_video($v): string
{
    $v = trim(clean_text($v, 1000));
    if (preg_match('~^[A-Za-z0-9_-]{6,20}$~', $v) || preg_match('~^m:[a-f0-9]{32}$~', $v)) return $v;
    return preg_match('~^https://[^\s<>"\x27]+$~i', $v) ? $v : '';
}

function clean_bg($v): ?array
{
    if (!is_array($v)) return null;
    switch ($v['t'] ?? '') {
        case 'c':
            $c = clean_color($v['c'] ?? '');
            return $c ? ['t' => 'c', 'c' => $c] : null;
        case 'g':
            $a = clean_color($v['a'] ?? '');
            $b = clean_color($v['b'] ?? '');
            return $a && $b ? ['t' => 'g', 'a' => $a, 'b' => $b, 'ang' => clean_num($v['ang'] ?? 135, 0, 360) ?? 135] : null;
        case 'i':
            $src = clean_media($v['src'] ?? '');
            return $src ? ['t' => 'i', 'src' => $src, 'dim' => clean_num($v['dim'] ?? 0, 0, 0.95) ?? 0, 'fx' => clean_num($v['fx'] ?? .5, 0, 1) ?? .5, 'fy' => clean_num($v['fy'] ?? .5, 0, 1) ?? .5,
                'credit' => clean_text($v['credit'] ?? '', 300), 'creditUrl' => clean_link($v['creditUrl'] ?? '')] : null;
    }
    return null;
}

/** The data of a chart: labels and series of numbers. */
function clean_chart($v): ?array
{
    if (!is_array($v)) return null;
    $labels = array_map(fn($x) => clean_text($x, 60), array_slice(array_values((array)($v['labels'] ?? [])), 0, 40));
    $series = [];
    foreach (array_slice(array_values((array)($v['series'] ?? [])), 0, 8) as $s) {
        if (!is_array($s)) continue;
        $series[] = ['name' => clean_text($s['name'] ?? '', 60), 'values' => array_map(fn($x) => clean_num($x, -1e12, 1e12) ?? 0, array_slice(array_values((array)($s['values'] ?? [])), 0, 40))];
    }
    return ['labels' => $labels, 'series' => $series];
}

/** The grid of a page of the simple mode: cells [x, y, w, h] on a 12 x 12 board, and the gap between them. m = 0: the board is the whole page. */
function clean_grid($v): ?array
{
    if (!is_array($v) || !is_array($v['c'] ?? null)) return null;
    $cells = [];
    foreach (array_slice(array_values($v['c']), 0, 24) as $c) {
        if (!is_array($c) || count($c) !== 4) continue;
        [$x, $y, $w, $h] = array_map(fn($n) => clean_num($n, 0, 12) ?? 0, array_values($c));
        if ($w >= .1 && $h >= .1 && $x + $w <= 12.01 && $y + $h <= 12.01) $cells[] = [$x, $y, $w, $h];
    }
    return $cells ? ['c' => $cells, 'g' => clean_num($v['g'] ?? 24, 0, 80) ?? 24] + (isset($v['m']) ? ['m' => 0] : []) : null;
}

/** The place of an element inside its cell, in fractions of it. */
function clean_rect($v): ?array
{
    if (!is_array($v) || count($v) !== 4) return null;
    $v = array_map(fn($n) => clean_num($n, -2, 3), array_values($v));
    return in_array(null, $v, true) || $v[2] <= 0 || $v[3] <= 0 ? null : $v;
}

/** The cells of a table: at most 30 rows of 12 plain texts. */
function clean_cells($v): ?array
{
    if (!is_array($v)) return null;
    $out = [];
    foreach (array_slice(array_values($v), 0, 30) as $r) $out[] = array_map(fn($x) => clean_text($x, 300), array_slice(array_values((array)$r), 0, 12));
    return $out;
}

/** Keeps only the known fields, each with its own check. A field set to null is removed from the element. */
function clean_fields($src, array $fields): array
{
    $out = [];
    if (!is_array($src)) return $out;
    foreach ($fields as $k => $f) {
        if (!array_key_exists($k, $src)) continue;
        $v = $src[$k];
        if ($v === null) {
            $out[$k] = null;
            continue;
        }
        switch ($f[0]) {
            case 'num':
                $v = clean_num($v, $f[1], $f[2]);
                break;
            case 'bool':
                $v = $v ? 1 : 0;
                break;
            case 'font':
                $v = valid_font($v) ? $v : null;
                break;
            case 'enum':
                $v = in_array($v, $f[1], true) ? $v : null;
                break;
            case 'text':
                $v = clean_text($v, $f[1]);
                break;
            case 'color':
                $v = clean_color($v);
                break;
            case 'fill':
                $v = clean_fill($v);
                break;
            case 'url':
                $v = clean_link($v);
                break;
            case 'media':
                $v = clean_media($v);
                break;
            case 'video':
                $v = clean_video($v);
                break;
            case 'rich':
                $v = clean_rich($v);
                break;
            case 'bg':
                $v = clean_bg($v);
                break;
            case 'key':
                $v = valid_key($v) ? $v : null;
                break;
            case 'chart':
                $v = clean_chart($v);
                break;
            case 'rect':
                $v = clean_rect($v);
                break;
            case 'grid':
                $v = clean_grid($v);
                break;
            case 'cells':
                $v = clean_cells($v);
                break;
            default:
                $v = null;
        }
        $out[$k] = $v;
    }
    return $out;
}

function drop_nulls(array $a): array
{
    return array_filter($a, fn($v) => $v !== null);
}

/** A whole element, or null when it cannot be one. */
function clean_element($src): ?array
{
    $el = drop_nulls(clean_fields($src, ELEMENT_FIELDS));
    foreach (['t', 'x', 'y', 'w', 'h'] as $k) if (!isset($el[$k])) return null;
    return $el;
}

function valid_key($v): bool
{
    return is_string($v) && preg_match('/^[A-Za-z][A-Za-z0-9_-]{3,15}$/', $v) === 1;
}

/** The content of a slide: its own fields plus els (object of elements by id). */
function clean_slide($src): array
{
    $d = drop_nulls(clean_fields($src, SLIDE_FIELDS));
    $els = [];
    foreach (is_array($src['els'] ?? null) ? $src['els'] : [] as $id => $el) {
        if (!valid_key((string)$id) || count($els) >= 300) continue;
        $c = clean_element($el);
        if ($c) $els[(string)$id] = $c;
    }
    $d['els'] = $els;
    return $d;
}

function slide_json(array $d): string
{
    if (empty($d['els'])) $d['els'] = new stdClass();
    return json_out($d);
}

function clean_hex_map($src, array $keys): array
{
    $out = [];
    foreach ($keys as $k) {
        $c = is_array($src) ? ($src[$k] ?? null) : null;
        if (is_string($c) && preg_match('/^#[0-9a-f]{6}$/i', $c)) $out[$k] = strtolower($c);
    }
    return $out;
}

/** Format, theme and options of a presentation. */
function clean_meta($src): array
{
    $f = is_array($src['format'] ?? null) ? $src['format'] : [];
    $th = is_array($src['theme'] ?? null) ? $src['theme'] : [];
    $o = is_array($src['opts'] ?? null) ? $src['opts'] : [];
    $fonts = [];
    foreach (['head', 'body'] as $k) if (valid_font($th['fonts'][$k] ?? null) && $th['fonts'][$k][0] !== '@') $fonts[$k] = $th['fonts'][$k];
    // typefaces that are not included: where they come from, their name and kind
    $extra = [];
    foreach (array_slice(is_array($src['fonts'] ?? null) ? $src['fonts'] : [], 0, 24) as $x) {
        if (!is_array($x) || !valid_font($x['id'] ?? null) || in_array($x['id'], FONT_IDS, true)) continue;
        if (!is_string($x['n'] ?? null) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9 \-]{0,59}$/', $x['n'])) continue;
        $extra[] = ['id' => $x['id'], 'n' => $x['n'], 'c' => in_array($x['c'] ?? '', ['sans-serif', 'serif', 'monospace', 'cursive', 'display'], true) ? $x['c'] : 'sans-serif'];
    }
    $colors = clean_hex_map($th['colors'] ?? null, ['bg', 'fg', 'muted', 'accent', 'accent2', 'surface', 'onaccent']);
    return [
        'format' => ['id' => preg_match('/^[a-z0-9-]{1,16}$/', (string)($f['id'] ?? '')) ? (string)$f['id'] : '16-9', 'w' => (int)(clean_num($f['w'] ?? 1280, 200, 4000) ?? 1280), 'h' => (int)(clean_num($f['h'] ?? 720, 200, 4000) ?? 720)],
        'theme' => ['id' => preg_match('/^[a-z0-9-]{1,24}$/', (string)($th['id'] ?? '')) ? (string)$th['id'] : 'paper', 'colors' => $colors ?: new stdClass(), 'fonts' => $fonts ?: new stdClass()],
        'fonts' => $extra,
        'opts' => [
            'numbers' => !empty($o['numbers']), 'footer' => clean_text($o['footer'] ?? '', 120), 'tr' => in_array($o['tr'] ?? '', TRANSITIONS, true) ? ($o['tr'] ?? '') : '',
            'download' => !isset($o['download']) || !empty($o['download']), 'copy' => !isset($o['copy']) || !empty($o['copy']), 'comments' => !isset($o['comments']) || !empty($o['comments']),
            'loop' => !empty($o['loop']), 'auto' => (int)(clean_num($o['auto'] ?? 0, 0, 600) ?? 0), 'credits' => !empty($o['credits']), 'lang' => preg_match('/^[a-z]{2}$/', (string)($o['lang'] ?? '')) ? (string)$o['lang'] : '',
        ],
    ];
}

/** Rich text: b, i, u, s, sup, sub, a, br, p, ul, ol, li and span with a colour, size or typeface. */
function clean_rich($html): string
{
    if (!is_string($html) || trim($html) === '') return '';
    $html = mb_substr($html, 0, 40000);
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><div id="r">' . $html . '</div>', LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    $root = $doc->getElementById('r');
    return $root ? trim(rich_children($root)) : '';
}

function rich_children(DOMNode $node, int $depth = 0): string
{
    static $allowed = ['b' => 'b', 'strong' => 'b', 'i' => 'i', 'em' => 'i', 'u' => 'u', 's' => 's', 'strike' => 's', 'sup' => 'sup', 'sub' => 'sub', 'p' => 'p', 'div' => 'p', 'ul' => 'ul', 'ol' => 'ol', 'li' => 'li',
        'h1' => 'p', 'h2' => 'p', 'h3' => 'p', 'h4' => 'p', 'blockquote' => 'p'];
    $out = '';
    if ($depth > 12) return e($node->textContent ?? '');
    foreach ($node->childNodes as $c) {
        if ($c instanceof DOMText) {
            $out .= e($c->nodeValue ?? '');
            continue;
        }
        if (!$c instanceof DOMElement) continue;
        $tag = strtolower($c->tagName);
        if (in_array($tag, ['script', 'style', 'iframe', 'object', 'embed', 'head', 'title', 'template', 'svg', 'math', 'textarea', 'noscript'], true)) continue;
        if ($tag === 'br') {
            $out .= '<br>';
            continue;
        }
        $inner = rich_children($c, $depth + 1);
        if ($tag === 'a') {
            $href = clean_link($c->getAttribute('href'));
            $out .= $href !== '' ? '<a href="' . e($href) . '">' . $inner . '</a>' : $inner;
            continue;
        }
        if ($tag === 'span') {
            $attrs = '';
            $col = clean_color($c->getAttribute('data-c'));
            if ($col) $attrs .= ' data-c="' . e($col) . '"';
            $size = clean_num($c->getAttribute('data-s'), 0.2, 5);
            if ($size) $attrs .= ' data-s="' . $size . '"';
            $font = $c->getAttribute('data-f');
            if (valid_font($font) && $font[0] !== '@') $attrs .= ' data-f="' . e($font) . '"';
            $mark = clean_color($c->getAttribute('data-m'));
            if ($mark) $attrs .= ' data-m="' . e($mark) . '"';
            $out .= $attrs ? "<span$attrs>$inner</span>" : $inner;
            continue;
        }
        if (isset($allowed[$tag])) {
            $tg = $allowed[$tag];
            if ($tg === 'p') {
                // a block inside a block (pasted content) would nest paragraphs: keep its text only
                if ($node instanceof DOMElement && in_array(strtolower($node->tagName), ['p', 'li'], true)) {
                    $out .= $inner . '<br>';
                    continue;
                }
                $al = $c->getAttribute('data-a');
                $out .= '<p' . (in_array($al, ['left', 'center', 'right'], true) ? ' data-a="' . $al . '"' : '') . '>' . $inner . '</p>';
                continue;
            }
            $out .= "<$tg>$inner</$tg>";
            continue;
        }
        $out .= $inner;
    }
    return $out;
}

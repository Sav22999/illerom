<?php
/**
 * SavBooks — what a document may contain. Everything the browsers send passes from here before it is stored:
 * only known elements, attributes and styles survive (same list as assets/clean.js).
 */

declare(strict_types=1);

const TAGS = ['p' => 1, 'h1' => 1, 'h2' => 1, 'h3' => 1, 'h4' => 1, 'ul' => 1, 'ol' => 1, 'li' => 1, 'blockquote' => 1, 'pre' => 1, 'code' => 1, 'div' => 1, 'hr' => 1,
    'table' => 1, 'colgroup' => 1, 'col' => 1, 'tbody' => 1, 'tr' => 1, 'td' => 1, 'th' => 1, 'figure' => 1, 'img' => 1, 'figcaption' => 1,
    'span' => 1, 'strong' => 1, 'em' => 1, 'u' => 1, 's' => 1, 'sub' => 1, 'sup' => 1, 'a' => 1, 'br' => 1];
const TOP_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote', 'pre', 'div', 'hr', 'table', 'figure'];
const RENAME = ['b' => 'strong', 'i' => 'em', 'strike' => 's', 'del' => 's', 'ins' => 'u', 'h5' => 'h4', 'h6' => 'h4', 'thead' => 'tbody', 'tfoot' => 'tbody'];
const DROP = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'head', 'title'];
const CLASSES = ['title', 'subtitle', 'lead', 'small', 'drop', 'eq', 'callout', 'toc', 'pb', 'beside', 'check', 'fn', 'plain', 'striped', 'bare', 'headcol', 'math', 'thick', 'dash', 'dots', 'dbl', 'short', 'orn'];
const COLOR_RE = '/^(#[0-9a-f]{3,8}|rgba?\([0-9., %]+\))$/i';
const STYLE_RE = [
    'text-align' => '/^(left|center|right|justify|start|end)$/',
    'color' => COLOR_RE, 'background-color' => COLOR_RE,
    'font-family' => '/^[A-Za-z0-9 ,"\'-]{1,80}$/',
    'font-size' => '/^\d{1,3}(\.\d{1,2})?(pt|px)$/',
    'line-height' => '/^\d(\.\d{1,2})?$/',
    'margin-left' => '/^\d{1,3}(\.\d{1,2})?(pt|px|em)$/', 'text-indent' => '/^\d{1,3}(\.\d{1,2})?(pt|px|em)$/',
    'margin-top' => '/^\d{1,3}(\.\d{1,2})?(pt|px)$/', 'margin-bottom' => '/^\d{1,3}(\.\d{1,2})?(pt|px)$/',
    'vertical-align' => '/^(top|middle|bottom)$/', 'width' => '/^\d{1,3}(\.\d{1,3})?%$/',
    'letter-spacing' => '/^-?\d(\.\d{1,2})?(pt|px|em)$/', 'font-variant' => '/^small-caps$/',
];

function clean_style(string $css): string
{
    $out = [];
    foreach (explode(';', $css) as $d) {
        $i = strpos($d, ':');
        if ($i === false) continue;
        $k = strtolower(trim(substr($d, 0, $i)));
        $v = trim(substr($d, $i + 1));
        if (isset(STYLE_RE[$k]) && preg_match(STYLE_RE[$k], $v)) $out[$k] = $k . ':' . $v;
    }
    return implode(';', $out);
}

function clean_href(string $v): string
{
    $v = trim(preg_replace('/[\x00-\x20\x7F]+/', '', $v) ?? '');
    if (preg_match('/^#b-[a-z0-9]{4,12}$/', $v)) return $v;
    return preg_match('#^(https?://|mailto:|tel:)#i', $v) && strlen($v) <= 2000 ? $v : '';
}

/** Charts, diagrams, shapes, icons, QR codes, signatures: same fields and limits of assets/objects.js. */
function clean_object($o): ?array
{
    if (!is_array($o)) return null;
    $str = fn($v, int $n): string => is_string($v) || is_int($v) || is_float($v) ? mb_substr(preg_replace('/[\x00-\x1F]/u', ' ', (string)$v) ?? '', 0, $n) : '';
    $col = fn($v): string => is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtolower($v) : '';
    $num = fn($v, float $a, float $b, float $d) => is_numeric($v) && is_finite((float)$v) ? round(max($a, min($b, (float)$v)), 3) + 0 : $d + 0;
    $one = fn($v, array $list, $d) => in_array($v, $list, true) ? $v : $d;
    $list = fn($v, int $n): array => array_slice(is_array($v) ? array_values($v) : [], 0, $n);
    $r = $num($o['r'] ?? null, 0.02, 3, 0.56);
    switch ($o['k'] ?? '') {
        case 'chart':
            return ['k' => 'chart', 't' => $one($o['t'] ?? '', ['bar', 'stack', 'hbar', 'line', 'area', 'pie', 'donut', 'radar', 'scatter'], 'bar'), 'l' => array_map(fn($x) => $str($x, 60), $list($o['l'] ?? null, 40)),
                's' => array_map(fn($x) => ['n' => $str($x['n'] ?? '', 60), 'v' => array_map(fn($y) => $num($y, -1e12, 1e12, 0), $list($x['v'] ?? null, 40))], array_filter($list($o['s'] ?? null, 8), 'is_array')),
                'g' => ($o['g'] ?? 1) === 0 ? 0 : 1, 'v' => ($o['v'] ?? 0) === 1 ? 1 : 0, 'x' => $str($o['x'] ?? '', 120), 'c' => $col($o['c'] ?? ''), 'r' => $r];
        case 'flow':
            return ['k' => 'flow', 't' => $one($o['t'] ?? '', ['process', 'cycle', 'pyramid', 'timeline', 'steps', 'list'], 'process'), 'i' => array_map(fn($x) => $str($x, 120), $list($o['i'] ?? null, 10)), 'c' => $col($o['c'] ?? ''), 'r' => $r];
        case 'shape':
            return ['k' => 'shape', 's' => is_string($o['s'] ?? null) && preg_match('/^[a-z0-9]{2,16}$/', $o['s']) ? $o['s'] : 'rect', 'f' => ($o['f'] ?? '') === 'none' ? 'none' : $col($o['f'] ?? ''), 'b' => $col($o['b'] ?? ''), 'w' => $num($o['w'] ?? null, 0, 20, 0),
                'd' => ($o['d'] ?? 0) === 1 ? 1 : 0, 'x' => $str($o['x'] ?? '', 300), 'tc' => $col($o['tc'] ?? ''), 'ts' => $num($o['ts'] ?? null, 6, 90, 14), 'h' => $one($o['h'] ?? '', ['', 'end', 'both'], ''), 'r' => $r];
        case 'icon':
            return ['k' => 'icon', 'n' => is_string($o['n'] ?? null) && preg_match('/^[a-z0-9-]{1,40}$/', $o['n']) ? $o['n'] : 'star', 'c' => $col($o['c'] ?? ''), 'w' => $num($o['w'] ?? null, 0.5, 4, 2)];
        case 'qr':
            return ['k' => 'qr', 'x' => $str($o['x'] ?? '', 350), 'c' => $col($o['c'] ?? '')];
        case 'sign':
            return ['k' => 'sign', 'x' => $str($o['x'] ?? '', 120), 'd' => $str($o['d'] ?? '', 120)];
    }
    return null;
}

function clean_node(DOMNode $n, int $depth = 0): string
{
    if ($n instanceof DOMText) return htmlspecialchars(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $n->nodeValue) ?? '', ENT_NOQUOTES, 'UTF-8');
    if (!$n instanceof DOMElement || $depth > 40) return '';
    $tag = strtolower($n->nodeName);
    $tag = RENAME[$tag] ?? $tag;
    if (in_array($tag, DROP, true)) return '';
    $inner = '';
    foreach ($n->childNodes as $c) $inner .= clean_node($c, $depth + 1);
    if (!isset(TAGS[$tag])) return $inner;
    $at = '';
    $add = function (string $k, string $v) use (&$at) {
        $at .= ' ' . $k . '="' . htmlspecialchars($v, ENT_QUOTES, 'UTF-8') . '"';
    };
    $cls = array_values(array_intersect(preg_split('/\s+/', (string)$n->getAttribute('class')) ?: [], CLASSES));
    if ($cls) $add('class', implode(' ', $cls));
    $style = clean_style((string)$n->getAttribute('style'));
    if ($style !== '') $add('style', $style);
    $num = function (string $k, int $max) use ($n, $add) {
        $v = (int)$n->getAttribute($k);
        if ($v > 1 && $v <= $max) $add($k, (string)$v);
    };
    switch ($tag) {
        case 'a':
            $h = clean_href((string)$n->getAttribute('href'));
            if ($h === '') return $inner;
            $add('href', $h);
            break;
        case 'img':
            $id = (string)$n->getAttribute('data-i');
            if (!preg_match('/^[a-f0-9]{24}$/', $id)) return '';
            $add('data-i', $id);
            $add('alt', mb_substr((string)$n->getAttribute('alt'), 0, 500));
            return "<img$at>";
        case 'figure':
            if (preg_match('/^(l|c|r)$/', (string)$n->getAttribute('data-a'))) $add('data-a', $n->getAttribute('data-a'));
            $w = (int)$n->getAttribute('data-w');
            if ($w >= 5 && $w <= 100) $add('data-w', (string)$w);
            if ($n->hasAttribute('data-o')) {
                $o = clean_object(json_decode((string)$n->getAttribute('data-o'), true, 8));
                if (!$o) return '';
                $add('data-o', json_out($o));
            }
            break;
        case 'div':
            if (!$cls) return $depth === 0 ? "<p>$inner</p>" : $inner;
            if (preg_match('/^(info|tip|warn|note|l|r|f|t)$/', (string)$n->getAttribute('data-k'))) $add('data-k', $n->getAttribute('data-k'));
            if (in_array('toc', $cls, true) && preg_match('/^[1-3]$/', (string)$n->getAttribute('data-l'))) $add('data-l', $n->getAttribute('data-l'));
            if (in_array('toc', $cls, true) || in_array('pb', $cls, true)) return "<div$at></div>";
            break;
        case 'li':
            if ($n->getAttribute('data-c') === '1') $add('data-c', '1');
            break;
        case 'ol':
            $num('start', 9999);
            if (preg_match('/^(a|A|i|I)$/', (string)$n->getAttribute('type'))) $add('type', $n->getAttribute('type'));
            break;
        case 'sup':
            if (in_array('fn', $cls, true)) {
                $add('data-n', mb_substr((string)$n->getAttribute('data-n'), 0, 2000));
                return "<sup$at></sup>";
            }
            break;
        case 'td':
        case 'th':
            $num('colspan', 30);
            $num('rowspan', 200);
            break;
        case 'col':
            return "<col$at>";
        case 'hr':
            return "<hr$at>";
        case 'br':
            return '<br>';
        case 'span':
            if (in_array('math', $cls, true)) return '<span class="math" data-m="' . htmlspecialchars(mb_substr((string)$n->getAttribute('data-m'), 0, 800), ENT_QUOTES, 'UTF-8') . '"></span>';
            if ($at === '') return $inner;
            break;
    }
    return "<$tag$at>$inner</$tag>";
}

/** The HTML of one block: exactly one known element, or '' when nothing is left. */
function clean_block($html): string
{
    if (!is_string($html) || $html === '' || strlen($html) > MAX_BLOCK_BYTES) return '';
    $d = new DOMDocument();
    libxml_use_internal_errors(true);
    $ok = $d->loadHTML('<?xml encoding="UTF-8"><html><body>' . $html . '</body></html>', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
    libxml_clear_errors();
    $body = $ok ? $d->getElementsByTagName('body')->item(0) : null;
    if (!$body) return '';
    $out = '';
    foreach ($body->childNodes as $n) {
        if ($n instanceof DOMElement) {
            $c = clean_node($n);
            if ($c === '') continue;
            if (!preg_match('/^<([a-z0-9]+)/', $c, $m) || !in_array($m[1], TOP_TAGS, true)) $c = "<p>$c</p>";
            $out = $c;
            break;
        }
        if ($n instanceof DOMText && trim($n->nodeValue) !== '') {
            $out = '<p>' . clean_node($n) . '</p>';
            break;
        }
    }
    return $out;
}

const PAGE_SIZES = ['A3', 'A4', 'A5', 'A6', 'B5', 'Letter', 'Legal', 'Tabloid', 'Trade', 'Digest', 'Pocket', 'Royal', 'custom'];
const COVER_DESIGNS = ['classic', 'modern', 'band', 'minimal', 'bold', 'photo', 'art'];

/** The details of a book (settings.book): the same fields as BOOK in assets/book.js. */
function clean_book($b): array
{
    $b = is_array($b) ? $b : [];
    $text = fn($v, int $max) => is_string($v) ? mb_substr(trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? ''), 0, $max) : '';
    $line = fn($v, int $max) => is_string($v) ? mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v) ?? ''), 0, $max) : '';
    $font = $line($b['cf'] ?? '', 60);
    return [
        'sub' => $line($b['sub'] ?? '', 160), 'author' => $line($b['author'] ?? '', 300), 'series' => $line($b['series'] ?? '', 160), 'seriesNo' => $line($b['seriesNo'] ?? '', 8),
        'publisher' => $line($b['publisher'] ?? '', 160), 'date' => is_string($b['date'] ?? null) && preg_match('/^\d{4}(-\d\d(-\d\d)?)?$/', $b['date']) ? $b['date'] : '',
        'isbn' => $line(preg_replace('/[^0-9Xx\- ]/', '', (string)($b['isbn'] ?? '')) ?? '', 20), 'desc' => $text($b['desc'] ?? '', 4000), 'subjects' => $line($b['subjects'] ?? '', 300),
        'rights' => $line($b['rights'] ?? '', 300), 'dedication' => $text($b['dedication'] ?? '', 600),
        'cover' => is_string($b['cover'] ?? null) && preg_match('/^[a-f0-9]{24}$/', $b['cover']) ? $b['cover'] : '',
        'cv' => in_array($b['cv'] ?? '', COVER_DESIGNS, true) ? $b['cv'] : 'classic',
        'cc' => is_string($b['cc'] ?? null) && preg_match('/^#[0-9a-f]{6}$/i', $b['cc']) ? strtolower($b['cc']) : '#8a2346',
        'cf' => preg_match('/^[A-Za-z0-9][A-Za-z0-9 \-]{0,59}$/', $font) ? $font : '',
        'titlePage' => !array_key_exists('titlePage', $b) || !empty($b['titlePage']), 'copyPage' => !array_key_exists('copyPage', $b) || !empty($b['copyPage']),
        'tocPage' => !array_key_exists('tocPage', $b) || !empty($b['tocPage']),
        'chap' => in_array($b['chap'] ?? '', ['', 'n', 'w', 'r', 'o'], true) ? $b['chap'] : '', 'indent' => !empty($b['indent']),
        'uid' => is_string($b['uid'] ?? null) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $b['uid']) ? $b['uid'] : '',
    ];
}

function clean_settings($s): array
{
    $s = is_array($s) ? $s : [];
    $num = function ($v, float $min, float $max, float $def): float {
        return is_numeric($v) ? round(max($min, min($max, (float)$v)), 2) : $def;
    };
    $line = fn($v) => is_string($v) ? mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v) ?? ''), 0, 120) : '';
    $zone = function ($z) use ($line): array {
        $z = is_array($z) ? $z : [];
        return ['l' => $line($z['l'] ?? ''), 'c' => $line($z['c'] ?? ''), 'r' => $line($z['r'] ?? '')];
    };
    // any typeface by name (the included ones, Bunny Fonts, from file): the list "fonts" says where the others come from
    $font = fn($v, $def) => is_string($v) && preg_match('/^[A-Za-z0-9][A-Za-z0-9 \-]{0,59}$/', $v) ? $v : $def;
    $fonts = [];
    foreach (array_slice(is_array($s['fonts'] ?? null) ? $s['fonts'] : [], 0, 24) as $f) {
        if (!is_array($f) || !is_string($f['n'] ?? null) || !preg_match('/^[A-Za-z0-9][A-Za-z0-9 \-]{0,59}$/', $f['n'])) continue;
        $o = ['n' => $f['n'], 'c' => in_array($f['c'] ?? '', ['sans-serif', 'serif', 'display', 'handwriting', 'monospace'], true) ? $f['c'] : 'sans-serif'];
        if (is_string($f['b'] ?? null) && preg_match('/^[a-z0-9][a-z0-9\-]{0,59}$/', $f['b'])) $o['b'] = $f['b'];
        elseif (is_string($f['f'] ?? null) && preg_match('/^[a-f0-9]{24}$/', $f['f'])) $o['f'] = $f['f'];
        else continue;
        $fonts[] = $o;
    }
    $color = fn($v, $def) => is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? strtolower($v) : $def;
    return [
        'size' => in_array($s['size'] ?? '', PAGE_SIZES, true) ? $s['size'] : 'A4',
        'w' => $num($s['w'] ?? null, 50, 600, 210), 'h' => $num($s['h'] ?? null, 50, 600, 297),
        'landscape' => !empty($s['landscape']),
        'mt' => $num($s['mt'] ?? null, 0, 100, 25), 'mr' => $num($s['mr'] ?? null, 0, 100, 25), 'mb' => $num($s['mb'] ?? null, 0, 100, 25), 'ml' => $num($s['ml'] ?? null, 0, 100, 25),
        'header' => $zone($s['header'] ?? null), 'footer' => $zone($s['footer'] ?? null), 'firstPage' => !array_key_exists('firstPage', $s) || !empty($s['firstPage']),
        'font' => $font($s['font'] ?? '', 'Source Sans 3'), 'headFont' => $font($s['headFont'] ?? '', 'Source Sans 3'),
        'fontSize' => $num($s['fontSize'] ?? null, 6, 40, 11), 'line' => $num($s['line'] ?? null, 1, 3, 1.5), 'gap' => $num($s['gap'] ?? null, 0, 40, 8),
        'color' => $color($s['color'] ?? '', '#1c1c1c'), 'headColor' => $color($s['headColor'] ?? '', '#1c1c1c'),
        'accent' => $color($s['accent'] ?? '', '#8a2346'), 'bg' => $color($s['bg'] ?? '', '#ffffff'),
        'border' => in_array($s['border'] ?? '', ['thin', 'thick', 'double', 'dashed'], true) ? $s['border'] : '', 'borderColor' => $color($s['borderColor'] ?? '', '#8a2346'),
        'mark' => mb_substr($line($s['mark'] ?? ''), 0, 40), 'startPage' => (int)$num($s['startPage'] ?? null, 0, 9999, 1), 'bandLine' => !empty($s['bandLine']), 'capNum' => !empty($s['capNum']),
        'numbered' => !empty($s['numbered']), 'justify' => !empty($s['justify']),
        'fonts' => $fonts,
        // what who only reads (or comments) may do
        'noComments' => !empty($s['noComments']), 'noDownload' => !empty($s['noDownload']), 'noCopy' => !empty($s['noCopy']),
        'lang' => is_string($s['lang'] ?? null) && preg_match('/^[a-z]{2}(-[A-Z]{2})?$/', $s['lang']) ? $s['lang'] : 'en',
        'book' => clean_book($s['book'] ?? null),
    ];
}

function valid_block_id($id): bool
{
    return is_string($id) && preg_match('/^[a-z0-9]{4,12}$/', $id) === 1;
}

/** A whole document (import, template, restored version). */
function clean_doc($doc): array
{
    $doc = is_array($doc) ? $doc : [];
    $blocks = [];
    $seen = [];
    foreach (array_slice(is_array($doc['blocks'] ?? null) ? $doc['blocks'] : [], 0, 20000) as $b) {
        $h = clean_block($b['h'] ?? '');
        if ($h === '') continue;
        $id = valid_block_id($b['id'] ?? null) && !isset($seen[$b['id']]) ? $b['id'] : substr(bin2hex(random_bytes(6)), 0, 10);
        $seen[$id] = true;
        $blocks[] = ['id' => $id, 'h' => $h, 'v' => 1];
    }
    if (!$blocks) $blocks[] = ['id' => substr(bin2hex(random_bytes(6)), 0, 10), 'h' => '<p><br></p>', 'v' => 1];
    return ['settings' => clean_settings($doc['settings'] ?? []), 'blocks' => $blocks];
}

function doc_words(array $doc): int
{
    $n = 0;
    foreach ($doc['blocks'] as $b) $n += preg_match_all('/[\p{L}\p{N}][\p{L}\p{N}\p{M}’\'-]*/u', html_entity_decode(strip_tags(str_replace('<', ' <', $b['h'])), ENT_QUOTES, 'UTF-8'));
    return $n;
}

/** Ids of the images a document shows. */
function doc_images(array $doc): array
{
    $ids = [];
    $cover = $doc['settings']['book']['cover'] ?? '';
    if (is_string($cover) && preg_match('/^[a-f0-9]{24}$/', $cover)) $ids[$cover] = true; // the picture of the cover
    foreach ($doc['blocks'] as $b) if (preg_match_all('/data-i="([a-f0-9]{24})"/', $b['h'], $m)) foreach ($m[1] as $id) $ids[$id] = true;
    return array_keys($ids);
}

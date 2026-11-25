<?php
/**
 * SavDocuments — what a document may contain. Everything the browsers send passes from here before it is stored:
 * only known elements, attributes and styles survive (same list as assets/clean.js).
 */

declare(strict_types=1);

const TAGS = ['p' => 1, 'h1' => 1, 'h2' => 1, 'h3' => 1, 'h4' => 1, 'ul' => 1, 'ol' => 1, 'li' => 1, 'blockquote' => 1, 'pre' => 1, 'code' => 1, 'div' => 1, 'hr' => 1,
    'table' => 1, 'colgroup' => 1, 'col' => 1, 'tbody' => 1, 'tr' => 1, 'td' => 1, 'th' => 1, 'figure' => 1, 'img' => 1, 'figcaption' => 1,
    'span' => 1, 'strong' => 1, 'em' => 1, 'u' => 1, 's' => 1, 'sub' => 1, 'sup' => 1, 'a' => 1, 'br' => 1];
const TOP_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote', 'pre', 'div', 'hr', 'table', 'figure'];
const RENAME = ['b' => 'strong', 'i' => 'em', 'strike' => 's', 'del' => 's', 'ins' => 'u', 'h5' => 'h4', 'h6' => 'h4', 'thead' => 'tbody', 'tfoot' => 'tbody'];
const DROP = ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template', 'noscript', 'link', 'meta', 'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'head', 'title'];
const CLASSES = ['title', 'subtitle', 'lead', 'small', 'callout', 'toc', 'pb', 'beside', 'check', 'fn', 'plain', 'striped'];
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
    $add = function (string $k, string $v) use (&$at) { $at .= ' ' . $k . '="' . htmlspecialchars($v, ENT_QUOTES, 'UTF-8') . '"'; };
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
            break;
        case 'div':
            if (!$cls) return $depth === 0 ? "<p>$inner</p>" : $inner;
            if (preg_match('/^(info|tip|warn|note|l|r)$/', (string)$n->getAttribute('data-k'))) $add('data-k', $n->getAttribute('data-k'));
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
            return '<hr>';
        case 'br':
            return '<br>';
        case 'span':
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

const PAGE_SIZES = ['A3', 'A4', 'A5', 'A6', 'B5', 'Letter', 'Legal', 'Tabloid', 'custom'];
const FONTS = ['Inter', 'Lora', 'Montserrat', 'Open Sans', 'Playfair Display', 'Poppins', 'Source Sans 3', 'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Garamond', 'Verdana', 'Courier New'];

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
    $font = fn($v, $def) => in_array($v, FONTS, true) ? $v : $def;
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
        'numbered' => !empty($s['numbered']), 'justify' => !empty($s['justify']),
        'lang' => is_string($s['lang'] ?? null) && preg_match('/^[a-z]{2}(-[A-Z]{2})?$/', $s['lang']) ? $s['lang'] : 'en',
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
    foreach ($doc['blocks'] as $b) if (preg_match_all('/data-i="([a-f0-9]{24})"/', $b['h'], $m)) foreach ($m[1] as $id) $ids[$id] = true;
    return array_keys($ids);
}

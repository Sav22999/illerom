<?php
/**
 * SavMail — messages as the mail servers keep them (RFC 5322 + MIME): reading them (headers, encoded words, charsets,
 * parts, attachments), making their HTML safe to show, and writing new ones.
 *
 * Safe HTML (ml_sanitize): an allow-list of tags and attributes; scripts, frames, forms, objects, SVG, event handlers and
 * javascript: links are removed; links open in a new tab without the address of SavMail. Pictures from the internet are
 * held back (they tell the sender when and where a message is read) until the person asks for them: the count comes back
 * with the HTML. The app shows the result in an iframe with no scripts at all, so even a mistake here could not run code.
 */

declare(strict_types=1);

const ML_MAX_PARTS = 400;
const ML_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// ---------------------------------------------------------------- charsets and encoded words

/** Bytes in some charset, as UTF-8 (what cannot be read becomes "�"). */
function ml_utf8(string $s, string $charset = ''): string
{
    static $mb = null;
    if ($mb === null) $mb = array_flip(array_map('strtolower', mb_list_encodings()));
    $cs = strtolower(trim($charset, " \t\"'"));
    $cs = ['utf8' => 'utf-8', 'latin1' => 'windows-1252', 'iso-8859-1' => 'windows-1252', 'us-ascii' => '', 'ascii' => '', 'ansi_x3.4-1968' => '', 'ks_c_5601-1987' => 'cp949',
        'gb2312' => 'gbk', 'x-unknown' => '', 'unknown-8bit' => '', 'x-user-defined' => '', 'default' => ''][$cs] ?? $cs;
    if ($cs === '' || $cs === 'utf-8') return mb_check_encoding($s, 'UTF-8') ? $s : ($cs === '' ? mb_convert_encoding($s, 'UTF-8', 'Windows-1252') : mb_scrub($s, 'UTF-8'));
    if (isset($mb[$cs])) { $r = @mb_convert_encoding($s, 'UTF-8', $cs); if (is_string($r)) return $r; }
    $r = @iconv($cs, 'UTF-8//IGNORE', $s);
    if (is_string($r) && $r !== '') return $r;
    return mb_check_encoding($s, 'UTF-8') ? $s : mb_convert_encoding($s, 'UTF-8', 'Windows-1252');
}

/** Decodes the encoded words of a header (=?UTF-8?B?…?=); words next to each other in the same charset are joined first. */
function ml_words(string $v): string
{
    $v = trim($v);
    if (strpos($v, '=?') === false) return ml_utf8($v);
    $re = '/=\?([^?\s]+)\?([bBqQ])\?([^?]*)\?=/';
    $out = '';
    $pend = ['cs' => '', 'bytes' => ''];
    $flush = function () use (&$out, &$pend) { if ($pend['bytes'] !== '') $out .= ml_utf8($pend['bytes'], $pend['cs']); $pend = ['cs' => '', 'bytes' => '']; };
    $pos = 0;
    preg_match_all($re, $v, $all, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
    foreach ($all as $m) {
        $gap = substr($v, $pos, $m[0][1] - $pos);
        if (trim($gap) !== '' || $pos === 0 && $gap !== '') { $flush(); $out .= ml_utf8($gap); }
        $cs = strtolower(explode('*', $m[1][0])[0]);
        $bytes = strtolower($m[2][0]) === 'b' ? (string)base64_decode($m[3][0]) : quoted_printable_decode(str_replace('_', ' ', $m[3][0]));
        if ($pend['cs'] !== $cs) $flush();
        $pend['cs'] = $cs;
        $pend['bytes'] .= $bytes;
        $pos = $m[0][1] + strlen($m[0][0]);
    }
    $flush();
    return $out . ml_utf8(substr($v, $pos));
}

// ---------------------------------------------------------------- headers

/** Headers as [lower-case name => [values…]] (folded lines joined, values still encoded). */
function ml_headers(string $raw): array
{
    $h = [];
    foreach (preg_split('/\r?\n/', preg_replace('/\r?\n[ \t]+/', ' ', $raw) ?? '') as $line) {
        $c = strpos($line, ':');
        if ($c === false || $c === 0) continue;
        $h[strtolower(trim(substr($line, 0, $c)))][] = trim(substr($line, $c + 1));
    }
    return $h;
}

function ml_h(array $h, string $name): string
{
    return (string)($h[$name][0] ?? '');
}

/** "text/plain; charset=utf-8; name*0*=…" → ['text/plain', ['charset' => 'utf-8', 'name' => '…']] (RFC 2231 included). */
function ml_params(string $v): array
{
    $parts = [];
    $cur = '';
    $quote = false;
    for ($i = 0, $n = strlen($v); $i < $n; $i++) {
        $c = $v[$i];
        if ($c === '"' && ($i === 0 || $v[$i - 1] !== '\\')) $quote = !$quote;
        if ($c === ';' && !$quote) { $parts[] = $cur; $cur = ''; continue; }
        $cur .= $c;
    }
    $parts[] = $cur;
    $main = strtolower(trim(array_shift($parts)));
    $raw = [];
    foreach ($parts as $p) {
        $eq = strpos($p, '=');
        if ($eq === false) continue;
        $k = strtolower(trim(substr($p, 0, $eq)));
        $val = trim(substr($p, $eq + 1));
        if (strlen($val) > 1 && $val[0] === '"' && substr($val, -1) === '"') $val = stripcslashes(substr($val, 1, -1));
        $raw[$k] = $val;
    }
    $out = [];
    $multi = [];
    foreach ($raw as $k => $val) {
        if (preg_match('/^([^*]+)\*(\d+)(\*?)$/', $k, $m)) $multi[$m[1]][(int)$m[2]] = [$val, $m[3] === '*'];
        elseif (preg_match('/^([^*]+)\*$/', $k, $m)) $multi[$m[1]][0] = [$val, true];
        else $out[$k] = ml_words($val);
    }
    foreach ($multi as $name => $segs) {
        ksort($segs);
        $cs = '';
        $bytes = '';
        foreach ($segs as $i => [$val, $enc]) {
            if ($enc && $i === 0 && preg_match("/^([^']*)'[^']*'(.*)$/s", $val, $m)) { $cs = $m[1]; $val = $m[2]; }
            $bytes .= $enc ? rawurldecode($val) : $val;
        }
        $out[$name] = ml_utf8($bytes, $cs);
    }
    return [$main, $out];
}

/** "Ada <ada@x.it>, "Rossi, M." <m@y.it>, team: a@b.c;" → [['name' => 'Ada', 'email' => 'ada@x.it'], …] */
function ml_addresses(string $v): array
{
    $v = preg_replace('/^[^:"<@]+:(.*);\s*$/', '$1', trim($v)) ?? $v; // a group: its members
    $items = [];
    $cur = '';
    $q = false;
    $angle = 0;
    $paren = 0;
    for ($i = 0, $n = strlen($v); $i < $n; $i++) {
        $c = $v[$i];
        if ($c === '"' && ($i === 0 || $v[$i - 1] !== '\\')) $q = !$q;
        elseif (!$q && $c === '<') $angle++;
        elseif (!$q && $c === '>') $angle = max(0, $angle - 1);
        elseif (!$q && $c === '(') $paren++;
        elseif (!$q && $c === ')') $paren = max(0, $paren - 1);
        if (($c === ',' || $c === ';') && !$q && !$angle && !$paren) { $items[] = $cur; $cur = ''; continue; }
        $cur .= $c;
    }
    $items[] = $cur;
    $out = [];
    foreach ($items as $it) {
        $it = trim($it);
        if (preg_match('/^[^"<@:]+:\s*(.*)$/s', $it, $g)) $it = trim($g[1]); // the first member of a group ("Team: a@b.c")
        if ($it === '') continue;
        if (preg_match('/^(.*)<([^<>]*)>\s*$/s', $it, $m)) { $name = trim($m[1]); $email = trim($m[2]); }
        else { $name = preg_match('/\(([^)]*)\)/', $it, $c) ? $c[1] : ''; $email = trim(preg_replace('/\([^)]*\)/', '', $it) ?? $it); }
        $name = trim($name);
        if (strlen($name) > 1 && $name[0] === '"' && substr($name, -1) === '"') $name = stripcslashes(substr($name, 1, -1));
        $email = trim($email, " \t'\"");
        if ($email === '' || strpos($email, '@') === false) { if ($name === '' && $email !== '') $name = $email; if ($email === '') continue; }
        $out[] = ['name' => mb_substr(ml_words($name), 0, 200), 'email' => mb_substr(ml_utf8($email), 0, 254)];
        if (count($out) >= 300) break;
    }
    return $out;
}

/** A Date header as ISO 8601 (UTC), or null. */
function ml_date(string $v): ?string
{
    $v = preg_replace('/\s*\([^)]*\)\s*$/', '', trim($v)) ?? $v;
    $t = $v !== '' ? strtotime($v) : false;
    return $t ? gmdate('Y-m-d\TH:i:s\Z', $t) : null;
}

// ---------------------------------------------------------------- parts

/** The tree of a message: ['path', 'type', 'params', 'headers', 'disp', 'filename', 'cid', 'body' (decoded) | 'parts']. */
function ml_parse(string $raw, string $path = '', int &$count = 0, int $depth = 0): array
{
    $a = strpos($raw, "\r\n\r\n");
    $b = strpos($raw, "\n\n");
    if ($a !== false && ($b === false || $a <= $b)) { $head = substr($raw, 0, $a); $body = (string)substr($raw, $a + 4); }
    elseif ($b !== false) { $head = substr($raw, 0, $b); $body = (string)substr($raw, $b + 2); }
    else { $head = $raw; $body = ''; }
    $h = ml_headers($head);
    [$type, $params] = ml_params(ml_h($h, 'content-type') ?: 'text/plain; charset=us-ascii');
    if (!preg_match('~^[a-z0-9.+-]+/[a-z0-9.+-]+$~', $type)) $type = 'text/plain';
    [$disp, $dparams] = ml_params(ml_h($h, 'content-disposition'));
    $part = ['path' => $path === '' ? '1' : $path, 'type' => $type, 'params' => $params, 'headers' => $h, 'disp' => $disp,
        'filename' => trim(str_replace(["\0", '/', '\\'], ['', '_', '_'], $dparams['filename'] ?? $params['name'] ?? '')), 'cid' => trim(ml_h($h, 'content-id'), " <>")];
    $count++;
    if (strpos($type, 'multipart/') === 0 && !empty($params['boundary']) && $depth < 20 && $count < ML_MAX_PARTS) {
        $bd = preg_quote($params['boundary'], '/');
        $chunks = preg_split('/(?:^|\r?\n)--' . $bd . '(--)?[ \t]*(?=\r?\n|$)/', $body, -1, PREG_SPLIT_DELIM_CAPTURE);
        $part['parts'] = [];
        // [preamble, (close?), chunk, (close?), chunk…]: after a "--" (closing) delimiter only the epilogue is left
        for ($i = 1, $k = 1, $n = count($chunks); $i < $n; $i++) {
            if ($chunks[$i] === '--') break;
            if ($chunks[$i] === '') continue;
            $c = preg_replace('/^\r?\n/', '', $chunks[$i]) ?? '';
            $part['parts'][] = ml_parse($c, ($path === '' ? '' : $path . '.') . $k++, $count, $depth + 1);
            if ($count >= ML_MAX_PARTS) break;
        }
        return $part;
    }
    $cte = strtolower(trim(ml_h($h, 'content-transfer-encoding')));
    if ($cte === 'base64') $body = (string)base64_decode(preg_replace('/[^A-Za-z0-9+\/=]/', '', $body) ?? '');
    elseif ($cte === 'quoted-printable') $body = quoted_printable_decode($body);
    $part['body'] = $body;
    return $part;
}

/** What the reader shows: the text (HTML and/or plain), the pictures named by cid:, the attachments. */
function ml_content(array $tree): array
{
    $res = ['html' => [], 'text' => [], 'cid' => [], 'atts' => []];
    $walk = function (array $p, bool $inAlt = false) use (&$walk, &$res) {
        if (isset($p['parts'])) {
            if ($p['type'] === 'multipart/alternative') {
                // the richest version that can be shown: HTML (or a related group with HTML) over plain text; text kept for replies
                $best = null;
                foreach ($p['parts'] as $c) if ($c['type'] === 'text/html' || ($c['type'] === 'multipart/related' && ml_has_html($c)) || ($c['type'] === 'multipart/mixed' && ml_has_html($c))) $best = $c;
                foreach ($p['parts'] as $c) {
                    if ($c === $best) $walk($c, true);
                    elseif ($c['type'] === 'text/plain' && $c['disp'] !== 'attachment') $res['text'][] = ml_utf8($c['body'] ?? '', $c['params']['charset'] ?? '');
                    elseif (!$best) $walk($c, true);
                    elseif (!in_array($c['type'], ['text/plain', 'text/html', 'text/enriched', 'text/calendar'], true)) $walk($c, true);
                }
                return;
            }
            foreach ($p['parts'] as $c) $walk($c, $inAlt);
            return;
        }
        $isBody = in_array($p['type'], ['text/plain', 'text/html'], true) && $p['disp'] !== 'attachment' && ($p['filename'] === '' || $p['disp'] === 'inline');
        if ($isBody) {
            $s = ml_utf8($p['body'] ?? '', $p['params']['charset'] ?? '');
            if ($p['type'] === 'text/html') $res['html'][] = $s; else $res['text'][] = $s;
            return;
        }
        $size = strlen($p['body'] ?? '');
        if ($p['cid'] !== '' && strpos($p['type'], 'image/') === 0 && $size <= 3000000) $res['cid'][$p['cid']] = 'data:' . $p['type'] . ';base64,' . base64_encode($p['body']);
        if ($p['cid'] !== '' && $p['disp'] !== 'attachment' && strpos($p['type'], 'image/') === 0) { $res['inline'][] = $p['cid']; }
        $name = $p['filename'] !== '' ? $p['filename'] : ($p['type'] === 'message/rfc822' ? 'message.eml' : ($p['type'] === 'text/calendar' ? 'invite.ics' : 'file'));
        $res['atts'][] = ['part' => $p['path'], 'name' => mb_substr($name, 0, 200), 'type' => $p['type'], 'size' => $size, 'cid' => $p['cid']];
    };
    $walk($tree);
    return $res;
}

function ml_has_html(array $p): bool
{
    if ($p['type'] === 'text/html') return true;
    foreach ($p['parts'] ?? [] as $c) if (ml_has_html($c)) return true;
    return false;
}

/** The part at a path ("1.2.1"), or null. */
function ml_part(array $tree, string $path): ?array
{
    if ($tree['path'] === $path && !isset($tree['parts'])) return $tree;
    foreach ($tree['parts'] ?? [] as $c) if (($r = ml_part($c, $path)) !== null) return $r;
    return null;
}

// ---------------------------------------------------------------- safe HTML

const ML_TAGS = ['a', 'abbr', 'address', 'article', 'aside', 'b', 'bdi', 'bdo', 'big', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup',
    'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img',
    'ins', 'kbd', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 's', 'samp', 'section', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table',
    'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr'];
/** Gone with all they contain. */
const ML_DROP = ['script', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'input', 'button', 'select', 'textarea', 'option', 'optgroup',
    'link', 'meta', 'base', 'svg', 'math', 'template', 'audio', 'video', 'source', 'track', 'canvas', 'portal', 'dialog', 'title', 'head', 'xml', 'param', 'picture'];
const ML_ATTRS = ['style', 'class', 'dir', 'lang', 'title', 'align', 'valign', 'width', 'height', 'bgcolor', 'color', 'face', 'size', 'border', 'cellpadding',
    'cellspacing', 'colspan', 'rowspan', 'nowrap', 'background', 'href', 'src', 'alt', 'start', 'type', 'datetime', 'name', 'span', 'abbr', 'scope', 'open', 'reversed', 'hspace', 'vspace'];

/** CSS of a style attribute or a <style>: no scripts, no imports, pictures from the internet only when allowed. */
function ml_css(string $css, array $cid, bool $remote, int &$held): string
{
    $css = preg_replace('/\/\*.*?\*\//s', '', $css) ?? '';
    $css = preg_replace('/\\\\[0-9a-f]{1,6}\s?/i', '', $css) ?? ''; // escapes could spell "expression" or "url"
    $css = preg_replace('/@import[^;]*;?|expression\s*\(|behaviou?r\s*:|-moz-binding|javascript\s*:|vbscript\s*:/i', '', $css) ?? '';
    return preg_replace_callback('/url\s*\(\s*([\'"]?)(.*?)\1\s*\)/i', function ($m) use ($cid, $remote, &$held) {
        $u = trim($m[2]);
        if (stripos($u, 'cid:') === 0) return isset($cid[substr($u, 4)]) ? 'url("' . $cid[substr($u, 4)] . '")' : 'none';
        if (preg_match('~^data:image/(png|jpe?g|gif|webp|bmp);base64,~i', $u)) return 'url("' . str_replace('"', '', $u) . '")';
        if (preg_match('~^https?://~i', $u)) { if ($remote) return 'url("' . str_replace(['"', '\\'], '', $u) . '")'; $held++; return 'none'; }
        return 'none';
    }, $css) ?? '';
}

/** Safe HTML of a message: ['html' => body, 'css' => its styles, 'held' => pictures from the internet held back]. */
function ml_sanitize(string $html, array $cid, bool $remote): array
{
    $held = 0;
    $prev = libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    $doc->loadHTML('<?xml encoding="UTF-8"?><!DOCTYPE html><html><head><meta charset="utf-8"></head><body>' . preg_replace('/<\?xml[^>]*>/i', '', $html) . '</body></html>', LIBXML_NONET | LIBXML_COMPACT | LIBXML_NOERROR);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    $css = [];
    foreach (iterator_to_array($doc->getElementsByTagName('style')) as $st) { $css[] = ml_css($st->textContent, $cid, $remote, $held); $st->parentNode->removeChild($st); }
    $body = $doc->getElementsByTagName('body')->item(0);
    if (!$body) return ['html' => '', 'css' => '', 'held' => 0];
    $wrapStyle = '';
    if ($body->hasAttribute('bgcolor') && preg_match('/^#?[0-9a-z]{3,20}$/i', $body->getAttribute('bgcolor'))) $wrapStyle .= 'background-color:' . $body->getAttribute('bgcolor') . ';';
    if ($body->hasAttribute('style')) $wrapStyle .= ml_css($body->getAttribute('style'), $cid, $remote, $held);
    $clean = function (DOMNode $node) use (&$clean, $cid, $remote, &$held) {
        foreach (iterator_to_array($node->childNodes) as $c) {
            if ($c instanceof DOMComment || $c instanceof DOMProcessingInstruction || $c instanceof DOMCdataSection) { $node->removeChild($c); continue; }
            if (!($c instanceof DOMElement)) continue;
            $tag = strtolower($c->nodeName);
            if (in_array($tag, ML_DROP, true)) { $node->removeChild($c); continue; }
            $clean($c);
            if (!in_array($tag, ML_TAGS, true)) { // unknown or not wanted (form, body inside body…): its content stays, without it
                while ($c->firstChild) $node->insertBefore($c->firstChild, $c);
                $node->removeChild($c);
                continue;
            }
            foreach (iterator_to_array($c->attributes) as $a) {
                $n = strtolower($a->nodeName);
                $v = $a->nodeValue;
                if (!in_array($n, ML_ATTRS, true)) { $c->removeAttribute($a->nodeName); continue; }
                if ($n === 'style') { $c->setAttribute('style', ml_css($v, $cid, $remote, $held)); continue; }
                if ($n === 'href') {
                    $v = trim(preg_replace('/[\x00-\x20]+/', '', $v) ?? '');
                    if (!preg_match('~^(https?:|mailto:|tel:|#)~i', $v)) $c->removeAttribute('href');
                    continue;
                }
                if ($n === 'src' || $n === 'background') {
                    $v = trim($v);
                    if (stripos($v, 'cid:') === 0 && isset($cid[substr($v, 4)])) $c->setAttribute($n, $cid[substr($v, 4)]);
                    elseif (preg_match('~^data:image/(png|jpe?g|gif|webp|bmp);base64,~i', $v)) continue;
                    elseif (preg_match('~^https?://~i', $v) && $remote) continue;
                    elseif (preg_match('~^https?://~i', $v)) { $held++; $n === 'src' ? $c->setAttribute('src', ML_PIXEL) : $c->removeAttribute($n); if ($n === 'src') $c->setAttribute('data-held', '1'); }
                    else $n === 'src' ? $c->setAttribute('src', ML_PIXEL) : $c->removeAttribute($n);
                }
            }
            if ($tag === 'a' && $c->hasAttribute('href') && $c->getAttribute('href')[0] !== '#') { $c->setAttribute('target', '_blank'); $c->setAttribute('rel', 'noopener noreferrer'); }
        }
    };
    $clean($body);
    $out = '';
    foreach ($body->childNodes as $c) $out .= $doc->saveHTML($c);
    if ($wrapStyle !== '') $out = '<div style="' . e($wrapStyle) . '">' . $out . '</div>';
    return ['html' => $out, 'css' => implode("\n", $css), 'held' => $held];
}

/** Plain text shown as HTML: escaped, with its addresses as links, quotes ("> ") a little lighter. */
function ml_text_html(string $text): string
{
    $s = e(str_replace(["\r\n", "\r"], "\n", $text));
    $s = preg_replace('~\b(https?://[^\s<>"\']+[^\s<>"\'.,;:!?)\]])~i', '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>', $s) ?? $s;
    $s = preg_replace('/^(&gt;.*)$/m', '<span class="q">$1</span>', $s) ?? $s;
    return '<div class="plain">' . $s . '</div>';
}

/** Plain text of an HTML message (for the reply quoted as text, and the preview). */
function ml_html_text(string $html): string
{
    $html = preg_replace(['/<(style|script|head)[^>]*>.*?<\/\1>/is', '/<br\s*\/?>/i', '/<\/(p|div|tr|h[1-6]|li|blockquote|table)>/i'], ['', "\n", "\n"], $html) ?? '';
    $t = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace(["/[ \t\x{00a0}]+/u", "/\n\s*\n\s*\n+/"], [' ', "\n\n"], $t) ?? '');
}

// ---------------------------------------------------------------- writing

/** A header value, encoded only when it is not plain ASCII (encoded words of at most 75 characters). */
function ml_enc(string $s): string
{
    $s = str_replace(["\r", "\n"], ' ', $s);
    if (preg_match('/^[\x20-\x7e]*$/', $s)) return $s;
    $words = [];
    $cur = '';
    foreach (mb_str_split($s) as $ch) {
        if (strlen($cur . $ch) > 45) { $words[] = $cur; $cur = ''; }
        $cur .= $ch;
    }
    if ($cur !== '') $words[] = $cur;
    return implode("\r\n ", array_map(fn($w) => '=?UTF-8?B?' . base64_encode($w) . '?=', $words));
}

function ml_addr(array $a): string
{
    $email = str_replace(["\r", "\n", '<', '>', ' ', ','], '', (string)$a['email']);
    $name = trim(str_replace(["\r", "\n"], ' ', (string)($a['name'] ?? '')));
    if ($name === '') return $email;
    if (preg_match('/^[\x20-\x7e]*$/', $name)) return '"' . addcslashes($name, '"\\') . '" <' . $email . '>';
    return ml_enc($name) . ' <' . $email . '>';
}

/** A long header line folded at spaces (RFC 5322: lines of at most 78 characters when possible). */
function ml_fold(string $name, string $value): string
{
    $line = $name . ': ';
    $out = '';
    foreach (preg_split('/(?<=,) |(?<=>) (?=<)/', $value) as $i => $w) {
        if ($i > 0 && strlen($line) + strlen($w) + 1 > 78) { $out .= rtrim($line) . "\r\n"; $line = ' '; }
        $line .= ($i > 0 && $line !== ' ' ? ' ' : '') . $w;
    }
    return $out . $line;
}

function ml_qp(string $s): string
{
    return quoted_printable_encode(preg_replace("/\r?\n/", "\r\n", $s) ?? $s);
}

/**
 * A new message. $m: from {name, email}, to/cc [{name, email}…] (bcc never goes in the headers), subject, html, text,
 * attachments [{name, type, data}], inReplyTo, references, domain. Returns [raw message with CRLF, Message-ID].
 */
function ml_build(array $m): array
{
    $domain = preg_replace('/[^a-z0-9.-]/i', '', (string)(substr(strrchr((string)$m['from']['email'], '@') ?: '@localhost', 1))) ?: 'localhost';
    $id = '<' . bin2hex(random_bytes(12)) . '.' . base_convert((string)time(), 10, 36) . '@' . $domain . '>';
    $h = ['Date: ' . date('r'), ml_fold('From', ml_addr($m['from']))];
    if (!empty($m['to'])) $h[] = ml_fold('To', implode(', ', array_map('ml_addr', $m['to'])));
    if (!empty($m['cc'])) $h[] = ml_fold('Cc', implode(', ', array_map('ml_addr', $m['cc'])));
    $h[] = 'Subject: ' . ml_enc((string)$m['subject']);
    $h[] = 'Message-ID: ' . $id;
    if (!empty($m['inReplyTo']) && preg_match('/^<[^<>\s]+>$/', $m['inReplyTo'])) $h[] = 'In-Reply-To: ' . $m['inReplyTo'];
    if (!empty($m['references'])) {
        preg_match_all('/<[^<>\s]+>/', (string)$m['references'], $r);
        if ($r[0]) $h[] = ml_fold('References', implode(' ', array_slice($r[0], -20)));
    }
    $h[] = 'MIME-Version: 1.0';
    $h[] = 'User-Agent: SavMail';
    $b1 = '=_alt_' . bin2hex(random_bytes(10));
    $alt = "--$b1\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" . ml_qp((string)$m['text']) . "\r\n"
        . "--$b1\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" . ml_qp((string)$m['html']) . "\r\n--$b1--\r\n";
    if (empty($m['attachments'])) {
        $h[] = 'Content-Type: multipart/alternative; boundary="' . $b1 . '"';
        return [implode("\r\n", $h) . "\r\n\r\n" . $alt, $id];
    }
    $b0 = '=_mix_' . bin2hex(random_bytes(10));
    $h[] = 'Content-Type: multipart/mixed; boundary="' . $b0 . '"';
    $body = "--$b0\r\nContent-Type: multipart/alternative; boundary=\"$b1\"\r\n\r\n" . $alt;
    foreach ($m['attachments'] as $a) {
        $name = str_replace(["\r", "\n", '"', '\\', '/'], ['', '', "'", '_', '_'], (string)$a['name']) ?: 'file';
        $ascii = preg_replace('/[^\x20-\x7e]/', '_', $name);
        $type = preg_match('~^[a-z0-9.+-]+/[a-z0-9.+-]+$~i', (string)$a['type']) ? $a['type'] : 'application/octet-stream';
        $body .= "--$b0\r\nContent-Type: $type; name=\"" . $ascii . "\"\r\nContent-Transfer-Encoding: base64\r\n"
            . 'Content-Disposition: attachment; filename="' . $ascii . '"' . ($ascii !== $name ? "; filename*=UTF-8''" . rawurlencode($name) : '') . "\r\n\r\n"
            . rtrim(chunk_split(base64_encode((string)$a['data']), 76, "\r\n")) . "\r\n";
    }
    return [implode("\r\n", $h) . "\r\n\r\n" . $body . "--$b0--\r\n", $id];
}

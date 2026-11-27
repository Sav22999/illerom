<?php
/**
 * SavReads — the readable part of a web page, read by the server (in the manner of Readability): the title, the author,
 * the date, the main picture, and the text of the article as a small set of clean HTML.
 *
 * 1. What the page says of itself: JSON-LD (schema.org Article…), Open Graph and Twitter cards, <meta name=author>…
 * 2. Everything that is not reading goes: scripts, styles, frames, forms, navigation, footers, asides, hidden elements,
 *    and the blocks whose class or id say comments, sharing, related, newsletter, cookie, advertising…
 * 3. Each paragraph scores (length, commas) for its parent and, half, for its grandparent; the class and id of the
 *    candidates add or take away; links lower the score. The best one wins, with the siblings that score well too.
 *    A page that marks its text (itemprop=articleBody, a single long <article>) is believed first.
 * 4. What is kept is rewritten from scratch (rd_clean): only a small list of tags, no attribute but href, src and alt,
 *    no script, no style, no event, no frame. Links open apart without telling where the reader comes from. Pictures
 *    keep their original address here; the API shows them through api/?r=img (the publisher never sees the reader), and
 *    the pixels that only count visits are dropped.
 */

declare(strict_types=1);

const RD_CONTENT_MAX = 600000;   // bytes of clean HTML kept of an article
const RD_PAGE_MAX = 6000000;     // bytes of a page read from the Internet

const RD_UNLIKELY = '/-ad-|\bads?\b|ai2html|banner|breadcrumb|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote|share|sharing|newsletter|subscribe|signup|cookie|consent|promo|outbrain|taboola|recirc|paywall|modal|toolbar|tags?-list|author-bio|read-more|more-stories|most-popular|trending/i';
const RD_MAYBE = '/and|article|body|column|content|main|shadow|story|post|entry|text/i';
const RD_POSITIVE = '/article|body|content|entry|hentry|h-entry|main|page|post|text|blog|story|prose/i';
const RD_NEGATIVE = '/hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|foot|footer|footnote|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|tool|widget|byline|caption-credit|subscribe|newsletter|ad-|advert/i';
const RD_TRACKERS = '#(^|[./])(doubleclick\.net|google-analytics\.com|googletagmanager\.com|facebook\.com/tr|scorecardresearch\.com|quantserve\.com|pixel\.|/pixel|beacon|/tr\?|/track|chartbeat|omtrdc|demdex|krxd|bluekai|adsrvr|amazon-adsystem|parsely\.com/plogger|feedburner\.com/~r|feeds\.feedburner\.com/~ff|stats\.wp\.com|pixel\.wp\.com|mc\.yandex|hotjar|matomo\.php|piwik\.php)#i';

/** Text of a node, spaces collapsed. */
function rd_text(DOMNode $n): string
{
    return trim(preg_replace('/\s+/u', ' ', $n->textContent ?? '') ?? '');
}

function rd_len(DOMNode $n): int
{
    return mb_strlen(rd_text($n));
}

/** How much of the text of a node is the text of its links (0…1). */
function rd_link_density(DOMElement $e): float
{
    $len = rd_len($e);
    if ($len === 0) return 0.0;
    $links = 0;
    foreach ($e->getElementsByTagName('a') as $a) {
        $href = (string)$a->getAttribute('href');
        $links += rd_len($a) * (strpos($href, '#') === 0 ? .3 : 1); // links inside the page weigh less
    }
    return min(1.0, $links / $len);
}

function rd_class_weight(DOMElement $e): int
{
    $w = 0;
    foreach ([$e->getAttribute('class'), $e->getAttribute('id')] as $s) {
        if ($s === '') continue;
        if (preg_match(RD_NEGATIVE, $s)) $w -= 25;
        if (preg_match(RD_POSITIVE, $s)) $w += 25;
    }
    return $w;
}

/** A page as a DOMDocument, whatever its encoding. */
function rd_dom(string $html, string $type = ''): ?DOMDocument
{
    if (strlen($html) > RD_PAGE_MAX) $html = substr($html, 0, RD_PAGE_MAX);
    $cs = '';
    if (preg_match('/charset=["\']?([\w-]+)/i', $type, $m)) $cs = $m[1];
    elseif (preg_match('/<meta[^>]+charset=["\']?([\w-]+)/i', substr($html, 0, 4000), $m)) $cs = $m[1];
    $cs = strtoupper($cs);
    if ($cs !== '' && $cs !== 'UTF-8' && $cs !== 'UTF8') {
        $conv = @mb_convert_encoding($html, 'UTF-8', $cs === 'ISO-8859-1' || $cs === 'LATIN1' ? 'Windows-1252' : $cs);
        if (is_string($conv) && $conv !== '') $html = $conv;
    } elseif (!mb_check_encoding($html, 'UTF-8')) {
        $html = mb_convert_encoding($html, 'UTF-8', 'Windows-1252');
    }
    $html = preg_replace('/<meta[^>]+charset=[^>]*>/i', '', $html) ?? $html;
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $ok = $doc->loadHTML('<?xml encoding="utf-8"?>' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_COMPACT | (strlen($html) > 9000000 ? LIBXML_PARSEHUGE : 0));
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    return $ok ? $doc : null;
}

/** The value of the first <meta> with one of these names or properties. */
function rd_meta(DOMXPath $xp, array $names): string
{
    foreach ($names as $n) {
        $n = strtolower($n);
        foreach ($xp->query("//meta[translate(@property,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='$n' or translate(@name,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='$n' or translate(@itemprop,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz')='$n']") ?: [] as $m) {
            $v = trim(html_entity_decode((string)$m->getAttribute('content'), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if ($v !== '') return $v;
        }
    }
    return '';
}

/** The first Article (or NewsArticle, BlogPosting…) of the JSON-LD of the page, flattened. */
function rd_jsonld(DOMXPath $xp): array
{
    $kinds = ['article', 'newsarticle', 'blogposting', 'report', 'scholarlyarticle', 'techarticle', 'analysisnewsarticle', 'opinionnewsarticle', 'reviewnewsarticle', 'liveblogposting', 'socialmediaposting', 'webpage', 'medicalwebpage', 'creativework', 'howto', 'recipe'];
    $best = null;
    $walk = function ($d) use (&$walk, &$best, $kinds) {
        if (!is_array($d)) return;
        if (isset($d['@graph'])) $walk($d['@graph']);
        if (array_is_list($d)) { foreach ($d as $x) $walk($x); return; }
        $type = $d['@type'] ?? '';
        foreach ((array)$type as $tt) {
            $tt = strtolower((string)$tt);
            $rank = array_search($tt, $kinds, true);
            if ($rank === false) continue;
            if ($best === null || $rank < $best[0]) $best = [$rank, $d];
        }
    };
    foreach ($xp->query('//script[@type="application/ld+json"]') ?: [] as $s) {
        $j = json_decode(trim((string)$s->textContent), true);
        if (is_array($j)) $walk($j);
    }
    if (!$best) return [];
    $d = $best[1];
    $name = function ($a) use (&$name): string {
        if (is_string($a)) return $a;
        if (!is_array($a)) return '';
        if (array_is_list($a)) return implode(', ', array_filter(array_map($name, array_slice($a, 0, 3))));
        return (string)($a['name'] ?? '');
    };
    $img = $d['image'] ?? '';
    if (is_array($img)) $img = array_is_list($img) ? ($img[0]['url'] ?? (is_string($img[0] ?? null) ? $img[0] : '')) : ($img['url'] ?? '');
    return [
        'title' => trim((string)($d['headline'] ?? $d['name'] ?? '')),
        'author' => trim($name($d['author'] ?? '')),
        'published' => (string)($d['datePublished'] ?? $d['dateCreated'] ?? ''),
        'image' => is_string($img) ? $img : '',
        'site' => trim($name($d['publisher'] ?? '')),
        'descr' => trim((string)($d['description'] ?? '')),
        'body' => is_string($d['articleBody'] ?? null) ? (string)$d['articleBody'] : '',
        'paywalled' => isset($d['isAccessibleForFree']) && in_array(strtolower((string)json_encode($d['isAccessibleForFree'])), ['false', '"false"'], true),
    ];
}

/** The title of the page without the name of the site that many pages add to it ("Title | Site", "Site – Title"). */
function rd_clean_title(string $title, string $site): string
{
    $title = trim(preg_replace('/\s+/u', ' ', $title) ?? '');
    if ($title === '') return '';
    foreach ([' | ', ' – ', ' — ', ' - ', ' :: ', ' · ', ' » '] as $sep) {
        if (strpos($title, $sep) === false) continue;
        $parts = explode($sep, $title);
        $first = trim($parts[0]);
        $last = trim(end($parts));
        if ($site !== '' && mb_strtolower($last) === mb_strtolower($site)) return trim(implode($sep, array_slice($parts, 0, -1)));
        if ($site !== '' && mb_strtolower($first) === mb_strtolower($site)) return trim(implode($sep, array_slice($parts, 1)));
        // a short last part that looks like a brand (one or two words, no full stop): the name of the site
        if (count($parts) === 2 && mb_strlen($last) <= 24 && str_word_count($last) <= 2 && mb_strlen($first) >= 4) return $first;
        // the longest part, when it is long enough to be a title on its own
        usort($parts, fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
        if (mb_strlen(trim($parts[0])) >= 20 && count($parts) === 2) return trim($parts[0]);
    }
    return $title;
}

/** A picture's address from the attributes lazy loaders use; srcset: the largest. */
function rd_img_src(DOMElement $img, string $base): string
{
    $cands = [];
    foreach (['data-src', 'data-lazy-src', 'data-original', 'data-url', 'data-hi-res-src', 'data-full-src', 'src'] as $a) {
        $v = trim((string)$img->getAttribute($a));
        if ($v !== '' && strpos($v, 'data:') !== 0) $cands[] = $v;
    }
    $set = trim((string)($img->getAttribute('data-srcset') ?: $img->getAttribute('srcset')));
    if ($set === '' && $img->parentNode instanceof DOMElement && strtolower($img->parentNode->tagName) === 'picture') {
        foreach ($img->parentNode->getElementsByTagName('source') as $so) { $set = trim((string)($so->getAttribute('data-srcset') ?: $so->getAttribute('srcset'))); if ($set !== '') break; }
    }
    if ($set !== '') {
        $best = ['', 0];
        foreach (preg_split('/,\s+(?=\S)/', $set) ?: [] as $c) {
            $p = preg_split('/\s+/', trim($c));
            $w = isset($p[1]) ? (float)$p[1] : 1;
            if (!empty($p[0]) && $w >= $best[1] && $w <= 2400) $best = [$p[0], $w];
        }
        if ($best[0] !== '') array_unshift($cands, $best[0]);
    }
    foreach ($cands as $c) {
        $u = safe_url(html_entity_decode($c, ENT_QUOTES | ENT_HTML5, 'UTF-8'), $base);
        if ($u !== '' && !preg_match(RD_TRACKERS, $u)) return $u;
    }
    return '';
}

/**
 * HTML written by others (an article, the content of a feed) made safe and plain: only the tags of reading, only href /
 * src / alt (and the few attributes of tables and times). $base resolves relative addresses.
 */
function rd_clean(?string $html, string $base = '', int $max = RD_CONTENT_MAX): string
{
    $html = trim((string)$html);
    if ($html === '') return '';
    if (!preg_match('#<[a-z!/][^>]*>#i', $html)) return text_to_html(html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $doc = rd_dom('<div id="rd-root">' . $html . '</div>');
    $root = $doc ? $doc->getElementById('rd-root') : null;
    return $root ? rd_serialize($root, $base, $max) : text_to_html(plain($html, 20000));
}

/** The children of $root written again with the tags of reading only (see rd_clean). */
function rd_serialize(DOMNode $root, string $base, int $max = RD_CONTENT_MAX): string
{
    $map = ['p' => 'p', 'br' => 'br', 'h1' => 'h2', 'h2' => 'h2', 'h3' => 'h3', 'h4' => 'h4', 'h5' => 'h4', 'h6' => 'h4',
        'b' => 'strong', 'strong' => 'strong', 'i' => 'em', 'em' => 'em', 'u' => 'u', 's' => 's', 'strike' => 's', 'del' => 's', 'ins' => 'u',
        'sub' => 'sub', 'sup' => 'sup', 'small' => 'small', 'mark' => 'mark', 'abbr' => 'abbr', 'time' => 'time', 'cite' => 'cite', 'q' => 'q',
        'blockquote' => 'blockquote', 'pre' => 'pre', 'code' => 'code', 'kbd' => 'kbd', 'samp' => 'code', 'var' => 'em',
        'ul' => 'ul', 'ol' => 'ol', 'li' => 'li', 'dl' => 'dl', 'dt' => 'dt', 'dd' => 'dd',
        'figure' => 'figure', 'figcaption' => 'figcaption', 'img' => 'img', 'hr' => 'hr', 'a' => 'a',
        'table' => 'table', 'thead' => 'thead', 'tbody' => 'tbody', 'tfoot' => 'tfoot', 'tr' => 'tr', 'th' => 'th', 'td' => 'td', 'caption' => 'caption'];
    $drop = ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'video', 'audio', 'source', 'track', 'svg', 'math', 'canvas', 'map',
        'form', 'input', 'button', 'select', 'textarea', 'label', 'option', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'base', 'nav', 'dialog', 'menu', 'slot', 'portal'];
    $block = ['div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'center', 'address', 'details', 'summary', 'hgroup', 'picture'];
    $out = '';
    $walk = function (DOMNode $n, int $depth) use (&$walk, $map, $drop, $block, $base): string {
        if ($depth > 60) return '';
        $s = '';
        foreach ($n->childNodes as $c) {
            if ($c instanceof DOMText) { $s .= htmlspecialchars((string)$c->nodeValue, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8'); continue; }
            if (!$c instanceof DOMElement) continue;
            $tag = strtolower($c->tagName);
            if (in_array($tag, $drop, true)) continue;
            if ($tag === 'picture') { $img = $c->getElementsByTagName('img')->item(0); if ($img) $s .= rd_img_html($img, $base); continue; }
            if (!isset($map[$tag])) {
                $inner = $walk($c, $depth + 1);
                $s .= in_array($tag, $block, true) && trim(strip_tags($inner, '<img>')) !== '' && !preg_match('#^\s*<(p|h\d|ul|ol|blockquote|pre|figure|table|div|dl|hr)\b#', $inner) ? '<p>' . $inner . '</p>' : $inner;
                continue;
            }
            $t = $map[$tag];
            if ($t === 'br') { $s .= '<br>'; continue; }
            if ($t === 'hr') { $s .= '<hr>'; continue; }
            if ($t === 'img') { $s .= rd_img_html($c, $base); continue; }
            $inner = $walk($c, $depth + 1);
            if ($t === 'a') {
                $href = trim((string)$c->getAttribute('href'));
                if ($href !== '' && $href[0] === '#') { $s .= $inner; continue; } // anchors of the original page lead nowhere here
                $u = preg_match('#^mailto:[^\s<>"]+$#i', $href) ? $href : safe_url(html_entity_decode($href, ENT_QUOTES | ENT_HTML5, 'UTF-8'), $base);
                $s .= $u !== '' && trim(strip_tags($inner, '<img>')) !== '' ? '<a href="' . htmlspecialchars($u, ENT_QUOTES, 'UTF-8') . '">' . $inner . '</a>' : $inner;
                continue;
            }
            $empty = trim(str_replace("\u{a0}", '', strip_tags($inner, '<img><br><hr>'))) === '' || trim(str_replace("\u{a0}", '', strip_tags($inner, '<img>'))) === '';
            if ($empty && !in_array($t, ['td', 'th', 'li'], true) && strpos($inner, '<img') === false) continue;
            $attr = '';
            if (in_array($t, ['td', 'th'], true)) foreach (['colspan', 'rowspan'] as $a) { $v = (int)$c->getAttribute($a); if ($v > 1 && $v < 100) $attr .= " $a=\"$v\""; }
            if ($t === 'time' && preg_match('/^[\d:T+\-Z. ]{4,40}$/', (string)$c->getAttribute('datetime'))) $attr = ' datetime="' . htmlspecialchars((string)$c->getAttribute('datetime'), ENT_QUOTES, 'UTF-8') . '"';
            if ($t === 'abbr' && $c->getAttribute('title') !== '') $attr = ' title="' . htmlspecialchars(mb_substr((string)$c->getAttribute('title'), 0, 200), ENT_QUOTES, 'UTF-8') . '"';
            if ($t === 'ol' && (int)$c->getAttribute('start') > 1) $attr = ' start="' . (int)$c->getAttribute('start') . '"';
            if ($t === 'p' && preg_match('#^\s*<(p|h\d|ul|ol|blockquote|pre|figure|table)\b#', $inner)) { $s .= $inner; continue; } // a paragraph never holds blocks
            $s .= "<$t$attr>$inner</$t>";
        }
        return $s;
    };
    $out = $walk($root, 0);
    // tidy: no empty paragraphs, no runs of line breaks, no break at the edges of a paragraph
    $out = preg_replace(['#<p>(\s|&nbsp;|<br>)*</p>#u', '#(<br>\s*){3,}#', '#<p>(\s|<br>)+#', '#(\s|<br>)+</p>#'], ['', '<br><br>', '<p>', '</p>'], $out) ?? $out;
    $out = trim($out);
    if (strlen($out) > $max) {
        // cut, then closed again by DOMDocument so that no tag stays open
        $cut = preg_replace('#<[^>]*$#', '', mb_strcut($out, 0, $max)) ?? '';
        $d = rd_dom('<div id="rd-cut">' . $cut . '</div>');
        $r = $d ? $d->getElementById('rd-cut') : null;
        $out = '';
        if ($r) foreach ($r->childNodes as $c) $out .= $d->saveHTML($c);
    }
    return $out;
}

/** A picture of an article as clean HTML (its original address: the API shows it through the server), or '' for a pixel. */
function rd_img_html(DOMElement $img, string $base): string
{
    $src = rd_img_src($img, $base);
    if ($src === '') return '';
    $w = (int)$img->getAttribute('width');
    $h = (int)$img->getAttribute('height');
    if (($w > 0 && $w <= 3) || ($h > 0 && $h <= 3)) return ''; // a pixel that counts visits
    if (preg_match('#\.(svg)(\?|$)#i', $src)) return ''; // logos and icons, and SVG is never served through the server
    $alt = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)$img->getAttribute('alt')) ?? ''), 0, 300);
    $size = ($w >= 16 && $w <= 6000 && $h >= 16 && $h <= 6000) ? ' width="' . $w . '" height="' . $h . '"' : '';
    return '<img src="' . htmlspecialchars($src, ENT_QUOTES, 'UTF-8') . '" alt="' . htmlspecialchars($alt, ENT_QUOTES, 'UTF-8') . '"' . $size . '>';
}

/** Takes away what is never reading, in place. */
function rd_prune(DOMDocument $doc, DOMXPath $xp): void
{
    foreach (['script', 'style', 'noscript', 'iframe', 'frame', 'object', 'embed', 'form', 'button', 'input', 'select', 'textarea', 'svg', 'canvas', 'nav', 'footer', 'aside', 'template', 'dialog', 'link', 'meta'] as $tag) {
        $list = [];
        foreach ($doc->getElementsByTagName($tag) as $n) $list[] = $n;
        foreach ($list as $n) $n->parentNode?->removeChild($n);
    }
    $remove = [];
    foreach ($xp->query('//*[@hidden or @aria-hidden="true" or contains(@style,"display:none") or contains(@style,"display: none") or contains(@style,"visibility:hidden") or @role="navigation" or @role="complementary" or @role="dialog" or @role="banner" or @role="contentinfo"]') ?: [] as $n) {
        if ($n instanceof DOMElement && !in_array(strtolower($n->tagName), ['html', 'body', 'article', 'main'], true)) $remove[] = $n;
    }
    foreach ($xp->query('//*[@class or @id]') ?: [] as $n) {
        if (!$n instanceof DOMElement) continue;
        $tag = strtolower($n->tagName);
        if (in_array($tag, ['html', 'body', 'article', 'main', 'a', 'img', 'figure', 'picture', 'table', 'tbody', 'tr', 'td', 'th', 'pre', 'code', 'p'], true)) continue;
        $s = $n->getAttribute('class') . ' ' . $n->getAttribute('id');
        if (preg_match(RD_UNLIKELY, $s) && !preg_match(RD_MAYBE, $s) && !$n->getElementsByTagName('article')->length) $remove[] = $n;
    }
    foreach ($remove as $n) if ($n->parentNode) $n->parentNode->removeChild($n);
}

/** The element that holds the article: what the page marks as such, otherwise the best score. */
function rd_candidate(DOMDocument $doc, DOMXPath $xp): ?DOMElement
{
    // the page says where its text is
    $marked = [];
    foreach ($xp->query('//*[@itemprop="articleBody"] | //article | //*[contains(concat(" ", normalize-space(@class), " "), " entry-content ")] | //*[contains(concat(" ", normalize-space(@class), " "), " post-content ")] | //*[contains(concat(" ", normalize-space(@class), " "), " article-body ")] | //main') ?: [] as $n) {
        if (!$n instanceof DOMElement) continue;
        $len = rd_len($n);
        if ($len >= 600 && rd_link_density($n) < .35) $marked[] = [$n, $len * (strtolower($n->tagName) === 'main' ? .7 : 1) + ($n->getAttribute('itemprop') === 'articleBody' ? 5000 : 0)];
    }
    // a single long article, or the marked block: the innermost one that still holds most of the text
    if ($marked) {
        usort($marked, fn($a, $b) => $b[1] <=> $a[1]);
        $best = $marked[0][0];
        foreach ($marked as [$n, $score]) if ($n !== $best && $best->contains($n) && rd_len($n) > rd_len($best) * .75) $best = $n;
        return $best;
    }
    // scores: each paragraph for its parents
    $scores = new SplObjectStorage();
    $init = function (DOMElement $e) use ($scores) {
        if (isset($scores[$e])) return;
        $tag = strtolower($e->tagName);
        $base = in_array($tag, ['div', 'article', 'section', 'main'], true) ? 5 : (in_array($tag, ['pre', 'td', 'blockquote'], true) ? 3 : (in_array($tag, ['address', 'ol', 'ul', 'dl', 'dd', 'dt', 'li', 'form'], true) ? -3 : (in_array($tag, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'th'], true) ? -5 : 0)));
        $scores[$e] = $base + rd_class_weight($e);
    };
    $paras = [];
    foreach (['p', 'pre', 'td', 'blockquote'] as $tag) foreach ($doc->getElementsByTagName($tag) as $p) $paras[] = $p;
    // divs with only inline content count as paragraphs
    foreach ($doc->getElementsByTagName('div') as $d) {
        $blocky = false;
        foreach ($d->childNodes as $c) if ($c instanceof DOMElement && in_array(strtolower($c->tagName), ['p', 'div', 'table', 'ul', 'ol', 'blockquote', 'pre', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'figure', 'dl'], true)) { $blocky = true; break; }
        if (!$blocky) $paras[] = $d;
    }
    foreach ($paras as $p) {
        $text = rd_text($p);
        $len = mb_strlen($text);
        if ($len < 25) continue;
        $score = 1 + count(preg_split('/[,，、]/u', $text)) - 1 + min(3, intdiv($len, 100)) + 1;
        $node = $p->parentNode;
        for ($level = 0; $node instanceof DOMElement && $level < 3; $level++, $node = $node->parentNode) {
            if (in_array(strtolower($node->tagName), ['html', 'body'], true)) break;
            $init($node);
            $scores[$node] = $scores[$node] + $score / ($level === 0 ? 1 : ($level === 1 ? 2 : $level * 3));
        }
    }
    $top = null;
    $topScore = 0.0;
    foreach ($scores as $e) {
        $s = $scores[$e] * (1 - rd_link_density($e));
        $scores[$e] = $s;
        if ($s > $topScore) { $top = $e; $topScore = $s; }
    }
    if (!$top) return $doc->getElementsByTagName('body')->item(0);
    // the parent, when the text is split among siblings that score as much
    $parent = $top->parentNode;
    if ($parent instanceof DOMElement && !in_array(strtolower($parent->tagName), ['body', 'html'], true)) {
        $good = 0;
        foreach ($parent->childNodes as $c) if ($c instanceof DOMElement && isset($scores[$c]) && $scores[$c] >= $topScore * .5) $good++;
        if ($good >= 3) return $parent;
    }
    // the siblings that belong to the article join it
    if ($parent instanceof DOMElement) {
        $wrap = $doc->createElement('div');
        $limit = max(10, $topScore * .2);
        $sibs = [];
        foreach ($parent->childNodes as $c) $sibs[] = $c;
        foreach ($sibs as $c) {
            if (!$c instanceof DOMElement) continue;
            $ok = $c === $top;
            if (!$ok && isset($scores[$c]) && $scores[$c] >= $limit) $ok = true;
            if (!$ok && strtolower($c->tagName) === 'p') {
                $len = rd_len($c);
                $ld = rd_link_density($c);
                if (($len > 80 && $ld < .25) || ($len > 0 && $len <= 80 && $ld == 0 && preg_match('/\.( |$)/', rd_text($c)))) $ok = true;
            }
            if ($ok) $wrap->appendChild($c->cloneNode(true));
        }
        return $wrap;
    }
    return $top;
}

/** Inside the article: lists, tables and blocks that look like navigation or "read also" go. */
function rd_tidy(DOMElement $root): void
{
    $remove = [];
    foreach (['ul', 'ol', 'div', 'section', 'table', 'header'] as $tag) {
        foreach ($root->getElementsByTagName($tag) as $e) {
            $len = rd_len($e);
            $ld = rd_link_density($e);
            $weight = rd_class_weight($e);
            $imgs = $e->getElementsByTagName('img')->length;
            $ps = $e->getElementsByTagName('p')->length;
            if ($weight < 0 && $len < 2000) { $remove[] = $e; continue; }
            if ($ld > .5 && $len < 1500 && $tag !== 'table') { $remove[] = $e; continue; }
            if ($tag === 'header' && $len < 400 && $ps < 2) { $remove[] = $e; continue; }
            if (in_array($tag, ['div', 'section'], true) && $len < 140 && $imgs === 0 && $ps === 0 && $ld > .3) $remove[] = $e;
        }
    }
    // the byline and the date line are shown above the text: inside it they would come twice
    foreach ($root->getElementsByTagName('*') as $e) {
        $s = $e->getAttribute('class') . ' ' . $e->getAttribute('id') . ' ' . $e->getAttribute('rel') . ' ' . $e->getAttribute('itemprop');
        if (preg_match('/\b(byline|by-line|author|dateline|article-date|post-date|posted-on|post-meta|entry-meta|article-meta|published|timestamp)\b/i', $s) && rd_len($e) < 160) $remove[] = $e;
    }
    foreach ($remove as $n) if ($n->parentNode) $n->parentNode->removeChild($n);
}

/**
 * A page → ['title', 'author', 'site', 'lang', 'image', 'published', 'excerpt', 'content', 'words'].
 * $url: its address (the base of relative links); $type: its Content-Type (the encoding).
 */
function rd_extract(string $html, string $url, string $type = ''): array
{
    $doc = rd_dom($html, $type);
    $host = preg_replace('/^www\./', '', (string)parse_url($url, PHP_URL_HOST));
    $empty = ['title' => '', 'author' => '', 'site' => $host, 'lang' => '', 'image' => '', 'published' => null, 'excerpt' => '', 'content' => '', 'words' => 0];
    if (!$doc) return $empty;
    $xp = new DOMXPath($doc);
    $base = $url;
    foreach ($xp->query('//base[@href]') ?: [] as $b) { $u = safe_url((string)$b->getAttribute('href'), $url); if ($u !== '') $base = $u; break; }
    $ld = rd_jsonld($xp);
    $site = plain(rd_meta($xp, ['og:site_name', 'application-name', 'twitter:site']) ?: ($ld['site'] ?? ''), 200);
    if ($site === '' || $site[0] === '@') $site = $host;
    $docTitle = '';
    foreach ($doc->getElementsByTagName('title') as $tt) { $docTitle = rd_text($tt); break; }
    // Open Graph first: the headline of JSON-LD is at times a description (Wikipedia), the <title> carries the name of the site
    $title = plain(rd_clean_title(rd_meta($xp, ['og:title', 'twitter:title', 'dc.title', 'parsely-title', 'sailthru.title']), $site) ?: ($ld['title'] ?? '') ?: rd_clean_title($docTitle, $site), 400);
    if ($title === '') { foreach ($doc->getElementsByTagName('h1') as $h1) { $title = plain(rd_text($h1), 400); break; } }
    $author = $ld['author'] ?? '';
    if ($author === '') {
        $author = rd_meta($xp, ['author', 'article:author', 'dc.creator', 'parsely-author', 'sailthru.author', 'byl', 'twitter:creator']);
        if (preg_match('#^https?://#i', $author)) $author = '';
    }
    if ($author === '') foreach ($xp->query('//*[@rel="author" or @itemprop="author" or contains(@class,"byline") or contains(@class,"author-name")]') ?: [] as $a) { $v = rd_text($a); if ($v !== '' && mb_strlen($v) < 100) { $author = $v; break; } }
    $author = plain(preg_replace('/^(by|di|von|par|por)\s+/i', '', (string)$author) ?? '', 300);
    if (str_starts_with($author, '@')) $author = '';
    $published = parse_date(($ld['published'] ?? '') ?: rd_meta($xp, ['article:published_time', 'og:article:published_time', 'datePublished', 'pubdate', 'publishdate', 'date', 'dc.date', 'dc.date.issued', 'parsely-pub-date', 'sailthru.date']));
    if (!$published) foreach ($xp->query('//time[@datetime]') ?: [] as $tm) { $published = parse_date((string)$tm->getAttribute('datetime')); if ($published) break; }
    $image = safe_url(($ld['image'] ?? '') ?: rd_meta($xp, ['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'thumbnailurl']), $base);
    if ($image !== '' && preg_match(RD_TRACKERS, $image)) $image = '';
    $lang = strtolower(substr(preg_replace('/[^A-Za-z-]/', '', (string)$doc->documentElement?->getAttribute('lang')) ?? '', 0, 16)) ?: strtolower(substr(rd_meta($xp, ['og:locale', 'content-language']), 0, 5));
    $lang = str_replace('_', '-', $lang);
    $descr = plain(rd_meta($xp, ['og:description', 'description', 'twitter:description']) ?: ($ld['descr'] ?? ''), 480);

    rd_prune($doc, $xp);
    $root = rd_candidate($doc, $xp);
    $content = '';
    if ($root) {
        rd_tidy($root);
        // the title of the page is shown on its own: the first heading, when it repeats it, goes
        foreach (['h1', 'h2'] as $tag) {
            $h = $root->getElementsByTagName($tag)->item(0);
            if ($h && $title !== '' && similar_text(mb_strtolower(rd_text($h)), mb_strtolower($title)) >= mb_strlen($title) * .8) { $h->parentNode?->removeChild($h); break; }
        }
        $content = rd_serialize($root, $base);
    }
    // a page that gives its whole text in JSON-LD (and almost nothing in the HTML): that text
    $plainLen = mb_strlen(trim(strip_tags($content)));
    if (!empty($ld['body']) && mb_strlen($ld['body']) > max(600, $plainLen * 1.5)) $content = text_to_html(mb_substr($ld['body'], 0, 200000));
    $text = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags(str_replace(['</p>', '<br>', '</li>', '</h2>', '</h3>', '</h4>'], ' ', $content)), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
    $words = $text === '' ? 0 : count(preg_split('/\s+/u', $text));
    return [
        'title' => $title !== '' ? $title : $host,
        'author' => $author,
        'site' => $site,
        'lang' => $lang,
        'image' => $image,
        'published' => $published,
        'excerpt' => $descr !== '' ? $descr : plain($text, 300),
        'content' => $content,
        'words' => $words,
        'paywalled' => !empty($ld['paywalled']),
    ];
}

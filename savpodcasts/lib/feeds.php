<?php
/**
 * SavPodcasts — podcasts: reading a feed (RSS 2.0 with the itunes: and podcast: namespaces, or Atom), keeping it in
 * pod_feeds / pod_episodes, bringing it up to date, and what the app receives of them.
 *
 * A feed is read once for everybody (it is public). It is asked again when someone needs it and it is older than
 * refresh_minutes (credentials.php, 30 by default), with If-None-Match / If-Modified-Since so that an unchanged feed
 * costs almost nothing; tools/refresh.php does the same for every followed podcast from cron.
 * Episodes missing from a newer copy of the feed are kept (many feeds only list the last ones): what someone listened to
 * stays in their history.
 *
 * The notes of the episodes are HTML written by others: clean_html keeps a small set of tags (paragraphs, lists, bold,
 * links…) and drops the rest, pictures included (they would be loaded from the publisher, who would see the listener).
 */

declare(strict_types=1);

require_once __DIR__ . '/net.php';

const FEED_MAX_BYTES = 20000000;      // a feed as XML (some long-running shows have big feeds)
const FEED_MAX_EPISODES = 3000;       // episodes kept from one copy of a feed (the newest)
const DESCR_MAX = 40000;              // notes of an episode, as clean HTML
const NS_ITUNES = 'http://www.itunes.com/dtds/podcast-1.0.dtd';
const NS_PODCAST = 'https://podcastindex.org/namespace/1.0';
const NS_CONTENT = 'http://purl.org/rss/1.0/modules/content/';
const NS_MEDIA = 'http://search.yahoo.com/mrss/';
const NS_ATOM = 'http://www.w3.org/2005/Atom';

if (!function_exists('q')) {
    function q(string $sql, array $args = []): PDOStatement
    {
        $st = db()->prepare($sql);
        $st->execute($args);
        return $st;
    }
}

// ------------------------------------------------------------------ text and HTML

/** Plain text: no tags, entities decoded, spaces collapsed, cut at $max characters. */
function plain(?string $s, int $max = 400): string
{
    $s = html_entity_decode(strip_tags(preg_replace('#<(br|/p|/div|/li|/h\d)\b[^>]*>#i', ' ', (string)$s) ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = trim(preg_replace('/\s+/u', ' ', preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '') ?? '');
    return mb_strlen($s) > $max ? rtrim(mb_substr($s, 0, $max - 1)) . '…' : $s;
}

/** An http(s) address, or ''. */
function safe_url(?string $u, string $base = ''): string
{
    $u = trim((string)$u);
    if ($u === '') return '';
    if ($base !== '' && !preg_match('#^[a-z][a-z0-9+.-]*:#i', $u)) $u = net_resolve($base, $u);
    return preg_match('#^https?://[^\s<>"]+$#i', $u) && strlen($u) <= 2000 ? $u : '';
}

/** Text as HTML, with the addresses in it made links. */
function link_text(string $text): string
{
    $parts = preg_split('#(\bhttps?://[^\s<>"\']+)#i', $text, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [$text];
    $out = '';
    foreach ($parts as $i => $p) {
        if ($i % 2 === 0) { $out .= htmlspecialchars($p, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); continue; }
        $u = rtrim($p, '.,;:!?)»”');
        $out .= '<a href="' . htmlspecialchars($u, ENT_QUOTES, 'UTF-8') . '" rel="noopener noreferrer nofollow" target="_blank">' . htmlspecialchars($u, ENT_QUOTES, 'UTF-8') . '</a>' . htmlspecialchars(substr($p, strlen($u)), ENT_QUOTES, 'UTF-8');
    }
    return $out;
}

/** Plain text with line breaks as HTML paragraphs, addresses made links. */
function text_to_html(string $s): string
{
    $s = trim(str_replace(["\r\n", "\r"], "\n", $s));
    if ($s === '') return '';
    $out = [];
    foreach (preg_split("/\n{2,}/", $s) as $para) $out[] = '<p>' . nl2br(link_text($para), false) . '</p>';
    return implode('', $out);
}

/**
 * The notes of an episode, cleaned: only p, br, b/strong, i/em, u, s, ul/ol/li, blockquote, pre/code, h4 (any heading)
 * and links (http, https, mailto; they open in a new tab). Pictures, scripts, styles, frames and forms are dropped with
 * what is inside them; other tags are dropped keeping their text. No attribute survives but href.
 */
function clean_html(?string $html, int $max = DESCR_MAX): string
{
    $html = trim((string)$html);
    if ($html === '') return '';
    if (!preg_match('#<[a-z!/][^>]*>#i', $html)) return mb_substr(text_to_html(html_entity_decode($html, ENT_QUOTES | ENT_HTML5, 'UTF-8')), 0, $max);
    if (strlen($html) > 400000) $html = substr($html, 0, 400000);
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="utf-8"?><div id="r">' . $html . '</div>', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_HTML_NODEFDTD);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    $root = $doc->getElementById('r');
    if (!$root) return mb_substr(text_to_html(plain($html, $max)), 0, $max);
    $keep = ['p' => 'p', 'br' => 'br', 'b' => 'strong', 'strong' => 'strong', 'i' => 'em', 'em' => 'em', 'u' => 'u', 's' => 's', 'strike' => 's', 'del' => 's',
        'ul' => 'ul', 'ol' => 'ol', 'li' => 'li', 'blockquote' => 'blockquote', 'pre' => 'pre', 'code' => 'code',
        'h1' => 'h4', 'h2' => 'h4', 'h3' => 'h4', 'h4' => 'h4', 'h5' => 'h4', 'h6' => 'h4', 'a' => 'a'];
    $drop = ['script', 'style', 'iframe', 'object', 'embed', 'img', 'picture', 'video', 'audio', 'source', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'canvas'];
    $block = ['div', 'section', 'article', 'header', 'footer', 'figure', 'figcaption', 'table', 'tr', 'dl', 'dt', 'dd', 'hr', 'center', 'main', 'aside', 'nav'];
    $walk = function (DOMNode $n, bool $inLink = false) use (&$walk, $keep, $drop, $block): string {
        $s = '';
        foreach ($n->childNodes as $c) {
            if ($c instanceof DOMText) { $s .= $inLink ? htmlspecialchars($c->nodeValue ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') : link_text($c->nodeValue ?? ''); continue; }
            if (!$c instanceof DOMElement) continue;
            $tag = strtolower($c->tagName);
            if (in_array($tag, $drop, true)) continue;
            $inner = $walk($c, $inLink || $tag === 'a');
            if (!isset($keep[$tag])) { $s .= in_array($tag, $block, true) ? ($tag === 'hr' ? '<br>' : $inner . '<br>') : $inner; continue; }
            $t = $keep[$tag];
            if ($t === 'br') { $s .= '<br>'; continue; }
            if ($t === 'a') {
                $href = trim($c->getAttribute('href'));
                $ok = preg_match('#^(https?://|mailto:)[^\s<>"]+$#i', $href);
                $s .= $ok ? '<a href="' . htmlspecialchars($href, ENT_QUOTES, 'UTF-8') . '" rel="noopener noreferrer nofollow" target="_blank">' . $inner . '</a>' : $inner;
                continue;
            }
            if (trim(str_replace(["\u{a0}", '&nbsp;', '<br>'], '', strip_tags($inner, '<br>'))) === '' && $t !== 'li') continue;
            $s .= "<$t>$inner</$t>";
        }
        return $s;
    };
    $out = $walk($root);
    $out = preg_replace('#(<br>\s*){3,}#', '<br><br>', $out) ?? $out;
    $out = preg_replace('#^(\s|<br>)+|(\s|<br>)+$#', '', $out) ?? $out;
    if (strlen($out) > $max) {
        // cut on the text, then closed again by DOMDocument so no tag stays open
        $cut = mb_strcut($out, 0, $max);
        $cut = preg_replace('#<[^>]*$#', '', $cut) ?? $cut;
        $d = new DOMDocument();
        libxml_use_internal_errors(true);
        $d->loadHTML('<?xml encoding="utf-8"?><div id="r">' . $cut . '…</div>', LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        $r = $d->getElementById('r');
        $out = '';
        if ($r) foreach ($r->childNodes as $c) $out .= $d->saveHTML($c);
    }
    return $out;
}

// ------------------------------------------------------------------ reading a feed

/** Seconds from "01:02:03", "62:03", "3723" or "3723.5"; 0 when unknown. */
function parse_duration(?string $s): int
{
    $s = trim((string)$s);
    if ($s === '') return 0;
    if (preg_match('/^\d+(\.\d+)?$/', $s)) return (int)round((float)$s);
    if (preg_match('/^(?:(\d+):)?(\d{1,3}):(\d{1,2})(?:\.\d+)?$/', $s, $m)) return (int)$m[1] * 3600 + (int)$m[2] * 60 + (int)$m[3];
    return 0;
}

/** A date of a feed as UTC for the database, or null. */
function parse_date(?string $s): ?string
{
    $s = trim((string)$s);
    if ($s === '') return null;
    // a few feeds write the time zone with words the parser does not know
    $s = preg_replace('/\s+(UT|Z)$/i', ' +0000', $s) ?? $s;
    $t = strtotime($s);
    if ($t === false || $t < 0) return null;
    if ($t > time() + 86400 * 2) $t = time(); // dates in the future: as now, so they do not stay on top for ever
    return gmdate('Y-m-d H:i:s', $t);
}

function x_attr(?SimpleXMLElement $e, string $name, string $ns = ''): string
{
    if (!$e) return '';
    $a = $ns === '' ? $e->attributes() : $e->attributes($ns);
    return $a && isset($a[$name]) ? trim((string)$a[$name]) : '';
}

/** The first child $name in namespace $ns ('' for none). */
function x_child(SimpleXMLElement $e, string $name, string $ns = ''): ?SimpleXMLElement
{
    $c = $ns === '' ? $e->children() : $e->children($ns);
    return isset($c->{$name}) ? $c->{$name}[0] : null;
}

function x_text(SimpleXMLElement $e, string $name, string $ns = ''): string
{
    $c = x_child($e, $name, $ns);
    return $c === null ? '' : trim((string)$c);
}

/**
 * A feed as XML → ['feed' => [...], 'episodes' => [...]], or null when it is not a podcast feed.
 * $base: the address of the feed (relative links and pictures).
 */
function parse_feed(string $xml, string $base): ?array
{
    if (strlen($xml) < 20) return null;
    $xml = preg_replace('/^\xEF\xBB\xBF/', '', ltrim($xml)) ?? $xml;
    $prev = libxml_use_internal_errors(true);
    $opts = LIBXML_NOCDATA | LIBXML_NONET | LIBXML_COMPACT | (strlen($xml) > 9000000 ? LIBXML_PARSEHUGE : 0);
    $sx = simplexml_load_string($xml, 'SimpleXMLElement', $opts);
    if ($sx === false) {
        // characters that XML does not allow (often in feeds made by hand): taken away, then a second try
        $sx = simplexml_load_string(preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', $xml) ?? '', 'SimpleXMLElement', $opts);
    }
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    if ($sx === false) return null;
    $root = strtolower($sx->getName());
    if ($root === 'rss' && isset($sx->channel)) return parse_rss($sx->channel[0], $base);
    if ($root === 'feed') return parse_atom($sx, $base);
    if ($root === 'rdf') return isset($sx->channel) ? parse_rss($sx->channel[0], $base, $sx) : null;
    return null;
}

function parse_rss(SimpleXMLElement $ch, string $base, ?SimpleXMLElement $rdf = null): array
{
    $img = safe_url(x_attr(x_child($ch, 'image', NS_ITUNES), 'href'), $base) ?: safe_url(isset($ch->image) ? (string)$ch->image->url : '', $base);
    $cats = [];
    foreach ($ch->children(NS_ITUNES)->category ?? [] as $c) {
        $t = x_attr($c, 'text');
        if ($t !== '' && !in_array($t, $cats, true)) $cats[] = $t;
        foreach ($c->children(NS_ITUNES)->category ?? [] as $sub) { $t2 = x_attr($sub, 'text'); if ($t2 !== '' && !in_array($t2, $cats, true)) $cats[] = $t2; }
    }
    $funding = [];
    foreach ($ch->children(NS_PODCAST)->funding ?? [] as $f) {
        $u = safe_url(x_attr($f, 'url'));
        if ($u !== '') $funding[] = ['url' => $u, 'text' => plain((string)$f, 80)];
        if (count($funding) >= 3) break;
    }
    $owner = x_child($ch, 'owner', NS_ITUNES);
    $feed = [
        'title' => plain((string)$ch->title, 300),
        'author' => plain(x_text($ch, 'author', NS_ITUNES) ?: ($owner ? x_text($owner, 'name', NS_ITUNES) : '') ?: (string)$ch->managingEditor, 300),
        'descr' => clean_html(x_text($ch, 'summary', NS_ITUNES) ?: (string)$ch->description, 8000),
        'link' => safe_url((string)$ch->link, $base),
        'image' => $img,
        'lang' => strtolower(substr(preg_replace('/[^A-Za-z-]/', '', (string)$ch->language) ?? '', 0, 16)),
        'cats' => mb_substr(implode(', ', array_slice($cats, 0, 6)), 0, 250),
        'explicit' => in_array(strtolower(x_text($ch, 'explicit', NS_ITUNES)), ['yes', 'true', 'explicit'], true) ? 1 : 0,
        'newUrl' => safe_url(x_text($ch, 'new-feed-url', NS_ITUNES)),
        'extra' => array_filter(['funding' => $funding, 'guid' => mb_substr(x_text($ch, 'guid', NS_PODCAST), 0, 80), 'complete' => strtolower(x_text($ch, 'complete', NS_ITUNES)) === 'yes']),
    ];
    $items = $rdf ? $rdf->item : $ch->item;
    $eps = [];
    foreach ($items ?? [] as $it) {
        $enc = isset($it->enclosure) ? $it->enclosure[0] : null;
        $audio = safe_url(x_attr($enc, 'url'), $base);
        $type = strtolower(x_attr($enc, 'type'));
        $bytes = (int)x_attr($enc, 'length');
        if ($audio === '') {
            // no enclosure: media:content with sound, as some feeds write it
            foreach ($it->children(NS_MEDIA)->content ?? [] as $mc) {
                $mt = strtolower(x_attr($mc, 'type'));
                if (strpos($mt, 'audio/') === 0 || strpos($mt, 'video/') === 0 || x_attr($mc, 'medium') === 'audio') { $audio = safe_url(x_attr($mc, 'url'), $base); $type = $mt; $bytes = (int)x_attr($mc, 'fileSize'); break; }
            }
        }
        if ($audio === '') continue;
        $title = plain((string)$it->title, 300) ?: plain(x_text($it, 'title', NS_ITUNES), 300);
        $notes = x_text($it, 'encoded', NS_CONTENT) ?: (string)$it->description ?: x_text($it, 'summary', NS_ITUNES);
        $guid = trim((string)$it->guid) ?: $audio;
        $eps[] = [
            'guid' => $guid,
            'title' => $title !== '' ? $title : plain(basename(parse_url($audio, PHP_URL_PATH) ?: ''), 300),
            'descr' => clean_html($notes),
            'summary' => plain(x_text($it, 'subtitle', NS_ITUNES) ?: $notes, 400),
            'pub' => parse_date((string)$it->pubDate ?: x_text($it, 'date', 'http://purl.org/dc/elements/1.1/')),
            'duration' => parse_duration(x_text($it, 'duration', NS_ITUNES)),
            'audio' => $audio,
            'type' => mb_substr($type, 0, 80),
            'bytes' => max(0, $bytes),
            'image' => safe_url(x_attr(x_child($it, 'image', NS_ITUNES), 'href'), $base),
            'link' => safe_url((string)$it->link, $base),
            'season' => ($s = (int)x_text($it, 'season', NS_ITUNES)) > 0 && $s < 65000 ? $s : null,
            'episode' => ($n = (int)x_text($it, 'episode', NS_ITUNES)) > 0 ? $n : null,
            'kind' => in_array($k = strtolower(x_text($it, 'episodeType', NS_ITUNES)), ['trailer', 'bonus'], true) ? $k : 'full',
        ];
    }
    return ['feed' => $feed, 'episodes' => $eps];
}

function parse_atom(SimpleXMLElement $f, string $base): array
{
    $ch = $f->children(NS_ATOM);
    $link = '';
    foreach ($ch->link ?? [] as $l) if (in_array(x_attr($l, 'rel'), ['', 'alternate'], true)) { $link = safe_url(x_attr($l, 'href'), $base); break; }
    $feed = [
        'title' => plain((string)$ch->title, 300),
        'author' => plain(isset($ch->author) ? (string)$ch->author->name : '', 300),
        'descr' => clean_html((string)$ch->subtitle, 8000),
        'link' => $link,
        'image' => safe_url(x_attr(x_child($f, 'image', NS_ITUNES), 'href'), $base) ?: safe_url((string)$ch->logo ?: (string)$ch->icon, $base),
        'lang' => strtolower(substr(x_attr($f, 'lang', 'http://www.w3.org/XML/1998/namespace'), 0, 16)),
        'cats' => '', 'explicit' => 0, 'newUrl' => '', 'extra' => [],
    ];
    $eps = [];
    foreach ($ch->entry ?? [] as $en) {
        $e = $en->children(NS_ATOM);
        $audio = $type = '';
        $bytes = 0;
        $page = '';
        foreach ($e->link ?? [] as $l) {
            $rel = x_attr($l, 'rel');
            if ($rel === 'enclosure' && $audio === '') { $audio = safe_url(x_attr($l, 'href'), $base); $type = strtolower(x_attr($l, 'type')); $bytes = (int)x_attr($l, 'length'); }
            elseif (in_array($rel, ['', 'alternate'], true) && $page === '') $page = safe_url(x_attr($l, 'href'), $base);
        }
        if ($audio === '') continue;
        $notes = (string)$e->content ?: (string)$e->summary;
        $eps[] = [
            'guid' => trim((string)$e->id) ?: $audio, 'title' => plain((string)$e->title, 300), 'descr' => clean_html($notes), 'summary' => plain((string)$e->summary ?: $notes, 400),
            'pub' => parse_date((string)$e->published ?: (string)$e->updated), 'duration' => parse_duration(x_text($en, 'duration', NS_ITUNES)),
            'audio' => $audio, 'type' => mb_substr($type, 0, 80), 'bytes' => max(0, $bytes), 'image' => safe_url(x_attr(x_child($en, 'image', NS_ITUNES), 'href'), $base),
            'link' => $page, 'season' => null, 'episode' => null, 'kind' => 'full',
        ];
    }
    return ['feed' => $feed, 'episodes' => $eps];
}

// ------------------------------------------------------------------ feeds in the database

function url_hash(string $url): string
{
    // the same feed written with http or https, or with a final slash, is one feed
    $u = preg_replace('#^https?://#i', '', rtrim($url, '/')) ?? $url;
    $p = strpos($u, '/');
    $u = $p === false ? strtolower($u) : strtolower(substr($u, 0, $p)) . substr($u, $p);
    return sha1($u);
}

function feed_row(int $id): ?array
{
    $f = q('SELECT * FROM ' . t('pod_feeds') . ' WHERE id = ?', [$id])->fetch();
    return $f ?: null;
}

/** The feed with this address (created, without reading it, when it is new). */
function feed_for_url(string $url): array
{
    $h = url_hash($url);
    $f = q('SELECT * FROM ' . t('pod_feeds') . ' WHERE url_hash = ?', [$h])->fetch();
    if ($f) return $f;
    q('INSERT IGNORE INTO ' . t('pod_feeds') . ' (url, url_hash, created_at) VALUES (?,?,?)', [$url, $h, now_utc()]);
    return q('SELECT * FROM ' . t('pod_feeds') . ' WHERE url_hash = ?', [$h])->fetch();
}

/** Whether the feed should be asked again: never read, or older than refresh_minutes (less often after errors). */
function feed_stale(array $f, ?int $minutes = null): bool
{
    if (!$f['checked_at']) return true;
    $m = $minutes ?? (int)config_value('refresh_minutes', 30);
    $m *= min(48, 1 + (int)$f['fails'] * (int)$f['fails']); // a feed that keeps failing is asked less and less often
    return strtotime($f['checked_at'] . ' UTC') < time() - $m * 60;
}

/**
 * Brings feeds up to date, several at once. $feeds: rows of pod_feeds. Each one is claimed first (checked_at = now), so
 * two requests never read the same feed together. Returns [id => 'new' | 'same' | 'error'].
 */
function refresh_feeds(array $feeds, int $timeout = 12, bool $force = false): array
{
    $reqs = [];
    $rows = [];
    foreach ($feeds as $f) {
        $id = (int)$f['id'];
        $claim = q('UPDATE ' . t('pod_feeds') . ' SET checked_at = ? WHERE id = ? AND (checked_at IS NULL OR checked_at < ?)', [now_utc(), $id, gmdate('Y-m-d H:i:s', time() - ($force ? 15 : 60))]);
        if ($claim->rowCount() !== 1) continue;
        $rows[$id] = $f;
        $first = !$f['fetched_at'];
        $reqs[$id] = ['url' => $f['url'], 'max' => FEED_MAX_BYTES, 'etag' => $first ? '' : $f['etag'], 'modified' => $first ? '' : $f['modified']];
    }
    if (!$reqs) return [];
    $res = net_fetch_many($reqs, $timeout);
    $out = [];
    foreach ($res as $id => $r) {
        $f = $rows[$id];
        if ($r['ok'] && $r['status'] === 304) {
            q('UPDATE ' . t('pod_feeds') . " SET fails = 0, error = '' WHERE id = ?", [$id]);
            $out[$id] = 'same';
            continue;
        }
        $parsed = $r['ok'] ? parse_feed((string)$r['body'], (string)$r['url']) : null;
        if (!$parsed) {
            $err = !$r['ok'] ? ($r['error'] === 'http' ? 'http_' . $r['status'] : $r['error']) : 'not_feed';
            q('UPDATE ' . t('pod_feeds') . ' SET fails = LEAST(fails + 1, 1000), error = ? WHERE id = ?', [mb_substr($err, 0, 40), $id]);
            $out[$id] = 'error';
            continue;
        }
        store_feed($f, $parsed, $r);
        $out[$id] = 'new';
    }
    return $out;
}

function refresh_feed(array $f, bool $force = false): string
{
    return refresh_feeds([$f], 15, $force)[(int)$f['id']] ?? 'busy';
}

/** Writes a feed just read: its details, its episodes (new ones added, known ones updated), its new address. */
function store_feed(array $f, array $parsed, array $res): void
{
    $id = (int)$f['id'];
    $p = $parsed['feed'];
    $eps = $parsed['episodes'];
    usort($eps, fn($a, $b) => strcmp((string)$b['pub'], (string)$a['pub']));
    $eps = array_slice($eps, 0, FEED_MAX_EPISODES);
    $latest = $eps ? $eps[0]['pub'] : null;
    // a feed that moved for good (permanent redirect or itunes:new-feed-url) keeps its row: its address changes when free
    $url = $f['url'];
    foreach ([$res['moved'] ?? '', $p['newUrl'] ?? ''] as $to) {
        $to = net_clean_url((string)$to);
        if ($to === '' || url_hash($to) === url_hash($url)) continue;
        if (!q('SELECT 1 FROM ' . t('pod_feeds') . ' WHERE url_hash = ?', [url_hash($to)])->fetchColumn()) $url = $to;
    }
    $extra = $p['extra'] ? json_out($p['extra']) : null;
    q('UPDATE ' . t('pod_feeds') . ' SET url = ?, url_hash = ?, title = ?, author = ?, descr = ?, link = ?, image = ?, lang = ?, cats = ?, explicit = ?, extra = ?,
        etag = ?, modified = ?, latest_at = COALESCE(?, latest_at), fails = 0, error = \'\', fetched_at = ? WHERE id = ?',
        [$url, url_hash($url), $p['title'] ?: ($f['title'] ?: parse_url($url, PHP_URL_HOST)), $p['author'], $p['descr'], $p['link'], $p['image'], $p['lang'], $p['cats'], $p['explicit'], $extra,
            (string)($res['etag'] ?? ''), (string)($res['modified'] ?? ''), $latest, now_utc(), $id]);
    // episodes: in groups, one statement each; the id of a known episode never changes (states and queue point at it)
    $now = now_utc();
    foreach (array_chunk($eps, 100) as $chunk) {
        $vals = [];
        $args = [];
        $seen = [];
        foreach ($chunk as $e) {
            $gh = sha1($e['guid']);
            if (isset($seen[$gh])) continue;
            $seen[$gh] = 1;
            $vals[] = '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
            array_push($args, $id, $gh, $e['title'], $e['summary'], $e['descr'], $e['pub'], $e['duration'], $e['audio'], $e['type'], $e['bytes'], $e['image'], $e['link'], $e['season'], $e['episode'], $e['kind'], $now);
        }
        if (!$vals) continue;
        q('INSERT INTO ' . t('pod_episodes') . ' (feed_id, guid_hash, title, summary, descr, pub_at, duration, audio, audio_type, audio_bytes, image, link, season, episode, kind, created_at) VALUES '
            . implode(',', $vals) . ' ON DUPLICATE KEY UPDATE title = VALUES(title), summary = VALUES(summary), descr = VALUES(descr), pub_at = COALESCE(VALUES(pub_at), pub_at),
            duration = IF(VALUES(duration) > 0, VALUES(duration), duration), audio = VALUES(audio), audio_type = VALUES(audio_type), audio_bytes = VALUES(audio_bytes),
            image = VALUES(image), link = VALUES(link), season = VALUES(season), episode = VALUES(episode), kind = VALUES(kind)', $args);
    }
    q('UPDATE ' . t('pod_feeds') . ' SET n_episodes = (SELECT COUNT(*) FROM ' . t('pod_episodes') . ' WHERE feed_id = ?) WHERE id = ?', [$id, $id]);
}

// ------------------------------------------------------------------ pictures (through the server: the listener stays unseen)

function img_key(): string
{
    static $k = null;
    if ($k === null) $k = (string)db()->query('SELECT v FROM ' . t('meta') . " WHERE k = 'pod_img_key'")->fetchColumn();
    return $k;
}

const IMG_SIZES = [96, 200, 400, 800];

/** A text in an address, as base64url. */
function b64u(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

/**
 * The address of a picture of a publisher as the app shows it: through api/?r=img, signed, at width $w (one of
 * IMG_SIZES). $alt: a second picture, tried when the first one does not come (signed together with it).
 */
function img_url(?string $src, int $w = 400, string $alt = ''): ?string
{
    $src = trim((string)$src);
    $alt = trim($alt);
    if ($src === '' || !preg_match('#^https?://#i', $src)) return null;
    if ($alt === $src || !preg_match('#^https?://#i', $alt)) $alt = '';
    return 'api/?r=img&w=' . $w . '&u=' . b64u($src) . ($alt !== '' ? '&a=' . b64u($alt) : '') . '&s=' . substr(hash_hmac('sha256', $w . '|' . $src . '|' . $alt, img_key()), 0, 24);
}

// ------------------------------------------------------------------ what the app receives

function out_feed(array $f, bool $full = false): array
{
    $o = [
        'id' => (int)$f['id'], 'title' => $f['title'] !== '' ? $f['title'] : (string)parse_url($f['url'], PHP_URL_HOST), 'author' => $f['author'],
        'image' => img_url($f['image'], 400), 'thumb' => img_url($f['image'], 200), 'latest' => iso($f['latest_at']), 'episodes' => (int)$f['n_episodes'],
        'ready' => (bool)$f['fetched_at'], 'error' => $f['fetched_at'] ? '' : $f['error'],
    ];
    if ($full) {
        $x = json_decode((string)$f['extra'], true) ?: [];
        $o += ['url' => $f['url'], 'link' => $f['link'], 'descr' => (string)$f['descr'], 'lang' => $f['lang'], 'cats' => $f['cats'] !== '' ? explode(', ', $f['cats']) : [],
            'explicit' => (bool)$f['explicit'], 'funding' => $x['funding'] ?? [], 'complete' => !empty($x['complete']), 'checked' => iso($f['checked_at']), 'problem' => $f['error']];
    }
    return $o;
}

/**
 * An episode for the app. $e may carry the columns of its state (pos, dur, done, starred) and of its podcast (f_title,
 * f_image, f_author) from a JOIN.
 */
function out_episode(array $e, bool $full = false): array
{
    $o = [
        'id' => (int)$e['id'], 'feed' => (int)$e['feed_id'], 'title' => $e['title'], 'date' => iso($e['pub_at']), 'dur' => (int)$e['duration'],
        'audio' => $e['audio'], 'type' => $e['audio_type'], 'bytes' => (int)$e['audio_bytes'],
        'image' => img_url($e['image'] ?: ($e['f_image'] ?? ''), 400), 'thumb' => img_url($e['image'] ?: ($e['f_image'] ?? ''), 200),
        'season' => $e['season'] !== null ? (int)$e['season'] : null, 'ep' => $e['episode'] !== null ? (int)$e['episode'] : null, 'kind' => $e['kind'],
        'summary' => $e['summary'],
        'pos' => (int)($e['pos'] ?? 0), 'done' => !empty($e['done']), 'starred' => !empty($e['starred']),
    ];
    if (isset($e['f_title'])) $o['podcast'] = ['id' => (int)$e['feed_id'], 'title' => $e['f_title'], 'author' => $e['f_author'] ?? ''];
    if ($full) $o += ['descr' => (string)$e['descr'], 'link' => $e['link']];
    return $o;
}

/** The columns of an episode with the state of $uid and its podcast: SELECT … FROM episodes e JOIN feeds f LEFT JOIN states s. */
function ep_select(bool $descr = false): string
{
    return 'SELECT e.id, e.feed_id, e.title, e.summary, ' . ($descr ? 'e.descr, ' : '') . 'e.pub_at, e.duration, e.audio, e.audio_type, e.audio_bytes, e.image, e.link, e.season, e.episode, e.kind,
        f.title AS f_title, f.image AS f_image, f.author AS f_author, s.pos, s.dur, s.done, s.starred, s.updated_at AS s_updated
        FROM ' . t('pod_episodes') . ' e JOIN ' . t('pod_feeds') . ' f ON f.id = e.feed_id LEFT JOIN ' . t('pod_states') . ' s ON s.episode_id = e.id AND s.user_id = ?';
}

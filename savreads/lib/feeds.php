<?php
/**
 * SavReads — feeds of sites (RSS 2.0, RSS 1.0/RDF, Atom and JSON Feed) and articles saved from the Internet.
 *
 * The network and the small helpers of XML come from SavPodcasts (../../savpodcasts/lib/net.php and feeds.php: every
 * address is checked to be public before it is asked for, redirects are followed by hand, answers are cut at a size).
 * Its parser of feeds keeps only items with sound, so the articles are read here: rd_parse_feed.
 *
 * A feed is read once for everybody (it is public), again when someone needs it and it is older than refresh_minutes,
 * with If-None-Match / If-Modified-Since; tools/refresh.php does the same from cron. The newest FEED_KEEP articles of a
 * feed are kept. Their HTML is cleaned like a saved article (rd_clean): pictures pass through the server.
 */

declare(strict_types=1);

if (!defined('NET_AGENT')) define('NET_AGENT', 'SavReads/1.0 (+https://www.illerom.eu/savreads/; feed reader and read-later)');
require_once dirname(__DIR__, 2) . '/savpodcasts/lib/feeds.php'; // net_*, plain, safe_url, text_to_html, parse_date, url_hash, x_attr/x_child/x_text, b64u
require_once __DIR__ . '/extract.php';

const RD_FEED_MAX_BYTES = 12000000;
const RD_FEED_KEEP = 400;          // articles kept of one feed
const RD_ITEM_MAX = 200000;        // clean HTML of one article of a feed
const NS_DC = 'http://purl.org/dc/elements/1.1/';
const NS_RSS1 = 'http://purl.org/rss/1.0/';
const RD_ACCEPT_FEED = 'application/feed+json, application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, text/html;q=0.7, */*;q=0.5';
const RD_ACCEPT_PAGE = 'text/html, application/xhtml+xml;q=0.9, */*;q=0.5';

// ------------------------------------------------------------------ pictures (through the server: the reader stays unseen)

function rd_img_key(): string
{
    static $k = null;
    if ($k === null) $k = (string)db()->query('SELECT v FROM ' . t('meta') . " WHERE k = 'rd_img_key'")->fetchColumn();
    return $k;
}

const RD_IMG_SIZES = [64, 200, 400, 800, 1400];

/** The address of a picture of a publisher as the app shows it: through api/?r=img, signed, at most $w wide. */
function rd_img_url(?string $src, int $w = 800): ?string
{
    $src = trim((string)$src);
    if ($src === '' || !preg_match('#^https?://#i', $src)) return null;
    return 'api/?r=img&w=' . $w . '&u=' . b64u($src) . '&s=' . substr(hash_hmac('sha256', $w . '|' . $src, rd_img_key()), 0, 24);
}

/** The pictures of clean HTML, through the server. */
function rd_proxy_html(string $html, int $w = 1400): string
{
    if ($html === '' || stripos($html, '<img') === false) return $html;
    return preg_replace_callback('#<img src="([^"]+)"#', function ($m) use ($w) {
        $u = rd_img_url(html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8'), $w);
        return $u ? '<img loading="lazy" src="' . htmlspecialchars($u, ENT_QUOTES, 'UTF-8') . '"' : '<img';
    }, $html) ?? $html;
}

// ------------------------------------------------------------------ reading a feed

/** Words of clean HTML. */
function rd_words(string $html): int
{
    $t = trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags(str_replace(['</p>', '<br>', '</li>'], ' ', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8')) ?? '');
    return $t === '' ? 0 : count(preg_split('/\s+/u', $t));
}

/** The first picture of clean HTML (the cover of an article of a feed that gives none). */
function rd_first_img(string $html): string
{
    return preg_match('#<img src="([^"]+)"#', $html, $m) ? html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8') : '';
}

/** An item of a feed, made the same for every format. */
function rd_item(string $guid, string $title, string $link, string $author, string $html, string $summary, string $date, string $image, string $base): ?array
{
    $content = rd_clean($html, $link ?: $base, RD_ITEM_MAX);
    $title = plain($title, 400);
    if ($title === '' && $content === '' && $link === '') return null;
    if ($title === '') $title = plain($summary ?: strip_tags($content), 120);
    return [
        'guid' => $guid !== '' ? $guid : ($link !== '' ? $link : sha1($title . $date)),
        'title' => $title,
        'link' => $link,
        'author' => plain($author, 300),
        'content' => $content,
        'summary' => plain($summary !== '' ? $summary : $content, 300),
        'words' => rd_words($content),
        'image' => $image !== '' ? $image : rd_first_img($content),
        'pub' => parse_date($date),
    ];
}

/** A JSON Feed (https://jsonfeed.org) → the same as rd_parse_feed, or null. */
function rd_parse_json(string $body, string $base): ?array
{
    $j = json_decode($body, true);
    if (!is_array($j) || !preg_match('#jsonfeed\.org/version/#', (string)($j['version'] ?? '')) || !is_array($j['items'] ?? null)) return null;
    $who = fn($x) => is_array($x) ? (string)($x['authors'][0]['name'] ?? $x['author']['name'] ?? '') : '';
    $feed = ['title' => plain((string)($j['title'] ?? ''), 300), 'link' => safe_url((string)($j['home_page_url'] ?? ''), $base), 'descr' => plain((string)($j['description'] ?? ''), 600),
        'icon' => safe_url((string)($j['icon'] ?? $j['favicon'] ?? ''), $base), 'kind' => 'json'];
    $items = [];
    foreach (array_slice($j['items'], 0, RD_FEED_KEEP) as $it) {
        if (!is_array($it)) continue;
        $link = safe_url((string)($it['url'] ?? $it['external_url'] ?? ''), $base);
        $html = (string)($it['content_html'] ?? '') ?: text_to_html((string)($it['content_text'] ?? ''));
        $x = rd_item((string)($it['id'] ?? ''), (string)($it['title'] ?? ''), $link, $who($it) ?: $who($j), $html, (string)($it['summary'] ?? ''), (string)($it['date_published'] ?? $it['date_modified'] ?? ''), safe_url((string)($it['image'] ?? $it['banner_image'] ?? ''), $base), $base);
        if ($x) $items[] = $x;
    }
    return ['feed' => $feed, 'items' => $items];
}

/** A feed (XML or JSON) → ['feed' => [title, link, descr, icon, kind], 'items' => [...]], or null when it is not a feed. */
function rd_parse_feed(string $body, string $base): ?array
{
    $body = preg_replace('/^\xEF\xBB\xBF/', '', ltrim($body)) ?? $body;
    if (strlen($body) < 20) return null;
    if ($body[0] === '{') return rd_parse_json($body, $base);
    if (stripos(substr($body, 0, 600), '<html') !== false) return null;
    $prev = libxml_use_internal_errors(true);
    $opts = LIBXML_NOCDATA | LIBXML_NONET | LIBXML_COMPACT | (strlen($body) > 9000000 ? LIBXML_PARSEHUGE : 0);
    $sx = simplexml_load_string($body, 'SimpleXMLElement', $opts);
    if ($sx === false) $sx = simplexml_load_string(preg_replace('/[^\x{9}\x{A}\x{D}\x{20}-\x{D7FF}\x{E000}-\x{FFFD}\x{10000}-\x{10FFFF}]/u', '', $body) ?? '', 'SimpleXMLElement', $opts);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    if ($sx === false) return null;
    $root = strtolower($sx->getName());
    if ($root === 'rss' && isset($sx->channel)) return rd_parse_rss($sx->channel[0], $sx->channel[0]->item, $base, 'rss');
    if ($root === 'rdf') {
        $ch = $sx->children(NS_RSS1);
        if (!isset($ch->channel)) return null;
        return rd_parse_rss($ch->channel[0], $ch->item, $base, 'rdf', true);
    }
    if ($root === 'feed') return rd_parse_atom($sx, $base);
    return null;
}

function rd_parse_rss(SimpleXMLElement $ch, $items, string $base, string $kind, bool $rss1 = false): array
{
    $c = $rss1 ? $ch->children(NS_RSS1) : $ch;
    $icon = isset($c->image) ? safe_url((string)($c->image->url ?? ''), $base) : '';
    if ($icon === '') $icon = safe_url(x_attr(x_child($ch, 'image', NS_ITUNES), 'href'), $base);
    $feed = ['title' => plain((string)$c->title, 300), 'link' => safe_url((string)$c->link, $base), 'descr' => plain((string)$c->description, 600), 'icon' => $icon, 'kind' => $kind];
    $out = [];
    $n = 0;
    foreach ($items ?? [] as $it) {
        if (++$n > RD_FEED_KEEP) break;
        $i = $rss1 ? $it->children(NS_RSS1) : $it;
        $link = safe_url(trim((string)$i->link), $base);
        $guid = trim((string)($i->guid ?? ''));
        if ($link === '' && $guid !== '' && preg_match('#^https?://#i', $guid) && strtolower(x_attr($i->guid[0] ?? null, 'isPermaLink')) !== 'false') $link = safe_url($guid, $base);
        if ($rss1 && $guid === '') $guid = x_attr($it, 'about', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#');
        $html = x_text($it, 'encoded', NS_CONTENT) ?: (string)$i->description;
        $image = '';
        foreach ([x_child($it, 'content', NS_MEDIA), x_child($it, 'thumbnail', NS_MEDIA)] as $m) {
            if (!$m) continue;
            $mt = strtolower(x_attr($m, 'type'));
            if ($mt === '' || strpos($mt, 'image/') === 0 || x_attr($m, 'medium') === 'image') { $image = safe_url(x_attr($m, 'url'), $base); if ($image !== '') break; }
        }
        if ($image === '' && isset($i->enclosure) && strpos(strtolower(x_attr($i->enclosure[0], 'type')), 'image/') === 0) $image = safe_url(x_attr($i->enclosure[0], 'url'), $base);
        $author = x_text($it, 'creator', NS_DC) ?: (string)($i->author ?? '');
        $author = preg_replace('/^\S+@\S+\s*\((.+)\)$/', '$1', trim($author)) ?? $author; // "mail@x (Name)"
        if (filter_var($author, FILTER_VALIDATE_EMAIL)) $author = '';
        $x = rd_item($guid, (string)$i->title, $link, $author, $html, (string)$i->description !== $html ? (string)$i->description : '', (string)($i->pubDate ?? '') ?: x_text($it, 'date', NS_DC), $image, $base);
        if ($x) $out[] = $x;
    }
    return ['feed' => $feed, 'items' => $out];
}

function rd_parse_atom(SimpleXMLElement $f, string $base): array
{
    $ch = $f->children(NS_ATOM);
    $link = '';
    foreach ($ch->link ?? [] as $l) if (in_array(x_attr($l, 'rel'), ['', 'alternate'], true)) { $link = safe_url(x_attr($l, 'href'), $base); break; }
    $feed = ['title' => plain((string)$ch->title, 300), 'link' => $link, 'descr' => plain((string)$ch->subtitle, 600), 'icon' => safe_url((string)$ch->icon ?: (string)$ch->logo, $base), 'kind' => 'atom'];
    $out = [];
    $n = 0;
    foreach ($ch->entry ?? [] as $en) {
        if (++$n > RD_FEED_KEEP) break;
        $e = $en->children(NS_ATOM);
        $page = '';
        foreach ($e->link ?? [] as $l) if (in_array(x_attr($l, 'rel'), ['', 'alternate'], true)) { $page = safe_url(x_attr($l, 'href'), $base); break; }
        $content = (string)$e->content;
        if ($content !== '' && x_attr($e->content[0], 'type') === 'text') $content = text_to_html($content);
        $summary = (string)$e->summary;
        $image = '';
        foreach ([x_child($en, 'thumbnail', NS_MEDIA), x_child($en, 'content', NS_MEDIA)] as $m) if ($m && $image === '') $image = safe_url(x_attr($m, 'url'), $base);
        if ($image === '') { $g = x_child($en, 'group', NS_MEDIA); if ($g) $image = safe_url(x_attr(x_child($g, 'thumbnail', NS_MEDIA), 'url'), $base); }
        $author = isset($e->author) ? (string)$e->author->name : (isset($ch->author) ? (string)$ch->author->name : '');
        $x = rd_item(trim((string)$e->id), (string)$e->title, $page, $author, $content !== '' ? $content : $summary, $content !== '' ? $summary : '', (string)$e->published ?: (string)$e->updated, $image, $base);
        if ($x) $out[] = $x;
    }
    return ['feed' => $feed, 'items' => $out];
}

/**
 * The feed of an address: a feed itself, or a page that names its feeds (<link rel="alternate">), or the usual places
 * (/feed, /rss.xml…). → ['url', 'parsed', 'res'] or ['error' => code]. $all: every feed a page names, for choosing.
 */
function rd_discover(string $url): array
{
    $url = net_clean_url($url);
    if ($url === '') return ['error' => 'bad_url'];
    $r = net_fetch($url, ['max' => RD_FEED_MAX_BYTES, 'accept' => RD_ACCEPT_FEED], 12);
    if (!$r['ok']) return ['error' => $r['error'] === 'http' ? 'feed_unreachable' : ($r['error'] === 'blocked' ? 'bad_url' : 'feed_unreachable')];
    $parsed = rd_parse_feed((string)$r['body'], (string)$r['url']);
    if ($parsed) return ['url' => (string)$r['moved'], 'parsed' => $parsed, 'res' => $r, 'found' => []];
    // a page: the feeds it names
    $found = [];
    $doc = rd_dom((string)$r['body'], (string)$r['type']);
    if ($doc) {
        $xp = new DOMXPath($doc);
        foreach ($xp->query('//link[@href]') ?: [] as $l) {
            $rel = strtolower((string)$l->getAttribute('rel'));
            $type = strtolower((string)$l->getAttribute('type'));
            if (strpos($rel, 'alternate') === false && $rel !== 'feed') continue;
            if (!preg_match('#(rss|atom|feed\+json|application/json|xml)#', $type) && $rel !== 'feed') continue;
            if (preg_match('#oembed|comments?/feed#i', (string)$l->getAttribute('href') . ' ' . $type)) continue;
            $u = safe_url((string)$l->getAttribute('href'), (string)$r['url']);
            if ($u !== '') $found[url_hash($u)] = ['url' => $u, 'title' => plain((string)$l->getAttribute('title'), 120)];
        }
    }
    $found = array_values($found);
    $try = array_column($found, 'url');
    if (!$try) {
        $p = parse_url((string)$r['url']);
        $root = $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
        foreach (['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feed.json', '/blog/feed', '/?feed=rss2'] as $path) $try[] = $root . $path;
    }
    $reqs = [];
    foreach (array_slice($try, 0, 9) as $i => $u) $reqs[$i] = ['url' => $u, 'max' => RD_FEED_MAX_BYTES, 'accept' => RD_ACCEPT_FEED];
    foreach (net_fetch_many($reqs, 12) as $i => $x) {
        if (!$x['ok']) continue;
        $p2 = rd_parse_feed((string)$x['body'], (string)$x['url']);
        if ($p2) return ['url' => (string)$x['moved'], 'parsed' => $p2, 'res' => $x, 'found' => $found];
    }
    return ['error' => 'feed_not_found'];
}

// ------------------------------------------------------------------ feeds in the database

function rd_feed_row(int $id): ?array
{
    $f = q('SELECT * FROM ' . t('rd_feeds') . ' WHERE id = ?', [$id])->fetch();
    return $f ?: null;
}

/** The feed with this address (created, without reading it, when it is new). */
function rd_feed_for_url(string $url): array
{
    $h = url_hash($url);
    $f = q('SELECT * FROM ' . t('rd_feeds') . ' WHERE url_hash = ?', [$h])->fetch();
    if ($f) return $f;
    q('INSERT IGNORE INTO ' . t('rd_feeds') . ' (url, url_hash, created_at) VALUES (?,?,?)', [$url, $h, now_utc()]);
    return q('SELECT * FROM ' . t('rd_feeds') . ' WHERE url_hash = ?', [$h])->fetch();
}

function rd_feed_stale(array $f, ?int $minutes = null): bool
{
    if (!$f['checked_at']) return true;
    $m = $minutes ?? (int)config_value('refresh_minutes', 30);
    $m *= min(48, 1 + (int)$f['fails'] * (int)$f['fails']); // a feed that keeps failing is asked less and less often
    return strtotime($f['checked_at'] . ' UTC') < time() - $m * 60;
}

/** Brings feeds up to date, several at once (each one is claimed first). Returns [id => 'new' | 'same' | 'error']. */
function rd_refresh_feeds(array $feeds, int $timeout = 12, bool $force = false): array
{
    $reqs = [];
    $rows = [];
    foreach ($feeds as $f) {
        $id = (int)$f['id'];
        $claim = q('UPDATE ' . t('rd_feeds') . ' SET checked_at = ? WHERE id = ? AND (checked_at IS NULL OR checked_at < ?)', [now_utc(), $id, gmdate('Y-m-d H:i:s', time() - ($force ? 15 : 60))]);
        if ($claim->rowCount() !== 1) continue;
        $rows[$id] = $f;
        $first = !$f['fetched_at'];
        $reqs[$id] = ['url' => $f['url'], 'max' => RD_FEED_MAX_BYTES, 'accept' => RD_ACCEPT_FEED, 'etag' => $first ? '' : $f['etag'], 'modified' => $first ? '' : $f['modified']];
    }
    if (!$reqs) return [];
    $out = [];
    foreach (net_fetch_many($reqs, $timeout) as $id => $r) {
        if ($r['ok'] && $r['status'] === 304) {
            q('UPDATE ' . t('rd_feeds') . " SET fails = 0, error = '' WHERE id = ?", [$id]);
            $out[$id] = 'same';
            continue;
        }
        $parsed = $r['ok'] ? rd_parse_feed((string)$r['body'], (string)$r['url']) : null;
        if (!$parsed) {
            $err = !$r['ok'] ? ($r['error'] === 'http' ? 'http_' . $r['status'] : $r['error']) : 'not_feed';
            q('UPDATE ' . t('rd_feeds') . ' SET fails = LEAST(fails + 1, 1000), error = ? WHERE id = ?', [mb_substr($err, 0, 40), $id]);
            $out[$id] = 'error';
            continue;
        }
        rd_store_feed($rows[$id], $parsed, $r);
        $out[$id] = 'new';
    }
    return $out;
}

/** Writes a feed just read: its details and its articles (new ones added, known ones updated, the oldest beyond FEED_KEEP gone). */
function rd_store_feed(array $f, array $parsed, array $res): void
{
    $id = (int)$f['id'];
    $p = $parsed['feed'];
    $items = $parsed['items'];
    $now = now_utc();
    foreach ($items as &$it) $it['pub'] = $it['pub'] ?: $now;
    unset($it);
    usort($items, fn($a, $b) => strcmp((string)$b['pub'], (string)$a['pub']));
    $items = array_slice($items, 0, RD_FEED_KEEP);
    $url = $f['url'];
    $to = net_clean_url((string)($res['moved'] ?? ''));
    if ($to !== '' && url_hash($to) !== url_hash($url) && !q('SELECT 1 FROM ' . t('rd_feeds') . ' WHERE url_hash = ?', [url_hash($to)])->fetchColumn()) $url = $to;
    $icon = $p['icon'];
    if ($icon === '' && ($p['link'] ?: $url) !== '') { $h = parse_url($p['link'] ?: $url); if (!empty($h['host'])) $icon = 'https://' . $h['host'] . '/favicon.ico'; }
    q('UPDATE ' . t('rd_feeds') . ' SET url = ?, url_hash = ?, title = ?, link = ?, descr = ?, icon = ?, kind = ?, etag = ?, modified = ?, latest_at = COALESCE(?, latest_at), fails = 0, error = \'\', fetched_at = ? WHERE id = ?',
        [$url, url_hash($url), $p['title'] ?: ($f['title'] ?: (string)parse_url($url, PHP_URL_HOST)), $p['link'], $p['descr'], $icon, $p['kind'], (string)($res['etag'] ?? ''), (string)($res['modified'] ?? ''), $items ? $items[0]['pub'] : null, $now, $id]);
    foreach (array_chunk($items, 50) as $chunk) {
        $vals = [];
        $args = [];
        $seen = [];
        foreach ($chunk as $e) {
            $gh = sha1($e['guid']);
            if (isset($seen[$gh])) continue;
            $seen[$gh] = 1;
            $vals[] = '(?,?,?,?,?,?,?,?,?,?,?)';
            array_push($args, $id, $gh, $e['title'], $e['author'], $e['link'], $e['summary'], $e['content'], $e['words'], $e['image'], $e['pub'], $now);
        }
        if (!$vals) continue;
        // a known article keeps its date (feeds that change the date of every item on every copy would bring it back up)
        q('INSERT INTO ' . t('rd_items') . ' (feed_id, guid_hash, title, author, link, summary, content, words, image, pub_at, created_at) VALUES ' . implode(',', $vals)
            . ' ON DUPLICATE KEY UPDATE title = VALUES(title), author = VALUES(author), link = VALUES(link), summary = VALUES(summary), content = VALUES(content), words = VALUES(words), image = VALUES(image)', $args);
    }
    // only the newest RD_FEED_KEEP stay
    $cut = q('SELECT pub_at FROM ' . t('rd_items') . ' WHERE feed_id = ? ORDER BY pub_at DESC LIMIT 1 OFFSET ' . RD_FEED_KEEP, [$id])->fetchColumn();
    if ($cut) q('DELETE FROM ' . t('rd_items') . ' WHERE feed_id = ? AND pub_at < ?', [$id, $cut]);
}

// ------------------------------------------------------------------ articles saved from the Internet

/** A page read and made readable: the fields of rd_articles, or ['error' => code]. */
function rd_fetch_page(string $url): array
{
    return rd_fetch_pages(['x' => $url])['x'];
}

/** Several pages at once (an import): [key => fields | ['error' => code]]. */
function rd_fetch_pages(array $urls, int $timeout = 15): array
{
    $reqs = [];
    foreach ($urls as $k => $u) $reqs[$k] = ['url' => $u, 'max' => RD_PAGE_MAX, 'accept' => RD_ACCEPT_PAGE, 'headers' => ['Accept-Language: ' . (identity_lang_header())]];
    $out = [];
    foreach (net_fetch_many($reqs, $timeout) as $k => $r) {
        if (!$r['ok'] || $r['status'] === 304) { $out[$k] = ['error' => $r['error'] === 'blocked' || $r['error'] === 'bad_url' ? 'bad_url' : ($r['error'] === 'http' ? 'http_' . $r['status'] : ($r['error'] ?: 'network'))]; continue; }
        $type = (string)$r['type'];
        if ($type !== '' && !preg_match('#html|xml|text/plain#', $type)) { $out[$k] = ['error' => 'not_page']; continue; }
        $body = (string)$r['body'];
        if (strpos($type, 'text/plain') === 0) {
            $x = ['title' => plain(strtok($body, "\n") ?: '', 300), 'author' => '', 'site' => (string)parse_url($r['url'], PHP_URL_HOST), 'lang' => '', 'image' => '', 'published' => null, 'excerpt' => plain($body, 300), 'content' => text_to_html(mb_substr($body, 0, 200000))];
            $x['words'] = rd_words($x['content']);
        } else {
            // a feed given as an article: its first item
            $feed = stripos(substr($body, 0, 400), '<rss') !== false || stripos(substr($body, 0, 400), '<feed') !== false ? rd_parse_feed($body, (string)$r['url']) : null;
            $x = rd_extract($body, (string)$r['url'], $type);
            if ($feed && !empty($feed['items'][0]) && $x['words'] < 30) { $i = $feed['items'][0]; $x = ['title' => $i['title'], 'author' => $i['author'], 'site' => $feed['feed']['title'], 'lang' => '', 'image' => $i['image'], 'published' => $i['pub'], 'excerpt' => $i['summary'], 'content' => $i['content'], 'words' => $i['words']]; }
        }
        $x['final'] = (string)$r['url'];
        $out[$k] = $x;
    }
    return $out;
}

/** The language the page is asked in: the one of the app (the Accept-Language of the reader is not passed on). */
function identity_lang_header(): string
{
    $l = function_exists('identity_lang') ? identity_lang() : 'en';
    return $l === 'it' ? 'it-IT,it;q=0.9,en;q=0.6' : 'en-GB,en;q=0.9';
}

<?php
/**
 * SavPodcasts — finding podcasts in open catalogues, never in the directories of the big platforms.
 *
 *   Podcast Index (podcastindex.org): open, non-profit, millions of feeds. Used when credentials.php has its free keys.
 *   fyyd (fyyd.de): an independent catalogue with an open API that needs no key. Used otherwise.
 *
 * Both only give feed addresses and descriptions: the podcast itself is always read from its own feed. Answers are kept
 * in pod_cache for a while (searches 30 minutes, the popular ones 3 hours) to be gentle with services run by volunteers.
 * Every result has the same shape: {url, title, author, image, descr, lang, episodes, latest, cats}.
 */

declare(strict_types=1);

require_once __DIR__ . '/net.php';

function catalog_source(): string
{
    return config_value('pi_key', '') !== '' && config_value('pi_secret', '') !== '' ? 'podcastindex' : 'fyyd';
}

/** Raise when the shape of the answers changes (addresses of the pictures, fields): answers kept before are then ignored. */
const CATALOG_CACHE = 'v2';

function cache_get(string $key, int $seconds): ?array
{
    $key = CATALOG_CACHE . '|' . $key;
    $r = q('SELECT v, at FROM ' . t('pod_cache') . ' WHERE k = ?', [sha1($key)])->fetch();
    if (!$r || strtotime($r['at'] . ' UTC') < time() - $seconds) return null;
    $v = json_decode((string)$r['v'], true);
    return is_array($v) ? $v : null;
}

function cache_put(string $key, array $v): void
{
    $key = CATALOG_CACHE . '|' . $key;
    q('INSERT INTO ' . t('pod_cache') . ' (k, v, at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE v = VALUES(v), at = VALUES(at)', [sha1($key), json_out($v), now_utc()]);
}

/** A JSON answer of a catalogue, or null. */
function catalog_get(string $url, array $headers = []): ?array
{
    $r = net_fetch($url, ['max' => 4000000, 'accept' => 'application/json', 'headers' => $headers], 10);
    if (!$r['ok'] || $r['status'] !== 200) return null;
    $d = json_decode((string)$r['body'], true);
    return is_array($d) ? $d : null;
}

function pi_headers(): array
{
    $key = (string)config_value('pi_key', '');
    $now = (string)time();
    return ['X-Auth-Key: ' . $key, 'X-Auth-Date: ' . $now, 'Authorization: ' . sha1($key . config_value('pi_secret', '') . $now)];
}

function iso_ts($v): ?string
{
    if (is_numeric($v) && (int)$v > 0) return gmdate('Y-m-d\TH:i:s\Z', (int)$v);
    if (is_string($v) && $v !== '' && ($t = strtotime($v)) !== false) return gmdate('Y-m-d\TH:i:s\Z', $t);
    return null;
}

/** A result of Podcast Index in the common shape. */
function from_pi(array $x): ?array
{
    $url = net_clean_url((string)($x['url'] ?? ''));
    if ($url === '' || !empty($x['dead']) || trim((string)($x['title'] ?? '')) === '') return null;
    return ['url' => $url, 'title' => plain((string)($x['title'] ?? ''), 200), 'author' => plain((string)($x['author'] ?? $x['ownerName'] ?? ''), 200),
        'image' => img_url((string)($x['artwork'] ?? '') ?: (string)($x['image'] ?? ''), 200, (string)($x['image'] ?? '')), 'descr' => plain((string)($x['description'] ?? ''), 260),
        'lang' => strtolower(substr((string)($x['language'] ?? ''), 0, 8)), 'episodes' => (int)($x['episodeCount'] ?? 0) ?: null,
        'latest' => iso_ts($x['newestItemPubdate'] ?? $x['newestItemPublishTime'] ?? $x['lastUpdateTime'] ?? null),
        'cats' => array_values(array_slice(array_map('strval', (array)($x['categories'] ?? [])), 0, 3))];
}

/** A result of fyyd in the common shape. */
function from_fyyd(array $x): ?array
{
    $url = net_clean_url((string)($x['xmlURL'] ?? ''));
    if ($url === '' || (isset($x['status']) && (int)$x['status'] >= 400) || trim((string)($x['title'] ?? '')) === '') return null;
    return ['url' => $url, 'title' => plain((string)($x['title'] ?? ''), 200), 'author' => plain((string)($x['author'] ?? ''), 200),
        // the artwork of the publisher: fyyd's own copies (smallImageURL…) refuse requests from other sites
        'image' => img_url((string)($x['imgURL'] ?? '') ?: (string)($x['layoutImageURL'] ?? ''), 200), 'descr' => plain((string)($x['description'] ?? $x['subtitle'] ?? ''), 260),
        'lang' => strtolower(substr((string)($x['language'] ?? ''), 0, 8)), 'episodes' => (int)($x['episode_count'] ?? 0) ?: null,
        'latest' => iso_ts($x['lastpub'] ?? null), 'cats' => []];
}

/** Podcasts whose title, author or description match $term. */
function catalog_search(string $term, string $lang = ''): array
{
    $term = trim(mb_substr($term, 0, 120));
    if (mb_strlen($term) < 2) return [];
    $src = catalog_source();
    $key = "search|$src|" . mb_strtolower($term) . "|$lang";
    if (($c = cache_get($key, 1800)) !== null) return $c;
    $list = [];
    if ($src === 'podcastindex') {
        $d = catalog_get('https://api.podcastindex.org/api/1.0/search/byterm?max=40&q=' . rawurlencode($term), pi_headers());
        foreach ((array)($d['feeds'] ?? []) as $x) if (is_array($x) && ($r = from_pi($x))) $list[] = $r;
    } else {
        $d = catalog_get('https://api.fyyd.de/0.2/search/podcast?count=40&term=' . rawurlencode($term));
        foreach ((array)($d['data'] ?? []) as $x) if (is_array($x) && ($r = from_fyyd($x))) $list[] = $r;
    }
    if ($d === null) return [];
    // the language of the app first, the others after (a search in Italian should find Italian podcasts first)
    if ($lang !== '') usort($list, fn($a, $b) => (strpos($b['lang'], $lang) === 0) <=> (strpos($a['lang'], $lang) === 0));
    $list = array_slice($list, 0, 40);
    cache_put($key, $list);
    return $list;
}

/** The podcasts that are listened to most right now, in a language ('' for all). */
function catalog_popular(string $lang = ''): array
{
    $src = catalog_source();
    $key = "popular|$src|$lang";
    if (($c = cache_get($key, 10800)) !== null) return $c;
    $list = [];
    if ($src === 'podcastindex') {
        $d = catalog_get('https://api.podcastindex.org/api/1.0/podcasts/trending?max=40' . ($lang !== '' ? '&lang=' . rawurlencode($lang) : ''), pi_headers());
        foreach ((array)($d['feeds'] ?? []) as $x) if (is_array($x) && ($r = from_pi($x))) $list[] = $r;
    } else {
        $d = catalog_get('https://api.fyyd.de/0.2/feature/podcast/hot?count=40' . ($lang !== '' ? '&language=' . rawurlencode($lang) : ''));
        foreach ((array)($d['data'] ?? []) as $x) if (is_array($x) && ($r = from_fyyd($x))) $list[] = $r;
    }
    if ($d === null) return [];
    cache_put($key, $list);
    return $list;
}

// ------------------------------------------------------------------ by author, by category

/** Lower case, accents and punctuation away: "Will Media" = "will-media" = "WILL MEDIA". */
function norm_name(string $s): string
{
    $s = mb_strtolower(trim($s));
    if (function_exists('iconv')) $s = (string)@iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    return trim(preg_replace('/[^a-z0-9]+/', ' ', $s) ?? '');
}

/**
 * Whether a podcast is by $who: one of its authors is that name ("Will Media & Chora", "di Will Media", "Radio 24 /
 * Il Sole 24 Ore"), not a longer name that contains it ("At Will Media" is someone else).
 */
function by_author(string $author, string $who): bool
{
    $w = norm_name($who);
    if ($w === '') return false;
    foreach (preg_split('#\s*(?:[,/&|;+·–—]|\s(?:and|e|ed|und|et|y|x|with|con|feat\.?)\s)\s*#iu', $author) ?: [] as $part) {
        $p = preg_replace('/^(by|di|da|a cura di|presented by|hosted by|con|with|von|par)\s+/', '', norm_name($part)) ?? '';
        if ($p === $w) return true;
    }
    return false;
}

/** The categories of fyyd (the same names as in the feeds, itunes:category): name → [id, its subcategories]. Kept a day. */
function fyyd_categories(): array
{
    $c = cache_get('fyyd|categories', 86400);
    if ($c === null) {
        $d = catalog_get('https://api.fyyd.de/0.2/categories');
        $c = [];
        foreach ((array)($d['data'] ?? []) as $x) {
            if (!is_array($x) || empty($x['name'])) continue;
            $subs = array_map(fn($s) => (int)$s['id'], (array)($x['subcategories'] ?? []));
            $c[mb_strtolower((string)$x['name'])] = [(int)$x['id'], $subs];
            foreach ((array)($x['subcategories'] ?? []) as $s) if (!empty($s['name'])) $c[mb_strtolower((string)$s['name'])] = [(int)$s['id'], []];
        }
        if ($c) cache_put('fyyd|categories', $c);
    }
    return $c;
}

/** Podcasts of a catalogue by an author. */
function catalog_by_author(string $who): array
{
    $src = catalog_source();
    $key = "author|$src|" . norm_name($who);
    if (($c = cache_get($key, 10800)) !== null) return $c;
    $list = [];
    if ($src === 'podcastindex') {
        $d = catalog_get('https://api.podcastindex.org/api/1.0/search/byterm?max=100&q=' . rawurlencode($who), pi_headers());
        foreach ((array)($d['feeds'] ?? []) as $x) if (is_array($x) && by_author((string)($x['author'] ?? $x['ownerName'] ?? ''), $who) && ($r = from_pi($x))) $list[] = $r;
    } else {
        // fyyd has no search by author: its search by words, then only what is really by that author
        $d = catalog_get('https://api.fyyd.de/0.2/search/podcast?count=50&term=' . rawurlencode($who));
        foreach ((array)($d['data'] ?? []) as $x) if (is_array($x) && by_author((string)($x['author'] ?? ''), $who) && ($r = from_fyyd($x))) $list[] = $r;
    }
    if ($d === null) return [];
    cache_put($key, $list);
    return $list;
}

/** Podcasts of a catalogue in a category (its name as in the feeds: "News", "Society & Culture"…), in a language ('' all). */
function catalog_by_category(string $cat, string $lang = ''): array
{
    $src = catalog_source();
    $key = "category|$src|" . mb_strtolower($cat) . "|$lang";
    if (($c = cache_get($key, 10800)) !== null) return $c;
    $list = [];
    $d = null;
    if ($src === 'podcastindex') {
        $d = catalog_get('https://api.podcastindex.org/api/1.0/podcasts/trending?max=80&cat=' . rawurlencode($cat) . ($lang !== '' ? '&lang=' . rawurlencode($lang) : ''), pi_headers());
        foreach ((array)($d['feeds'] ?? []) as $x) if (is_array($x) && ($r = from_pi($x))) $list[] = $r;
    } else {
        $cats = fyyd_categories();
        $c = $cats[mb_strtolower($cat)] ?? null;
        if (!$c) return [];
        $ids = array_merge([$c[0]], $c[1]);
        $in = fn(array $x) => (bool)array_intersect($ids, array_map('intval', (array)($x['categories'] ?? [])));
        // the popular ones of the language first (fyyd's lists by category have no language and start from the oldest)
        $d = catalog_get('https://api.fyyd.de/0.2/feature/podcast/hot?count=100' . ($lang !== '' ? '&language=' . rawurlencode($lang) : ''));
        foreach ((array)($d['data'] ?? []) as $x) if (is_array($x) && $in($x) && ($r = from_fyyd($x))) $list[] = $r;
        $recent = gmdate('Y-m-d', time() - 365 * 86400);
        for ($page = 0; $page < 3; $page++) {
            $p = catalog_get('https://api.fyyd.de/0.2/category?count=50&page=' . $page . '&category_id=' . $c[0]);
            if ($p === null) break;
            $d = $d ?? $p;
            foreach ((array)($p['data']['podcasts'] ?? []) as $x) {
                if (!is_array($x) || ($lang !== '' && strpos((string)($x['language'] ?? ''), $lang) !== 0) || substr((string)($x['lastpub'] ?? ''), 0, 10) < $recent) continue;
                if ($r = from_fyyd($x)) $list[] = $r;
            }
        }
    }
    if ($d === null) return [];
    $seen = [];
    $list = array_values(array_filter($list, function ($r) use (&$seen) { $h = url_hash($r['url']); if (isset($seen[$h])) return false; return $seen[$h] = true; }));
    cache_put($key, $list);
    return $list;
}

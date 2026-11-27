<?php
/**
 * SavReads — JSON API.  api/index.php?r=<action>
 *
 * Accounts:   the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login (and the
 *             routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *             auth.reset, auth.profile, auth.export, auth.delete
 * Reading:    rd.init, rd.prefs, rd.list, rd.get, rd.save, rd.preview, rd.update, rd.progress, rd.delete, rd.refetch,
 *             rd.fetch_pending, rd.tags.rename, rd.tags.delete
 * Highlights: rd.hl.add, rd.hl.update, rd.hl.delete, rd.highlights
 * Feeds:      rd.feeds, rd.feeds.add, rd.feeds.update, rd.feeds.remove, rd.feeds.refresh, rd.folder.rename,
 *             rd.items, rd.item, rd.items.read, rd.items.read_all
 * Files:      rd.import (Pocket CSV/HTML, Instapaper CSV, .savrea), rd.export (.savrea), rd.opml.import, rd.opml.export
 * Pictures:   img — a picture of an article, read by the server and made smaller (the publisher never sees the reader)
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/feeds.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavReads API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false]);
if (!credentials()) fail('not_installed', 503);

if ($r === 'img') serve_img();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) fail('bad_request', 415);
remember_app_url();

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}

function writer(bool $unverifiedOk = false): array
{
    only('POST');
    $u = require_user($unverifiedOk);
    require_csrf($u);
    return $u;
}

function reader(): array
{
    only('GET');
    return require_user();
}

function validate_password(string $pw): void
{
    if (mb_strlen($pw) < 8) fail('password_short', 422);
    if (mb_strlen($pw) > 200) fail('password_long', 422);
}

function ui_lang(array $b): string
{
    $l = (string)($b['lang'] ?? '');
    return in_array($l, LANGS, true) ? $l : 'en';
}

function valid_email(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) fail('email_invalid', 422);
}

function user_row(int $id): array
{
    $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: [];
}

function new_user(string $name, string $email, string $hash, ?string $googleSub, string $lang): int
{
    db()->prepare('INSERT INTO ' . t('users') . ' (name, email, password_hash, google_sub, ui_lang, created_at, last_login_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([$name, $email, $hash, $googleSub, $lang, now_utc(), now_utc()]);
    return (int)db()->lastInsertId();
}

function signed_in(int $uid): void
{
    db()->prepare('UPDATE ' . t('users') . ' SET last_login_at = ? WHERE id = ?')->execute([now_utc(), $uid]);
    $csrf = create_auth_session($uid);
    send_json(['ok' => true, 'user' => public_user(user_row($uid)), 'csrf' => $csrf]);
}

/** Too many pages or feeds asked for from one address: a gentle limit, for the sites as much as for the server. */
function limit(string $kind, int $max, int $minutes): void
{
    if (too_many_attempts($kind, $max, $minutes)) fail('rate_limited', 429);
    record_attempt($kind);
}

// ---------- pictures ----------

/**
 * img: a picture of an article (or the icon of a feed), read by the server, made at most w pixels wide and kept in
 * cache/img/ (or the temporary folder). Only addresses signed by rd_img_url() are read, so nobody can use the server to
 * fetch something else. A picture that cannot be read is not asked again for 6 hours.
 */
function serve_img(): void
{
    $w = (int)($_GET['w'] ?? 0);
    $src = base64_decode(strtr((string)($_GET['u'] ?? ''), '-_', '+/'), true);
    if (!in_array($w, RD_IMG_SIZES, true) || $src === false || $src === '' || !hash_equals(substr(hash_hmac('sha256', $w . '|' . $src, rd_img_key()), 0, 24), (string)($_GET['s'] ?? ''))) {
        http_response_code(404);
        exit;
    }
    $dir = dirname(__DIR__) . '/cache/img';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    if (!is_dir($dir) || !is_writable($dir)) { $dir = sys_get_temp_dir() . '/savreads-img'; if (!is_dir($dir)) @mkdir($dir, 0775, true); }
    $name = $dir . '/' . sha1($w . '|' . $src);
    $send = function (string $file, string $type) {
        header('Content-Type: ' . $type);
        header('Cache-Control: private, max-age=31536000, immutable');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'");
        header('Content-Length: ' . filesize($file));
        readfile($file);
        exit;
    };
    foreach (['.jpg' => 'image/jpeg', '.png' => 'image/png', '.webp' => 'image/webp', '.gif' => 'image/gif', '.ico' => 'image/x-icon'] as $ext => $type) if (is_file($name . $ext)) $send($name . $ext, $type);
    $gone = function () use ($name) {
        @file_put_contents($name . '.fail', (string)time());
        http_response_code(404);
        header('Cache-Control: no-store');
        exit;
    };
    if (is_file($name . '.fail') && filemtime($name . '.fail') > time() - 21600) { http_response_code(404); header('Cache-Control: no-store'); exit; }
    $res = net_fetch($src, ['max' => 15000000, 'accept' => 'image/avif;q=0, image/webp, image/jpeg, image/png, image/gif, image/*;q=0.8'], 12);
    if (!$res['ok'] || $res['status'] !== 200 || $res['body'] === '') $gone();
    $body = $res['body'];
    // a favicon.ico: as it is, when small (GD cannot read it)
    if (substr($body, 0, 4) === "\x00\x00\x01\x00") { if (strlen($body) > 300000) $gone(); file_put_contents($name . '.ico', $body); $send($name . '.ico', 'image/x-icon'); }
    $info = @getimagesizefromstring($body);
    $types = [IMAGETYPE_JPEG => ['.jpg', 'image/jpeg'], IMAGETYPE_PNG => ['.png', 'image/png'], IMAGETYPE_GIF => ['.gif', 'image/gif'], IMAGETYPE_WEBP => ['.webp', 'image/webp']];
    if (!$info || !isset($types[$info[2]]) || $info[0] < 1 || $info[1] < 1 || $info[0] * $info[1] > 50000000) $gone();
    [$ext, $type] = $types[$info[2]];
    // small enough, or an animation: as it came
    if (($info[0] <= $w && strlen($body) < 600000) || ($info[2] === IMAGETYPE_GIF && strlen($body) < 4000000)) { file_put_contents($name . $ext, $body); $send($name . $ext, $type); }
    if (function_exists('imagecreatefromstring')) {
        @ini_set('memory_limit', '384M');
        $im = @imagecreatefromstring($body);
        if ($im) {
            $sw = imagesx($im);
            $sh = imagesy($im);
            $scale = min(1, $w / $sw);
            $dw = max(1, (int)round($sw * $scale));
            $dh = max(1, (int)round($sh * $scale));
            $out = imagecreatetruecolor($dw, $dh);
            $alpha = $info[2] === IMAGETYPE_PNG || $info[2] === IMAGETYPE_WEBP;
            if ($alpha) { imagealphablending($out, false); imagesavealpha($out, true); imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127)); }
            else imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
            imagecopyresampled($out, $im, 0, 0, 0, 0, $dw, $dh, $sw, $sh);
            $tmp = $name . '.tmp' . getmypid();
            if ($alpha && function_exists('imagewebp') && imagewebp($out, $tmp, 84)) { rename($tmp, $name . '.webp'); $send($name . '.webp', 'image/webp'); }
            if (!$alpha) { imageinterlace($out, true); if (imagejpeg($out, $tmp, 84)) { rename($tmp, $name . '.jpg'); $send($name . '.jpg', 'image/jpeg'); } }
        }
    }
    if (strlen($body) > 3000000) $gone();
    file_put_contents($name . $ext, $body);
    $send($name . $ext, $type);
}

// ---------- SavAccount: signing in and joining an account that already exists ----------

require dirname(__DIR__, 2) . '/identity/identity.php';

/** The language of the messages of the sign-in: the app sends it with every request. */
function identity_lang(): string
{
    $h = strtolower((string)($_SERVER['HTTP_X_LANG'] ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')));
    return strpos($h, 'it') === 0 ? 'it' : 'en';
}

identity_setup([
    'name' => 'SavReads', 'cookie' => 'savreads', 'lang' => fn() => identity_lang(),
    'fail' => function (string $code, int $http): void {
        fail($code, $http);
    },
    'accepted' => fn(array $b) => !empty($b['acceptTerms']),
    'create' => fn(array $who, array $b) => new_user($who['name'] ?: explode('@', $who['email'])[0], $who['email'], '', null, ui_lang($b)),
    'writer' => fn() => writer(),
]);
identity_route($r);

// ---------- reading: helpers ----------

/** The settings of SavReads of an account (created the first time). */
function profile(array $u): array
{
    $p = q('SELECT * FROM ' . t('rd_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('rd_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], '{}', now_utc()]);
        $p = q('SELECT * FROM ' . t('rd_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    return $p;
}

function profile_prefs(array $p): array
{
    $x = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($x) ? $x : [];
}

function id_of($v): int
{
    return is_numeric($v) && (int)$v > 0 && (int)$v < 4294967295 ? (int)$v : 0;
}

function ids_of($v, int $max = 500): array
{
    return array_values(array_unique(array_filter(array_map('id_of', is_array($v) ? array_slice($v, 0, $max) : []))));
}

function in_list(array $ids): string
{
    return implode(',', array_fill(0, count($ids), '?'));
}

function x(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_XML1, 'UTF-8');
}

/** Tags as people write them: no commas, at most 40 characters each, 20 per article, the same tag once. */
function clean_tags($v): array
{
    $list = is_array($v) ? $v : explode(',', (string)$v);
    $out = [];
    foreach ($list as $t) {
        $t = trim(preg_replace('/[\x00-\x1F\x7F,#]+/u', ' ', (string)$t) ?? '');
        $t = mb_substr(preg_replace('/\s+/u', ' ', $t) ?? '', 0, 40);
        if ($t !== '' && !in_array(mb_strtolower($t), array_map('mb_strtolower', $out), true)) $out[] = $t;
        if (count($out) >= 20) break;
    }
    return $out;
}

/** Tags as kept: ",one,two," (so that one tag is found with LIKE '%,tag,%'). */
function tags_col(array $tags): string
{
    return $tags ? ',' . implode(',', $tags) . ',' : '';
}

function tags_of(string $col): array
{
    return array_values(array_filter(explode(',', $col), fn($t) => $t !== ''));
}

/** An address as one article: the same page written with http or https, a final slash, or the usual tracking words, is one. */
function article_hash(string $url): string
{
    $p = parse_url($url);
    if (!$p || empty($p['host'])) return sha1($url);
    $q = '';
    if (!empty($p['query'])) {
        parse_str($p['query'], $args);
        foreach (array_keys($args) as $k) if (preg_match('/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|ref$|ref_src$|_hsenc$|_hsmi$|mkt_tok$|cmpid$|ocid$|s_kwcid$|yclid$|dclid$|twclid$)/i', (string)$k)) unset($args[$k]);
        ksort($args);
        $q = http_build_query($args);
    }
    return sha1(strtolower(preg_replace('/^www\./', '', $p['host'])) . rtrim($p['path'] ?? '', '/') . ($q !== '' ? '?' . $q : ''));
}

/** The address without the words that only tell where the reader came from (utm_…, fbclid…). */
function clean_article_url(string $url): string
{
    $p = parse_url($url);
    if (!$p || empty($p['query'])) return $url;
    parse_str($p['query'], $args);
    $n = count($args);
    foreach (array_keys($args) as $k) if (preg_match('/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|_hsenc$|_hsmi$|mkt_tok$|yclid$|dclid$|twclid$)/i', (string)$k)) unset($args[$k]);
    if (count($args) === $n) return $url;
    $q = http_build_query($args);
    return preg_replace('/\?[^#]*/', $q !== '' ? '?' . $q : '', $url, 1) ?? $url;
}

/** An article for the lists (no text). */
function out_article(array $a): array
{
    return [
        'id' => (int)$a['id'], 'url' => $a['url'], 'title' => $a['title'] !== '' ? $a['title'] : $a['url'], 'author' => $a['author'], 'site' => $a['site'],
        'image' => rd_img_url($a['image'], 400), 'excerpt' => $a['excerpt'], 'words' => (int)$a['words'], 'lang' => $a['lang'],
        'added' => iso($a['added_at']), 'published' => iso($a['published_at']), 'read' => iso($a['read_at']), 'status' => $a['status'], 'error' => $a['error'],
        'archived' => (bool)$a['archived'], 'starred' => (bool)$a['starred'], 'progress' => round((float)$a['progress'], 4), 'tags' => tags_of($a['tags']),
        'hl' => (int)($a['n_hl'] ?? 0), 'source' => $a['source'],
    ];
}

const ARTICLE_COLS = 'a.id, a.url, a.title, a.author, a.site, a.image, a.excerpt, a.words, a.lang, a.added_at, a.published_at, a.read_at, a.status, a.error, a.archived, a.starred, a.progress, a.tags, a.source';

function article_of(array $u, $id): array
{
    $a = q('SELECT * FROM ' . t('rd_articles') . ' WHERE id = ? AND user_id = ?', [id_of($id), $u['id']])->fetch();
    if (!$a) fail('not_found', 404);
    return $a;
}

function out_highlight(array $h): array
{
    return ['id' => (int)$h['id'], 'article' => (int)$h['article_id'], 'quote' => $h['quote'], 'prefix' => $h['prefix'], 'suffix' => $h['suffix'], 'start' => (int)$h['start'],
        'color' => $h['color'], 'note' => (string)$h['note'], 'created' => iso($h['created_at'])];
}

const HL_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'];

/** An article saved with what is known of it; its text is read later (status pending) unless $x gives it. Returns its id. */
function insert_article(int $uid, string $url, array $x, array $more = []): int
{
    $now = now_utc();
    $added = $more['added'] ?? $now;
    q('INSERT INTO ' . t('rd_articles') . ' (user_id, url, url_hash, title, author, site, lang, image, excerpt, content, words, published_at, status, error, archived, starred, progress, tags, note, source, added_at, updated_at, archived_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [
        $uid, $url, article_hash($url), mb_substr((string)($x['title'] ?? ''), 0, 400), mb_substr((string)($x['author'] ?? ''), 0, 300), mb_substr((string)($x['site'] ?? (string)parse_url($url, PHP_URL_HOST)), 0, 200),
        mb_substr((string)($x['lang'] ?? ''), 0, 16), mb_substr((string)($x['image'] ?? ''), 0, 2048), mb_substr((string)($x['excerpt'] ?? ''), 0, 500),
        ($x['content'] ?? '') !== '' ? $x['content'] : null, (int)($x['words'] ?? 0), $x['published'] ?? null, $more['status'] ?? (($x['content'] ?? '') !== '' ? 'ready' : 'pending'), mb_substr((string)($more['error'] ?? ''), 0, 40),
        !empty($more['archived']) ? 1 : 0, !empty($more['starred']) ? 1 : 0, max(0, min(1, (float)($more['progress'] ?? 0))), tags_col($more['tags'] ?? []), $more['note'] ?? null,
        mb_substr((string)($more['source'] ?? 'url'), 0, 20), $added, $now, !empty($more['archived']) ? $added : null]);
    return (int)db()->lastInsertId();
}

/** Whether what was read of a page is worth reading here: some text, or pictures (a comic, a photo story). */
function readable(array $x): bool
{
    return ($x['content'] ?? '') !== '' && ((int)($x['words'] ?? 0) >= 20 || stripos($x['content'], '<img') !== false);
}

/** What was read of a page, written into an article (keeps what the reader already gave: tags, a title typed…). */
function fill_article(int $id, array $x): void
{
    if (isset($x['error'])) {
        // a page that is not there (4xx, but "too many requests") is not asked again; anything else, up to three times
        $final = $x['error'] === 'bad_url' || $x['error'] === 'not_page' || preg_match('/^http_4(?!29)/', $x['error']);
        q('UPDATE ' . t('rd_articles') . ' SET status = IF(? OR tries >= 2, \'failed\', \'pending\'), error = ?, tries = tries + 1, updated_at = ? WHERE id = ?', [$final ? 1 : 0, mb_substr($x['error'], 0, 40), now_utc(), $id]);
        return;
    }
    $ok = readable($x);
    q('UPDATE ' . t('rd_articles') . ' SET title = IF(? <> \'\', ?, title), author = ?, site = ?, lang = ?, image = ?, excerpt = ?, content = ?, words = ?, published_at = ?, status = ?, error = ?, tries = tries + 1, updated_at = ? WHERE id = ?', [
        $x['title'], mb_substr($x['title'], 0, 400), mb_substr($x['author'], 0, 300), mb_substr($x['site'], 0, 200), mb_substr($x['lang'], 0, 16), mb_substr($x['image'], 0, 2048), mb_substr($x['excerpt'], 0, 500),
        $x['content'] !== '' ? $x['content'] : null, (int)$x['words'], $x['published'], $ok ? 'ready' : 'failed', $ok ? '' : (!empty($x['paywalled']) ? 'paywall' : 'no_text'), now_utc(), $id]);
}

/** The articles of an account still to be read from the Internet, a few at once. Returns how many are left. */
function fetch_pending(int $uid, int $n = 6): int
{
    $rows = q('SELECT id, url FROM ' . t('rd_articles') . " WHERE user_id = ? AND status = 'pending' AND tries < 3 ORDER BY archived, added_at DESC LIMIT " . (int)$n, [$uid])->fetchAll();
    if ($rows) {
        $urls = [];
        foreach ($rows as $a) $urls[(int)$a['id']] = $a['url'];
        foreach (rd_fetch_pages($urls, 20) as $id => $x) fill_article((int)$id, $x);
    }
    return (int)q('SELECT COUNT(*) FROM ' . t('rd_articles') . " WHERE user_id = ? AND status = 'pending' AND tries < 3", [$uid])->fetchColumn();
}

// ---------- feeds: helpers ----------

/** Whether an article of a feed is unread for the account, as SQL (needs i = rd_items, s = rd_subs, st = rd_states). */
const UNREAD_SQL = '(CASE WHEN st.is_read IS NOT NULL THEN st.is_read = 0 ELSE i.pub_at > s.read_before END)';

/** The feeds an account follows, each with how many of its articles are unread. */
function subs_of(int $uid): array
{
    $rows = q('SELECT f.*, s.title AS s_title, s.folder, s.added_at AS s_added,
            (SELECT COUNT(*) FROM ' . t('rd_items') . ' i LEFT JOIN ' . t('rd_states') . ' st ON st.item_id = i.id AND st.user_id = s.user_id WHERE i.feed_id = f.id AND ' . UNREAD_SQL . ') AS n_unread
        FROM ' . t('rd_subs') . ' s JOIN ' . t('rd_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? ORDER BY s.folder, COALESCE(NULLIF(s.title, \'\'), f.title)', [$uid])->fetchAll();
    return array_map(fn($f) => sub_out($f), $rows);
}

function sub_out(array $f): array
{
    return ['id' => (int)$f['id'], 'title' => ($f['s_title'] ?? '') !== '' ? $f['s_title'] : ($f['title'] !== '' ? $f['title'] : (string)parse_url($f['url'], PHP_URL_HOST)), 'feedTitle' => $f['title'],
        'url' => $f['url'], 'link' => $f['link'], 'descr' => $f['descr'], 'icon' => rd_img_url($f['icon'], 64), 'folder' => (string)($f['folder'] ?? ''),
        'unread' => (int)($f['n_unread'] ?? 0), 'latest' => iso($f['latest_at']), 'ready' => (bool)$f['fetched_at'], 'error' => $f['error'], 'checked' => iso($f['checked_at'])];
}

function out_item(array $i, bool $full = false): array
{
    $o = ['id' => (int)$i['id'], 'feed' => (int)$i['feed_id'], 'title' => $i['title'], 'author' => $i['author'], 'link' => $i['link'], 'summary' => $i['summary'],
        'image' => rd_img_url($i['image'], 400), 'words' => (int)$i['words'], 'date' => iso($i['pub_at']), 'unread' => (bool)($i['unread'] ?? false),
        'feedTitle' => ($i['s_title'] ?? '') !== '' ? $i['s_title'] : ($i['f_title'] ?? ''), 'icon' => rd_img_url($i['f_icon'] ?? '', 64)];
    if ($full) $o['content'] = rd_proxy_html((string)$i['content']);
    return $o;
}

function item_select(): string
{
    return 'SELECT i.*, f.title AS f_title, f.icon AS f_icon, s.title AS s_title, ' . UNREAD_SQL . ' AS unread
        FROM ' . t('rd_items') . ' i JOIN ' . t('rd_subs') . ' s ON s.feed_id = i.feed_id AND s.user_id = ? JOIN ' . t('rd_feeds') . ' f ON f.id = i.feed_id
        LEFT JOIN ' . t('rd_states') . ' st ON st.item_id = i.id AND st.user_id = s.user_id';
}

/** The articles of feeds for the app, each with the article of the reading list it was saved as (saved: its id). */
function out_items(array $rows, int $uid, bool $full = false): array
{
    $hashes = [];
    foreach ($rows as $i) if ($i['link'] !== '') $hashes[(int)$i['id']] = article_hash($i['link']);
    $saved = [];
    if ($hashes) foreach (q('SELECT id, url_hash FROM ' . t('rd_articles') . ' WHERE user_id = ? AND url_hash IN (' . in_list(array_values($hashes)) . ')', array_merge([$uid], array_values($hashes)))->fetchAll() as $a) $saved[$a['url_hash']] = (int)$a['id'];
    return array_map(function ($i) use ($hashes, $saved, $full) { $o = out_item($i, $full); $o['saved'] = $saved[$hashes[(int)$i['id']] ?? ''] ?? null; return $o; }, $rows);
}

function count_subs(int $fid): void
{
    q('UPDATE ' . t('rd_feeds') . ' SET subs = (SELECT COUNT(*) FROM ' . t('rd_subs') . ' WHERE feed_id = ?) WHERE id = ?', [$fid, $fid]);
}

function clean_folder($v): string
{
    return mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', '', (string)$v) ?? ''), 0, 80);
}

/** Follows a feed (read_before: the articles of the last two weeks start unread). */
function subscribe(int $uid, int $fid, string $folder = '', string $title = ''): bool
{
    $n = q('INSERT IGNORE INTO ' . t('rd_subs') . ' (user_id, feed_id, title, folder, read_before, added_at) VALUES (?,?,?,?,?,?)', [$uid, $fid, mb_substr($title, 0, 300), $folder, gmdate('Y-m-d H:i:s', time() - 14 * 86400), now_utc()])->rowCount();
    if ($n) count_subs($fid);
    return $n > 0;
}

/** Feeds of an account to bring up to date now: never read first, then the oldest. */
function stale_subs(int $uid, int $limit): array
{
    $m = (int)config_value('refresh_minutes', 30);
    $rows = q('SELECT f.* FROM ' . t('rd_subs') . ' s JOIN ' . t('rd_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? AND (f.checked_at IS NULL OR f.checked_at < ?)
        ORDER BY f.fetched_at IS NOT NULL, f.checked_at LIMIT ' . (int)($limit * 3), [$uid, gmdate('Y-m-d H:i:s', time() - $m * 60)])->fetchAll();
    return array_slice(array_values(array_filter($rows, fn($f) => rd_feed_stale($f))), 0, $limit);
}

/** The feeds an OPML file lists, with the folder (the outline around them) each one is in. */
function opml_feeds(string $xml): array
{
    $prev = libxml_use_internal_errors(true);
    $sx = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    if ($sx === false || !isset($sx->body)) return [];
    $out = [];
    $walk = function (SimpleXMLElement $n, string $folder) use (&$walk, &$out) {
        foreach ($n->outline as $o) {
            $a = [];
            foreach ($o->attributes() as $k => $v) $a[strtolower((string)$k)] = (string)$v;
            if (!empty($a['xmlurl'])) {
                $u = net_clean_url($a['xmlurl']);
                if ($u !== '') $out[url_hash($u)] = ['url' => $u, 'title' => plain($a['title'] ?? $a['text'] ?? '', 300), 'folder' => $folder];
            } else $walk($o, clean_folder($a['title'] ?? $a['text'] ?? ''));
        }
    };
    $walk($sx->body, '');
    return array_values($out);
}

/** A CSV text as rows of columns named by the first line (lower case). */
function csv_rows(string $text): array
{
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text) ?? $text;
    $fh = fopen('php://temp', 'r+');
    fwrite($fh, $text);
    rewind($fh);
    $head = fgetcsv($fh, 0, ',', '"', '');
    if (!$head) return [];
    $head = array_map(fn($h) => strtolower(trim((string)$h)), $head);
    $rows = [];
    while (($r = fgetcsv($fh, 0, ',', '"', '')) !== false) {
        if ($r === [null]) continue;
        $row = [];
        foreach ($head as $i => $h) $row[$h] = (string)($r[$i] ?? '');
        $rows[] = $row;
        if (count($rows) > MAX_ARTICLES) break;
    }
    fclose($fh);
    return $rows;
}

/** A time of an export: seconds since 1970, or a date. */
function import_time(string $v): string
{
    $v = trim($v);
    if (preg_match('/^\d{9,10}$/', $v)) return gmdate('Y-m-d H:i:s', min(time(), (int)$v));
    return parse_date($v) ?: now_utc();
}

/**
 * The articles of another service → [['url', 'title', 'added', 'archived', 'starred', 'tags']]. kind: pocket (its CSV
 * of 2024–2025 or its old HTML export), instapaper (CSV).
 */
function parse_import(string $kind, string $data): array
{
    $out = [];
    $data = trim($data);
    if ($kind === 'pocket' && stripos(substr($data, 0, 2000), '<') !== false && stripos($data, '<a ') !== false) {
        // the HTML of Pocket: <h1>Unread</h1><ul><li><a href time_added tags>…</a></li></ul><h1>Read Archive</h1>…
        $doc = rd_dom($data);
        if (!$doc) return [];
        $archived = false;
        $xp = new DOMXPath($doc);
        foreach ($xp->query('//h1 | //a[@href]') ?: [] as $n) {
            if (strtolower($n->nodeName) === 'h1') { $archived = (bool)preg_match('/archive|read/i', rd_text($n)) && !preg_match('/unread/i', rd_text($n)); continue; }
            $url = net_clean_url((string)$n->getAttribute('href'));
            if ($url === '') continue;
            $out[] = ['url' => $url, 'title' => plain(rd_text($n), 400), 'added' => import_time((string)$n->getAttribute('time_added')), 'archived' => $archived, 'starred' => false,
                'tags' => clean_tags(str_replace('|', ',', (string)$n->getAttribute('tags')))];
        }
        return $out;
    }
    foreach (csv_rows($data) as $row) {
        $url = net_clean_url($row['url'] ?? '');
        if ($url === '') continue;
        if ($kind === 'instapaper') {
            // URL, Title, Selection, Folder (Unread | Archive | Starred | a folder of one's own), Timestamp[, Tags]
            $folder = trim($row['folder'] ?? '');
            $tags = clean_tags(trim($row['tags'] ?? '', '[]"'));
            if ($folder !== '' && !in_array(strtolower($folder), ['unread', 'archive', 'starred'], true)) $tags = clean_tags(array_merge([$folder], $tags));
            $out[] = ['url' => $url, 'title' => plain($row['title'] ?? '', 400), 'added' => import_time($row['timestamp'] ?? ''), 'archived' => strtolower($folder) === 'archive',
                'starred' => strtolower($folder) === 'starred', 'tags' => $tags, 'note' => trim($row['selection'] ?? '') !== '' ? mb_substr(trim($row['selection']), 0, 2000) : null];
        } else {
            // title, url, time_added, tags (a|b), status (unread | archive)
            $out[] = ['url' => $url, 'title' => plain($row['title'] ?? '', 400), 'added' => import_time($row['time_added'] ?? ''), 'archived' => strtolower(trim($row['status'] ?? '')) === 'archive',
                'starred' => in_array(strtolower(trim($row['favorite'] ?? $row['starred'] ?? '')), ['1', 'true', 'yes'], true), 'tags' => clean_tags(str_replace('|', ',', $row['tags'] ?? ''))];
        }
    }
    return $out;
}

/** Everything of the library of an account as .savrea (JSON): articles with their text and highlights, the feeds. */
function savrea_of(array $u, bool $withText = true): array
{
    $hl = [];
    foreach (q('SELECT * FROM ' . t('rd_highlights') . ' WHERE user_id = ? ORDER BY article_id, start', [$u['id']])->fetchAll() as $h)
        $hl[(int)$h['article_id']][] = ['quote' => $h['quote'], 'prefix' => $h['prefix'], 'suffix' => $h['suffix'], 'start' => (int)$h['start'], 'color' => $h['color'], 'note' => (string)$h['note'], 'created' => iso($h['created_at'])];
    $arts = [];
    foreach (q('SELECT * FROM ' . t('rd_articles') . ' WHERE user_id = ? ORDER BY added_at', [$u['id']])->fetchAll() as $a) {
        $arts[] = array_filter(['url' => $a['url'], 'title' => $a['title'], 'author' => $a['author'], 'site' => $a['site'], 'lang' => $a['lang'], 'image' => $a['image'], 'excerpt' => $a['excerpt'],
            'content' => $withText ? (string)$a['content'] : null, 'words' => (int)$a['words'], 'published' => iso($a['published_at']), 'added' => iso($a['added_at']), 'read' => iso($a['read_at']),
            'archived' => (bool)$a['archived'], 'starred' => (bool)$a['starred'], 'progress' => round((float)$a['progress'], 4), 'tags' => tags_of($a['tags']), 'note' => (string)$a['note'],
            'highlights' => $hl[(int)$a['id']] ?? []], fn($v) => $v !== null && $v !== '' && $v !== []);
    }
    $feeds = array_map(fn($f) => array_filter(['url' => $f['url'], 'title' => $f['title'], 'folder' => $f['folder']], fn($v) => $v !== ''),
        q('SELECT f.url, COALESCE(NULLIF(s.title, \'\'), f.title) AS title, s.folder FROM ' . t('rd_subs') . ' s JOIN ' . t('rd_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? ORDER BY s.folder, title', [$u['id']])->fetchAll());
    return ['format' => 'savrea', 'version' => 1, 'app' => 'SavReads', 'exported' => gmdate('c'), 'articles' => $arts, 'feeds' => $feeds];
}

/** How many articles the account keeps, and whether one more fits. */
function room(int $uid, int $more = 1): bool
{
    return (int)q('SELECT COUNT(*) FROM ' . t('rd_articles') . ' WHERE user_id = ?', [$uid])->fetchColumn() + $more <= MAX_ARTICLES;
}

/** The counts of the places on the side. */
function counts_of(int $uid): array
{
    $c = q('SELECT SUM(archived = 0) AS unread, SUM(starred = 1) AS starred, SUM(archived = 1) AS archive, SUM(status = \'pending\' AND tries < 3) AS pending FROM ' . t('rd_articles') . ' WHERE user_id = ?', [$uid])->fetch();
    $tags = [];
    foreach (q('SELECT tags FROM ' . t('rd_articles') . " WHERE user_id = ? AND tags <> ''", [$uid])->fetchAll(PDO::FETCH_COLUMN) as $col)
        foreach (tags_of($col) as $tg) { $k = mb_strtolower($tg); $tags[$k] = ['name' => $tags[$k]['name'] ?? $tg, 'n' => ($tags[$k]['n'] ?? 0) + 1]; }
    uasort($tags, fn($a, $b) => strcasecmp($a['name'], $b['name']));
    return ['unread' => (int)$c['unread'], 'starred' => (int)$c['starred'], 'archive' => (int)$c['archive'], 'pending' => (int)$c['pending'],
        'highlights' => (int)q('SELECT COUNT(*) FROM ' . t('rd_highlights') . ' WHERE user_id = ?', [$uid])->fetchColumn(), 'tags' => array_values($tags)];
}

switch ($r) {

    // ================================================================ accounts

    case 'auth.config':
        send_json(['ok' => true, 'installed' => true, 'savAccount' => sav_enabled(), 'mailReady' => mail_settings() !== null]);

    case 'auth.me':
        only('GET');
        $u = current_user();
        if (!$u || $u['status'] !== 'active') send_json(['ok' => true, 'user' => null]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id'])), 'csrf' => $u['csrf_token']]);

    case 'auth.register':
        only('POST');
        if (too_many_attempts('register', 5, 60)) fail('rate_limited', 429);
        $b = body();
        $name = s($b, 'name', 80);
        $email = mb_strtolower(s($b, 'email', 190));
        $pw = (string)($b['password'] ?? '');
        if (mb_strlen($name) < 2) fail('name_required', 422);
        valid_email($email);
        validate_password($pw);
        if (empty($b['acceptTerms'])) fail('terms_required', 422);
        // The same answer whether the address is new or already registered, so nobody can find out who has an account
        $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE email = ?');
        $st->execute([$email]);
        $row = $st->fetch();
        record_attempt('register');
        if (!$row) send_account_link(user_row(new_user($name, $email, password_hash($pw, PASSWORD_DEFAULT), null, ui_lang($b))), ui_lang($b), 'verify');
        elseif (empty($row['email_verified_at']) && $row['status'] === 'active' && !too_many_attempts('verify_mail', 3, 60)) {
            record_attempt('verify_mail');
            send_account_link($row, ui_lang($b), 'verify');
        }
        send_json(['ok' => true, 'checkEmail' => true]);

    case 'auth.login':
        only('POST');
        if (too_many_attempts('login', 10, 15)) fail('rate_limited', 429);
        $b = body();
        $email = mb_strtolower(s($b, 'email', 190));
        $pw = (string)($b['password'] ?? '');
        $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE email = ?');
        $st->execute([$email]);
        $row = $st->fetch();
        // One answer for an unknown address, a wrong password and an account without a password, in about the same time
        $ok = $row && $row['password_hash'] !== '' ? password_verify($pw, $row['password_hash']) : password_hash($pw, PASSWORD_DEFAULT) === '';
        if (!$ok) {
            record_attempt('login');
            fail('bad_credentials', 401);
        }
        if ($row['status'] !== 'active') fail('disabled', 403);
        clear_attempts('login');
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $row['id']]);
        signed_in((int)$row['id']);

    case 'auth.resend':
        $u = writer(true);
        if (!empty($u['email_verified_at'])) send_json(['ok' => true, 'user' => public_user(user_row((int)$u['id']))]);
        if (too_many_attempts('verify_mail', 3, 60)) fail('rate_limited', 429);
        record_attempt('verify_mail');
        send_account_link(user_row((int)$u['id']), ui_lang(body()), 'verify');
        send_json(['ok' => true]);

    case 'auth.verify':
        // The link of the email opens the app, which asks for this with a button: mail scanners that open links do nothing
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $token = (string)(body()['token'] ?? '');
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . ' WHERE token_hash = ? AND purpose = \'verify\' AND expires_at > ?');
        $st->execute([hash('sha256', $token), now_utc()]);
        $uid = (int)$st->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        db()->prepare('UPDATE ' . t('users') . ' SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([now_utc(), $uid]);
        db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ? AND purpose = \'verify\'')->execute([$uid]);
        if (user_row($uid)['status'] !== 'active') fail('disabled', 403);
        signed_in($uid);

    case 'auth.logout':
        only('POST');
        $u = current_user();
        if ($u) require_csrf($u);
        destroy_auth_session();
        send_json(['ok' => true]);

    case 'auth.password':
        $u = writer();
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['current'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        $pw = (string)($b['password'] ?? '');
        validate_password($pw);
        db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.forgot':
        // The same answer whether the address has an account or not
        only('POST');
        if (too_many_attempts('forgot', 5, 60)) fail('rate_limited', 429);
        record_attempt('forgot');
        $b = body();
        $st = db()->prepare('SELECT * FROM ' . t('users') . " WHERE email = ? AND status = 'active'");
        $st->execute([mb_strtolower(s($b, 'email', 190))]);
        $row = $st->fetch();
        if ($row) send_account_link($row, ui_lang($b), 'reset');
        send_json(['ok' => true]);

    case 'auth.reset':
        // The link proves the address too. Every other session of the account ends.
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $b = body();
        $pw = (string)($b['password'] ?? '');
        validate_password($pw);
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . " WHERE token_hash = ? AND purpose = 'reset' AND expires_at > ?");
        $st->execute([hash('sha256', (string)($b['token'] ?? '')), now_utc()]);
        $uid = (int)$st->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        if (user_row($uid)['status'] !== 'active') fail('disabled', 403);
        db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), now_utc(), $uid]);
        db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ?')->execute([$uid]);
        db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$uid]);
        signed_in($uid);

    case 'auth.profile':
        // Name and language of the app (also the language of the platform's emails). The email never changes.
        $u = writer(true);
        $b = body();
        $name = s($b, 'name', 80);
        if ($name !== '' && mb_strlen($name) < 2) fail('name_required', 422);
        db()->prepare('UPDATE ' . t('users') . ' SET name = IF(? = \'\', name, ?), ui_lang = ? WHERE id = ?')->execute([$name, $name, ui_lang($b), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.export':
        // Everything SavReads keeps of the account, as one JSON file (the polls, calendars, notebooks… are exported by their apps)
        $u = reader();
        header('Content-Disposition: attachment; filename="savreads-data.json"');
        send_json(['app' => 'SavReads', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => profile_prefs(profile($u))] + savrea_of($u));

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        $fids = q('SELECT feed_id FROM ' . t('rd_subs') . ' WHERE user_id = ?', [$u['id']])->fetchAll(PDO::FETCH_COLUMN);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        foreach ($fids as $fid) count_subs((int)$fid);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);

    // ================================================================ reading

    case 'rd.init':
        // Everything the app needs to start: settings, the counts of the places, the tags, the feeds followed
        $u = reader();
        $p = profile($u);
        send_json(['ok' => true, 'prefs' => (object)profile_prefs($p), 'counts' => counts_of($u['id']), 'subs' => subs_of($u['id'])]);

    case 'rd.counts':
        $u = reader();
        send_json(['ok' => true, 'counts' => counts_of($u['id']), 'subs' => subs_of($u['id'])]);

    case 'rd.prefs':
        // Settings of SavReads (the reader's font, size, theme…): read only by the app
        $u = writer();
        profile($u);
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 6000) fail('bad_request', 413);
        q('UPDATE ' . t('rd_profiles') . ' SET prefs = ? WHERE user_id = ?', [$p, $u['id']]);
        send_json(['ok' => true]);

    case 'rd.list':
        // view: unread (the reading list) | starred | archive | all | tag (&tag=) · q: words in the title, the text, the
        // address, the tags or the highlights · sort: new | old | short | long · offset
        $u = reader();
        $view = (string)($_GET['view'] ?? 'unread');
        $where = ['a.user_id = ?'];
        $args = [$u['id']];
        if ($view === 'unread') $where[] = 'a.archived = 0';
        elseif ($view === 'archive') $where[] = 'a.archived = 1';
        elseif ($view === 'starred') $where[] = 'a.starred = 1';
        elseif ($view === 'tag') { $where[] = 'a.tags LIKE ?'; $args[] = '%,' . addcslashes(s($_GET, 'tag', 40), '%_\\') . ',%'; }
        $term = s($_GET, 'q', 200);
        if ($term !== '') {
            $like = '%' . addcslashes($term, '%_\\') . '%';
            $where[] = '(a.title LIKE ? OR a.author LIKE ? OR a.site LIKE ? OR a.url LIKE ? OR a.tags LIKE ? OR a.note LIKE ? OR a.content LIKE ?
                OR EXISTS (SELECT 1 FROM ' . t('rd_highlights') . ' h WHERE h.article_id = a.id AND (h.quote LIKE ? OR h.note LIKE ?)))';
            array_push($args, $like, $like, $like, $like, $like, $like, $like, $like, $like);
        }
        $sort = ['old' => 'a.added_at ASC', 'short' => 'a.words = 0, a.words ASC', 'long' => 'a.words DESC', 'progress' => 'a.progress DESC, a.read_at DESC'][(string)($_GET['sort'] ?? '')] ?? ($view === 'archive' ? 'COALESCE(a.archived_at, a.added_at) DESC' : 'a.added_at DESC');
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        $rows = q('SELECT ' . ARTICLE_COLS . ', (SELECT COUNT(*) FROM ' . t('rd_highlights') . ' h WHERE h.article_id = a.id) AS n_hl FROM ' . t('rd_articles') . ' a WHERE ' . implode(' AND ', $where)
            . " ORDER BY $sort, a.id DESC LIMIT 41 OFFSET $offset", $args)->fetchAll();
        send_json(['ok' => true, 'articles' => array_map('out_article', array_slice($rows, 0, 40)), 'more' => count($rows) > 40]);

    case 'rd.get':
        // An article to read: its text (pictures through the server) and its highlights. It writes nothing: the same answer
        // is kept on the device for reading offline (when it was read is written by rd.progress)
        $u = reader();
        $a = article_of($u, $_GET['id'] ?? 0);
        $hl = q('SELECT * FROM ' . t('rd_highlights') . ' WHERE article_id = ? ORDER BY start, id', [$a['id']])->fetchAll();
        send_json(['ok' => true, 'article' => out_article($a + ['n_hl' => count($hl)]) + ['content' => rd_proxy_html((string)$a['content']), 'note' => (string)$a['note'], 'cover' => rd_img_url($a['image'], 1400)],
            'highlights' => array_map('out_highlight', $hl)]);

    case 'rd.save':
        // An address saved to read later: read now by the server (title, author, text…). An address already saved is not
        // saved twice: it comes back to the reading list. source: url | share | bookmarklet | feed · item: the article of a
        // feed it comes from (its text is used when the page cannot be read)
        $u = writer();
        $b = body();
        $url = net_clean_url(s($b, 'url', 2000));
        if ($url === '') fail('bad_url', 422);
        $url = clean_article_url($url);
        $old = q('SELECT * FROM ' . t('rd_articles') . ' WHERE user_id = ? AND url_hash = ?', [$u['id'], article_hash($url)])->fetch();
        if ($old) {
            q('UPDATE ' . t('rd_articles') . ' SET archived = 0, archived_at = NULL, updated_at = ? WHERE id = ?', [now_utc(), $old['id']]);
            send_json(['ok' => true, 'existing' => true, 'article' => out_article(article_of($u, $old['id'])), 'counts' => counts_of($u['id'])]);
        }
        if (!room($u['id'])) fail('too_many_articles', 422);
        limit('rd_save', 150, 10);
        $tags = clean_tags($b['tags'] ?? []);
        $source = in_array($b['source'] ?? '', ['url', 'share', 'bookmarklet', 'feed'], true) ? $b['source'] : 'url';
        $x = rd_fetch_page($url);
        $item = !empty($b['item']) ? q('SELECT i.* FROM ' . t('rd_items') . ' i JOIN ' . t('rd_subs') . ' s ON s.feed_id = i.feed_id AND s.user_id = ? WHERE i.id = ?', [$u['id'], id_of($b['item'])])->fetch() : null;
        if ($item && (isset($x['error']) || $x['words'] < max(40, (int)$item['words'] * .6))) {
            // the page did not give more than the feed: the text of the feed
            $f = rd_feed_row((int)$item['feed_id']);
            $x = ['title' => $item['title'], 'author' => $item['author'], 'site' => $f['title'] ?? '', 'lang' => '', 'image' => $item['image'], 'published' => $item['pub_at'], 'excerpt' => $item['summary'], 'content' => (string)$item['content'], 'words' => (int)$item['words']];
            $fromFeed = true;
        }
        $given = plain(s($b, 'title', 400), 400);
        if (isset($x['error'])) {
            $id = insert_article($u['id'], $url, ['title' => $given, 'site' => preg_replace('/^www\./', '', (string)parse_url($url, PHP_URL_HOST))], ['tags' => $tags, 'source' => $source, 'status' => $x['error'] === 'bad_url' || $x['error'] === 'not_page' || preg_match('/^http_4(?!29)/', $x['error']) ? 'failed' : 'pending', 'error' => $x['error']]);
        } else {
            if ($x['title'] === '' || $x['title'] === $x['site']) $x['title'] = $given ?: $x['title'];
            $ok = readable($x) || (!empty($fromFeed) && $x['content'] !== ''); // the text of the feed is what the reader saw: it is enough
            $id = insert_article($u['id'], $url, $x, ['tags' => $tags, 'source' => $source, 'status' => $ok ? 'ready' : 'failed', 'error' => $ok ? '' : (!empty($x['paywalled']) ? 'paywall' : 'no_text')]);
        }
        send_json(['ok' => true, 'article' => out_article(article_of($u, $id)), 'counts' => counts_of($u['id'])]);

    case 'rd.preview':
        // The whole article behind an item of a feed that gives only a summary, read now and not saved
        $u = reader();
        limit('rd_save', 150, 10);
        $url = net_clean_url(s($_GET, 'url', 2000));
        if ($url === '') fail('bad_url', 422);
        $x = rd_fetch_page($url);
        if (isset($x['error'])) fail($x['error'] === 'bad_url' ? 'bad_url' : 'page_unreachable', 422);
        send_json(['ok' => true, 'content' => rd_proxy_html($x['content']), 'words' => $x['words'], 'title' => $x['title'], 'author' => $x['author'], 'cover' => rd_img_url($x['image'], 1400)]);

    case 'rd.update':
        // One or more articles: archived, starred, tags (all of them, or add / remove one), title, note (only what is sent)
        $u = writer();
        $b = body();
        $ids = ids_of($b['ids'] ?? [$b['id'] ?? 0]);
        if (!$ids) fail('bad_request', 422);
        $rows = q('SELECT id, tags FROM ' . t('rd_articles') . ' WHERE user_id = ? AND id IN (' . in_list($ids) . ')', array_merge([$u['id']], $ids))->fetchAll();
        if (!$rows) fail('not_found', 404);
        $now = now_utc();
        foreach ($rows as $a) {
            $set = [];
            $args = [];
            if (array_key_exists('archived', $b)) { $set[] = 'archived = ?, archived_at = ?'; array_push($args, $b['archived'] ? 1 : 0, $b['archived'] ? $now : null); }
            if (array_key_exists('starred', $b)) { $set[] = 'starred = ?'; $args[] = $b['starred'] ? 1 : 0; }
            if (array_key_exists('title', $b) && s($b, 'title', 400) !== '') { $set[] = 'title = ?'; $args[] = s($b, 'title', 400); }
            if (array_key_exists('note', $b)) { $set[] = 'note = ?'; $args[] = multiline($b, 'note', 20000) ?: null; }
            if (array_key_exists('progress', $b)) { $set[] = 'progress = ?'; $args[] = max(0, min(1, (float)$b['progress'])); }
            $tags = null;
            if (array_key_exists('tags', $b)) $tags = clean_tags($b['tags']);
            if (isset($b['addTag'])) $tags = clean_tags(array_merge(tags_of($a['tags']), [s($b, 'addTag', 40)]));
            if (isset($b['removeTag'])) $tags = array_values(array_filter(tags_of($a['tags']), fn($t) => mb_strtolower($t) !== mb_strtolower(s($b, 'removeTag', 40))));
            if ($tags !== null) { $set[] = 'tags = ?'; $args[] = tags_col($tags); }
            if (!$set) continue;
            q('UPDATE ' . t('rd_articles') . ' SET ' . implode(', ', $set) . ', updated_at = ? WHERE id = ?', array_merge($args, [$now, $a['id']]));
        }
        $out = q('SELECT ' . ARTICLE_COLS . ', (SELECT COUNT(*) FROM ' . t('rd_highlights') . ' h WHERE h.article_id = a.id) AS n_hl FROM ' . t('rd_articles') . ' a WHERE a.user_id = ? AND a.id IN (' . in_list($ids) . ')', array_merge([$u['id']], $ids))->fetchAll();
        send_json(['ok' => true, 'articles' => array_map('out_article', $out), 'counts' => counts_of($u['id'])]);

    case 'rd.progress':
        // Where the reading got to (0…1), the same on every device; at the end the article may go to the archive by itself
        $u = writer();
        $b = body();
        $a = article_of($u, $b['id'] ?? 0);
        $p = max(0, min(1, (float)($b['progress'] ?? 0)));
        q('UPDATE ' . t('rd_articles') . ' SET progress = ?, read_at = ?, updated_at = ? WHERE id = ?', [$p, now_utc(), now_utc(), $a['id']]);
        send_json(['ok' => true]);

    case 'rd.delete':
        $u = writer();
        $ids = ids_of(body()['ids'] ?? [body()['id'] ?? 0], 5000);
        if ($ids) q('DELETE FROM ' . t('rd_articles') . ' WHERE user_id = ? AND id IN (' . in_list($ids) . ')', array_merge([$u['id']], $ids));
        send_json(['ok' => true, 'counts' => counts_of($u['id'])]);

    case 'rd.refetch':
        // The page read again (it changed, or it could not be read the first time): the highlights stay
        $u = writer();
        $a = article_of($u, body()['id'] ?? 0);
        limit('rd_save', 150, 10);
        q('UPDATE ' . t('rd_articles') . ' SET tries = 0 WHERE id = ?', [$a['id']]);
        $x = rd_fetch_page($a['url']);
        if (isset($x['error'])) { fill_article((int)$a['id'], $x); fail($x['error'] === 'bad_url' ? 'bad_url' : 'page_unreachable', 422); }
        fill_article((int)$a['id'], $x);
        send_json(['ok' => true, 'article' => out_article(article_of($u, $a['id']))]);

    case 'rd.fetch_pending':
        // The articles of an import, read from the Internet a few at a time: the app asks again while some are left
        $u = writer();
        $left = fetch_pending($u['id'], 6);
        send_json(['ok' => true, 'pending' => $left, 'counts' => counts_of($u['id'])]);

    case 'rd.tags.rename':
    case 'rd.tags.delete':
        $u = writer();
        $b = body();
        $from = s($b, 'from', 40);
        $to = $r === 'rd.tags.rename' ? (clean_tags([s($b, 'to', 40)])[0] ?? '') : '';
        if ($from === '' || ($r === 'rd.tags.rename' && $to === '')) fail('bad_request', 422);
        foreach (q('SELECT id, tags FROM ' . t('rd_articles') . ' WHERE user_id = ? AND tags LIKE ?', [$u['id'], '%,' . addcslashes($from, '%_\\') . ',%'])->fetchAll() as $a) {
            $list = array_map(fn($t) => mb_strtolower($t) === mb_strtolower($from) ? $to : $t, tags_of($a['tags']));
            q('UPDATE ' . t('rd_articles') . ' SET tags = ? WHERE id = ?', [tags_col(clean_tags($list)), $a['id']]);
        }
        send_json(['ok' => true, 'counts' => counts_of($u['id'])]);

    // ================================================================ highlights

    case 'rd.hl.add':
        // A passage marked: the words, a little of the text around them (to find them again), where they start
        $u = writer();
        $b = body();
        $a = article_of($u, $b['article'] ?? 0);
        $quote = multiline($b, 'quote', 8000);
        if ($quote === '') fail('bad_request', 422);
        if ((int)q('SELECT COUNT(*) FROM ' . t('rd_highlights') . ' WHERE article_id = ?', [$a['id']])->fetchColumn() >= MAX_HIGHLIGHTS) fail('too_many_highlights', 422);
        $color = in_array($b['color'] ?? '', HL_COLORS, true) ? $b['color'] : 'yellow';
        q('INSERT INTO ' . t('rd_highlights') . ' (user_id, article_id, quote, prefix, suffix, start, color, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$u['id'], $a['id'], $quote, mb_substr((string)($b['prefix'] ?? ''), -80), mb_substr((string)($b['suffix'] ?? ''), 0, 80), max(0, (int)($b['start'] ?? 0)), $color, multiline($b, 'note', 8000) ?: null, now_utc(), now_utc()]);
        $h = q('SELECT * FROM ' . t('rd_highlights') . ' WHERE id = ?', [(int)db()->lastInsertId()])->fetch();
        send_json(['ok' => true, 'highlight' => out_highlight($h)]);

    case 'rd.hl.update':
        $u = writer();
        $b = body();
        $h = q('SELECT * FROM ' . t('rd_highlights') . ' WHERE id = ? AND user_id = ?', [id_of($b['id'] ?? 0), $u['id']])->fetch();
        if (!$h) fail('not_found', 404);
        if (array_key_exists('note', $b)) q('UPDATE ' . t('rd_highlights') . ' SET note = ?, updated_at = ? WHERE id = ?', [multiline($b, 'note', 8000) ?: null, now_utc(), $h['id']]);
        if (in_array($b['color'] ?? '', HL_COLORS, true)) q('UPDATE ' . t('rd_highlights') . ' SET color = ?, updated_at = ? WHERE id = ?', [$b['color'], now_utc(), $h['id']]);
        send_json(['ok' => true, 'highlight' => out_highlight(q('SELECT * FROM ' . t('rd_highlights') . ' WHERE id = ?', [$h['id']])->fetch())]);

    case 'rd.hl.delete':
        $u = writer();
        q('DELETE FROM ' . t('rd_highlights') . ' WHERE id = ? AND user_id = ?', [id_of(body()['id'] ?? 0), $u['id']]);
        send_json(['ok' => true]);

    case 'rd.highlights':
        // Every highlight of the account, newest first, with its article (q: words in the passage or the note)
        $u = reader();
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        $args = [$u['id']];
        $where = '';
        $term = s($_GET, 'q', 200);
        if ($term !== '') { $where = ' AND (h.quote LIKE ? OR h.note LIKE ? OR a.title LIKE ?)'; $like = '%' . addcslashes($term, '%_\\') . '%'; array_push($args, $like, $like, $like); }
        $rows = q('SELECT h.*, a.title AS a_title, a.site AS a_site, a.url AS a_url FROM ' . t('rd_highlights') . ' h JOIN ' . t('rd_articles') . ' a ON a.id = h.article_id WHERE h.user_id = ?' . $where . " ORDER BY h.created_at DESC, h.id DESC LIMIT 61 OFFSET $offset", $args)->fetchAll();
        send_json(['ok' => true, 'highlights' => array_map(fn($h) => out_highlight($h) + ['title' => $h['a_title'], 'site' => $h['a_site'], 'url' => $h['a_url']], array_slice($rows, 0, 60)), 'more' => count($rows) > 60]);

    // ================================================================ feeds

    case 'rd.feeds':
        $u = reader();
        send_json(['ok' => true, 'subs' => subs_of($u['id'])]);

    case 'rd.feeds.add':
        // A feed from its address, or from the address of a site that names its feed; read now
        $u = writer();
        $b = body();
        limit('rd_feed', 60, 10);
        if ((int)q('SELECT COUNT(*) FROM ' . t('rd_subs') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_SUBS) fail('too_many_feeds', 422);
        $d = rd_discover(s($b, 'url', 2000));
        if (isset($d['error'])) fail($d['error'], 422);
        $f = rd_feed_for_url($d['url']);
        if (!$f['fetched_at'] || rd_feed_stale($f, 5)) {
            q('UPDATE ' . t('rd_feeds') . ' SET checked_at = ? WHERE id = ?', [now_utc(), $f['id']]);
            rd_store_feed($f, $d['parsed'], $d['res']);
        }
        subscribe($u['id'], (int)$f['id'], clean_folder($b['folder'] ?? ''));
        $subs = subs_of($u['id']);
        send_json(['ok' => true, 'feed' => current(array_filter($subs, fn($x) => $x['id'] === (int)$f['id'])) ?: null, 'subs' => $subs, 'others' => array_slice($d['found'], 0, 8)]);

    case 'rd.feeds.update':
        // Its own name (empty: the one of the feed) and its folder
        $u = writer();
        $b = body();
        $fid = id_of($b['id'] ?? 0);
        $set = [];
        $args = [];
        if (array_key_exists('title', $b)) { $set[] = 'title = ?'; $args[] = s($b, 'title', 300); }
        if (array_key_exists('folder', $b)) { $set[] = 'folder = ?'; $args[] = clean_folder($b['folder']); }
        if ($set) q('UPDATE ' . t('rd_subs') . ' SET ' . implode(', ', $set) . ' WHERE user_id = ? AND feed_id = ?', array_merge($args, [$u['id'], $fid]));
        send_json(['ok' => true, 'subs' => subs_of($u['id'])]);

    case 'rd.feeds.remove':
        $u = writer();
        $fid = id_of(body()['id'] ?? 0);
        q('DELETE st FROM ' . t('rd_states') . ' st JOIN ' . t('rd_items') . ' i ON i.id = st.item_id WHERE st.user_id = ? AND i.feed_id = ?', [$u['id'], $fid]);
        q('DELETE FROM ' . t('rd_subs') . ' WHERE user_id = ? AND feed_id = ?', [$u['id'], $fid]);
        count_subs($fid);
        send_json(['ok' => true, 'subs' => subs_of($u['id'])]);

    case 'rd.folder.rename':
        // A folder renamed (or emptied with to = ''): its feeds go with it
        $u = writer();
        $b = body();
        q('UPDATE ' . t('rd_subs') . ' SET folder = ? WHERE user_id = ? AND folder = ?', [clean_folder($b['to'] ?? ''), $u['id'], clean_folder($b['from'] ?? '')]);
        send_json(['ok' => true, 'subs' => subs_of($u['id'])]);

    case 'rd.feeds.refresh':
        // The feeds followed that are old, brought up to date (several at once, ~10 seconds at most); force: this one now
        $u = writer();
        $b = body();
        $one = id_of($b['id'] ?? 0);
        if ($one) {
            $f = q('SELECT f.* FROM ' . t('rd_subs') . ' s JOIN ' . t('rd_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? AND f.id = ?', [$u['id'], $one])->fetch();
            $res = $f ? rd_refresh_feeds([$f], 12, true) : [];
        } else {
            $todo = stale_subs($u['id'], 12);
            $res = $todo ? rd_refresh_feeds($todo, 10) : [];
        }
        send_json(['ok' => true, 'updated' => count(array_filter($res, fn($x) => $x === 'new')), 'checked' => count($res), 'subs' => subs_of($u['id'])]);

    case 'rd.items':
        // The articles of the feeds: of one feed (feed=), of a folder (folder=), or of all · unread=1: only those not read
        $u = reader();
        $where = [];
        $args = [$u['id']];
        if (!empty($_GET['feed'])) { $where[] = 'i.feed_id = ?'; $args[] = id_of($_GET['feed']); }
        elseif (isset($_GET['folder'])) { $where[] = 's.folder = ?'; $args[] = clean_folder($_GET['folder']); }
        if (!empty($_GET['unread'])) $where[] = UNREAD_SQL;
        $term = s($_GET, 'q', 200);
        if ($term !== '') { $like = '%' . addcslashes($term, '%_\\') . '%'; $where[] = '(i.title LIKE ? OR i.summary LIKE ? OR i.author LIKE ?)'; array_push($args, $like, $like, $like); }
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        $rows = q(item_select() . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY i.pub_at DESC, i.id DESC LIMIT 51 OFFSET $offset", $args)->fetchAll();
        send_json(['ok' => true, 'items' => out_items(array_slice($rows, 0, 50), $u['id']), 'more' => count($rows) > 50]);

    case 'rd.item':
        $u = reader();
        $i = q(item_select() . ' WHERE i.id = ?', [$u['id'], id_of($_GET['id'] ?? 0)])->fetch();
        if (!$i) fail('not_found', 404);
        send_json(['ok' => true, 'item' => out_items([$i], $u['id'], true)[0]]);

    case 'rd.items.read':
        // Articles of feeds marked as read (read: true) or unread
        $u = writer();
        $b = body();
        $ids = ids_of($b['ids'] ?? [$b['id'] ?? 0], 2000);
        $read = !array_key_exists('read', $b) || $b['read'] ? 1 : 0;
        if ($ids) {
            $ok = q('SELECT i.id FROM ' . t('rd_items') . ' i JOIN ' . t('rd_subs') . ' s ON s.feed_id = i.feed_id AND s.user_id = ? WHERE i.id IN (' . in_list($ids) . ')', array_merge([$u['id']], $ids))->fetchAll(PDO::FETCH_COLUMN);
            $now = now_utc();
            foreach (array_chunk($ok, 200) as $chunk) {
                $vals = implode(',', array_fill(0, count($chunk), '(?,?,?,?)'));
                $args = [];
                foreach ($chunk as $id) array_push($args, $u['id'], (int)$id, $read, $now);
                q('INSERT INTO ' . t('rd_states') . " (user_id, item_id, is_read, updated_at) VALUES $vals ON DUPLICATE KEY UPDATE is_read = VALUES(is_read), updated_at = VALUES(updated_at)", $args);
            }
        }
        send_json(['ok' => true, 'subs' => subs_of($u['id'])]);

    case 'rd.items.read_all':
        // Everything of a feed, of a folder or of all the feeds marked as read, up to now
        $u = writer();
        $b = body();
        $where = 'user_id = ?';
        $args = [$u['id']];
        if (!empty($b['feed'])) { $where .= ' AND feed_id = ?'; $args[] = id_of($b['feed']); }
        elseif (array_key_exists('folder', $b)) { $where .= ' AND folder = ?'; $args[] = clean_folder($b['folder']); }
        $fids = q('SELECT feed_id FROM ' . t('rd_subs') . " WHERE $where", $args)->fetchAll(PDO::FETCH_COLUMN);
        if ($fids) {
            q('UPDATE ' . t('rd_subs') . " SET read_before = ? WHERE $where", array_merge([now_utc()], $args));
            q('DELETE st FROM ' . t('rd_states') . ' st JOIN ' . t('rd_items') . ' i ON i.id = st.item_id WHERE st.user_id = ? AND i.feed_id IN (' . in_list($fids) . ')', array_merge([$u['id']], array_map('intval', $fids)));
        }
        send_json(['ok' => true, 'subs' => subs_of($u['id'])]);

    // ================================================================ files

    case 'rd.import':
        // kind: pocket (its CSV, or its old HTML export) | instapaper (CSV) | savrea (a file of SavReads). The articles come
        // in at once with what the file knows of them; their text is read afterwards (rd.fetch_pending, tools/refresh.php)
        $u = writer();
        $b = body();
        $kind = (string)($b['kind'] ?? '');
        $data = (string)($b['data'] ?? '');
        if ($data === '' || strlen($data) > 40000000) fail('import_invalid', 422);
        $added = $skipped = $feeds = 0;
        $known = array_flip(q('SELECT url_hash FROM ' . t('rd_articles') . ' WHERE user_id = ?', [$u['id']])->fetchAll(PDO::FETCH_COLUMN));
        $count = count($known);
        db()->beginTransaction();
        if ($kind === 'savrea') {
            $j = json_decode($data, true);
            if (!is_array($j) || ($j['format'] ?? '') !== 'savrea' || !is_array($j['articles'] ?? null)) fail('import_invalid', 422);
            foreach ($j['articles'] as $a) {
                if (!is_array($a)) continue;
                $url = net_clean_url((string)($a['url'] ?? ''));
                if ($url === '' || isset($known[article_hash($url)])) { $skipped++; continue; }
                if ($count + $added >= MAX_ARTICLES) break;
                // the text of a file is cleaned again: a file can be written by anyone
                $content = rd_clean((string)($a['content'] ?? ''), $url);
                $x = ['title' => plain((string)($a['title'] ?? ''), 400), 'author' => plain((string)($a['author'] ?? ''), 300), 'site' => plain((string)($a['site'] ?? ''), 200), 'lang' => substr(preg_replace('/[^A-Za-z-]/', '', (string)($a['lang'] ?? '')) ?? '', 0, 16),
                    'image' => safe_url((string)($a['image'] ?? '')), 'excerpt' => plain((string)($a['excerpt'] ?? ''), 500), 'content' => $content, 'words' => rd_words($content), 'published' => parse_date((string)($a['published'] ?? ''))];
                $id = insert_article($u['id'], $url, $x, ['added' => parse_date((string)($a['added'] ?? '')) ?: now_utc(), 'archived' => !empty($a['archived']), 'starred' => !empty($a['starred']), 'progress' => (float)($a['progress'] ?? 0),
                    'tags' => clean_tags($a['tags'] ?? []), 'note' => is_string($a['note'] ?? null) && $a['note'] !== '' ? mb_substr($a['note'], 0, 20000) : null, 'source' => 'savrea', 'status' => $content !== '' ? 'ready' : 'pending']);
                foreach (array_slice(is_array($a['highlights'] ?? null) ? $a['highlights'] : [], 0, MAX_HIGHLIGHTS) as $h) {
                    if (!is_array($h) || trim((string)($h['quote'] ?? '')) === '') continue;
                    q('INSERT INTO ' . t('rd_highlights') . ' (user_id, article_id, quote, prefix, suffix, start, color, note, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                        [$u['id'], $id, mb_substr((string)$h['quote'], 0, 8000), mb_substr((string)($h['prefix'] ?? ''), -80), mb_substr((string)($h['suffix'] ?? ''), 0, 80), max(0, (int)($h['start'] ?? 0)),
                            in_array($h['color'] ?? '', HL_COLORS, true) ? $h['color'] : 'yellow', is_string($h['note'] ?? null) && $h['note'] !== '' ? mb_substr($h['note'], 0, 8000) : null, parse_date((string)($h['created'] ?? '')) ?: now_utc(), now_utc()]);
                }
                $known[article_hash($url)] = 1;
                $added++;
            }
            foreach (is_array($j['feeds'] ?? null) ? array_slice($j['feeds'], 0, MAX_SUBS) : [] as $fd) {
                $fu = net_clean_url((string)($fd['url'] ?? ''));
                if ($fu === '') continue;
                $f = rd_feed_for_url($fu);
                if (subscribe($u['id'], (int)$f['id'], clean_folder($fd['folder'] ?? ''), plain((string)($fd['title'] ?? ''), 300) === $f['title'] ? '' : '')) $feeds++;
            }
        } elseif (in_array($kind, ['pocket', 'instapaper'], true)) {
            $list = parse_import($kind, $data);
            if (!$list) fail('import_invalid', 422);
            foreach ($list as $a) {
                $h = article_hash($a['url']);
                if (isset($known[$h])) { $skipped++; continue; }
                if ($count + $added >= MAX_ARTICLES) break;
                insert_article($u['id'], $a['url'], ['title' => $a['title'], 'site' => preg_replace('/^www\./', '', (string)parse_url($a['url'], PHP_URL_HOST))],
                    ['added' => $a['added'], 'archived' => $a['archived'], 'starred' => $a['starred'], 'tags' => $a['tags'], 'note' => $a['note'] ?? null, 'source' => $kind, 'status' => 'pending']);
                $known[$h] = 1;
                $added++;
            }
        } else fail('import_invalid', 422);
        db()->commit();
        send_json(['ok' => true, 'added' => $added, 'skipped' => $skipped, 'feeds' => $feeds, 'counts' => counts_of($u['id']), 'subs' => subs_of($u['id'])]);

    case 'rd.export':
        // The library as a .savrea file: articles with their text, highlights, tags and the feeds followed
        $u = reader();
        header('Content-Disposition: attachment; filename="savreads-' . gmdate('Y-m-d') . '.savrea"');
        header('Content-Type: application/vnd.savreads.library+json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode(savrea_of($u, empty($_GET['light'])), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;

    case 'rd.opml.import':
        // An OPML file (the feeds of another reader): each one is followed, in its folder; they are read by rd.feeds.refresh
        $u = writer();
        $xml = (string)(body()['opml'] ?? '');
        if ($xml === '' || strlen($xml) > 4000000) fail('opml_invalid', 422);
        $list = opml_feeds($xml);
        if (!$list) fail('opml_invalid', 422);
        $have = (int)q('SELECT COUNT(*) FROM ' . t('rd_subs') . ' WHERE user_id = ?', [$u['id']])->fetchColumn();
        $added = 0;
        foreach ($list as $fd) {
            if ($have + $added >= MAX_SUBS) break;
            $f = rd_feed_for_url($fd['url']);
            if (subscribe($u['id'], (int)$f['id'], $fd['folder'])) $added++;
        }
        send_json(['ok' => true, 'found' => count($list), 'added' => $added, 'subs' => subs_of($u['id'])]);

    case 'rd.opml.export':
        // The feeds followed as OPML (folders as outlines), for any other reader
        $u = reader();
        $rows = q('SELECT f.url, COALESCE(NULLIF(s.title, \'\'), f.title) AS title, f.link, s.folder FROM ' . t('rd_subs') . ' s JOIN ' . t('rd_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? ORDER BY s.folder, title', [$u['id']])->fetchAll();
        header('Content-Type: text/x-opml; charset=utf-8');
        header('Content-Disposition: attachment; filename="savreads.opml"');
        header('Cache-Control: no-store');
        $line = fn($f, $pad) => $pad . '<outline type="rss" text="' . x($f['title']) . '" title="' . x($f['title']) . '" xmlUrl="' . x($f['url']) . '"' . ($f['link'] !== '' ? ' htmlUrl="' . x($f['link']) . '"' : '') . "/>\n";
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n<opml version=\"2.0\">\n  <head>\n    <title>SavReads</title>\n    <dateCreated>" . gmdate(DATE_RFC2822) . "</dateCreated>\n  </head>\n  <body>\n";
        $groups = [];
        foreach ($rows as $f) $groups[$f['folder']][] = $f;
        foreach ($groups as $folder => $list) {
            if ($folder === '') { foreach ($list as $f) echo $line($f, '    '); continue; }
            echo '    <outline text="' . x($folder) . '" title="' . x($folder) . "\">\n";
            foreach ($list as $f) echo $line($f, '      ');
            echo "    </outline>\n";
        }
        echo "  </body>\n</opml>\n";
        exit;

    default:
        fail('not_found', 404);
}

<?php
/**
 * SavPresentations — pictures (uploaded or imported) and the search of free images and videos.
 *
 * Pictures are re-encoded with GD (metadata such as the place of a photo is lost on purpose), kept as files in the
 * storage folder (never reachable from the browser) and served by their random id: api/?r=media&id=…
 * Searches go through the server: the portals never see who is searching. Imports only accept results of a recent
 * search (or a YouTube/Vimeo poster), never an address chosen by the browser.
 */

declare(strict_types=1);

const MAX_SIDE = 2400;

function media_path(string $id): string
{
    return config_value('storage') . '/' . substr($id, 0, 2) . '/' . $id . '.bin';
}

function media_used(int $userId): int
{
    $st = db()->prepare('SELECT COALESCE(SUM(bytes), 0) FROM ' . t('media') . ' WHERE user_id = ?');
    $st->execute([$userId]);
    return (int)$st->fetchColumn();
}

function media_out(array $m): array
{
    return ['id' => $m['id'], 'src' => 'm:' . $m['id'], 'w' => (int)$m['width'], 'h' => (int)$m['height'], 'bytes' => (int)$m['bytes'], 'name' => $m['name'], 'credit' => $m['credit']];
}

/** Checks, re-encodes and stores the bytes of a picture. */
function store_picture(int $userId, string $bytes, string $name, string $credit = ''): array
{
    $size = @getimagesizefromstring($bytes);
    $types = [IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_PNG => 'image/png', IMAGETYPE_WEBP => 'image/webp', IMAGETYPE_GIF => 'image/gif'];
    if (!$size || !isset($types[$size[2]])) fail('image_type', 422);
    [$w, $h] = $size;
    if ($w < 1 || $h < 1 || $w * $h > 50000000) fail('image_big', 413);
    $mime = $types[$size[2]];
    if ($mime !== 'image/gif' && function_exists('imagecreatefromstring')) {
        @ini_set('memory_limit', '384M');
        $im = @imagecreatefromstring($bytes);
        if (!$im) fail('image_type', 422);
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $ex = @exif_read_data('data://image/jpeg;base64,' . base64_encode(substr($bytes, 0, 131072)));
            $rot = [3 => 180, 6 => -90, 8 => 90][(int)($ex['Orientation'] ?? 1)] ?? 0;
            if ($rot) $im = imagerotate($im, $rot, 0);
        }
        $w = imagesx($im);
        $h = imagesy($im);
        $k = min(1, MAX_SIDE / max($w, $h));
        if ($k < 1) {
            $nw = max(1, (int)round($w * $k));
            $nh = max(1, (int)round($h * $k));
            $out = imagecreatetruecolor($nw, $nh);
            imagealphablending($out, false);
            imagesavealpha($out, true);
            imagecopyresampled($out, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
            $im = $out;
            [$w, $h] = [$nw, $nh];
        }
        ob_start();
        if ($mime === 'image/jpeg') imagejpeg($im, null, 86);
        else {
            if (!imageistruecolor($im)) imagepalettetotruecolor($im);
            imagealphablending($im, false);
            imagesavealpha($im, true);
            if ($mime === 'image/webp' && function_exists('imagewebp')) imagewebp($im, null, 86);
            else {
                $mime = 'image/png';
                imagepng($im, null, 7);
            }
        }
        $bytes = (string)ob_get_clean();
    }
    if (strlen($bytes) > MAX_IMAGE_BYTES) fail('image_big', 413);
    if (media_used($userId) + strlen($bytes) > (int)config_value('quota')) fail('quota', 413);
    $id = bin2hex(random_bytes(16));
    $file = media_path($id);
    if (!is_dir(dirname($file)) && !@mkdir(dirname($file), 0755, true) && !is_dir(dirname($file))) throw new RuntimeException('storage folder not writable');
    if (@file_put_contents($file, $bytes) !== strlen($bytes)) throw new RuntimeException('storage folder not writable');
    db()->prepare('INSERT INTO ' . t('media') . ' (id, user_id, mime, width, height, bytes, name, credit, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        ->execute([$id, $userId, $mime, $w, $h, strlen($bytes), mb_substr($name, 0, 120), mb_substr($credit, 0, 300), now_utc()]);
    return ['id' => $id, 'src' => 'm:' . $id, 'w' => $w, 'h' => $h, 'bytes' => strlen($bytes), 'name' => $name, 'credit' => $credit];
}

function serve_media(string $id): void
{
    $m = null;
    if (preg_match('/^[a-f0-9]{32}$/', $id)) {
        $st = db()->prepare('SELECT m.mime, m.bytes FROM ' . t('media') . ' m JOIN ' . t('users') . ' u ON u.id = m.user_id WHERE m.id = ? AND u.status = \'active\'');
        $st->execute([$id]);
        $m = $st->fetch();
    }
    if (!$m || !is_file(media_path($id))) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: ' . $m['mime']);
    header('Content-Length: ' . filesize(media_path($id)));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=31536000, immutable');
    header("Content-Security-Policy: default-src 'none'");
    readfile(media_path($id));
    exit;
}

function delete_media_files(array $ids): void
{
    foreach ($ids as $id) if (preg_match('/^[a-f0-9]{32}$/', (string)$id)) @unlink(media_path((string)$id));
}

// ---------------------------------------------------------------- outgoing requests

function public_host(string $host): bool
{
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (@gethostbynamel($host) ?: []);
    if (!$ips) return false;
    foreach ($ips as $ip) if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
    return true;
}

/** Downloads an https address of a public server (redirects checked one by one), at most $max bytes. */
function http_get(string $url, int $max = 3000000, array $headers = [], int $timeout = 12): ?string
{
    for ($hop = 0; $hop < 4; $hop++) {
        $p = parse_url($url);
        if (($p['scheme'] ?? '') !== 'https' || empty($p['host']) || !public_host((string)$p['host'])) return null;
        $buf = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => $timeout, CURLOPT_USERAGENT => (string)config_value('user_agent'),
            CURLOPT_HTTPHEADER => $headers, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_ENCODING => '',
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$buf, $max) {
                $buf .= $chunk;
                return strlen($buf) > $max ? 0 : strlen($chunk);
            },
        ]);
        $ok = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $next = (string)curl_getinfo($ch, CURLINFO_REDIRECT_URL);
        if ($code >= 300 && $code < 400 && $next !== '') {
            $url = $next;
            continue;
        }
        return $ok && $code === 200 ? $buf : null;
    }
    return null;
}

function http_json(string $url, array $headers = []): ?array
{
    $raw = http_get($url, 4000000, $headers);
    $d = $raw ? json_decode($raw, true) : null;
    return is_array($d) ? $d : null;
}

// ---------------------------------------------------------------- search

function search_sources(): array
{
    $out = ['image' => ['openverse', 'wikimedia'], 'video' => ['wikimedia']];
    if (config_value('pexels_key')) {
        array_unshift($out['image'], 'pexels');
        array_unshift($out['video'], 'pexels');
    }
    if (config_value('pixabay_key')) {
        $out['image'][] = 'pixabay';
        $out['video'][] = 'pixabay';
    }
    return $out;
}

function plain(string $html, int $max = 120): string
{
    return mb_substr(trim(html_entity_decode(strip_tags($html), ENT_QUOTES, 'UTF-8')), 0, $max);
}

/** $free: only what can be used without naming the author (CC0, public domain, Pexels and Pixabay licences). */
function search_media(string $kind, string $source, string $q, int $page, bool $free): ?array
{
    $sources = search_sources()[$kind] ?? [];
    if (!in_array($source, $sources, true)) fail('bad_request', 422);
    $key = hash('sha256', implode('|', ['v1', $kind, $source, mb_strtolower($q), $page, (int)$free]));
    $st = db()->prepare('SELECT v FROM ' . t('cache') . ' WHERE k = ? AND expires_at > ?');
    $st->execute([$key, now_utc()]);
    $hit = $st->fetchColumn();
    if ($hit !== false) $items = json_decode((string)$hit, true);
    else {
        $fn = 'search_' . $source;
        $items = $fn($kind, $q, $page, $free);
        if ($items === null) return null;
        db()->prepare('REPLACE INTO ' . t('cache') . ' (k, v, expires_at) VALUES (?,?,?)')->execute([$key, json_out($items), gmdate('Y-m-d H:i:s', time() + 43200)]);
        if (random_int(1, 50) === 1) db()->prepare('DELETE FROM ' . t('cache') . ' WHERE expires_at < ?')->execute([now_utc()]);
    }
    return ['key' => $key, 'items' => $items];
}

function search_openverse(string $kind, string $q, int $page, bool $free): ?array
{
    $d = http_json('https://api.openverse.org/v1/images/?' . http_build_query(['q' => $q, 'page' => $page, 'page_size' => 20, 'license' => $free ? 'cc0,pdm' : 'cc0,pdm,by,by-sa', 'mature' => 'false']));
    if (!$d || !isset($d['results'])) return null;
    $out = [];
    foreach ($d['results'] as $r) {
        if (empty($r['url']) || empty($r['thumbnail'])) continue;
        $lic = strtoupper((string)$r['license']);
        $needs = !in_array($lic, ['CC0', 'PDM'], true);
        $out[] = ['title' => plain((string)($r['title'] ?? '')), 'author' => plain((string)($r['creator'] ?? ''), 80), 'license' => $lic === 'PDM' ? 'Public domain' : ($lic === 'CC0' ? 'CC0' : 'CC ' . $lic . ' ' . ($r['license_version'] ?? '')),
            'needsCredit' => $needs, 'page' => (string)($r['foreign_landing_url'] ?? ''), 'thumb' => (string)$r['thumbnail'], 'url' => (string)$r['url'], 'w' => (int)($r['width'] ?? 0), 'h' => (int)($r['height'] ?? 0)];
    }
    return $out;
}

function search_wikimedia(string $kind, string $q, int $page, bool $free): ?array
{
    $isVideo = $kind === 'video';
    $prop = $isVideo ? 'videoinfo' : 'imageinfo';
    $pre = $isVideo ? 'vi' : 'ii';
    $lic = $free ? ' incategory:"CC-Zero"|"PD-self"' : '';
    $d = http_json('https://commons.wikimedia.org/w/api.php?' . http_build_query([
        'action' => 'query', 'format' => 'json', 'formatversion' => 2, 'generator' => 'search', 'gsrnamespace' => 6, 'gsrlimit' => 24, 'gsroffset' => ($page - 1) * 24,
        'gsrsearch' => $q . ' filetype:' . ($isVideo ? 'video' : 'bitmap') . $lic, 'prop' => $prop, $pre . 'prop' => 'url|size|mime|extmetadata' . ($isVideo ? '|derivatives' : ''), $pre . 'urlwidth' => 400,
        $pre . 'extmetadatafilter' => 'LicenseShortName|Artist|ImageDescription|AttributionRequired',
    ]));
    if (!$d) return null;
    $pages = $d['query']['pages'] ?? [];
    usort($pages, fn($a, $b) => ($a['index'] ?? 0) <=> ($b['index'] ?? 0));
    $out = [];
    foreach ($pages as $p) {
        $i = $p[$prop][0] ?? null;
        if (!$i || empty($i['thumburl'])) continue;
        $x = $i['extmetadata'] ?? [];
        $name = plain((string)($x['LicenseShortName']['value'] ?? ''), 40);
        $isFree = (bool)preg_match('/^(cc0|public domain|pd)/i', $name);
        if ($name === '' || ($free && !$isFree) || preg_match('/\b(nc|nd)\b/i', $name)) continue;
        $item = ['title' => preg_replace('/^File:|\.[a-z0-9]+$/i', '', (string)$p['title']), 'author' => plain((string)($x['Artist']['value'] ?? ''), 80), 'license' => $name, 'needsCredit' => !$isFree,
            'page' => (string)($i['descriptionurl'] ?? ''), 'thumb' => (string)$i['thumburl'], 'w' => (int)$i['width'], 'h' => (int)$i['height']];
        if ($isVideo) {
            // a light version every browser can play (the originals can be huge)
            $best = null;
            foreach ($i['derivatives'] ?? [] as $v) {
                if (empty($v['src']) || (int)($v['height'] ?? 0) < 240 || (int)($v['height'] ?? 0) > 760) continue;
                if (!preg_match('~^video/(mp4|webm)~', (string)($v['type'] ?? ''))) continue;
                if (!$best || (int)$v['height'] > (int)$best['height']) $best = $v;
            }
            $url = $best['src'] ?? (preg_match('~^video/(mp4|webm)~', (string)$i['mime']) ? $i['url'] : '');
            if ($url === '') continue;
            $item['video'] = strpos($url, '//') === 0 ? 'https:' . $url : $url;
            $item['url'] = $item['thumb'];
        } else {
            if (!in_array($i['mime'], ['image/jpeg', 'image/png', 'image/webp'], true)) continue;
            // originals can weigh tens of MB: Commons draws a 1920 px copy
            $item['url'] = $i['width'] > 1920 ? preg_replace('~/\d+px-~', '/1920px-', (string)$i['thumburl']) : (string)$i['url'];
        }
        $out[] = $item;
    }
    return $out;
}

function search_pexels(string $kind, string $q, int $page, bool $free): ?array
{
    $base = $kind === 'video' ? 'https://api.pexels.com/videos/search?' : 'https://api.pexels.com/v1/search?';
    $d = http_json($base . http_build_query(['query' => $q, 'page' => $page, 'per_page' => 24]), ['Authorization: ' . config_value('pexels_key')]);
    if (!$d) return null;
    $out = [];
    foreach ($kind === 'video' ? ($d['videos'] ?? []) : ($d['photos'] ?? []) as $r) {
        $item = ['title' => plain((string)($r['alt'] ?? '')), 'author' => plain((string)($r['photographer'] ?? $r['user']['name'] ?? ''), 80), 'license' => 'Pexels', 'needsCredit' => false, 'page' => (string)$r['url'], 'w' => (int)$r['width'], 'h' => (int)$r['height']];
        if ($kind === 'video') {
            $best = null;
            foreach ($r['video_files'] ?? [] as $f) if (($f['file_type'] ?? '') === 'video/mp4' && (int)$f['height'] <= 1100 && (!$best || (int)$f['height'] > (int)$best['height'])) $best = $f;
            if (!$best) continue;
            $item += ['thumb' => (string)$r['image'], 'url' => (string)$r['image'], 'video' => (string)$best['link']];
        } else $item += ['thumb' => (string)$r['src']['medium'], 'url' => (string)$r['src']['large2x']];
        $out[] = $item;
    }
    return $out;
}

function search_pixabay(string $kind, string $q, int $page, bool $free): ?array
{
    $d = http_json('https://pixabay.com/api/' . ($kind === 'video' ? 'videos/' : '') . '?' . http_build_query(['key' => config_value('pixabay_key'), 'q' => mb_substr($q, 0, 90), 'page' => $page, 'per_page' => 24, 'safesearch' => 'true']));
    if (!$d) return null;
    $out = [];
    foreach ($d['hits'] ?? [] as $r) {
        $item = ['title' => plain((string)($r['tags'] ?? '')), 'author' => plain((string)($r['user'] ?? ''), 80), 'license' => 'Pixabay', 'needsCredit' => false, 'page' => (string)$r['pageURL']];
        if ($kind === 'video') {
            $v = $r['videos']['medium'] ?? null;
            if (empty($v['url']) || empty($v['thumbnail'])) continue;
            $item += ['thumb' => (string)$v['thumbnail'], 'url' => (string)$v['thumbnail'], 'video' => (string)$v['url'], 'w' => (int)$v['width'], 'h' => (int)$v['height']];
        } else $item += ['thumb' => (string)$r['webformatURL'], 'url' => (string)$r['largeImageURL'], 'w' => (int)$r['imageWidth'], 'h' => (int)$r['imageHeight']];
        $out[] = $item;
    }
    return $out;
}

/** What the browser needs of a result: the addresses to download stay on the server. */
function search_public(array $res): array
{
    return ['key' => $res['key'], 'items' => array_map(fn($i, $n) => ['n' => $n, 'title' => $i['title'], 'author' => $i['author'], 'license' => $i['license'], 'needsCredit' => $i['needsCredit'], 'page' => $i['page'], 'w' => $i['w'], 'h' => $i['h'], 'video' => $i['video'] ?? null], $res['items'], array_keys($res['items']))];
}

function search_item(string $key, int $n): ?array
{
    if (!preg_match('/^[a-f0-9]{64}$/', $key)) return null;
    $st = db()->prepare('SELECT v FROM ' . t('cache') . ' WHERE k = ?');
    $st->execute([$key]);
    $items = json_decode((string)$st->fetchColumn(), true);
    return is_array($items) ? ($items[$n] ?? null) : null;
}

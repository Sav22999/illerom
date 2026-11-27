<?php
/**
 * SavPhotos — the photos and videos of SavDrive, by the day they were taken, with albums and the backup of a phone.
 *
 * SavPhotos has no accounts, files or space of its own: they are the ones of SavDrive. Its pages are in ../savphotos/,
 * its API is here, inside the API of SavDrive (api/?r=photos.*), so the session (the cookie of SavDrive), the uploads in
 * pieces, the trash, the stars and the space are the same. A photo is a file of SavDrive (image/* or video/*); SavPhotos
 * adds what it read from it (date taken, size in pixels, place, camera) and the albums.
 *
 * Who can use it: the master admins always; everybody else as an admin chooses in the panel of SavPhotos
 * (photo_users.enabled), or the default for whoever has no choice of their own (meta photos_default: off at the start,
 * while SavPhotos is being tried). An account must also be able to use SavDrive (confirmed and activated).
 *
 * Tables (with the prefix of SavDrive, created here the first time: meta photos_schema):
 *   photo_users  user_id, enabled (NULL = the default), changed_at, seen_at (the last visit), prefs (settings of the app)
 *   photo_meta   node_id, user_id, bkey (the content that was read: a file replaced is read again), taken_at (the local time
 *                of the camera), taken_src (exif | meta: read by the browser in the file | mp4 | modified: date of the file
 *                on the device | file: when it arrived), width, height, duration (s), lat, lon, camera, hash (SHA-256
 *                computed by the browser: a photo already there is not sent again)
 *   albums       id, uid, user_id, name, cover_id (a node), share_token (a link anyone can open), created_at, updated_at
 *   album_items  album_id, node_id, added_at
 *
 * Small pictures: <bkey>.t.jpg next to the file, as for the cards of SavDrive (lib/files.php thumb_path): made by GD for
 * the pictures it reads, or sent by the browser (photos.thumbset) for what GD cannot read (HEIC in Safari, videos).
 */

declare(strict_types=1);

const PHOTOS_SCHEMA = 1;
const PHOTO_ROOT = 'SavPhotos';           // the folder of My drive the photos sent from SavPhotos go into, by year
const PHOTO_THUMB_MAX = 700000;            // bytes of a small picture sent by the browser
const PHOTO_PAGE = 240;                    // photos in one answer of photos.list
/** A photo or a video (SVG is a drawing, not a photo). The table of the files is always "n". */
const PHOTO_MEDIA = "((n.mime LIKE 'image/%' AND n.mime <> 'image/svg+xml') OR n.mime LIKE 'video/%')";

// ---------------------------------------------------------------- tables

function photos_schema(): void
{
    static $done = false;
    if ($done) return;
    $done = true;
    if ((int)setting('photos_schema', '0') >= PHOTOS_SCHEMA) return;
    $p = (string)config_value('prefix', 'dr_');
    $e = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    $fk = fn(string $name, string $col, string $table) => "CONSTRAINT `fk_{$p}{$name}` FOREIGN KEY (`$col`) REFERENCES `{$p}$table` (`id`) ON DELETE CASCADE";
    foreach ([
        "CREATE TABLE IF NOT EXISTS `{$p}photo_users` (
            `user_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `enabled` TINYINT(1) NULL,
            `changed_at` DATETIME NULL,
            `seen_at` DATETIME NULL,
            `prefs` TEXT NULL,
            " . $fk('phu_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}photo_meta` (
            `node_id` INT UNSIGNED NOT NULL PRIMARY KEY,
            `user_id` INT UNSIGNED NOT NULL,
            `bkey` CHAR(32) NOT NULL,
            `taken_at` DATETIME NOT NULL,
            `taken_src` VARCHAR(8) NOT NULL DEFAULT 'file',
            `width` INT UNSIGNED NULL,
            `height` INT UNSIGNED NULL,
            `duration` INT UNSIGNED NULL,
            `lat` DECIMAL(9,6) NULL,
            `lon` DECIMAL(9,6) NULL,
            `camera` VARCHAR(80) NULL,
            `hash` CHAR(64) NULL,
            KEY `ix_user_taken` (`user_id`, `taken_at`),
            KEY `ix_user_hash` (`user_id`, `hash`),
            " . $fk('phm_node', 'node_id', 'nodes') . ",
            " . $fk('phm_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}albums` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            `uid` CHAR(16) NOT NULL,
            `user_id` INT UNSIGNED NOT NULL,
            `name` VARCHAR(120) NOT NULL,
            `cover_id` INT UNSIGNED NULL,
            `share_token` CHAR(32) NULL,
            `created_at` DATETIME NOT NULL,
            `updated_at` DATETIME NOT NULL,
            UNIQUE KEY `uq_uid` (`uid`),
            UNIQUE KEY `uq_share` (`share_token`),
            KEY `ix_user` (`user_id`),
            " . $fk('alb_user', 'user_id', 'users') . "
        ) $e",
        "CREATE TABLE IF NOT EXISTS `{$p}album_items` (
            `album_id` INT UNSIGNED NOT NULL,
            `node_id` INT UNSIGNED NOT NULL,
            `added_at` DATETIME NOT NULL,
            PRIMARY KEY (`album_id`, `node_id`),
            KEY `ix_node` (`node_id`),
            " . $fk('ali_album', 'album_id', 'albums') . ",
            " . $fk('ali_node', 'node_id', 'nodes') . "
        ) $e",
    ] as $sql) db()->exec($sql);
    set_setting('photos_schema', (string)PHOTOS_SCHEMA);
}

// ---------------------------------------------------------------- who can use SavPhotos

/** Whether people without a choice of their own can use SavPhotos (off until the admins open it to everybody). */
function photos_default(): bool
{
    return setting('photos_default', '0') === '1';
}

/** The choice of an admin for this account: true, false, or null (= the default). */
function photo_choice(int $uid): ?bool
{
    $st = db()->prepare('SELECT enabled FROM ' . t('photo_users') . ' WHERE user_id = ?');
    $st->execute([$uid]);
    $v = $st->fetchColumn();
    return $v === false || $v === null ? null : (bool)(int)$v;
}

function photo_allowed(array $u): bool
{
    if (is_master($u)) return true;
    return photo_choice((int)$u['id']) ?? photos_default();
}

/** A signed-in account that can use SavDrive and SavPhotos. */
function photos_user(): array
{
    $u = require_user();
    if (!photo_allowed($u)) fail('photos_off', 403);
    return $u;
}

function photos_reader(): array
{
    only('GET');
    return photos_user();
}

function photos_writer(): array
{
    only('POST');
    $u = photos_user();
    require_csrf($u);
    return $u;
}

/** The address of SavPhotos, next to SavDrive (for the emails). */
function photos_url(): string
{
    return rtrim(dirname(rtrim(app_url(), '/')), '/') . '/savphotos/';
}

// ---------------------------------------------------------------- what a file says about itself

/** EXIF of a picture: size in pixels (as it is shown: turned when EXIF says so), date taken with seconds, camera, place. */
function photo_exif(string $path): array
{
    $out = [];
    $info = @getimagesize($path);
    if ($info) [$out['width'], $out['height']] = [(int)$info[0], (int)$info[1]];
    if (!function_exists('exif_read_data')) return $out;
    $x = @exif_read_data($path, null, true);
    if (!is_array($x)) return $out;
    $ex = ($x['EXIF'] ?? []) + ($x['IFD0'] ?? []);
    if (isset($out['width']) && in_array((int)($ex['Orientation'] ?? 1), [5, 6, 7, 8], true)) [$out['width'], $out['height']] = [$out['height'], $out['width']];
    foreach (['DateTimeOriginal', 'DateTimeDigitized', 'DateTime'] as $k) {
        if (!empty($ex[$k]) && preg_match('/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):?(\d\d)?/', (string)$ex[$k], $m) && (int)$m[1] >= 1900 && (int)$m[1] <= 2100) {
            $out['taken'] = sprintf('%s-%s-%s %s:%s:%s', $m[1], $m[2], $m[3], $m[4], $m[5], $m[6] ?? '00');
            break;
        }
    }
    $cam = trim(trim((string)($ex['Make'] ?? '')) . ' ' . trim((string)($ex['Model'] ?? '')));
    // "Apple Apple iPhone 15" -> "Apple iPhone 15"
    $cam = preg_replace('/^(\S+)\s+\1\b/i', '$1', $cam) ?? $cam;
    if ($cam !== '') $out['camera'] = mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', '', $cam) ?? '', 0, 80);
    $g = $x['GPS'] ?? [];
    $deg = function ($v) {
        if (!is_array($v) || count($v) < 3) return null;
        $f = function ($r) { $p = explode('/', (string)$r); return count($p) === 2 && (float)$p[1] ? (float)$p[0] / (float)$p[1] : (float)$p[0]; };
        return $f($v[0]) + $f($v[1]) / 60 + $f($v[2]) / 3600;
    };
    $lat = $deg($g['GPSLatitude'] ?? null);
    $lon = $deg($g['GPSLongitude'] ?? null);
    if ($lat !== null && $lon !== null && ($lat || $lon) && abs($lat) <= 90 && abs($lon) <= 180) {
        if (strtoupper((string)($g['GPSLatitudeRef'] ?? 'N')) === 'S') $lat = -$lat;
        if (strtoupper((string)($g['GPSLongitudeRef'] ?? 'E')) === 'W') $lon = -$lon;
        $out['lat'] = round($lat, 6);
        $out['lon'] = round($lon, 6);
    }
    return $out;
}

/**
 * What an MP4 / MOV says about itself, read from its boxes (no other program needed): when it was recorded (mvhd, in
 * UTC), how long it lasts, and the size of its picture (tkhd, turned when the track is turned).
 */
function photo_mp4(string $path): array
{
    $fh = @fopen($path, 'rb');
    if (!$fh) return [];
    $size = (int)filesize($path);
    $out = [];
    $u32 = fn(string $s) => unpack('N', $s)[1];
    $u64 = function (string $s) { $p = unpack('N2', $s); return $p[1] * 4294967296 + $p[2]; };
    // the boxes between $from and $to: [type, start of the content, end]
    $boxes = function (int $from, int $to) use ($fh, $u32, $u64): array {
        $list = [];
        for ($pos = $from, $i = 0; $pos + 8 <= $to && $i < 4000; $i++) {
            fseek($fh, $pos);
            $head = fread($fh, 8);
            if (strlen($head) < 8) break;
            $len = $u32(substr($head, 0, 4));
            $type = substr($head, 4, 4);
            $body = $pos + 8;
            if ($len === 1) {
                $big = fread($fh, 8);
                if (strlen($big) < 8) break;
                $len = $u64($big);
                $body = $pos + 16;
            } elseif ($len === 0) $len = $to - $pos;
            if ($len < 8 || $pos + $len > $to + 8) break;
            $list[] = [$type, $body, min($to, $pos + $len)];
            $pos += $len;
        }
        return $list;
    };
    $moov = null;
    foreach ($boxes(0, $size) as $b) if ($b[0] === 'moov') { $moov = $b; break; }
    if ($moov) {
        foreach ($boxes($moov[1], $moov[2]) as $b) {
            if ($b[0] === 'mvhd') {
                fseek($fh, $b[1]);
                $d = fread($fh, 32);
                if (strlen($d) >= 20) {
                    $v1 = ord($d[0]) === 1;
                    $created = $v1 ? $u64(substr($d, 4, 8)) : $u32(substr($d, 4, 4));
                    $scale = $v1 ? $u32(substr($d, 20, 4)) : $u32(substr($d, 12, 4));
                    $dur = $v1 ? (strlen($d) >= 32 ? $u64(substr($d, 24, 8)) : 0) : $u32(substr($d, 16, 4));
                    $unix = $created - 2082844800; // the boxes count from 1904
                    if ($unix > 631152000 && $unix < time() + 86400) $out['created'] = $unix; // after 1990, not in the future
                    if ($scale > 0 && $dur > 0) $out['duration'] = (int)round($dur / $scale);
                }
            } elseif ($b[0] === 'trak' && !isset($out['width'])) {
                foreach ($boxes($b[1], $b[2]) as $c) {
                    if ($c[0] !== 'tkhd') continue;
                    fseek($fh, $c[1]);
                    $d = fread($fh, 96);
                    $v1 = strlen($d) > 0 && ord($d[0]) === 1;
                    $m = $v1 ? 52 : 40; // the matrix, then width and height (16.16)
                    if (strlen($d) < $m + 44) continue;
                    $w = (int)($u32(substr($d, $m + 36, 4)) / 65536);
                    $h = (int)($u32(substr($d, $m + 40, 4)) / 65536);
                    if ($w > 0 && $h > 0) {
                        $a = unpack('N', substr($d, $m, 4))[1];
                        $turned = $a === 0; // a = cos(angle): 0 when the picture is turned by 90° or 270°
                        [$out['width'], $out['height']] = $turned ? [$h, $w] : [$w, $h];
                    }
                }
            }
        }
    }
    fclose($fh);
    return $out;
}

/** Everything SavPhotos can read from a file on the server. */
function photo_read(array $n): array
{
    $path = blob_path((int)$n['user_id'], (string)$n['bkey']);
    if (!is_file($path)) return [];
    $mime = (string)$n['mime'];
    if (str_starts_with($mime, 'image/')) return photo_exif($path);
    if (preg_match('#^video/(mp4|quicktime|x-m4v|3gpp)#', $mime)) {
        $m = photo_mp4($path);
        $out = array_intersect_key($m, ['width' => 1, 'height' => 1, 'duration' => 1]);
        if (isset($m['created'])) $out['mp4'] = gmdate('Y-m-d H:i:s', $m['created']);
        return $out;
    }
    return [];
}

/**
 * Saves what is known of a file: read on the server ($read) and sent by the browser ($client: taken, src, w, h, d, hash).
 * The date taken: EXIF first, then what the browser read in the file, the date of the recording of a video, the date of
 * the file on the device, and last when it arrived in SavDrive.
 */
function photo_store(array $n, array $read, array $client = []): void
{
    $taken = $src = null;
    foreach ([[$read['taken'] ?? null, 'exif'], [($client['src'] ?? '') === 'meta' ? ($client['taken'] ?? null) : null, 'meta'], [$read['mp4'] ?? null, 'mp4'],
                 [$client['taken'] ?? null, 'modified']] as [$v, $s]) {
        if ($v) { [$taken, $src] = [$v, $s]; break; }
    }
    if (!$taken) [$taken, $src] = [(string)$n['created_at'], 'file'];
    $w = $read['width'] ?? ($client['w'] ?? null);
    $h = $read['height'] ?? ($client['h'] ?? null);
    $d = $read['duration'] ?? ($client['d'] ?? null);
    db()->prepare('INSERT INTO ' . t('photo_meta') . ' (node_id, user_id, bkey, taken_at, taken_src, width, height, duration, lat, lon, camera, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE hash = COALESCE(VALUES(hash), IF(bkey = VALUES(bkey), hash, NULL)), bkey = VALUES(bkey), taken_at = VALUES(taken_at), taken_src = VALUES(taken_src),
        width = VALUES(width), height = VALUES(height), duration = VALUES(duration), lat = VALUES(lat), lon = VALUES(lon), camera = VALUES(camera)')
        ->execute([$n['id'], $n['user_id'], $n['bkey'], $taken, $src, $w ? (int)$w : null, $h ? (int)$h : null, $d !== null ? (int)$d : null,
            $read['lat'] ?? null, $read['lon'] ?? null, $read['camera'] ?? null, $client['hash'] ?? null]);
}

/**
 * Reads the photos of an account that were never read (or whose content changed), for at most $budget seconds.
 * Returns how many are still to read.
 */
function photos_scan(int $uid, float $budget = 2.0): int
{
    $T = t('nodes');
    $M = t('photo_meta');
    $where = "n.user_id = ? AND n.kind = 'file' AND n.trashed_at IS NULL AND n.bkey IS NOT NULL AND " . PHOTO_MEDIA . ' AND (m.node_id IS NULL OR m.bkey <> n.bkey)';
    $st = db()->prepare("SELECT n.* FROM $T n LEFT JOIN $M m ON m.node_id = n.id WHERE $where ORDER BY n.id DESC LIMIT 500");
    $st->execute([$uid]);
    $t0 = microtime(true);
    foreach ($st->fetchAll() as $n) {
        photo_store($n, photo_read($n));
        if (microtime(true) - $t0 > $budget) break;
    }
    $st = db()->prepare("SELECT COUNT(*) FROM $T n LEFT JOIN $M m ON m.node_id = n.id WHERE $where");
    $st->execute([$uid]);
    return (int)$st->fetchColumn();
}

// ---------------------------------------------------------------- small pictures

/** The small picture of a photo: the one kept next to it, or one made now by GD (pictures only). */
function photo_thumb_file(array $n): ?string
{
    $mine = blob_path((int)$n['user_id'], (string)$n['bkey']) . '.t.jpg';
    if (is_file($mine)) return $mine;
    if (str_starts_with((string)$n['mime'], 'image/') && $n['mime'] !== 'image/svg+xml' && function_exists('thumb_path')) return thumb_path($n);
    return null;
}

function photo_send_thumb(array $n): void
{
    $path = photo_thumb_file($n);
    if (!$path) {
        http_response_code(404);
        exit;
    }
    $tag = '"' . substr((string)$n['bkey'], 0, 16) . '-' . filemtime($path) . '"';
    header('Content-Type: image/jpeg');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=2592000');
    header('ETag: ' . $tag);
    if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $tag) {
        http_response_code(304);
        exit;
    }
    header('Content-Length: ' . filesize($path));
    readfile($path);
    exit;
}

/**
 * Keeps the small picture made by the browser next to the file (<bkey>.t.jpg): a JPEG of at most 1600 px, drawn again by
 * GD when it is there, so what is kept is surely a plain picture. False when it is not one.
 */
function photo_save_thumb(array $n, string $raw): bool
{
    $info = strlen($raw) > 100 && strlen($raw) <= PHOTO_THUMB_MAX ? @getimagesizefromstring($raw) : false;
    if (!$info || $info[2] !== IMAGETYPE_JPEG || $info[0] > 1600 || $info[1] > 1600) return false;
    if (function_exists('imagecreatefromstring')) {
        $im = @imagecreatefromstring($raw);
        if (!$im) return false;
        ob_start();
        imagejpeg($im, null, 82);
        $raw = (string)ob_get_clean();
        unset($im);
    }
    $dest = blob_path((int)$n['user_id'], (string)$n['bkey']) . '.t.jpg';
    $tmp = $dest . '.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $raw) === false || !@rename($tmp, $dest)) {
        @unlink($tmp);
        throw new RuntimeException('thumb not saved');
    }
    return true;
}

/** Bytes a photo can have to travel in one request (photos.upload): what PHP accepts, with room for the rest, at most 15 MB. */
function photo_one_shot(): int
{
    $b = function (string $v): int { $v = trim($v); $n = (int)$v; $u = strtolower(substr($v, -1)); return $u === 'g' ? $n * 1073741824 : ($u === 'm' ? $n * 1048576 : ($u === 'k' ? $n * 1024 : $n)); };
    $lim = min($b((string)ini_get('post_max_size')) ?: PHP_INT_MAX, $b((string)ini_get('upload_max_filesize')) ?: PHP_INT_MAX);
    return max(0, min(15 * 1048576, $lim - 1048576));
}

/**
 * Many small pictures in one answer (the grid asks 40 at a time instead of one request each): {uid: base64 of the JPEG,
 * or null when there is none}; later: those GD had no time to draw now (asked again by the app).
 */
function photo_thumbs(array $nodes): array
{
    $out = [];
    $later = [];
    $t0 = microtime(true);
    foreach ($nodes as $uid => $n) {
        if (!$n) { $out[$uid] = null; continue; }
        $have = blob_path((int)$n['user_id'], (string)$n['bkey']) . '.t.jpg';
        if (!is_file($have) && microtime(true) - $t0 > 3) { $later[] = $uid; continue; } // drawing more would make the answer too slow
        $path = photo_thumb_file($n);
        $out[$uid] = $path ? base64_encode((string)file_get_contents($path)) : null;
    }
    return ['thumbs' => (object)$out, 'later' => $later];
}

/** The uids of a request (?ids=a,b,c), at most 40. */
function photo_ids(): array
{
    $ids = array_values(array_unique(array_filter(explode(',', (string)($_GET['ids'] ?? '')), fn($x) => preg_match('/^[A-Za-z0-9]{16}$/', $x))));
    if (!$ids || count($ids) > 40) fail('bad_request', 422);
    return $ids;
}

// ---------------------------------------------------------------- lists of photos

/** The folders of SavPhotos in My drive (the folder and every folder inside it): their ids, or [] when there is none. */
function photo_root_ids(int $uid): array
{
    $root = photo_folder($uid, null, PHOTO_ROOT, false);
    if (!$root) return [];
    $all = [(int)$root['id']];
    $level = $all;
    for ($i = 0; $level && $i <= MAX_DEPTH; $i++) {
        $st = db()->prepare('SELECT id FROM ' . t('nodes') . " WHERE user_id = ? AND kind = 'folder' AND trashed_at IS NULL AND parent_id IN (" . implode(',', $level) . ')');
        $st->execute([$uid]);
        $level = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        $all = array_merge($all, $level);
    }
    return $all;
}

/** A folder by name (the oldest one), created when $create and missing. */
function photo_folder(int $uid, ?int $parent, string $name, bool $create): ?array
{
    $st = db()->prepare('SELECT * FROM ' . t('nodes') . " WHERE user_id = ? AND parent_id <=> ? AND kind = 'folder' AND trashed_at IS NULL AND LOWER(name) = LOWER(?) ORDER BY id LIMIT 1");
    $st->execute([$uid, $parent, $name]);
    $f = $st->fetch();
    if ($f || !$create) return $f ?: null;
    if (count_nodes($uid) >= MAX_NODES) fail('too_many', 422);
    $node = new_uid();
    db()->prepare('INSERT INTO ' . t('nodes') . " (uid, user_id, parent_id, kind, name, created_by, created_at, updated_at) VALUES (?,?,?,'folder',?,?,?,?)")
        ->execute([$node, $uid, $parent, $name, $uid, now_utc(), now_utc()]);
    return node_by_uid($node);
}

function photo_prefs(int $uid): array
{
    $st = db()->prepare('SELECT prefs FROM ' . t('photo_users') . ' WHERE user_id = ?');
    $st->execute([$uid]);
    $p = json_decode((string)$st->fetchColumn(), true);
    return is_array($p) ? $p : [];
}

/** What the browser knows of a photo. */
function photo_out(array $r): array
{
    $x = ['id' => $r['uid'], 'name' => $r['name'], 'mime' => $r['mime'], 'size' => (int)$r['size'], 't' => $r['taken_at'], 'v' => substr((string)$r['bkey'], 0, 8)];
    if ($r['width']) [$x['w'], $x['h']] = [(int)$r['width'], (int)$r['height']];
    if ($r['duration'] !== null) $x['d'] = (int)$r['duration'];
    if (str_starts_with((string)$r['mime'], 'video/')) $x['video'] = true;
    if (!empty($r['starred'])) $x['star'] = true;
    return $x;
}

/**
 * One page of photos of $uid, newest first. $o: fav, video, q (in the name), album (id), folders (ids: only inside them), cursor
 * ("taken|node id": after this one), before ("YYYY-MM": from the end of that month), limit.
 */
function photo_page(int $uid, array $o): array
{
    $T = t('nodes');
    $M = t('photo_meta');
    $sql = "SELECT n.uid, n.name, n.mime, n.size, n.bkey, n.starred, m.node_id, m.taken_at, m.width, m.height, m.duration FROM $M m JOIN $T n ON n.id = m.node_id";
    $args = [];
    if (!empty($o['album'])) {
        $sql .= ' JOIN ' . t('album_items') . ' ai ON ai.node_id = m.node_id AND ai.album_id = ?';
        $args[] = (int)$o['album'];
    }
    $sql .= ' WHERE m.user_id = ? AND n.trashed_at IS NULL AND n.bkey = m.bkey AND ' . PHOTO_MEDIA;
    $args[] = $uid;
    if (!empty($o['fav'])) $sql .= ' AND n.starred = 1';
    if (!empty($o['video'])) $sql .= " AND n.mime LIKE 'video/%'";
    if (($o['q'] ?? '') !== '') {
        $sql .= ' AND n.name LIKE ?';
        $args[] = '%' . addcslashes((string)$o['q'], '%_\\') . '%';
    }
    if (isset($o['folders'])) {
        if (!$o['folders']) return ['items' => [], 'next' => null];
        $sql .= ' AND n.parent_id IN (' . implode(',', array_map('intval', $o['folders'])) . ')';
    }
    if (!empty($o['cursor']) && preg_match('/^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\|(\d+)$/', (string)$o['cursor'], $c)) {
        $sql .= ' AND (m.taken_at < ? OR (m.taken_at = ? AND m.node_id < ?))';
        array_push($args, $c[1], $c[1], (int)$c[2]);
    } elseif (!empty($o['before']) && preg_match('/^(\d{4})-(\d\d)$/', (string)$o['before'], $c)) {
        $y = (int)$c[1];
        $mo = (int)$c[2];
        $sql .= ' AND m.taken_at < ?';
        $args[] = $mo >= 12 ? sprintf('%04d-01-01 00:00:00', $y + 1) : sprintf('%04d-%02d-01 00:00:00', $y, $mo + 1);
    }
    $limit = max(1, min(600, (int)($o['limit'] ?? PHOTO_PAGE)));
    $st = db()->prepare("$sql ORDER BY m.taken_at DESC, m.node_id DESC LIMIT " . ($limit + 1));
    $st->execute($args);
    $rows = $st->fetchAll();
    $more = count($rows) > $limit;
    if ($more) array_pop($rows);
    $last = end($rows);
    return ['items' => array_map('photo_out', $rows), 'next' => $more && $last ? $last['taken_at'] . '|' . $last['node_id'] : null];
}

/** One photo as photo_out gives it (for the grid), or null. */
function photo_one(int $nodeId): ?array
{
    $st = db()->prepare('SELECT n.uid, n.name, n.mime, n.size, n.bkey, n.starred, m.node_id, m.taken_at, m.width, m.height, m.duration FROM ' . t('photo_meta') . ' m JOIN ' . t('nodes') . ' n ON n.id = m.node_id WHERE m.node_id = ? AND n.bkey = m.bkey');
    $st->execute([$nodeId]);
    $r = $st->fetch();
    return $r ? photo_out($r) : null;
}

/** The album of this account a photo just uploaded also goes into (dropped on an album), when the request names one. */
function photo_into_album(array $u, array $n, $albumUid): void
{
    if (!is_string($albumUid) || $albumUid === '') return;
    $st = db()->prepare('SELECT * FROM ' . t('albums') . ' WHERE uid = ? AND user_id = ?');
    $st->execute([$albumUid, $u['id']]);
    if ($a = $st->fetch()) album_add($a, [$n]);
}

/**
 * An album as a ZIP (lib/zipstream.php): its photos and videos as they are, in the order they were taken. With
 * ?check=1 only whether it can be made ({files, bytes} or the error), so the app asks before the download starts.
 */
function photo_album_zip(array $a): void
{
    require_once __DIR__ . '/zipstream.php';
    $st = db()->prepare('SELECT n.name, n.size, n.bkey, n.user_id, n.updated_at FROM ' . t('album_items') . ' ai JOIN ' . t('nodes') . ' n ON n.id = ai.node_id LEFT JOIN ' . t('photo_meta') . ' m ON m.node_id = n.id
        WHERE ai.album_id = ? AND n.trashed_at IS NULL AND n.bkey IS NOT NULL AND ' . PHOTO_MEDIA . ' ORDER BY m.taken_at, n.id');
    $st->execute([$a['id']]);
    $entries = array_map(fn($n) => ['name' => $n['name'], 'path' => blob_path((int)$n['user_id'], (string)$n['bkey']), 'size' => (int)$n['size'], 'time' => $n['updated_at']], $st->fetchAll());
    $err = zip_check($entries);
    if (!empty($_GET['check'])) send_json($err ? ['ok' => false, 'error' => $err] : ['ok' => true, 'files' => count($entries), 'bytes' => array_sum(array_column($entries, 'size'))], $err ? 422 : 200);
    if ($err) fail($err, 422);
    zip_send(clean_name($a['name']) . '.zip', $entries);
}

/** The filters of a request (the folder of SavPhotos when the person chose to see only that one). */
function photo_filters(int $uid, array $q): array
{
    $o = ['fav' => !empty($q['fav']), 'video' => !empty($q['video']), 'q' => s($q, 'q', 120), 'cursor' => (string)($q['cursor'] ?? ''), 'before' => (string)($q['before'] ?? ''), 'limit' => (int)($q['limit'] ?? PHOTO_PAGE)];
    if ((photo_prefs($uid)['source'] ?? 'all') === 'folder') $o['folders'] = photo_root_ids($uid);
    return $o;
}

/** Months with photos (the jump to a date) and the totals, with the same filters. */
function photo_months(int $uid, array $o): array
{
    $sql = 'SELECT DATE_FORMAT(m.taken_at, \'%Y-%m\') ym, COUNT(*) c, SUM(n.mime LIKE \'video/%\') v, COALESCE(SUM(n.size),0) b FROM ' . t('photo_meta') . ' m JOIN ' . t('nodes') . ' n ON n.id = m.node_id';
    $args = [];
    if (!empty($o['album'])) {
        $sql .= ' JOIN ' . t('album_items') . ' ai ON ai.node_id = m.node_id AND ai.album_id = ?';
        $args[] = (int)$o['album'];
    }
    $sql .= ' WHERE m.user_id = ? AND n.trashed_at IS NULL AND n.bkey = m.bkey AND ' . PHOTO_MEDIA;
    $args[] = $uid;
    if (!empty($o['fav'])) $sql .= ' AND n.starred = 1';
    if (!empty($o['video'])) $sql .= " AND n.mime LIKE 'video/%'";
    if (($o['q'] ?? '') !== '') {
        $sql .= ' AND n.name LIKE ?';
        $args[] = '%' . addcslashes((string)$o['q'], '%_\\') . '%';
    }
    if (isset($o['folders'])) $sql .= $o['folders'] ? ' AND n.parent_id IN (' . implode(',', array_map('intval', $o['folders'])) . ')' : ' AND 0';
    $st = db()->prepare("$sql GROUP BY ym ORDER BY ym DESC");
    $st->execute($args);
    $months = [];
    $tot = ['count' => 0, 'videos' => 0, 'bytes' => 0];
    foreach ($st->fetchAll() as $r) {
        $months[] = ['ym' => $r['ym'], 'n' => (int)$r['c']];
        $tot['count'] += (int)$r['c'];
        $tot['videos'] += (int)$r['v'];
        $tot['bytes'] += (int)$r['b'];
    }
    return ['months' => $months] + $tot;
}

/** Own photos of a request (ids: uids of files), as rows of the files. */
function photo_nodes(array $u, $ids, int $max = 1000): array
{
    if (!is_array($ids) || !$ids || count($ids) > $max) fail('bad_request', 422);
    $out = [];
    foreach (array_values(array_unique(array_filter($ids, 'is_string'))) as $id) {
        $n = own_node($u, $id, 'file');
        if (!$n['trashed_at'] && preg_match('#^(image/(?!svg)|video/)#', (string)$n['mime'])) $out[] = $n;
    }
    return $out;
}

// ---------------------------------------------------------------- albums

function album_own(array $u, $uid): array
{
    if (!is_string($uid) || !preg_match('/^[A-Za-z0-9]{16}$/', $uid)) fail('not_found', 404);
    $st = db()->prepare('SELECT * FROM ' . t('albums') . ' WHERE uid = ? AND user_id = ?');
    $st->execute([$uid, $u['id']]);
    $a = $st->fetch();
    if (!$a) fail('not_found', 404);
    return $a;
}

function album_name($v): string
{
    $n = trim(preg_replace('/\s+/u', ' ', preg_replace('/[\x00-\x1F\x7F]/u', '', is_string($v) ? $v : '') ?? '') ?? '');
    $n = mb_substr($n, 0, 120);
    if ($n === '') fail('name_required', 422);
    return $n;
}

/**
 * An album for the browser: how many photos, its cover (chosen, or the newest one), the photos of its mosaic (covers:
 * up to 4, the cover first, then the newest ones), the link.
 */
function album_out(array $a): array
{
    $st = db()->prepare('SELECT COUNT(*) c, SUM(n.mime LIKE \'video/%\') v FROM ' . t('album_items') . ' ai JOIN ' . t('nodes') . ' n ON n.id = ai.node_id WHERE ai.album_id = ? AND n.trashed_at IS NULL AND ' . PHOTO_MEDIA);
    $st->execute([$a['id']]);
    $c = $st->fetch();
    $st = db()->prepare('SELECT n.id, n.uid, n.bkey FROM ' . t('album_items') . ' ai JOIN ' . t('nodes') . ' n ON n.id = ai.node_id LEFT JOIN ' . t('photo_meta') . ' m ON m.node_id = n.id
        WHERE ai.album_id = ? AND n.trashed_at IS NULL AND ' . PHOTO_MEDIA . ' ORDER BY n.id = ? DESC, m.taken_at DESC, n.id DESC LIMIT 4');
    $st->execute([$a['id'], (int)($a['cover_id'] ?? 0)]);
    $covers = array_map(fn($r) => ['id' => $r['uid'], 'v' => substr((string)$r['bkey'], 0, 8)], $st->fetchAll());
    $cover = $covers[0] ?? null;
    return ['id' => $a['uid'], 'name' => $a['name'], 'count' => (int)$c['c'], 'videos' => (int)$c['v'], 'cover' => $cover['id'] ?? null, 'coverV' => $cover['v'] ?? null, 'covers' => $covers,
        'shared' => $a['share_token'] !== null, 'token' => $a['share_token'], 'created' => iso($a['created_at']), 'updated' => iso($a['updated_at'])];
}

function album_add(array $a, array $nodes): int
{
    $n = 0;
    $ins = db()->prepare('INSERT IGNORE INTO ' . t('album_items') . ' (album_id, node_id, added_at) VALUES (?,?,?)');
    foreach ($nodes as $x) {
        $ins->execute([$a['id'], $x['id'], now_utc()]);
        $n += $ins->rowCount();
    }
    db()->prepare('UPDATE ' . t('albums') . ' SET updated_at = ? WHERE id = ?')->execute([now_utc(), $a['id']]);
    return $n;
}

/** An album shared with a link, while its owner can still use SavDrive and SavPhotos. */
function album_public(string $tok): ?array
{
    if (!preg_match('/^[a-f0-9]{32}$/', $tok)) return null;
    $st = db()->prepare('SELECT a.*, u.name owner_name, u.email, u.email_verified_at, u.activated, u.status FROM ' . t('albums') . ' a JOIN ' . t('users') . ' u ON u.id = a.user_id WHERE a.share_token = ?');
    $st->execute([$tok]);
    $a = $st->fetch();
    if (!$a || $a['status'] !== 'active' || !is_activated($a)) return null;
    if (!photo_allowed(['id' => $a['user_id'], 'email' => $a['email'], 'email_verified_at' => $a['email_verified_at']])) return null;
    return $a;
}

/** A photo of an album shared with a link (the file, not in the trash). */
function album_public_node(array $a, $uid): ?array
{
    $n = is_string($uid) ? node_by_uid($uid) : null;
    if (!$n || $n['trashed_at'] || (int)$n['user_id'] !== (int)$a['user_id']) return null;
    $st = db()->prepare('SELECT 1 FROM ' . t('album_items') . ' WHERE album_id = ? AND node_id = ?');
    $st->execute([$a['id'], $n['id']]);
    return $st->fetchColumn() ? $n : null;
}

// ---------------------------------------------------------------- the panel of the admins

/** The accounts of SavDrive with what SavPhotos knows of them. */
function photo_accounts(string $q = ''): array
{
    $like = '%' . addcslashes($q, '%_\\') . '%';
    $st = db()->prepare('SELECT u.*, p.enabled p_enabled, p.seen_at p_seen,
        (SELECT COUNT(*) FROM ' . t('nodes') . " n WHERE n.user_id = u.id AND n.kind = 'file' AND n.trashed_at IS NULL AND " . PHOTO_MEDIA . ') photos,
        (SELECT COALESCE(SUM(n.size),0) FROM ' . t('nodes') . " n WHERE n.user_id = u.id AND n.kind = 'file' AND n.trashed_at IS NULL AND " . PHOTO_MEDIA . ') bytes,
        (SELECT COUNT(*) FROM ' . t('albums') . ' a WHERE a.user_id = u.id) albums
        FROM ' . t('users') . ' u LEFT JOIN ' . t('photo_users') . ' p ON p.user_id = u.id WHERE (u.name LIKE ? OR u.email LIKE ?) ORDER BY u.id DESC LIMIT 500');
    $st->execute([$like, $like]);
    $def = photos_default();
    return array_map(function ($x) use ($def) {
        $own = $x['p_enabled'] === null ? null : (bool)(int)$x['p_enabled'];
        return ['id' => (int)$x['id'], 'name' => $x['name'], 'email' => $x['email'], 'verified' => !empty($x['email_verified_at']), 'driveOn' => is_activated($x) && $x['status'] === 'active',
            'master' => is_master($x), 'own' => $own, 'on' => is_master($x) || ($own ?? $def), 'photos' => (int)$x['photos'], 'bytes' => (int)$x['bytes'], 'albums' => (int)$x['albums'],
            'seen' => iso($x['p_seen']), 'created' => iso($x['created_at'])];
    }, $st->fetchAll());
}

const PHOTO_MAIL = [
    'en' => ['subject' => 'SavPhotos is ready for you', 'title' => 'SavPhotos is on for your account', 'button' => 'Open SavPhotos',
        'body' => 'An administrator has turned on SavPhotos for you: the photos and videos of your SavDrive, day by day, with albums and the backup of your phone. It uses your SavDrive account and space.'],
    'it' => ['subject' => 'SavPhotos è pronto per te', 'title' => 'SavPhotos è attivo per il tuo account', 'button' => 'Apri SavPhotos',
        'body' => 'Un amministratore ha attivato SavPhotos per te: le foto e i video del tuo SavDrive, giorno per giorno, con gli album e il backup del telefono. Usa il tuo account e il tuo spazio di SavDrive.'],
];

// ---------------------------------------------------------------- the routes: api/?r=photos.*

/**
 * Photos:   photos.me, photos.prefs, photos.scan, photos.list, photos.summary, photos.item, photos.upload (a photo, its data
 *           and its small picture in one request), photos.thumbs (many small pictures in one answer), photos.thumb (GET: the small
 *           picture), photos.thumbset (POST: the small picture made by the browser, as the body), photos.check (which of
 *           these are already there), photos.dest (the folder an upload goes into), photos.added (after an upload),
 *           photos.export
 * Albums:   photos.albums, photos.album.create, .rename, .delete, .add, .remove, .cover, .share, .zip (the album as a ZIP)
 * Links:    photos.pub.album, photos.pub.zip, photos.pub.thumbs, photos.pub.thumb, photos.pub.file (anyone with the link of an album)
 * Admins:   photos.admin.overview, photos.admin.users, photos.admin.set, photos.admin.settings
 * Stars, trash, downloads, details and uploads are the ones of SavDrive (node.star, node.trash, file.get, node.info, upload.*).
 */
function photos_route(string $r): void
{
    photos_schema();
    switch ($r) {

        // ============================================================ the account

        case 'photos.me':
            // Whether this account can use SavPhotos, and its settings. The last visit is kept for the admins.
            only('GET');
            $u = require_user();
            $ok = photo_allowed($u);
            if ($ok) db()->prepare('INSERT INTO ' . t('photo_users') . ' (user_id, seen_at) VALUES (?,?) ON DUPLICATE KEY UPDATE seen_at = VALUES(seen_at)')->execute([$u['id'], now_utc()]);
            $root = $ok ? photo_folder((int)$u['id'], null, PHOTO_ROOT, false) : null;
            send_json(['ok' => true, 'allowed' => $ok, 'master' => is_master($u), 'prefs' => (object)photo_prefs((int)$u['id']), 'folder' => $root ? $root['uid'] : null, 'oneShot' => photo_one_shot()]);

        case 'photos.prefs':
            // {prefs}: the settings of SavPhotos (where the photos come from, the size of the grid, the theme)
            $u = photos_writer();
            $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
            if (strlen($p) > 2000) fail('bad_request', 413);
            db()->prepare('INSERT INTO ' . t('photo_users') . ' (user_id, prefs) VALUES (?,?) ON DUPLICATE KEY UPDATE prefs = VALUES(prefs)')->execute([$u['id'], $p]);
            send_json(['ok' => true]);

        case 'photos.export':
            // What SavPhotos keeps about this account: settings, albums, what it read from each photo (the files are in SavDrive)
            $u = photos_reader();
            $st = db()->prepare('SELECT n.name, m.taken_at, m.taken_src, m.width, m.height, m.duration, m.lat, m.lon, m.camera FROM ' . t('photo_meta') . ' m JOIN ' . t('nodes') . ' n ON n.id = m.node_id WHERE m.user_id = ? ORDER BY m.taken_at');
            $st->execute([$u['id']]);
            $photos = $st->fetchAll();
            $st = db()->prepare('SELECT * FROM ' . t('albums') . ' WHERE user_id = ? ORDER BY id');
            $st->execute([$u['id']]);
            $albums = [];
            foreach ($st->fetchAll() as $a) {
                $s2 = db()->prepare('SELECT n.name FROM ' . t('album_items') . ' ai JOIN ' . t('nodes') . ' n ON n.id = ai.node_id WHERE ai.album_id = ? ORDER BY ai.added_at');
                $s2->execute([$a['id']]);
                $albums[] = ['name' => $a['name'], 'created' => iso($a['created_at']), 'shared' => $a['share_token'] !== null, 'items' => $s2->fetchAll(PDO::FETCH_COLUMN)];
            }
            header('Content-Disposition: attachment; filename="savphotos-data.json"');
            send_json(['app' => 'SavPhotos', 'exported' => gmdate('c'), 'settings' => (object)photo_prefs((int)$u['id']), 'albums' => $albums, 'photos' => $photos]);

        // ============================================================ photos

        case 'photos.scan':
            // Reads the photos never read (a little at a time): {left}
            $u = photos_writer();
            send_json(['ok' => true, 'left' => photos_scan((int)$u['id'], 3.0)]);

        case 'photos.list':
            // ?cursor= | ?before=YYYY-MM · ?fav=1 · ?video=1 · ?q= (in the name) · ?album=<id> · ?limit=. The first page also reads a few photos
            // never read, and says how many are left (the app reads them with photos.scan, then asks again)
            $u = photos_reader();
            $o = photo_filters((int)$u['id'], $_GET);
            if (!empty($_GET['album'])) {
                $a = album_own($u, (string)$_GET['album']);
                $o['album'] = (int)$a['id'];
                unset($o['folders']);
            }
            $left = $o['cursor'] === '' ? photos_scan((int)$u['id'], 1.5) : 0;
            send_json(['ok' => true, 'left' => $left] + photo_page((int)$u['id'], $o));

        case 'photos.summary':
            // The months with photos (to jump to a date) and the totals, with the filters of photos.list
            $u = photos_reader();
            $o = photo_filters((int)$u['id'], $_GET);
            if (!empty($_GET['album'])) {
                $o['album'] = (int)album_own($u, (string)$_GET['album'])['id'];
                unset($o['folders']);
            }
            send_json(['ok' => true] + photo_months((int)$u['id'], $o));

        case 'photos.item':
            // ?id=: what SavPhotos knows of a photo: the albums it is in, where it is in SavDrive
            $u = photos_reader();
            $n = own_node($u, (string)($_GET['id'] ?? ''), 'file');
            $st = db()->prepare('SELECT * FROM ' . t('photo_meta') . ' WHERE node_id = ?');
            $st->execute([$n['id']]);
            $m = $st->fetch() ?: [];
            $st = db()->prepare('SELECT a.uid id, a.name FROM ' . t('album_items') . ' ai JOIN ' . t('albums') . ' a ON a.id = ai.album_id WHERE ai.node_id = ? ORDER BY a.name');
            $st->execute([$n['id']]);
            $path = array_map(fn($p) => ['id' => $p['uid'], 'name' => $p['name']], array_slice(node_path($n), 0, -1));
            send_json(['ok' => true, 'item' => [
                'id' => $n['uid'], 'name' => $n['name'], 'mime' => $n['mime'], 'size' => (int)$n['size'], 'star' => (bool)$n['starred'], 'trashed' => (bool)$n['trashed_at'],
                'created' => iso($n['created_at']), 'updated' => iso($n['updated_at']), 'taken' => $m['taken_at'] ?? null, 'takenFrom' => $m['taken_src'] ?? null,
                'w' => isset($m['width']) ? (int)$m['width'] : null, 'h' => isset($m['height']) ? (int)$m['height'] : null, 'd' => isset($m['duration']) ? (int)$m['duration'] : null,
                'lat' => isset($m['lat']) ? (float)$m['lat'] : null, 'lon' => isset($m['lon']) ? (float)$m['lon'] : null, 'camera' => $m['camera'] ?? null,
                'albums' => $st->fetchAll(), 'path' => $path, 'folder' => $n['parent_id'] === null ? null : end($path)['id'] ?? null]]);

        case 'photos.thumb':
            // ?id=&v=: the small picture of a photo of this account (v changes with the content: it can be kept long)
            $u = current_user();
            if (!$u || $u['status'] !== 'active' || !is_activated($u) || !photo_allowed($u)) {
                http_response_code(404);
                exit;
            }
            $n = node_by_uid((string)($_GET['id'] ?? ''));
            if (!$n || $n['kind'] !== 'file' || (int)$n['user_id'] !== (int)$u['id']) {
                http_response_code(404);
                exit;
            }
            photo_send_thumb($n);

        case 'photos.thumbs':
            // ?ids=a,b,c (at most 40): the small pictures of these photos of the account, in one answer
            $u = photos_reader();
            $nodes = [];
            foreach (photo_ids() as $id) { $n = node_by_uid($id); $nodes[$id] = $n && $n['kind'] === 'file' && (int)$n['user_id'] === (int)$u['id'] ? $n : null; }
            header('Cache-Control: private, no-store');
            send_json(['ok' => true] + photo_thumbs($nodes));

        case 'photos.thumbset':
            // ?id=: the body is a small JPEG made by the browser (a video opened in the viewer without one)
            $u = photos_writer();
            $n = own_node($u, (string)($_GET['id'] ?? ''), 'file');
            if (!preg_match('#^(image/|video/)#', (string)$n['mime'])) fail('bad_request', 422);
            if (!photo_save_thumb($n, (string)file_get_contents('php://input', false, null, 0, PHOTO_THUMB_MAX + 1))) fail('bad_thumb', 422);
            send_json(['ok' => true]);

        case 'photos.check':
            // {items: [{h: SHA-256, n: name, s: size}]}: the positions of those already in the drive (the same content, or
            // a photo or video with the same name and size), with the id of the file that is there (ids: position -> id):
            // a backup sent again sends only what is new, and a folder uploaded again still fills its album
            $u = photos_writer();
            $items = body()['items'] ?? null;
            if (!is_array($items) || count($items) > 1000) fail('bad_request', 422);
            $hashes = array_values(array_unique(array_filter(array_map(fn($x) => is_array($x) ? strtolower((string)($x['h'] ?? '')) : '', $items), fn($h) => preg_match('/^[a-f0-9]{64}$/', $h))));
            $known = [];
            if ($hashes) {
                $st = db()->prepare('SELECT m.hash, n.uid FROM ' . t('photo_meta') . ' m JOIN ' . t('nodes') . ' n ON n.id = m.node_id WHERE m.user_id = ? AND n.trashed_at IS NULL AND m.bkey = n.bkey AND m.hash IN (' . implode(',', array_fill(0, count($hashes), '?')) . ')');
                $st->execute(array_merge([$u['id']], $hashes));
                foreach ($st->fetchAll() as $r) $known[$r['hash']] ??= $r['uid'];
            }
            $sizes = array_values(array_unique(array_filter(array_map(fn($x) => is_array($x) ? (int)($x['s'] ?? 0) : 0, $items))));
            $named = [];
            foreach (array_chunk($sizes, 500) as $part) {
                $st = db()->prepare('SELECT LOWER(n.name) nm, n.size, n.uid FROM ' . t('nodes') . " n WHERE n.user_id = ? AND n.kind = 'file' AND n.trashed_at IS NULL AND " . PHOTO_MEDIA . ' AND n.size IN (' . implode(',', array_map('intval', $part)) . ') ORDER BY n.id');
                $st->execute([$u['id']]);
                foreach ($st->fetchAll() as $r) $named[$r['nm'] . '|' . $r['size']] ??= $r['uid'];
            }
            $have = [];
            $ids = [];
            foreach ($items as $i => $x) {
                if (!is_array($x)) continue;
                $h = strtolower((string)($x['h'] ?? ''));
                $id = ($h !== '' ? ($known[$h] ?? null) : null) ?? ($named[mb_strtolower(clean_name($x['n'] ?? '')) . '|' . (int)($x['s'] ?? 0)] ?? null);
                if ($id !== null) { $have[] = $i; $ids[$i] = $id; }
            }
            send_json(['ok' => true, 'have' => $have, 'ids' => (object)$ids]);

        case 'photos.dest':
            // {year}: the folder of My drive an upload goes into: SavPhotos/<year> (made when missing)
            $u = photos_writer();
            $root = photo_folder((int)$u['id'], null, PHOTO_ROOT, true);
            $y = (int)(body()['year'] ?? 0);
            $f = $y >= 1900 && $y <= 2100 ? photo_folder((int)$u['id'], (int)$root['id'], (string)$y, true) : $root;
            send_json(['ok' => true, 'folder' => $f['uid'], 'root' => $root['uid']]);

        case 'photos.upload':
            // A whole photo in one request (multipart): file, folder (a folder of SavPhotos of this account), name, mime,
            // and what photos.added takes (hash, taken, src, w, h, d) with the small picture (thumb, a JPEG). For files that
            // fit in a request (oneShot of photos.me): a backup asks the hosting once per photo instead of 3 or 4 times.
            // Bigger files travel in pieces (upload.start / upload.chunk of SavDrive).
            $u = photos_writer();
            $f = $_FILES['file'] ?? null;
            // a body bigger than what PHP takes arrives empty: the app sends that file in pieces instead
            if (!$f && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) fail('too_big', 413);
            if (!$f || !is_array($f) || ($f['error'] ?? 1) !== UPLOAD_ERR_OK || !is_uploaded_file((string)$f['tmp_name'])) fail(in_array($f['error'] ?? 0, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'too_big' : 'bad_request', 422);
            $size = (int)$f['size'];
            $parent = target_folder($u, (string)($_POST['folder'] ?? ''));
            $pid = $parent ? (int)$parent['id'] : null;
            $name = clean_name($_POST['name'] ?? ($f['name'] ?? ''));
            if ($name === '') fail('name_required', 422);
            $uid = (int)$u['id'];
            if (user_used($uid, true) + $size > user_quota(user_row($uid))) send_json(['ok' => false, 'error' => 'quota', 'used' => user_used($uid), 'quota' => user_quota(user_row($uid))], 413);
            if (count_nodes($uid) >= MAX_NODES) fail('too_many', 422);
            $key = new_key();
            if (!@move_uploaded_file((string)$f['tmp_name'], blob_path($uid, $key))) throw new RuntimeException('cannot store the file');
            $node = new_uid();
            db()->prepare('INSERT INTO ' . t('nodes') . " (uid, user_id, parent_id, kind, name, mime, size, bkey, created_by, created_at, updated_at) VALUES (?,?,?,'file',?,?,?,?,?,?,?)")
                ->execute([$node, $uid, $pid, free_name($uid, $pid, $name), guess_mime($name, (string)($_POST['mime'] ?? ($f['type'] ?? ''))), $size, $key, $uid, now_utc(), now_utc()]);
            $n = node_by_uid($node);
            // what the browser knows of it, as photos.added
            $p = $_POST;
            $c = [];
            if (preg_match('/^[a-f0-9]{64}$/', strtolower((string)($p['hash'] ?? '')))) $c['hash'] = strtolower((string)$p['hash']);
            if (preg_match('/^(\d{4})-\d\d-\d\d \d\d:\d\d:\d\d$/', (string)($p['taken'] ?? ''), $m) && (int)$m[1] >= 1900 && (int)$m[1] <= 2100) {
                $c['taken'] = (string)$p['taken'];
                $c['src'] = ($p['src'] ?? '') === 'meta' ? 'meta' : 'modified';
            }
            foreach (['w', 'h', 'd'] as $k) if (isset($p[$k]) && is_numeric($p[$k]) && $p[$k] >= 0 && $p[$k] < 100000) $c[$k] = (int)$p[$k];
            if (preg_match('#^(image/|video/)#', (string)$n['mime'])) photo_store($n, photo_read($n), $c);
            $th = $_FILES['thumb'] ?? null;
            if ($th && ($th['error'] ?? 1) === UPLOAD_ERR_OK && is_uploaded_file((string)$th['tmp_name']) && (int)$th['size'] <= PHOTO_THUMB_MAX) photo_save_thumb($n, (string)file_get_contents((string)$th['tmp_name']));
            photo_into_album($u, $n, $_POST['album'] ?? null);
            // photo: as in photos.list, so the page shows it at once, while the rest is still travelling
            send_json(['ok' => true, 'done' => true, 'item' => out_node($n), 'photo' => photo_one((int)$n['id'])] + drive_space($u));

        case 'photos.added':
            // {id, hash, taken, src: meta | modified, w, h, d, thumb}: a photo just uploaded, with what the browser knows of it
            // and the small picture it made (base64 of a JPEG: in the same request, so a backup asks the hosting less)
            $u = photos_writer();
            $b = body();
            $n = own_node($u, (string)($b['id'] ?? ''), 'file');
            $c = [];
            if (preg_match('/^[a-f0-9]{64}$/', strtolower((string)($b['hash'] ?? '')))) $c['hash'] = strtolower((string)$b['hash']);
            if (preg_match('/^(\d{4})-\d\d-\d\d \d\d:\d\d:\d\d$/', (string)($b['taken'] ?? ''), $m) && (int)$m[1] >= 1900 && (int)$m[1] <= 2100) {
                $c['taken'] = (string)$b['taken'];
                $c['src'] = ($b['src'] ?? '') === 'meta' ? 'meta' : 'modified';
            }
            foreach (['w', 'h', 'd'] as $k) if (isset($b[$k]) && is_numeric($b[$k]) && $b[$k] >= 0 && $b[$k] < 100000) $c[$k] = (int)$b[$k];
            if ($n['bkey'] && preg_match('#^(image/|video/)#', (string)$n['mime'])) {
                photo_store($n, photo_read($n), $c);
                $th = is_string($b['thumb'] ?? null) && strlen($b['thumb']) <= PHOTO_THUMB_MAX * 1.4 ? base64_decode($b['thumb'], true) : false;
                if ($th !== false && $th !== '') photo_save_thumb($n, $th);
                photo_into_album($u, $n, $b['album'] ?? null);
            }
            send_json(['ok' => true, 'photo' => photo_one((int)$n['id'])]);

        // ============================================================ albums

        case 'photos.albums':
            $u = photos_reader();
            $st = db()->prepare('SELECT * FROM ' . t('albums') . ' WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1000');
            $st->execute([$u['id']]);
            send_json(['ok' => true, 'albums' => array_map('album_out', $st->fetchAll())]);

        case 'photos.album.create':
            // {name, ids, reuse}: a new album, with these photos already in it. reuse: an album of this account with the
            // same name gets them instead (a folder uploaded again fills the album it made the first time)
            $u = photos_writer();
            $name = album_name(body()['name'] ?? '');
            $nodes = isset(body()['ids']) ? photo_nodes($u, body()['ids']) : [];
            if (!empty(body()['reuse'])) {
                $st = db()->prepare('SELECT * FROM ' . t('albums') . ' WHERE user_id = ? AND LOWER(name) = LOWER(?) ORDER BY id LIMIT 1');
                $st->execute([$u['id'], $name]);
                if ($same = $st->fetch()) {
                    $added = $nodes ? album_add($same, $nodes) : 0;
                    send_json(['ok' => true, 'reused' => true, 'added' => $added, 'album' => album_out(album_own($u, $same['uid']))]);
                }
            }
            $st = db()->prepare('SELECT COUNT(*) FROM ' . t('albums') . ' WHERE user_id = ?');
            $st->execute([$u['id']]);
            if ((int)$st->fetchColumn() >= 1000) fail('too_many', 422);
            $uid = new_uid();
            db()->prepare('INSERT INTO ' . t('albums') . ' (uid, user_id, name, created_at, updated_at) VALUES (?,?,?,?,?)')->execute([$uid, $u['id'], $name, now_utc(), now_utc()]);
            $a = album_own($u, $uid);
            $added = $nodes ? album_add($a, $nodes) : 0;
            send_json(['ok' => true, 'added' => $added, 'album' => album_out(album_own($u, $uid))]);

        case 'photos.album.rename':
            $u = photos_writer();
            $a = album_own($u, body()['id'] ?? '');
            db()->prepare('UPDATE ' . t('albums') . ' SET name = ?, updated_at = ? WHERE id = ?')->execute([album_name(body()['name'] ?? ''), now_utc(), $a['id']]);
            send_json(['ok' => true, 'album' => album_out(album_own($u, $a['uid']))]);

        case 'photos.album.delete':
            // {id, photos}: the album; with photos, also its photos go to the trash of SavDrive (30 days, they can be put
            // back from there; they leave the other albums too). Without, they stay in SavPhotos and SavDrive.
            $u = photos_writer();
            $a = album_own($u, body()['id'] ?? '');
            $trashed = 0;
            if (!empty(body()['photos'])) {
                $st = db()->prepare('SELECT ai.node_id FROM ' . t('album_items') . ' ai JOIN ' . t('nodes') . " n ON n.id = ai.node_id WHERE ai.album_id = ? AND n.user_id = ? AND n.kind = 'file' AND n.trashed_at IS NULL");
                $st->execute([$a['id'], $u['id']]);
                $ids = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
                foreach (array_chunk($ids, 500) as $part) {
                    // as node.trash of SavDrive: each file is the root of what it takes to the trash, its link stops working
                    $q = db()->prepare('UPDATE ' . t('nodes') . ' SET trashed_at = ?, trash_root = 1, share_token = NULL WHERE user_id = ? AND trashed_at IS NULL AND id IN (' . implode(',', $part) . ')');
                    $q->execute([now_utc(), $u['id']]);
                    $trashed += $q->rowCount();
                }
            }
            db()->prepare('DELETE FROM ' . t('albums') . ' WHERE id = ?')->execute([$a['id']]);
            send_json(['ok' => true, 'trashed' => $trashed] + ($trashed ? drive_space($u) : []));

        case 'photos.album.add':
            // {id, ids}
            $u = photos_writer();
            $a = album_own($u, body()['id'] ?? '');
            $added = album_add($a, photo_nodes($u, body()['ids'] ?? null));
            send_json(['ok' => true, 'added' => $added, 'album' => album_out(album_own($u, $a['uid']))]);

        case 'photos.album.remove':
            // {id, ids}: out of the album (they stay in SavDrive)
            $u = photos_writer();
            $a = album_own($u, body()['id'] ?? '');
            $ids = body()['ids'] ?? null;
            if (!is_array($ids) || !$ids || count($ids) > 1000) fail('bad_request', 422);
            $del = db()->prepare('DELETE ai FROM ' . t('album_items') . ' ai JOIN ' . t('nodes') . ' n ON n.id = ai.node_id WHERE ai.album_id = ? AND n.uid = ?');
            foreach (array_filter($ids, 'is_string') as $id) $del->execute([$a['id'], $id]);
            db()->prepare('UPDATE ' . t('albums') . ' SET updated_at = ?, cover_id = IF(cover_id IN (SELECT node_id FROM ' . t('album_items') . ' WHERE album_id = ?), cover_id, NULL) WHERE id = ?')->execute([now_utc(), $a['id'], $a['id']]);
            send_json(['ok' => true, 'album' => album_out(album_own($u, $a['uid']))]);

        case 'photos.album.cover':
            // {id, item}: the photo on the cover (one of the album)
            $u = photos_writer();
            $a = album_own($u, body()['id'] ?? '');
            $n = own_node($u, (string)(body()['item'] ?? ''), 'file');
            $st = db()->prepare('SELECT 1 FROM ' . t('album_items') . ' WHERE album_id = ? AND node_id = ?');
            $st->execute([$a['id'], $n['id']]);
            if (!$st->fetchColumn()) fail('not_found', 404);
            db()->prepare('UPDATE ' . t('albums') . ' SET cover_id = ? WHERE id = ?')->execute([$n['id'], $a['id']]);
            send_json(['ok' => true, 'album' => album_out(album_own($u, $a['uid']))]);

        case 'photos.album.zip':
            // ?id=(&check=1): the album as a ZIP
            $u = photos_reader();
            photo_album_zip(album_own($u, (string)($_GET['id'] ?? '')));

        case 'photos.pub.zip':
            // ?t=(&check=1): an album shared with a link, as a ZIP
            only('GET');
            $a = album_public((string)($_GET['t'] ?? ''));
            if (!$a) fail('not_found', 404);
            photo_album_zip($a);

        case 'photos.album.share':
            // {id, on}: a link anyone can open to see the album and download its photos; off = the link stops working
            $u = photos_writer();
            $a = album_own($u, body()['id'] ?? '');
            $tok = !empty(body()['on']) ? ($a['share_token'] ?: bin2hex(random_bytes(16))) : null;
            db()->prepare('UPDATE ' . t('albums') . ' SET share_token = ? WHERE id = ?')->execute([$tok, $a['id']]);
            send_json(['ok' => true, 'token' => $tok, 'album' => album_out(album_own($u, $a['uid']))]);

        // ============================================================ albums shared with a link

        case 'photos.pub.album':
            // ?t=&cursor=: the album and one page of its photos
            only('GET');
            $a = album_public((string)($_GET['t'] ?? ''));
            if (!$a) fail('not_found', 404);
            $page = photo_page((int)$a['user_id'], ['album' => (int)$a['id'], 'cursor' => (string)($_GET['cursor'] ?? ''), 'limit' => PHOTO_PAGE]);
            // what people see: no stars of the owner
            $page['items'] = array_map(function ($x) { unset($x['star']); return $x; }, $page['items']);
            send_json(['ok' => true, 'album' => ['name' => $a['name'], 'owner' => $a['owner_name'], 'count' => album_out($a)['count'], 'updated' => iso($a['updated_at'])]] + $page);

        case 'photos.pub.thumbs':
            // ?t=&ids=: the small pictures of photos of an album shared with a link, in one answer
            only('GET');
            $a = album_public((string)($_GET['t'] ?? ''));
            if (!$a) fail('not_found', 404);
            $nodes = [];
            foreach (photo_ids() as $id) $nodes[$id] = album_public_node($a, $id);
            send_json(['ok' => true] + photo_thumbs($nodes));

        case 'photos.pub.thumb':
        case 'photos.pub.file':
            // ?t=&id=(&inline=1): a photo of an album shared with a link
            $a = album_public((string)($_GET['t'] ?? ''));
            $n = $a ? album_public_node($a, $_GET['id'] ?? null) : null;
            if (!$n) {
                http_response_code(404);
                exit;
            }
            if ($r === 'photos.pub.thumb') photo_send_thumb($n);
            stream_file(blob_path((int)$n['user_id'], (string)$n['bkey']), (string)$n['name'], (string)$n['mime'], !empty($_GET['inline']));

        // ============================================================ the panel of the master admins

        case 'photos.admin.overview':
            only('GET');
            require_master();
            $n = fn(string $sql) => (int)db()->query($sql)->fetchColumn();
            $acc = photo_accounts();
            $media = "kind = 'file' AND trashed_at IS NULL AND ((mime LIKE 'image/%' AND mime <> 'image/svg+xml') OR mime LIKE 'video/%')";
            send_json(['ok' => true, 'accounts' => count($acc), 'on' => count(array_filter($acc, fn($x) => $x['on'])), 'used' => count(array_filter($acc, fn($x) => $x['on'] && $x['seen'])),
                'photos' => $n('SELECT COUNT(*) FROM ' . t('nodes') . " WHERE $media AND mime LIKE 'image/%'"), 'videos' => $n('SELECT COUNT(*) FROM ' . t('nodes') . " WHERE $media AND mime LIKE 'video/%'"),
                'bytes' => $n('SELECT COALESCE(SUM(size),0) FROM ' . t('nodes') . " WHERE $media"), 'albums' => $n('SELECT COUNT(*) FROM ' . t('albums')),
                'sharedAlbums' => $n('SELECT COUNT(*) FROM ' . t('albums') . ' WHERE share_token IS NOT NULL'), 'defaultOn' => photos_default()]);

        case 'photos.admin.users':
            // ?q= name or email · ?show=all|on|off
            only('GET');
            require_master();
            $show = (string)($_GET['show'] ?? 'all');
            $list = photo_accounts(s($_GET, 'q', 80));
            if ($show === 'on' || $show === 'off') $list = array_values(array_filter($list, fn($x) => $x['on'] === ($show === 'on')));
            send_json(['ok' => true, 'defaultOn' => photos_default(), 'users' => $list]);

        case 'photos.admin.set':
            // {ids, on: true | false | null}: SavPhotos on or off for these accounts, or back to the default (null). An
            // account that gets it is told by email.
            $u = require_master();
            only('POST');
            require_csrf($u);
            $b = body();
            $on = array_key_exists('on', $b) && $b['on'] !== null ? (bool)$b['on'] : null;
            $ids = $b['ids'] ?? (isset($b['id']) ? [$b['id']] : []);
            if (!is_array($ids) || !$ids || count($ids) > 500) fail('bad_request', 422);
            $done = 0;
            foreach (array_unique(array_map('intval', $ids)) as $id) {
                $x = user_row($id);
                if (!$x) continue;
                $before = photo_allowed($x);
                db()->prepare('INSERT INTO ' . t('photo_users') . ' (user_id, enabled, changed_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), changed_at = VALUES(changed_at)')
                    ->execute([$id, $on === null ? null : ($on ? 1 : 0), now_utc()]);
                $after = photo_allowed($x);
                if ($after && !$before && !empty($x['email_verified_at']) && is_activated($x) && mail_settings()) {
                    $L = in_array($x['ui_lang'], LANGS, true) ? $x['ui_lang'] : 'en';
                    $T = PHOTO_MAIL[$L];
                    send_notice((string)$x['email'], (string)$x['name'], $L, $T['subject'], $T['title'], [fill(mail_t($L)['hello'], ['name' => $x['name']]), $T['body']], photos_url(), $T['button']);
                }
                if ($after !== $before || $on === null) $done++;
            }
            send_json(['ok' => true, 'changed' => $done]);

        case 'photos.admin.settings':
            // {defaultOn}: whether the accounts without a choice of their own can use SavPhotos
            $u = require_master();
            only('POST');
            require_csrf($u);
            if (array_key_exists('defaultOn', body())) set_setting('photos_default', !empty(body()['defaultOn']) ? '1' : '0');
            send_json(['ok' => true, 'defaultOn' => photos_default()]);

        default:
            fail('not_found', 404);
    }
}

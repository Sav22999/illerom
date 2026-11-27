<?php
/**
 * SavDrive — files and folders: where they are kept on disk, who can reach them, names, moving, the trash.
 *
 * A file is stored as <storage>/<user id>/<bkey> (32 random hex digits, no extension: nothing on disk can be run or
 * guessed). The folder should be outside the web root; inside it, storage/.htaccess refuses every request anyway.
 */

declare(strict_types=1);

// The files of the apps of SavOffice: extension => [app folder, mime]. SavDrive can make an empty one of each and open
// it in its app (the app reads it from ../savdrive/api/?r=file.get, see assets/savoffice/savoffice.js).
const SAVOFFICE = [
    'savdoc' => ['savdocuments', 'application/vnd.savdocuments.document+zip'],
    'savspr' => ['savspreadsheets', 'application/vnd.savspreadsheets.workbook+zip'],
    'savpre' => ['savpresentations', 'application/vnd.savpresentations'],
    'savboo' => ['savbooks', 'application/vnd.savbooks.book+zip'],
    'savwhi' => ['savwhiteboard', 'application/vnd.savwhiteboard.board+zip'],
    'savnot' => ['savnotes', 'application/vnd.savnotes.notebook+zip'],
    'savfor' => ['savforms', 'application/vnd.savforms.form+json'],
    'savtas' => ['savtasks', 'application/vnd.savtasks.list+json'],
    'savcal' => ['savcalendar', 'application/vnd.savcalendar.calendar+json'],
    'savsch' => ['savschedules', 'application/vnd.savschedules.schedule+json'],
    'savnew' => ['savnewsletters', 'application/vnd.savnewsletters.newsletter+json'],
    'savspl' => ['savsplits', 'application/vnd.savsplits.group+json'],
];

/** Types a browser may show inside the page (everything else is always downloaded). */
const INLINE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'application/pdf', 'video/mp4', 'video/webm', 'video/ogg', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac', 'audio/aac', 'text/plain'];

function storage_dir(int $uid = 0): string
{
    $base = (string)config_value('storage');
    if (!is_dir($base)) {
        if (!@mkdir($base, 0750, true) && !is_dir($base)) throw new RuntimeException('storage folder cannot be created');
        @file_put_contents($base . '/.htaccess', "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    if (!$uid) return $base;
    $d = $base . '/' . $uid;
    if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) throw new RuntimeException('storage folder cannot be created');
    return $d;
}

function blob_path(int $uid, string $bkey): string
{
    if (!preg_match('/^[a-f0-9]{32}$/', $bkey)) throw new RuntimeException('bad blob');
    return storage_dir($uid) . '/' . $bkey;
}

function new_key(): string
{
    return bin2hex(random_bytes(16));
}

function new_uid(): string
{
    return substr(strtr(base64_encode(random_bytes(12)), '+/', 'xy'), 0, 16);
}

/** A name a file can have everywhere: no slashes or control characters, not empty, at most 255 characters. */
function clean_name($v): string
{
    $n = is_string($v) ? $v : '';
    $n = preg_replace('/[\x00-\x1F\x7F\/\\\\]+/u', ' ', $n) ?? '';
    $n = trim(preg_replace('/\s+/u', ' ', $n) ?? '');
    $n = trim($n, '.');
    return mb_substr($n, 0, 255);
}

/** The type of a file from its name, when the browser did not give a good one. */
function guess_mime(string $name, string $given): string
{
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (isset(SAVOFFICE[$ext])) return SAVOFFICE[$ext][1];
    $map = ['txt' => 'text/plain', 'md' => 'text/markdown', 'csv' => 'text/csv', 'pdf' => 'application/pdf', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif', 'webp' => 'image/webp', 'avif' => 'image/avif', 'svg' => 'image/svg+xml', 'bmp' => 'image/bmp', 'heic' => 'image/heic', 'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mov' => 'video/quicktime',
        'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', 'ogg' => 'audio/ogg', 'wav' => 'audio/wav', 'flac' => 'audio/flac', 'zip' => 'application/zip', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'odt' => 'application/vnd.oasis.opendocument.text',
        'ods' => 'application/vnd.oasis.opendocument.spreadsheet', 'odp' => 'application/vnd.oasis.opendocument.presentation', 'json' => 'application/json', 'epub' => 'application/epub+zip'];
    if (isset($map[$ext])) return $map[$ext];
    $given = strtolower(trim($given));
    return preg_match('#^[a-z0-9.+-]+/[a-z0-9.+-]+$#', $given) && strlen($given) <= 100 ? $given : 'application/octet-stream';
}

function node_by_uid(string $uid): ?array
{
    if (!preg_match('/^[A-Za-z0-9]{16}$/', $uid)) return null;
    $st = db()->prepare('SELECT * FROM ' . t('nodes') . ' WHERE uid = ?');
    $st->execute([$uid]);
    return $st->fetch() ?: null;
}

/** A file or folder of this account (never one of somebody else). */
function own_node(array $u, $uid, ?string $kind = null): array
{
    $n = is_string($uid) ? node_by_uid($uid) : null;
    if (!$n || (int)$n['user_id'] !== (int)$u['id'] || ($kind && $n['kind'] !== $kind)) fail('not_found', 404);
    return $n;
}

/** The folder a request points to: null = My drive. Never a folder in the trash. */
function target_folder(array $u, $uid): ?array
{
    if ($uid === null || $uid === '' || $uid === 'root') return null;
    $f = own_node($u, $uid, 'folder');
    if ($f['trashed_at']) fail('in_trash', 409);
    return $f;
}

/** The folders from My drive down to this one (included). */
function node_path(array $n): array
{
    $out = [];
    for ($i = 0; $n && $i <= MAX_DEPTH + 1; $i++) {
        array_unshift($out, $n);
        if ($n['parent_id'] === null) break;
        $st = db()->prepare('SELECT * FROM ' . t('nodes') . ' WHERE id = ?');
        $st->execute([$n['parent_id']]);
        $n = $st->fetch() ?: null;
    }
    return $out;
}

/** Ids of a folder and of everything inside it, at any depth. */
function subtree_ids(int $uid, int $id): array
{
    $all = [$id];
    $level = [$id];
    for ($i = 0; $level && $i <= MAX_DEPTH + 1; $i++) {
        $in = implode(',', array_map('intval', $level));
        $st = db()->prepare('SELECT id FROM ' . t('nodes') . " WHERE user_id = ? AND parent_id IN ($in)");
        $st->execute([$uid]);
        $level = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        $all = array_merge($all, $level);
    }
    return $all;
}

/** "Report.pdf" is taken in this folder: "Report (2).pdf", "Report (3).pdf"… */
function free_name(int $uid, ?int $parent, string $name, ?int $except = null): string
{
    $st = db()->prepare('SELECT name FROM ' . t('nodes') . ' WHERE user_id = ? AND parent_id ' . ($parent === null ? 'IS NULL' : '= ' . (int)$parent) . ' AND trashed_at IS NULL' . ($except ? ' AND id <> ' . (int)$except : ''));
    $st->execute([$uid]);
    $taken = array_flip(array_map('mb_strtolower', $st->fetchAll(PDO::FETCH_COLUMN)));
    if (!isset($taken[mb_strtolower($name)])) return $name;
    $dot = mb_strrpos($name, '.');
    [$base, $ext] = $dot > 0 ? [mb_substr($name, 0, $dot), mb_substr($name, $dot)] : [$name, ''];
    for ($i = 2; $i < 10000; $i++) {
        $try = mb_substr($base, 0, 240) . " ($i)" . $ext;
        if (!isset($taken[mb_strtolower($try)])) return $try;
    }
    return $base . ' ' . new_uid() . $ext;
}

function count_nodes(int $uid): int
{
    $st = db()->prepare('SELECT COUNT(*) FROM ' . t('nodes') . ' WHERE user_id = ?');
    $st->execute([$uid]);
    return (int)$st->fetchColumn();
}

/** What the browser knows of a file or folder. */
function out_node(array $n, array $extra = []): array
{
    $ext = strtolower(pathinfo((string)$n['name'], PATHINFO_EXTENSION));
    return $extra + [
        'id' => $n['uid'],
        'kind' => $n['kind'],
        'name' => $n['name'],
        'mime' => $n['mime'],
        'size' => (int)$n['size'],
        'color' => $n['color'],
        'starred' => (bool)$n['starred'],
        'shared' => $n['share_token'] !== null,
        'app' => $n['kind'] === 'file' && isset(SAVOFFICE[$ext]) ? SAVOFFICE[$ext][0] : null,
        'trashed' => iso($n['trashed_at']),
        'created' => iso($n['created_at']),
        'updated' => iso($n['updated_at']),
        'opened' => iso($n['opened_at']),
    ];
}

/** Deletes rows and their files on disk (the rows of what is inside a folder go with it, by the foreign key). */
function delete_nodes_forever(int $uid, array $ids): int
{
    $ids = array_values(array_unique(array_map('intval', $ids)));
    if (!$ids) return 0;
    $all = [];
    foreach ($ids as $id) $all = array_merge($all, subtree_ids($uid, $id));
    $all = array_values(array_unique($all));
    $in = implode(',', $all);
    $st = db()->prepare('SELECT bkey FROM ' . t('nodes') . " WHERE user_id = ? AND id IN ($in) AND bkey IS NOT NULL");
    $st->execute([$uid]);
    $keys = $st->fetchAll(PDO::FETCH_COLUMN);
    db()->prepare('DELETE FROM ' . t('nodes') . " WHERE user_id = ? AND id IN (" . implode(',', $ids) . ')')->execute([$uid]);
    foreach ($keys as $k) { @unlink(blob_path($uid, (string)$k)); @unlink(blob_path($uid, (string)$k) . '.t.jpg'); @unlink(blob_path($uid, (string)$k) . '.a.json'); foreach (glob(blob_path($uid, (string)$k) . '.p*') ?: [] as $x) @unlink($x); }
    return count($all);
}

/** Everything left in the trash for TRASH_DAYS, and uploads abandoned half-way (a few accounts per call). */
function purge_old(int $limit = 20): void
{
    $st = db()->prepare('SELECT id, user_id FROM ' . t('nodes') . ' WHERE trash_root = 1 AND trashed_at < ? LIMIT ' . (int)$limit);
    $st->execute([gmdate('Y-m-d H:i:s', time() - TRASH_DAYS * 86400)]);
    foreach ($st->fetchAll() as $r) delete_nodes_forever((int)$r['user_id'], [(int)$r['id']]);
    $st = db()->prepare('SELECT id, user_id FROM ' . t('uploads') . ' WHERE expires_at < ? LIMIT ' . (int)$limit);
    $st->execute([now_utc()]);
    foreach ($st->fetchAll() as $r) {
        @unlink(storage_dir((int)$r['user_id']) . '/' . $r['id'] . '.part');
        db()->prepare('DELETE FROM ' . t('uploads') . ' WHERE id = ?')->execute([$r['id']]);
    }
}

/** Removes the whole folder of an account on disk (when the account is deleted). */
function delete_user_storage(int $uid): void
{
    $d = storage_dir() . '/' . $uid;
    if (!is_dir($d)) return;
    foreach (scandir($d) ?: [] as $f) if ($f !== '.' && $f !== '..') @unlink("$d/$f");
    @rmdir($d);
}

/**
 * Sends a file to the browser, with ranges (videos can be moved forward) and the right headers. $inline: shown in the
 * page when its type is safe; otherwise (and always for SVG, HTML…) it is downloaded.
 */
function stream_file(string $path, string $name, string $mime, bool $inline): void
{
    if (!is_file($path)) {
        http_response_code(404);
        exit;
    }
    $size = filesize($path);
    $safe = $inline && in_array($mime, INLINE_TYPES, true);
    $ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $name);
    header('Content-Type: ' . ($safe ? $mime : 'application/octet-stream'));
    header('Content-Disposition: ' . ($safe ? 'inline' : 'attachment') . '; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($name));
    header('X-Content-Type-Options: nosniff');
    // nothing a file contains can run; a PDF keeps the viewer of the browser (which a sandbox would block)
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'" . ($safe && $mime === 'application/pdf' ? '' : '; sandbox'));
    header('Cache-Control: private, max-age=0, must-revalidate');
    header('Accept-Ranges: bytes');
    $start = 0;
    $end = $size - 1;
    if (preg_match('/^bytes=(\d*)-(\d*)$/', (string)($_SERVER['HTTP_RANGE'] ?? ''), $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $start = max(0, $size - (int)$m[2]);
        } else {
            $start = (int)$m[1];
            if ($m[2] !== '') $end = min($end, (int)$m[2]);
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header("Content-Range: bytes */$size");
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$size");
    }
    header('Content-Length: ' . ($end - $start + 1));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') exit;
    @set_time_limit(0);
    while (ob_get_level()) ob_end_clean();
    $fh = fopen($path, 'rb');
    fseek($fh, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($fh) && !connection_aborted()) {
        $buf = fread($fh, (int)min(1048576, $left));
        if ($buf === false) break;
        echo $buf;
        flush();
        $left -= strlen($buf);
    }
    fclose($fh);
    exit;
}

/** "2 GB", "1.5 GB", "750 MB" for the emails. */
function human_bytes(int $b): string
{
    if ($b >= GB) return rtrim(rtrim(number_format($b / GB, 1, '.', ''), '0'), '.') . ' GB';
    return max(1, (int)round($b / 1048576)) . ' MB';
}

// ---------- small pictures (the cards of the grid) and the details of a picture

/**
 * The small picture of an image file (480 px at most, JPEG), made the first time with GD and kept next to the file as
 * <bkey>.t.jpg. Null when GD cannot read it (HEIC, TIFF, RAW…: the card shows the kind of file instead).
 */
function thumb_path(array $n): ?string
{
    $src = blob_path((int)$n['user_id'], (string)$n['bkey']);
    $out = $src . '.t.jpg';
    if (is_file($out)) return $out;
    if (!function_exists('imagecreatefromstring') || !is_file($src) || (int)$n['size'] > 40 * 1048576) return null;
    $info = @getimagesize($src);
    if (!$info || $info[0] * $info[1] > 80000000) return null; // too large to open in memory
    $im = @imagecreatefromstring((string)file_get_contents($src));
    if (!$im) return null;
    // a photo taken sideways: as EXIF says
    if (function_exists('exif_read_data') && ($info[2] ?? 0) === IMAGETYPE_JPEG) {
        $o = (int)(@exif_read_data($src)['Orientation'] ?? 1);
        if ($o === 3) $im = imagerotate($im, 180, 0); elseif ($o === 6) $im = imagerotate($im, -90, 0); elseif ($o === 8) $im = imagerotate($im, 90, 0);
    }
    $w = imagesx($im); $h = imagesy($im); $k = min(1, 480 / max($w, $h));
    $tw = max(1, (int)round($w * $k)); $th = max(1, (int)round($h * $k));
    $t = imagecreatetruecolor($tw, $th);
    imagefill($t, 0, 0, imagecolorallocate($t, 255, 255, 255)); // transparent pictures on white
    imagecopyresampled($t, $im, 0, 0, 0, 0, $tw, $th, $w, $h);
    $ok = @imagejpeg($t, $out, 82);
    unset($im, $t); // freed (imagedestroy has done nothing since PHP 8)
    return $ok ? $out : null;
}

/**
 * A picture inside a file of SavOffice (file.part) at most $w pixels wide, made once with GD and kept next to the file
 * (<bkey>.p<w>-<hash>, gone with it). JPEG for photos, PNG for pictures that may be transparent. Null: GD cannot.
 */
function part_small(array $n, string $part, string $data, int $w): ?array
{
    $out = blob_path((int)$n['user_id'], (string)$n['bkey']) . '.p' . $w . '-' . substr(sha1($part), 0, 12);
    foreach (['jpg' => 'image/jpeg', 'png' => 'image/png'] as $e => $type) if (is_file("$out.$e")) return ["$out.$e", $type];
    if (!function_exists('imagecreatefromstring') || strlen($data) > 40 * 1048576) return null;
    $info = @getimagesizefromstring($data);
    if (!$info || $info[0] * $info[1] > 80000000) return null;
    if ($info[0] <= $w) return null; // small already: as it is
    $im = @imagecreatefromstring($data);
    if (!$im) return null;
    $k = $w / $info[0];
    $t = imagecreatetruecolor($w, max(1, (int)round($info[1] * $k)));
    $alpha = in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true);
    if ($alpha) { imagealphablending($t, false); imagesavealpha($t, true); imagefill($t, 0, 0, imagecolorallocatealpha($t, 0, 0, 0, 127)); }
    imagecopyresampled($t, $im, 0, 0, 0, 0, imagesx($t), imagesy($t), $info[0], $info[1]);
    $ok = $alpha ? @imagepng($t, "$out.png", 6) : @imagejpeg($t, "$out.jpg", 84);
    unset($im, $t);
    return $ok ? ($alpha ? ["$out.png", 'image/png'] : ["$out.jpg", 'image/jpeg']) : null;
}

/** What a picture says about itself: size in pixels, when and with what it was taken, where (EXIF GPS). */
function image_details(array $n): array
{
    $src = blob_path((int)$n['user_id'], (string)$n['bkey']);
    $out = [];
    $info = @getimagesize($src);
    if ($info) [$out['width'], $out['height']] = [(int)$info[0], (int)$info[1]];
    if (!function_exists('exif_read_data')) return $out;
    $x = @exif_read_data($src, null, true);
    if (!is_array($x)) return $out;
    $exif = ($x['EXIF'] ?? []) + ($x['IFD0'] ?? []);
    if (!empty($exif['DateTimeOriginal']) && preg_match('/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/', (string)$exif['DateTimeOriginal'], $m)) $out['taken'] = "$m[1]-$m[2]-$m[3] $m[4]:$m[5]";
    $cam = trim(trim((string)($exif['Make'] ?? '')) . ' ' . trim((string)($exif['Model'] ?? '')));
    if ($cam !== '') $out['camera'] = mb_substr($cam, 0, 80);
    $g = $x['GPS'] ?? [];
    $deg = function ($v) { if (!is_array($v) || count($v) < 3) return null; $f = function ($r) { $p = explode('/', (string)$r); return count($p) === 2 && (float)$p[1] ? (float)$p[0] / (float)$p[1] : (float)$p[0]; }; return $f($v[0]) + $f($v[1]) / 60 + $f($v[2]) / 3600; };
    $lat = $deg($g['GPSLatitude'] ?? null); $lon = $deg($g['GPSLongitude'] ?? null);
    if ($lat !== null && $lon !== null && ($lat || $lon)) {
        if (($g['GPSLatitudeRef'] ?? 'N') === 'S') $lat = -$lat;
        if (($g['GPSLongitudeRef'] ?? 'E') === 'W') $lon = -$lon;
        $out['lat'] = round($lat, 6); $out['lon'] = round($lon, 6);
    }
    return $out;
}


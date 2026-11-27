<?php
/**
 * SavSplits — the photos of the expenses (a receipt, a bill, a ticket), as the pictures of SavWhiteboard
 * (savwhiteboard/lib/media.php): re-encoded with GD as JPEG, turned the right way and without their metadata (the place
 * where a photo was taken is lost on purpose), at most 2000 px on the longer side, kept as files in the storage folder
 * (never reachable from the browser: savsplits/.htaccess and storage/.htaccess) and served by their random id, only to
 * whoever can open the group (api/?r=splits.photo&p=<id>&id=<group> or &code=<link>).
 *
 * A photo is uploaded while the expense is being written (eid NULL), then the expense takes it when it is saved; the
 * photos left out of an expense, and the forgotten ones, are deleted with their files.
 */

declare(strict_types=1);

const PHOTO_SIDE = 2000;

function photo_path(string $pid): string
{
    return config_value('storage') . '/' . substr($pid, 0, 2) . '/' . $pid . '.jpg';
}

function valid_pid($v): string
{
    return is_string($v) && preg_match('/^[a-f0-9]{32}$/', $v) ? $v : '';
}

/** The storage folder, made the first time with a .htaccess that refuses every request. */
function photo_dir(string $pid): string
{
    $base = (string)config_value('storage');
    if (!is_dir($base)) {
        if (!@mkdir($base, 0750, true) && !is_dir($base)) throw new RuntimeException('storage folder cannot be created');
        @file_put_contents($base . '/.htaccess', "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    $d = $base . '/' . substr($pid, 0, 2);
    if (!is_dir($d) && !@mkdir($d, 0750, true) && !is_dir($d)) throw new RuntimeException('storage folder cannot be created');
    return $d;
}

/** Checks and re-encodes the bytes of a photo, keeps it for the group (not yet attached to an expense). */
function store_photo(array $g, string $bytes): array
{
    if (!function_exists('imagecreatefromstring')) fail('photo_off', 501);
    $size = @getimagesizefromstring($bytes);
    if (!$size || !in_array($size[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) fail('photo_type', 422);
    if ($size[0] < 1 || $size[1] < 1 || $size[0] * $size[1] > 60000000) fail('photo_big', 413);
    @ini_set('memory_limit', '384M');
    $im = @imagecreatefromstring($bytes);
    if (!$im) fail('photo_type', 422);
    // a photo taken sideways: as its EXIF says (then the EXIF is gone)
    if ($size[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $ex = @exif_read_data('data://image/jpeg;base64,' . base64_encode(substr($bytes, 0, 131072)));
        $rot = [3 => 180, 6 => -90, 8 => 90][(int)($ex['Orientation'] ?? 1)] ?? 0;
        if ($rot) $im = imagerotate($im, $rot, 0);
    }
    $w = imagesx($im);
    $h = imagesy($im);
    $k = min(1, PHOTO_SIDE / max($w, $h));
    $nw = max(1, (int)round($w * $k));
    $nh = max(1, (int)round($h * $k));
    // on white: a PNG with transparency becomes a JPEG
    $out = imagecreatetruecolor($nw, $nh);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $im, 0, 0, 0, 0, $nw, $nh, $w, $h);
    ob_start();
    imagejpeg($out, null, 84);
    $jpg = (string)ob_get_clean();
    unset($im, $out);
    if (!space_allows_id((int)$g['owner_id'], strlen($jpg))) fail('quota', 413); // the space of SavOffice of the owner
    $pid = bin2hex(random_bytes(16));
    photo_dir($pid);
    if (@file_put_contents(photo_path($pid), $jpg) !== strlen($jpg)) throw new RuntimeException('storage folder not writable');
    q('INSERT INTO ' . t('split_photos') . ' (pid, group_id, eid, width, height, bytes, created_at) VALUES (?,?,NULL,?,?,?,?)', [$pid, $g['id'], $nw, $nh, strlen($jpg), now_utc()]);
    return ['id' => $pid, 'w' => $nw, 'h' => $nh, 'bytes' => strlen($jpg)];
}

/** The photos of an expense become exactly $pids (in that order): the new ones are taken, the ones left out deleted. */
function attach_photos(int $gid, string $eid, $pids): void
{
    $want = [];
    foreach (is_array($pids) ? $pids : [] as $p) if (($p = valid_pid($p)) && !in_array($p, $want, true)) $want[] = $p;
    if (count($want) > MAX_PHOTOS) fail('too_many_photos', 422);
    $have = q('SELECT pid FROM ' . t('split_photos') . ' WHERE group_id = ? AND eid = ?', [$gid, $eid])->fetchAll(PDO::FETCH_COLUMN);
    delete_photos(array_values(array_diff($have, $want)));
    foreach ($want as $i => $p) q('UPDATE ' . t('split_photos') . ' SET eid = ?, position = ? WHERE pid = ? AND group_id = ? AND (eid IS NULL OR eid = ?)', [$eid, $i, $p, $gid, $eid]);
}

/** Rows and files. */
function delete_photos(array $pids): void
{
    $pids = array_values(array_filter(array_map('valid_pid', $pids)));
    if (!$pids) return;
    q('DELETE FROM ' . t('split_photos') . ' WHERE pid IN (' . implode(',', array_fill(0, count($pids), '?')) . ')', $pids);
    foreach ($pids as $p) @unlink(photo_path($p));
}

/** The files of whole groups (before the groups go: their rows go with them by themselves). */
function delete_group_photos(array $groupIds): void
{
    $groupIds = array_values(array_map('intval', $groupIds));
    if (!$groupIds) return;
    foreach (q('SELECT pid FROM ' . t('split_photos') . ' WHERE group_id IN (' . implode(',', array_fill(0, count($groupIds), '?')) . ')', $groupIds)->fetchAll(PDO::FETCH_COLUMN) as $p) @unlink(photo_path($p));
}

/** Photos uploaded for an expense never saved (more than a day ago), and the ones of expenses gone for good. */
function tidy_photos(int $gid): void
{
    $old = q('SELECT p.pid FROM ' . t('split_photos') . ' p LEFT JOIN ' . t('split_expenses') . ' e ON e.group_id = p.group_id AND e.eid = p.eid
        WHERE p.group_id = ? AND ((p.eid IS NULL AND p.created_at < ?) OR (p.eid IS NOT NULL AND e.id IS NULL))', [$gid, gmdate('Y-m-d H:i:s', time() - 86400)])->fetchAll(PDO::FETCH_COLUMN);
    delete_photos($old);
}

/** eid => [{id, w, h}] for the expenses of a group. */
function photos_of(int $gid): array
{
    $out = [];
    foreach (q('SELECT pid, eid, width, height FROM ' . t('split_photos') . ' WHERE group_id = ? AND eid IS NOT NULL ORDER BY eid, position', [$gid])->fetchAll() as $p) $out[$p['eid']][] = ['id' => $p['pid'], 'w' => (int)$p['width'], 'h' => (int)$p['height']];
    return $out;
}

/** The photo itself, to whoever can open its group. */
function serve_photo(array $a, string $pid): void
{
    $ok = $pid && q('SELECT 1 FROM ' . t('split_photos') . ' WHERE pid = ? AND group_id = ?', [$pid, $a['group']['id']])->fetchColumn();
    $file = $ok ? photo_path($pid) : '';
    if (!$ok || !is_file($file)) {
        http_response_code(404);
        exit;
    }
    header('Content-Type: image/jpeg');
    header('Content-Length: ' . filesize($file));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=31536000, immutable');
    header("Content-Security-Policy: default-src 'none'");
    header('X-Robots-Tag: noindex');
    if (!empty($_GET['dl'])) header('Content-Disposition: attachment; filename="photo-' . substr($pid, 0, 8) . '.jpg"');
    while (ob_get_level()) ob_end_clean();
    readfile($file);
    exit;
}

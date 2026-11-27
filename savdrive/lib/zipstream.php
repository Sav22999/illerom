<?php
/**
 * SavDrive — a ZIP sent while it is made: a folder of SavDrive or an album of SavPhotos downloaded in one request, with
 * no copy on the disk and no memory taken by the files (they are read a piece at a time).
 *
 * The files are stored as they are ("store": photos, videos and documents are already compressed), each with a data
 * descriptor (its CRC-32 is computed while it is sent), names in UTF-8. The length of the whole ZIP is known before
 * it starts, so the browser shows the progress. Limits of the plain ZIP format: 4 GB in all and 65 535 files
 * (zip_check answers too_big beyond them).
 */

declare(strict_types=1);

const ZIP_MAX_BYTES = 4294967295 - 50 * 1048576;
const ZIP_MAX_FILES = 65000;

/** A name for every file inside the ZIP: no two the same ("photo.jpg", "photo (2).jpg"), no "..", no slashes at the ends. */
function zip_names(array $entries): array
{
    $seen = [];
    foreach ($entries as $i => $e) {
        $parts = array_values(array_filter(array_map(fn($p) => trim(str_replace(['\\', "\0"], '', $p), " ."), explode('/', (string)$e['name'])), fn($p) => $p !== ''));
        $name = implode('/', $parts) ?: 'file';
        $base = $name;
        for ($k = 2; isset($seen[mb_strtolower($name)]); $k++) {
            $dot = mb_strrpos($base, '.');
            $slash = mb_strrpos($base, '/');
            $name = $dot !== false && ($slash === false || $dot > $slash) ? mb_substr($base, 0, $dot) . " ($k)" . mb_substr($base, $dot) : "$base ($k)";
        }
        $seen[mb_strtolower($name)] = true;
        $entries[$i]['name'] = $name;
    }
    return $entries;
}

/** Whether these files fit in a ZIP: null, or the error code. */
function zip_check(array $entries): ?string
{
    if (!$entries) return 'empty';
    if (count($entries) > ZIP_MAX_FILES) return 'too_big';
    $total = 0;
    foreach ($entries as $e) $total += (int)$e['size'] + 100 + 2 * strlen((string)$e['name']);
    return $total > ZIP_MAX_BYTES ? 'too_big' : null;
}

/** DOS date and time of a UTC datetime of the database. */
function zip_dos(?string $utc): array
{
    $t = $utc ? strtotime($utc . ' UTC') : time();
    $d = getdate($t ?: time());
    $year = max(1980, $d['year']);
    return [($d['hours'] << 11) | ($d['minutes'] << 5) | intdiv($d['seconds'], 2), (($year - 1980) << 9) | ($d['mon'] << 5) | $d['mday']];
}

/**
 * Sends the ZIP and ends the request. $entries: [['name' => path inside the ZIP, 'path' => file on the disk,
 * 'size' => bytes, 'time' => UTC datetime], …]. A file gone from the disk meanwhile is sent empty (the length stays right).
 */
function zip_send(string $filename, array $entries): void
{
    $entries = zip_names($entries);
    // the exact length: every local header (30 + name), the data, every descriptor (16), the central directory (46 + name), its end (22)
    $length = 22;
    foreach ($entries as $e) $length += 30 + 16 + 46 + 2 * strlen($e['name']) + (int)$e['size'];
    @set_time_limit(0);
    @ignore_user_abort(false);
    while (ob_get_level()) ob_end_clean();
    $ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $filename);
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($filename));
    header('Content-Length: ' . $length);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    $offset = 0;
    $central = '';
    $out = function (string $s) use (&$offset): void { echo $s; $offset += strlen($s); };
    foreach ($entries as $e) {
        if (connection_aborted()) exit;
        [$time, $date] = zip_dos($e['time'] ?? null);
        $name = $e['name'];
        $size = (int)$e['size'];
        $start = $offset;
        // local header: version 2.0, flags = data descriptor (8) + UTF-8 names (2048), stored, CRC and sizes in the descriptor
        $out(pack('VvvvvvVVVvv', 0x04034b50, 20, 0x0808, 0, $time, $date, 0, 0, 0, strlen($name), 0) . $name);
        $crc = hash_init('crc32b');
        $sent = 0;
        $fh = is_file((string)$e['path']) ? @fopen((string)$e['path'], 'rb') : false;
        while ($fh && $sent < $size && !feof($fh)) {
            $buf = fread($fh, (int)min(1048576, $size - $sent));
            if ($buf === false || $buf === '') break;
            hash_update($crc, $buf);
            $out($buf);
            $sent += strlen($buf);
            flush();
            if (connection_aborted()) exit;
        }
        if ($fh) fclose($fh);
        // a file that changed or went meanwhile: zeros up to the length announced, so the ZIP stays readable
        while ($sent < $size) { $z = str_repeat("\0", (int)min(1048576, $size - $sent)); hash_update($crc, $z); $out($z); $sent += strlen($z); }
        $c = (int)hexdec(hash_final($crc));
        $out(pack('VVVV', 0x08074b50, $c, $size, $size));
        $central .= pack('VvvvvvvVVVvvvvvVV', 0x02014b50, 20, 20, 0x0808, 0, $time, $date, $c, $size, $size, strlen($name), 0, 0, 0, 0, 0, $start) . $name;
    }
    $cdStart = $offset;
    $out($central);
    $out(pack('VvvvvVVv', 0x06054b50, 0, 0, count($entries), count($entries), strlen($central), $cdStart, 0));
    flush();
    exit;
}

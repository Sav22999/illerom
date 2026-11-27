<?php
/**
 * SavDrive — what is inside an archive, read from its index without extracting anything (nothing is written, nothing
 * inside is run). Plain PHP: no extension needed.
 *
 *   ZIP      the central directory at the end of the file (ZIP64 too): only those bytes are read
 *   TAR      a header of 512 bytes before each file: the reader jumps from one to the next (PAX and GNU long names)
 *   TAR.GZ   the same, decompressed in memory while reading (a time and a number of entries as limits); a .gz with
 *            one file inside shows that file
 *   RAR      the headers of RAR 4 and RAR 5; archives whose names are encrypted say only that they are protected
 *   7z       its index is compressed (LZMA): not readable here, the preview says so
 *
 * archive_list() answers {format, entries: [{path, size, time, dir}], total, bytes, truncated, partial, encrypted, unsupported}:
 * truncated = more entries than the ones listed; partial = reading stopped before the end (the totals are "at least").
 * The files macOS adds for itself (__MACOSX/, ._name, .DS_Store) are left out.
 */

declare(strict_types=1);

const ARCHIVE_MAX_ENTRIES = 5000;   // what is listed at most (the totals still count everything that was read)
const ARCHIVE_MAX_READ = 100000;    // what is read at most for the totals
const ARCHIVE_MAX_SECONDS = 4.0;    // TAR.GZ: decompressing stops after this

function archive_list(string $path, string $name): array
{
    $fh = @fopen($path, 'rb');
    if (!$fh) return ['format' => '', 'entries' => [], 'unsupported' => true];
    $head = (string)fread($fh, 8);
    // a damaged archive makes the readers stumble (short reads, odd numbers): any warning stops reading, quietly
    set_error_handler(function (int $no, string $msg) { if (!(error_reporting() & $no)) return false; throw new ErrorException($msg, 0, $no); });
    try {
        if (strncmp($head, "PK\x03\x04", 4) === 0 || strncmp($head, "PK\x05\x06", 4) === 0) return zip_list($fh);
        if (strncmp($head, "Rar!\x1A\x07\x01\x00", 8) === 0) return rar5_list($fh);
        if (strncmp($head, "Rar!\x1A\x07\x00", 7) === 0) return rar4_list($fh);
        if (strncmp($head, "7z\xBC\xAF\x27\x1C", 6) === 0) return ['format' => '7z', 'entries' => [], 'unsupported' => true];
        if (strncmp($head, "\x1F\x8B", 2) === 0) { fclose($fh); $fh = null; return gz_list($path, $name); }
        fseek($fh, 257);
        if (strncmp((string)fread($fh, 5), 'ustar', 5) === 0 || preg_match('/\.tar$/i', $name)) { rewind($fh); return tar_list(fn($n) => (string)fread($fh, $n), fn($n) => fseek($fh, $n, SEEK_CUR) === 0, 'tar'); }
        return ['format' => '', 'entries' => [], 'unsupported' => true];
    } catch (Throwable $e) {
        return ['format' => '', 'entries' => [], 'unsupported' => true, 'damaged' => true]; // a damaged archive: nothing to show, nothing broken
    } finally {
        restore_error_handler();
        if ($fh) fclose($fh);
    }
}

/** A list in the common shape: entries cut at the limit, totals of everything that was read. */
function archive_out(string $format, array $entries, bool $partial = false, bool $encrypted = false): array
{
    $entries = array_values(array_filter($entries, fn($e) => !preg_match('#(^|/)(__MACOSX(/|$)|\._[^/]*$|\.DS_Store$)#', $e['path'])));
    $files = array_filter($entries, fn($e) => !$e['dir']);
    return ['format' => $format, 'entries' => array_slice($entries, 0, ARCHIVE_MAX_ENTRIES), 'total' => count($files), 'bytes' => array_sum(array_column($files, 'size')),
        'truncated' => count($entries) > ARCHIVE_MAX_ENTRIES || $partial, 'partial' => $partial, 'encrypted' => $encrypted];
}

/** A name as UTF-8 (old ZIP files use code page 437; many tools write UTF-8 without saying so: valid UTF-8 is taken as
 * such), without control characters, "a/b/c" without "./" or "/" at the start. */
function archive_name(string $s): string
{
    if (!mb_check_encoding($s, 'UTF-8')) $s = function_exists('iconv') ? (string)@iconv('CP437', 'UTF-8//IGNORE', $s) : preg_replace('/[\x80-\xFF]/', '?', $s);
    $s = str_replace('\\', '/', preg_replace('/[\x00-\x1F\x7F]/u', '', $s) ?? '');
    return ltrim(preg_replace('#^(\./)+#', '', $s) ?? '', '/');
}

/** A DOS date and time (ZIP, RAR 4) as "YYYY-MM-DD HH:MM". */
function dos_time(int $date, int $time): ?string
{
    if (!$date) return null;
    return sprintf('%04d-%02d-%02d %02d:%02d', (($date >> 9) & 0x7F) + 1980, max(1, ($date >> 5) & 0x0F), max(1, $date & 0x1F), ($time >> 11) & 0x1F, ($time >> 5) & 0x3F);
}

// ---------------------------------------------------------------- ZIP

function zip_list($fh): array
{
    fseek($fh, 0, SEEK_END);
    $size = ftell($fh);
    $tail = min($size, 65557);
    fseek($fh, $size - $tail);
    $buf = (string)fread($fh, $tail);
    $p = strrpos($buf, "PK\x05\x06");
    if ($p === false) return ['format' => 'zip', 'entries' => [], 'unsupported' => true];
    $e = unpack('vdisk/vcddisk/vhere/vcount/Vcdsize/Vcdoff', substr($buf, $p + 4, 16));
    $count = $e['count']; $cdsize = $e['cdsize']; $cdoff = $e['cdoff'];
    // ZIP64: the real numbers are in a record of their own
    if (($count === 0xFFFF || $cdoff === 0xFFFFFFFF || $cdsize === 0xFFFFFFFF) && $p >= 20 && substr($buf, $p - 20, 4) === "PK\x06\x07") {
        $loc = unpack('Vdisk/Plow', substr($buf, $p - 16, 12));
        fseek($fh, $loc['low']);
        $z = (string)fread($fh, 56);
        if (substr($z, 0, 4) === "PK\x06\x06") {
            $r = unpack('Ptotal/Pcdsize/Pcdoff', substr($z, 32, 24));
            [$count, $cdsize, $cdoff] = [$r['total'], $r['cdsize'], $r['cdoff']];
        }
    }
    if ($cdsize > 64 * 1048576 || $cdoff + $cdsize > $size) return ['format' => 'zip', 'entries' => [], 'unsupported' => true];
    fseek($fh, $cdoff);
    $cd = (string)fread($fh, $cdsize);
    $out = [];
    $enc = false;
    for ($o = 0, $n = 0; $o + 46 <= strlen($cd) && substr($cd, $o, 4) === "PK\x01\x02" && $n < ARCHIVE_MAX_READ; $n++) {
        $h = unpack('vflags/vmethod/vtime/vdate/Vcrc/Vcsize/Vusize/vnlen/vxlen/vclen', substr($cd, $o + 8, 26));
        $name = substr($cd, $o + 46, $h['nlen']);
        $usize = $h['usize'];
        if ($usize === 0xFFFFFFFF) { // the size in the ZIP64 extra field
            $x = substr($cd, $o + 46 + $h['nlen'], $h['xlen']);
            for ($q = 0; $q + 4 <= strlen($x);) {
                $f = unpack('vid/vlen', substr($x, $q, 4));
                if ($f['id'] === 1 && $f['len'] >= 8) { $usize = unpack('P', substr($x, $q + 4, 8))[1]; break; }
                $q += 4 + $f['len'];
            }
        }
        if ($h['flags'] & 1) $enc = true;
        $path = archive_name($name);
        if ($path !== '') $out[] = ['path' => rtrim($path, '/'), 'size' => (int)$usize, 'time' => dos_time($h['date'], $h['time']), 'dir' => substr($path, -1) === '/'];
        $o += 46 + $h['nlen'] + $h['xlen'] + $h['clen'];
    }
    return archive_out('zip', $out, $n < $count, $enc);
}

// ---------------------------------------------------------------- TAR (and TAR.GZ through the same reader)

/** $read(n): the next n bytes · $skip(n): jumps n bytes forward (false when it cannot). */
function tar_list(callable $read, callable $skip, string $format, ?float $until = null): array
{
    $out = [];
    $long = null; $pax = [];
    $oct = function (string $f): int {
        if ($f !== '' && (ord($f[0]) & 0x80)) { $n = 0; for ($i = 1; $i < strlen($f); $i++) $n = $n * 256 + ord($f[$i]); return $n; } // base-256 (very large files)
        return (int)octdec(trim($f, " \0"));
    };
    $truncated = false;
    while (true) {
        if ($until && microtime(true) > $until) { $truncated = true; break; }
        $b = $read(512);
        if (strlen($b) < 512 || trim($b, "\0") === '') break;
        $size = $oct(substr($b, 124, 12));
        $type = $b[156];
        $blocks = (int)ceil($size / 512) * 512;
        if ($type === 'L' || $type === 'x' || $type === 'g') { // a long name, or attributes, for the next file
            $data = substr($read($blocks), 0, $size);
            if ($type === 'L') $long = rtrim($data, "\0");
            elseif ($type === 'x') foreach (explode("\n", $data) as $line) if (preg_match('/^\d+ (path|size)=(.*)$/s', $line, $m)) $pax[$m[1]] = $m[2];
            continue;
        }
        $name = rtrim(substr($b, 0, 100), "\0");
        if (substr($b, 257, 5) === 'ustar' && ($prefix = rtrim(substr($b, 345, 155), "\0")) !== '') $name = $prefix . '/' . $name;
        if ($long !== null) $name = $long;
        if (isset($pax['path'])) $name = $pax['path'];
        if (isset($pax['size'])) { $size = (int)$pax['size']; $blocks = (int)ceil($size / 512) * 512; }
        $long = null; $pax = [];
        $dir = $type === '5' || substr($name, -1) === '/';
        $path = rtrim(archive_name($name), '/');
        if ($path !== '' && in_array($type, ['0', "\0", '5', '7', '1', '2'], true)) {
            $out[] = ['path' => $path, 'size' => $dir ? 0 : $size, 'time' => ($t = $oct(substr($b, 136, 12))) ? gmdate('Y-m-d H:i', $t) : null, 'dir' => $dir];
            if (count($out) >= ARCHIVE_MAX_READ) { $truncated = true; break; }
        }
        if ($blocks && !$skip($blocks)) break;
    }
    return archive_out($format, $out, $truncated);
}

function gz_list(string $path, string $name): array
{
    $gz = @gzopen($path, 'rb');
    if (!$gz) return ['format' => 'gz', 'entries' => [], 'unsupported' => true];
    try {
        $first = (string)gzread($gz, 512);
        if (strlen($first) === 512 && (substr($first, 257, 5) === 'ustar' || preg_match('/\.(tgz|tar\.gz)$/i', $name))) {
            $pending = $first;
            $read = function (int $n) use ($gz, &$pending): string {
                if ($pending !== '') { $s = substr($pending, 0, $n); $pending = substr($pending, $n); return $s . ($n > strlen($s) ? (string)gzread($gz, $n - strlen($s)) : ''); }
                return (string)gzread($gz, $n);
            };
            // jumping forward in a compressed file means decompressing what is jumped over (in memory, then dropped)
            $skip = function (int $n) use ($gz): bool { while ($n > 0) { $c = gzread($gz, (int)min($n, 1048576)); if ($c === false || $c === '') return false; $n -= strlen($c); } return true; };
            return tar_list($read, $skip, 'tar.gz', microtime(true) + ARCHIVE_MAX_SECONDS);
        }
    } finally {
        gzclose($gz);
    }
    // one compressed file: its name, and its size from the last 4 bytes (modulo 4 GB)
    $fh = fopen($path, 'rb');
    fseek($fh, -4, SEEK_END);
    $isize = unpack('V', (string)fread($fh, 4))[1];
    fclose($fh);
    return archive_out('gz', [['path' => preg_replace('/\.gz$/i', '', basename($name)) ?: 'file', 'size' => (int)$isize, 'time' => null, 'dir' => false]]);
}

// ---------------------------------------------------------------- RAR 5 and RAR 4

/** A variable-length number of RAR 5 at $o of $s; null when it does not end. */
function rar_vint(string $s, int &$o): ?int
{
    $n = 0;
    for ($shift = 0; $shift < 64 && $o < strlen($s); $shift += 7) {
        $b = ord($s[$o++]);
        $n |= ($b & 0x7F) << $shift;
        if (!($b & 0x80)) return $n;
    }
    return null;
}

function rar5_list($fh): array
{
    $out = [];
    $pos = 8;
    fseek($fh, 0, SEEK_END);
    $size = ftell($fh);
    while ($pos + 7 < $size && count($out) < ARCHIVE_MAX_READ) {
        fseek($fh, $pos);
        $raw = (string)fread($fh, 16);
        $o = 4;
        $hsize = rar_vint($raw, $o);
        if ($hsize === null || $hsize < 1 || $hsize > 2 * 1048576) break;
        $start = $o; // the header begins after its size
        fseek($fh, $pos + $start);
        $hd = (string)fread($fh, $hsize);
        $q = 0;
        $type = rar_vint($hd, $q); $flags = rar_vint($hd, $q);
        if ($flags & 1) rar_vint($hd, $q); // extra area size
        $data = ($flags & 2) ? (int)rar_vint($hd, $q) : 0;
        if ($type === 4) return archive_out('rar', $out, false, true); // the headers themselves are encrypted
        if ($type === 5) break;
        if ($type === 2) {
            $ff = rar_vint($hd, $q); $usize = rar_vint($hd, $q); rar_vint($hd, $q);
            $mtime = ($ff & 2) ? unpack('V', substr($hd, $q, 4))[1] : null;
            if ($ff & 2) $q += 4;
            if ($ff & 4) $q += 4;
            rar_vint($hd, $q); rar_vint($hd, $q);
            $nlen = rar_vint($hd, $q);
            $path = rtrim(archive_name(substr($hd, $q, (int)$nlen)), '/');
            if ($path !== '') $out[] = ['path' => $path, 'size' => ($ff & 1) ? 0 : (int)$usize, 'time' => $mtime ? gmdate('Y-m-d H:i', $mtime) : null, 'dir' => (bool)($ff & 1)];
        }
        $pos += $start + $hsize + $data;
    }
    return archive_out('rar', $out, count($out) >= ARCHIVE_MAX_READ);
}

function rar4_list($fh): array
{
    $out = [];
    $pos = 7;
    fseek($fh, 0, SEEK_END);
    $size = ftell($fh);
    while ($pos + 7 <= $size && count($out) < ARCHIVE_MAX_READ) {
        fseek($fh, $pos);
        $b = (string)fread($fh, 7);
        if (strlen($b) < 7) break;
        $h = unpack('vcrc/Ctype/vflags/vsize', $b);
        if ($h['size'] < 7) break;
        $add = 0;
        if ($h['type'] === 0x73 && ($h['flags'] & 0x80)) return archive_out('rar', $out, false, true); // names encrypted with a password
        if ($h['type'] === 0x7B) break;
        if ($h['flags'] & 0x8000 || $h['type'] === 0x74) {
            fseek($fh, $pos + 7);
            $add = unpack('V', (string)fread($fh, 4))[1];
        }
        if ($h['type'] === 0x74) {
            fseek($fh, $pos);
            $f = (string)fread($fh, $h['size']);
            $v = unpack('Vpack/Vunp/Chost/Vcrc/Vtime/Cver/Cmethod/vnlen/Vattr', substr($f, 7, 25));
            $at = 32;
            $usize = $v['unp'];
            if ($h['flags'] & 0x100) { $hi = unpack('Vhp/Vhu', substr($f, 32, 8)); $add += $hi['hp'] * 4294967296; $usize += $hi['hu'] * 4294967296; $at = 40; }
            $name = substr($f, $at, $v['nlen']);
            if ($h['flags'] & 0x200) { $z = strpos($name, "\0"); if ($z !== false) $name = substr($name, 0, $z); } // the ASCII part of a Unicode name
            $dir = ($h['flags'] & 0xE0) === 0xE0;
            $path = rtrim(archive_name($name), '/');
            if ($path !== '') $out[] = ['path' => $path, 'size' => $dir ? 0 : (int)$usize, 'time' => dos_time($v['time'] >> 16, $v['time'] & 0xFFFF), 'dir' => $dir];
        }
        $pos += $h['size'] + $add;
    }
    return archive_out('rar', $out, count($out) >= ARCHIVE_MAX_READ);
}

// ---------------------------------------------------------------- one file out of a ZIP (the files of SavOffice)

/**
 * The files inside a ZIP: [name => [method, compressed size, size, offset of its local header]], or null. Only what
 * the files of SavOffice need (no ZIP64, no encryption): the previews of SavDrive read one entry at a time, so a
 * presentation full of photos is never downloaded whole to draw its first slide.
 */
function zip_index(string $path): ?array
{
    $fh = @fopen($path, 'rb');
    if (!$fh) return null;
    try {
        fseek($fh, 0, SEEK_END);
        $size = ftell($fh);
        $tail = min($size, 65557);
        fseek($fh, $size - $tail);
        $buf = (string)fread($fh, $tail);
        $p = strrpos($buf, "PK\x05\x06");
        if ($p === false) return null;
        $e = unpack('vdisk/vcddisk/vhere/vcount/Vcdsize/Vcdoff', substr($buf, $p + 4, 16));
        if ($e['cdsize'] > 16 * 1048576 || $e['cdoff'] + $e['cdsize'] > $size) return null;
        fseek($fh, $e['cdoff']);
        $cd = (string)fread($fh, $e['cdsize']);
        $out = [];
        for ($o = 0; $o + 46 <= strlen($cd) && substr($cd, $o, 4) === "PK\x01\x02" && count($out) < 20000;) {
            $h = unpack('vflags/vmethod/vtime/vdate/Vcrc/Vcsize/Vusize/vnlen/vxlen/vclen/vdisk/vint/Vext/Voff', substr($cd, $o + 8, 38));
            $name = substr($cd, $o + 46, $h['nlen']);
            if (!($h['flags'] & 1) && in_array($h['method'], [0, 8], true)) $out[$name] = [$h['method'], $h['csize'], $h['usize'], $h['off']];
            $o += 46 + $h['nlen'] + $h['xlen'] + $h['clen'];
        }
        return $out;
    } finally {
        fclose($fh);
    }
}

/** The content of one entry of zip_index (at most $max bytes once inflated), or null. */
function zip_entry(string $path, array $entry, int $max): ?string
{
    [$method, $csize, $usize, $off] = $entry;
    if ($usize > $max || $csize > $max + 1048576) return null;
    $fh = @fopen($path, 'rb');
    if (!$fh) return null;
    try {
        fseek($fh, $off);
        $lh = (string)fread($fh, 30);
        if (strlen($lh) < 30 || substr($lh, 0, 4) !== "PK\x03\x04") return null;
        $l = unpack('vnlen/vxlen', substr($lh, 26, 4));
        fseek($fh, $off + 30 + $l['nlen'] + $l['xlen']);
        $data = $csize > 0 ? (string)fread($fh, $csize) : '';
        if ($method === 0) return $data;
        $raw = @gzinflate($data, $max);
        return $raw === false ? null : $raw;
    } finally {
        fclose($fh);
    }
}

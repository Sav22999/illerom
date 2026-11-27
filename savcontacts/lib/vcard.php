<?php
/**
 * SavContacts — the formats of the contacts, without the database (so the same code can serve a CardDAV endpoint later):
 *
 *   vCard   vcard_parse($text) reads 2.1, 3.0 and 4.0, one card or many (Apple, Google, Android, Outlook, Thunderbird…);
 *           vcard_write($contact, '3.0'|'4.0') writes one card. What a card has and the app does not show is kept in
 *           "other" and written back as it came, so nothing is lost on the way through.
 *   CSV     csv_parse($text) reads the exports of Google Contacts (old and new columns) and of Outlook (also in
 *           Italian), with a comma or a semicolon; csv_write($contacts, 'google'|'outlook') writes them.
 *
 * A contact is an array: prefix, first, middle, last, suffix, nickname, company, department, title, birthday ("YYYY-MM-DD"
 * or "--MM-DD"), notes, emails / phones / urls ([{label, value}]), addresses ([{label, street, city, region, code,
 * country}]), categories (names of groups), favorite, uid, photo (the bytes of the image, or null), other ([lines]).
 * A label is home, work, mobile, main, fax, pager, school, other, or any word written by a person.
 */

declare(strict_types=1);

const CONTACT_TEXT = ['prefix', 'first', 'middle', 'last', 'suffix', 'nickname', 'company', 'department', 'title'];
const CONTACT_LISTS = ['emails', 'phones', 'addresses', 'urls'];
const ADDRESS_PARTS = ['street', 'city', 'region', 'code', 'country'];
const KNOWN_LABELS = ['home', 'work', 'mobile', 'main', 'fax', 'pager', 'school', 'other'];

function contact_blank(): array
{
    $c = array_fill_keys(CONTACT_TEXT, '');
    return $c + ['birthday' => '', 'notes' => '', 'emails' => [], 'phones' => [], 'addresses' => [], 'urls' => [], 'categories' => [], 'favorite' => false, 'uid' => '', 'photo' => null, 'other' => []];
}

/** The name as people read it: "Mario Rossi", else the company, else the first email or phone. */
function contact_display(array $c): string
{
    $n = trim(preg_replace('/\s+/u', ' ', implode(' ', array_filter([$c['prefix'] ?? '', $c['first'] ?? '', $c['middle'] ?? '', $c['last'] ?? '', $c['suffix'] ?? ''], 'strlen'))) ?? '');
    if ($n !== '') return $n;
    foreach (['nickname', 'company'] as $k) if (($c[$k] ?? '') !== '') return $c[$k];
    foreach (['emails', 'phones'] as $k) if (!empty($c[$k][0]['value'])) return $c[$k][0]['value'];
    return '';
}

/** A birthday as the app keeps it ("1985-04-12" or "--04-12"), from what a vCard, Google or Outlook writes; '' when unknown. */
function birthday_clean(string $s): string
{
    $s = trim($s);
    if ($s === '') return '';
    $ok = fn(int $y, int $m, int $d) => $m >= 1 && $m <= 12 && $d >= 1 && $d <= 31 && checkdate($m, $d, $y ?: 2000);
    $out = function (int $y, int $m, int $d) use ($ok): string {
        if (!$ok($y, $m, $d)) return '';
        // Apple writes 1604 for a birthday without its year (X-APPLE-OMIT-YEAR), others 0000 or 1900 by habit
        if ($y <= 1604 || $y > (int)gmdate('Y') + 1) return sprintf('--%02d-%02d', $m, $d);
        return sprintf('%04d-%02d-%02d', $y, $m, $d);
    };
    if (preg_match('/^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/', $s, $m)) return $out((int)$m[1], (int)$m[2], (int)$m[3]);
    if (preg_match('/^--(\d{2})-?(\d{2})$/', $s, $m)) return $out(0, (int)$m[1], (int)$m[2]);
    if (preg_match('/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/', $s, $m)) {
        // Outlook: month/day/year in English, day/month/year in Italian (a day over 12 tells which one it is)
        $a = (int)$m[1]; $b = (int)$m[2]; $y = (int)$m[3];
        if ($y === 0 && $a === 0) return '';
        if ($y < 100) $y += $y > (int)gmdate('y') ? 1900 : 2000;
        [$mo, $d] = $a > 12 ? [$b, $a] : [$a, $b];
        return $out($y, $mo, $d);
    }
    if (preg_match('/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/', $s, $m)) return $out((int)$m[1], (int)$m[2], (int)$m[3]);
    $t = strtotime($s . ' 12:00 UTC');
    return $t ? $out((int)gmdate('Y', $t), (int)gmdate('n', $t), (int)gmdate('j', $t)) : '';
}

/** A label from the words of a vCard TYPE, a Google label or an Apple X-ABLabel. */
function label_of(array $types, string $kind): string
{
    $t = array_map(fn($x) => mb_strtolower(trim((string)$x)), $types);
    if ($kind === 'phones') {
        if (in_array('cell', $t, true) || in_array('mobile', $t, true) || in_array('iphone', $t, true)) return 'mobile';
        if (in_array('fax', $t, true) || in_array('home fax', $t, true) || in_array('work fax', $t, true)) return 'fax';
        if (in_array('pager', $t, true)) return 'pager';
        if (in_array('main', $t, true)) return 'main';
    }
    foreach (['home' => 'home', 'work' => 'work', 'school' => 'school', 'other' => 'other', 'main' => 'main', 'internet' => '', 'pref' => '', 'voice' => '', 'x-internet' => '', 'intl' => '', 'postal' => '', 'parcel' => '', 'dom' => '', 'text' => ''] as $k => $v) {
        if ($v !== '' && in_array($k, $t, true)) return $v;
    }
    foreach ($t as $x) if ($x !== '' && !in_array($x, ['internet', 'pref', 'voice', 'x-internet', 'intl', 'postal', 'parcel', 'dom', 'text', 'uri', 'x-'], true) && !preg_match('/^pref=|^\d+$/', $x)) return label_word($x);
    return 'other';
}

/** One word of a label as the app keeps it: the known ones by name (English or Italian), the others as written. */
function label_word(string $s): string
{
    $s = trim(preg_replace('/^_\$!<(.+)>!\$_$/', '$1', trim($s)) ?? ''); // Apple: _$!<HomePage>!$_
    $l = mb_strtolower($s);
    $map = ['home' => 'home', 'casa' => 'home', 'abitazione' => 'home', 'personal' => 'home', 'personale' => 'home', 'work' => 'work', 'lavoro' => 'work', 'business' => 'work', 'ufficio' => 'work',
        'mobile' => 'mobile', 'cell' => 'mobile', 'cellulare' => 'mobile', 'iphone' => 'mobile', 'main' => 'main', 'principale' => 'main', 'fax' => 'fax', 'home fax' => 'fax', 'work fax' => 'fax',
        'pager' => 'pager', 'cercapersone' => 'pager', 'school' => 'school', 'scuola' => 'school', 'other' => 'other', 'altro' => 'other', 'homepage' => 'home', 'workfax' => 'fax', 'homefax' => 'fax'];
    if (isset($map[$l])) return $map[$l];
    return mb_substr($s, 0, 40) ?: 'other';
}

// ================================================================== vCard: reading

/** The cards of a text (.vcf): a list of contacts. */
function vcard_parse(string $text): array
{
    $text = text_utf8($text);
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    // folded lines (RFC 6350 3.2): a line that starts with a space or a tab goes on the one before
    $text = preg_replace('/\n[ \t]/', '', $text) ?? $text;
    // vCard 2.1 quoted-printable: a line of such a property ending in "=" goes on in the next one
    $lines = [];
    foreach (explode("\n", $text) as $line) {
        $n = count($lines);
        if ($n && substr($lines[$n - 1], -1) === '=' && preg_match('/^[^:]*QUOTED-PRINTABLE/i', $lines[$n - 1])) { $lines[$n - 1] = substr($lines[$n - 1], 0, -1) . $line; continue; }
        $lines[] = $line;
    }
    $out = [];
    $card = null;
    foreach ($lines as $line) {
        if (trim($line) === '') continue;
        if (preg_match('/^BEGIN:VCARD\s*$/i', $line)) { $card = []; continue; }
        if (preg_match('/^END:VCARD\s*$/i', $line)) { if ($card !== null) $out[] = vcard_card($card); $card = null; continue; }
        if ($card !== null) $card[] = $line;
    }
    return $out;
}

/** One line of a card: [group, NAME, params {NAME: [values]}, raw value]. */
function vcard_line(string $line): ?array
{
    // the name and the parameters end at the first ":" that is not inside quotes
    $n = strlen($line);
    $q = false;
    for ($i = 0; $i < $n; $i++) {
        $ch = $line[$i];
        if ($ch === '"') $q = !$q;
        elseif ($ch === ':' && !$q) break;
    }
    if ($i >= $n) return null;
    $head = substr($line, 0, $i);
    $value = substr($line, $i + 1);
    $parts = [];
    $cur = '';
    $q = false;
    for ($j = 0, $m = strlen($head); $j < $m; $j++) {
        $ch = $head[$j];
        if ($ch === '"') { $q = !$q; continue; }
        if ($ch === ';' && !$q) { $parts[] = $cur; $cur = ''; continue; }
        $cur .= $ch;
    }
    $parts[] = $cur;
    $name = array_shift($parts);
    $group = '';
    if (strpos($name, '.') !== false) [$group, $name] = explode('.', $name, 2);
    $params = [];
    foreach ($parts as $p) {
        if ($p === '') continue;
        if (strpos($p, '=') === false) { $params['TYPE'][] = $p; continue; } // vCard 2.1: ;HOME;CELL
        [$k, $v] = explode('=', $p, 2);
        $k = strtoupper(trim($k));
        foreach (explode(',', $v) as $x) $params[$k][] = trim($x);
    }
    return [strtolower($group), strtoupper(trim($name)), $params, $value];
}

/** A value as written in the card: quoted-printable and charsets undone (2.1), escapes undone later by the caller. */
function vcard_raw(array $params, string $value): string
{
    $enc = strtoupper($params['ENCODING'][0] ?? '');
    if ($enc === 'QUOTED-PRINTABLE') $value = quoted_printable_decode($value);
    $cs = $params['CHARSET'][0] ?? '';
    if ($cs !== '' && strtoupper($cs) !== 'UTF-8' && function_exists('mb_convert_encoding')) {
        $c = @mb_convert_encoding($value, 'UTF-8', $cs);
        if (is_string($c)) $value = $c;
    }
    return $value;
}

/** The components of a structured value (N, ADR, ORG), split at the ";" that are not escaped, each unescaped. */
function vcard_split(string $v, string $sep = ';'): array
{
    $out = [];
    $cur = '';
    for ($i = 0, $n = strlen($v); $i < $n; $i++) {
        $ch = $v[$i];
        if ($ch === '\\' && $i + 1 < $n) { $cur .= $ch . $v[++$i]; continue; }
        if ($ch === $sep) { $out[] = vcard_unescape($cur); $cur = ''; continue; }
        $cur .= $ch;
    }
    $out[] = vcard_unescape($cur);
    return $out;
}

function vcard_unescape(string $s): string
{
    return trim(strtr($s, ['\\n' => "\n", '\\N' => "\n", '\\,' => ',', '\\;' => ';', '\\:' => ':', '\\\\' => '\\']));
}

function vcard_card(array $lines): array
{
    $c = contact_blank();
    $labels = $labelLines = []; // Apple: item1.X-ABLabel gives the label of item1.TEL
    $rows = [];
    foreach ($lines as $l) {
        $x = vcard_line($l);
        if (!$x) continue;
        if ($x[1] === 'X-ABLABEL' && $x[0] !== '') { $labels[$x[0]] = label_word(vcard_unescape(vcard_raw($x[2], $x[3]))); $labelLines[$x[0]] = $l; continue; }
        if ($x[1] === 'X-ABADR') continue; // Apple's hint of the country of an address
        $rows[] = [$x, $l];
    }
    $fn = '';
    foreach ($rows as [$x, $raw]) {
        [$group, $name, $params, $value] = $x;
        $value = vcard_raw($params, $value);
        $types = array_merge($params['TYPE'] ?? [], array_map(fn($p) => 'pref', $params['PREF'] ?? []));
        $types = array_merge(...array_map(fn($t) => explode(',', $t), $types ?: ['']));
        $label = fn(string $kind) => $group !== '' && isset($labels[$group]) ? $labels[$group] : label_of($types, $kind);
        switch ($name) {
            case 'VERSION': case 'PRODID': case 'REV': case 'KIND': case 'X-ABSHOWAS': case 'SOURCE': case 'NAME': case 'PROFILE': case 'CLASS': case 'X-ABUID':
                break;
            case 'FN':
                $fn = vcard_unescape($value);
                break;
            case 'N':
                $p = vcard_split($value) + ['', '', '', '', ''];
                [$c['last'], $c['first'], $c['middle'], $c['prefix'], $c['suffix']] = array_map(fn($s) => str_replace(',', ' ', $s), array_slice($p, 0, 5));
                break;
            case 'NICKNAME':
                $c['nickname'] = implode(', ', vcard_split($value, ','));
                break;
            case 'ORG':
                $p = vcard_split($value) + ['', ''];
                $c['company'] = $p[0];
                $c['department'] = implode(', ', array_filter(array_slice($p, 1), 'strlen'));
                break;
            case 'TITLE':
                $c['title'] = vcard_unescape($value);
                break;
            case 'ROLE':
                if ($c['title'] === '') $c['title'] = vcard_unescape($value);
                else $c['other'][] = $raw;
                break;
            case 'BDAY':
                if (strtolower($params['VALUE'][0] ?? '') === 'text') { $c['other'][] = $raw; break; }
                $b = birthday_clean(vcard_unescape($value));
                if (!empty($params['X-APPLE-OMIT-YEAR']) && $b !== '' && $b[0] !== '-') $b = '--' . substr($b, 5);
                $c['birthday'] = $b;
                break;
            case 'EMAIL':
                $v = preg_replace('/^mailto:/i', '', vcard_unescape($value));
                if ($v !== '') $c['emails'][] = ['label' => $label('emails'), 'value' => $v];
                break;
            case 'TEL':
                $v = preg_replace('/^tel:/i', '', vcard_unescape($value));
                if ($v !== '') $c['phones'][] = ['label' => $label('phones'), 'value' => $v];
                break;
            case 'ADR':
                $p = vcard_split($value) + array_fill(0, 7, '');
                // post office box; extended address; street; locality; region; postal code; country
                $street = trim(implode("\n", array_filter([$p[2], $p[1], $p[0] !== '' ? $p[0] : ''], 'strlen')));
                $a = ['label' => $label('addresses'), 'street' => $street, 'city' => $p[3], 'region' => $p[4], 'code' => $p[5], 'country' => $p[6]];
                if (implode('', array_slice($a, 1)) !== '') $c['addresses'][] = $a;
                break;
            case 'URL':
                $v = vcard_unescape($value);
                if ($v !== '') $c['urls'][] = ['label' => $label('urls'), 'value' => $v];
                break;
            case 'NOTE':
                $c['notes'] = trim($c['notes'] . "\n" . vcard_unescape($value));
                break;
            case 'CATEGORIES':
                foreach (vcard_split($value, ',') as $g) if ($g !== '') $c['categories'][] = $g;
                break;
            case 'UID':
                $c['uid'] = mb_substr(preg_replace('/^urn:uuid:/i', '', vcard_unescape($value)) ?? '', 0, 190);
                break;
            case 'PHOTO':
                $bytes = null;
                $enc = strtoupper($params['ENCODING'][0] ?? '');
                if ($enc === 'B' || $enc === 'BASE64') $bytes = base64_decode(preg_replace('/\s+/', '', $value) ?? '', true);
                elseif (preg_match('/^data:image\/[a-z+.-]+;base64,(.*)$/is', trim($value), $m)) $bytes = base64_decode(preg_replace('/\s+/', '', $m[1]) ?? '', true);
                if (is_string($bytes) && $bytes !== '') $c['photo'] = $bytes;
                break;
            case 'X-SAVCONTACTS-FAVORITE': case 'X-FAVORITE':
                $c['favorite'] = in_array(strtolower(trim($value)), ['1', 'true', 'yes'], true);
                break;
            default:
                // kept as it came (anniversaries, related people, social profiles, phonetic names…), but not photos of
                // others nor the private fields of the program that wrote it
                if (strlen($raw) > 4000 || count($c['other']) >= 60) break;
                // a field of a group (item3.X-ABDATE + item3.X-ABLabel) keeps its label, with a group name of its own
                // ("o" before it), so it never meets the groups the app writes for its own labels
                if ($group !== '') {
                    $c['other'][] = 'o' . $raw;
                    if (isset($labelLines[$group])) { $c['other'][] = 'o' . $labelLines[$group]; unset($labelLines[$group]); }
                } else $c['other'][] = $raw;
        }
    }
    // a card with only FN (or a company written as FN): its name split in two
    if ($c['first'] === '' && $c['last'] === '' && $fn !== '' && $fn !== $c['company']) {
        $p = preg_split('/\s+/u', $fn) ?: [$fn];
        $c['last'] = count($p) > 1 ? (string)array_pop($p) : '';
        $c['first'] = implode(' ', $p);
    }
    $c['categories'] = array_values(array_unique($c['categories']));
    return $c;
}

// ================================================================== vCard: writing

function vcard_escape(string $s): string
{
    return strtr($s, ['\\' => '\\\\', "\n" => '\\n', "\r" => '', ',' => '\\,', ';' => '\\;']);
}

/** Lines of more than 75 bytes folded (without cutting a character in two), each ended by CRLF. */
function vcard_fold(string $line): string
{
    $out = '';
    while (strlen($line) > 75) {
        $cut = 75;
        while ($cut > 1 && (ord($line[$cut]) & 0xC0) === 0x80) $cut--;
        $out .= substr($line, 0, $cut) . "\r\n ";
        $line = substr($line, $cut);
    }
    return $out . $line . "\r\n";
}

/** The TYPE of a label, for a version of vCard; null when it is a word of a person (written with an Apple label instead). */
function vcard_type(string $label, string $kind, string $ver): ?string
{
    $map = ['home' => 'HOME', 'work' => 'WORK', 'other' => $ver === '4.0' ? '' : 'OTHER', 'school' => null, 'main' => $kind === 'phones' ? ($ver === '4.0' ? 'VOICE' : 'MAIN') : null,
        'mobile' => $kind === 'phones' ? 'CELL' : null, 'fax' => $kind === 'phones' ? 'FAX' : null, 'pager' => $kind === 'phones' ? 'PAGER' : null];
    if (!array_key_exists($label, $map)) return null;
    $t = $map[$label];
    if ($t === null) return null;
    if ($kind === 'emails' && $ver === '3.0') return 'INTERNET' . ($t !== '' ? ',' . $t : '');
    return $t;
}

function vcard_write(array $c, string $ver = '3.0'): string
{
    $ver = $ver === '4.0' ? '4.0' : '3.0';
    $e = 'vcard_escape';
    $L = ['BEGIN:VCARD', 'VERSION:' . $ver, 'PRODID:-//Illerom//SavContacts//EN'];
    if ($c['uid'] !== '') $L[] = 'UID:' . ($ver === '4.0' && preg_match('/^[0-9a-f-]{36}$/i', $c['uid']) ? 'urn:uuid:' : '') . $e($c['uid']);
    $fn = contact_display($c);
    $L[] = 'FN:' . $e($fn !== '' ? $fn : '?');
    $L[] = 'N:' . implode(';', array_map($e, [$c['last'], $c['first'], $c['middle'], $c['prefix'], $c['suffix']]));
    if ($c['nickname'] !== '') $L[] = 'NICKNAME:' . $e($c['nickname']);
    if ($c['company'] !== '' || $c['department'] !== '') $L[] = 'ORG:' . $e($c['company']) . ($c['department'] !== '' ? ';' . $e($c['department']) : '');
    if ($c['title'] !== '') $L[] = 'TITLE:' . $e($c['title']);
    if ($c['birthday'] !== '') {
        if ($c['birthday'][0] === '-') $L[] = $ver === '4.0' ? 'BDAY:--' . str_replace('-', '', substr($c['birthday'], 2)) : 'BDAY;X-APPLE-OMIT-YEAR=1604:1604' . substr($c['birthday'], 1);
        else $L[] = 'BDAY:' . ($ver === '4.0' ? str_replace('-', '', $c['birthday']) : $c['birthday']);
    }
    $item = 0;
    $field = function (string $name, string $kind, string $label, string $value) use (&$L, &$item, $ver, $e) {
        $t = vcard_type($label, $kind, $ver);
        if ($t !== null) { $L[] = $name . ($t !== '' ? ';TYPE=' . $t : '') . ':' . $value; return; }
        $item++;
        $L[] = "item$item.$name:" . $value;
        $L[] = "item$item.X-ABLabel:" . $e($label);
    };
    foreach ($c['emails'] as $x) $field('EMAIL', 'emails', $x['label'], $e($x['value']));
    foreach ($c['phones'] as $x) $field('TEL', 'phones', $x['label'], $e($x['value']));
    foreach ($c['addresses'] as $x) {
        $street = explode("\n", $x['street'], 2);
        $field('ADR', 'addresses', $x['label'], implode(';', ['', $e($street[1] ?? ''), $e($street[0]), $e($x['city']), $e($x['region']), $e($x['code']), $e($x['country'])]));
    }
    foreach ($c['urls'] as $x) $field('URL', 'urls', $x['label'], $x['value']);
    if ($c['notes'] !== '') $L[] = 'NOTE:' . $e($c['notes']);
    if ($c['categories']) $L[] = 'CATEGORIES:' . implode(',', array_map($e, $c['categories']));
    if (!empty($c['favorite'])) $L[] = 'X-SAVCONTACTS-FAVORITE:TRUE';
    if (!empty($c['photo'])) $L[] = $ver === '4.0' ? 'PHOTO:data:image/jpeg;base64,' . base64_encode($c['photo']) : 'PHOTO;ENCODING=b;TYPE=JPEG:' . base64_encode($c['photo']);
    if (!empty($c['rev'])) $L[] = 'REV:' . $c['rev'];
    foreach ($c['other'] as $o) if (is_string($o) && $o !== '' && !preg_match('/^(BEGIN|END|VERSION):/i', $o)) $L[] = $o;
    $L[] = 'END:VCARD';
    return implode('', array_map('vcard_fold', $L));
}

// ================================================================== CSV

/** Any text as UTF-8: UTF-16 with its mark (Outlook), UTF-8 with or without the mark, else Windows-1252 (old Excel). */
function text_utf8(string $s): string
{
    if (strncmp($s, "\xFF\xFE", 2) === 0) return (string)mb_convert_encoding(substr($s, 2), 'UTF-8', 'UTF-16LE');
    if (strncmp($s, "\xFE\xFF", 2) === 0) return (string)mb_convert_encoding(substr($s, 2), 'UTF-8', 'UTF-16BE');
    if (strncmp($s, "\xEF\xBB\xBF", 3) === 0) $s = substr($s, 3);
    if (!mb_check_encoding($s, 'UTF-8')) $s = (string)mb_convert_encoding($s, 'UTF-8', 'Windows-1252');
    return $s;
}

/** The rows of a CSV text (quotes, line breaks inside quotes); the separator is the one of the first line (comma, semicolon or tab). */
function csv_rows(string $text): array
{
    $text = text_utf8($text);
    $first = strtok($text, "\n") ?: '';
    $counts = [',' => substr_count($first, ','), ';' => substr_count($first, ';'), "\t" => substr_count($first, "\t")];
    arsort($counts);
    $sep = (string)array_key_first($counts);
    $rows = [];
    $row = [];
    $cell = '';
    $q = false;
    $n = strlen($text);
    for ($i = 0; $i < $n; $i++) {
        $ch = $text[$i];
        if ($q) {
            if ($ch === '"') { if ($i + 1 < $n && $text[$i + 1] === '"') { $cell .= '"'; $i++; } else $q = false; }
            else $cell .= $ch;
            continue;
        }
        if ($ch === '"') { $q = true; continue; }
        if ($ch === $sep) { $row[] = $cell; $cell = ''; continue; }
        if ($ch === "\r") continue;
        if ($ch === "\n") { $row[] = $cell; $rows[] = $row; $row = []; $cell = ''; continue; }
        $cell .= $ch;
    }
    if ($cell !== '' || $row) { $row[] = $cell; $rows[] = $row; }
    return array_values(array_filter($rows, fn($r) => implode('', $r) !== ''));
}

/** The columns of Outlook (English and Italian) and of Google, as what they hold. */
function csv_columns(): array
{
    $one = [
        'first' => ['first name', 'given name', 'nome'], 'middle' => ['middle name', 'additional name', 'secondo nome'], 'last' => ['last name', 'family name', 'cognome'],
        'prefix' => ['name prefix', 'title', 'titolo', 'prefisso'], 'suffix' => ['name suffix', 'suffix', 'suffisso'], 'nickname' => ['nickname', 'soprannome'],
        'company' => ['organization name', 'organization 1 - name', 'company', 'società', 'azienda'], 'department' => ['organization department', 'organization 1 - department', 'department', 'reparto'],
        'title' => ['organization title', 'organization 1 - title', 'job title', 'posizione', 'qualifica', 'ruolo'], 'birthday' => ['birthday', 'compleanno', 'data di nascita'],
        'notes' => ['notes', 'note'], 'categories' => ['labels', 'group membership', 'categories', 'categorie'], 'fullname' => ['name', 'display name', 'nome visualizzato'],
    ];
    // Outlook: one column per kind of phone, email and address
    $phones = ['mobile phone' => 'mobile', 'cellulare' => 'mobile', 'home phone' => 'home', 'home phone 2' => 'home', 'telefono abitazione' => 'home', 'telefono abitazione 2' => 'home',
        'business phone' => 'work', 'business phone 2' => 'work', 'telefono ufficio' => 'work', 'telefono ufficio 2' => 'work', 'other phone' => 'other', 'altro telefono' => 'other',
        'primary phone' => 'main', 'telefono principale' => 'main', 'business fax' => 'fax', 'home fax' => 'fax', 'fax ufficio' => 'fax', 'fax abitazione' => 'fax', 'pager' => 'pager', 'cercapersone' => 'pager',
        'company main phone' => 'work', 'car phone' => 'other', 'assistant\'s phone' => 'work'];
    $emails = ['e-mail address' => 'other', 'e-mail 2 address' => 'other', 'e-mail 3 address' => 'other', 'indirizzo posta elettronica' => 'other', 'indirizzo posta elettronica 2' => 'other', 'indirizzo posta elettronica 3' => 'other', 'email' => 'other'];
    $urls = ['web page' => 'other', 'pagina web' => 'other', 'personal web page' => 'home', 'business web page' => 'work'];
    $addr = [];
    foreach (['business' => 'work', 'home' => 'home', 'other' => 'other'] as $en => $lab) {
        foreach (['street' => 'street', 'city' => 'city', 'state' => 'region', 'postal code' => 'code', 'country/region' => 'country', 'country' => 'country'] as $p => $k) $addr["$en $p"] = [$lab, $k];
    }
    foreach (['ufficio' => 'work', 'abitazione' => 'home', 'altro' => 'other'] as $it => $lab) {
        foreach (['via' => 'street', 'città' => 'city', 'provincia' => 'region', 'cap' => 'code', 'paese/area geografica' => 'country', 'paese' => 'country'] as $p => $k) $addr["$p ($it)"] = [$lab, $k];
        foreach (['indirizzo' => 'street'] as $p => $k) $addr["$p ($it)"] = [$lab, $k];
    }
    return [$one, $phones, $emails, $urls, $addr];
}

/** The contacts of a CSV of Google or Outlook. */
function csv_parse(string $text): array
{
    $rows = csv_rows($text);
    if (count($rows) < 2) return [];
    $head = array_map(fn($h) => mb_strtolower(trim($h)), array_shift($rows));
    [$one, $phones, $emails, $urls, $addr] = csv_columns();
    $out = [];
    foreach ($rows as $r) {
        $c = contact_blank();
        $cells = [];
        foreach ($head as $i => $h) $cells[$h] = trim((string)($r[$i] ?? ''));
        $get = fn(array $names) => (function () use ($names, $cells) { foreach ($names as $n) if (($cells[$n] ?? '') !== '') return $cells[$n]; return ''; })();
        foreach (CONTACT_TEXT as $k) $c[$k] = $get($one[$k]);
        $c['notes'] = str_replace("\r", '', $get($one['notes']));
        $c['birthday'] = birthday_clean($get($one['birthday']));
        foreach (preg_split('/\s*(?::::|;)\s*/u', $get($one['categories'])) ?: [] as $g) {
            $g = trim($g);
            if ($g === '') continue;
            if (in_array(mb_strtolower($g), ['* starred', 'starred'], true)) { $c['favorite'] = true; continue; }
            if ($g[0] === '*' || in_array(mb_strtolower($g), ['mycontacts', 'my contacts'], true)) continue; // Google's own groups ("* myContacts")
            $c['categories'][] = $g;
        }
        // Google: "E-mail 1 - Label" / "E-mail 1 - Type" + "E-mail 1 - Value", values joined with " ::: "
        foreach (['emails' => 'e-mail', 'phones' => 'phone', 'urls' => 'website'] as $kind => $word) {
            for ($i = 1; $i <= 12; $i++) {
                $v = $cells["$word $i - value"] ?? '';
                if ($v === '') continue;
                $lab = $cells["$word $i - label"] ?? ($cells["$word $i - type"] ?? '');
                $labs = preg_split('/\s*:::\s*/u', $lab) ?: [''];
                foreach (preg_split('/\s*:::\s*/u', $v) ?: [] as $n => $x) if ($x !== '') $c[$kind][] = ['label' => label_word(ltrim($labs[$n] ?? $labs[0], '* ')) ?: 'other', 'value' => $x];
            }
        }
        for ($i = 1; $i <= 6; $i++) {
            $a = ['label' => label_word(ltrim($cells["address $i - label"] ?? ($cells["address $i - type"] ?? ''), '* ')) ?: 'other',
                'street' => trim(($cells["address $i - street"] ?? '') . (($cells["address $i - extended address"] ?? '') !== '' ? "\n" . $cells["address $i - extended address"] : '') . (($cells["address $i - po box"] ?? '') !== '' ? "\n" . $cells["address $i - po box"] : '')),
                'city' => $cells["address $i - city"] ?? '', 'region' => $cells["address $i - region"] ?? '', 'code' => $cells["address $i - postal code"] ?? '', 'country' => $cells["address $i - country"] ?? ''];
            if (implode('', array_slice($a, 1)) === '' && ($cells["address $i - formatted"] ?? '') !== '') $a['street'] = $cells["address $i - formatted"];
            if (implode('', array_slice($a, 1)) !== '') $c['addresses'][] = $a;
        }
        // Outlook: a column for each kind
        foreach ($phones as $h => $lab) if (($cells[$h] ?? '') !== '') $c['phones'][] = ['label' => $lab, 'value' => $cells[$h]];
        foreach ($emails as $h => $lab) if (($cells[$h] ?? '') !== '' && strpos($cells[$h], '@') !== false) $c['emails'][] = ['label' => $lab, 'value' => $cells[$h]];
        foreach ($urls as $h => $lab) if (($cells[$h] ?? '') !== '') $c['urls'][] = ['label' => $lab, 'value' => $cells[$h]];
        $ad = [];
        foreach ($addr as $h => [$lab, $k]) if (($cells[$h] ?? '') !== '') $ad[$lab][$k] = $cells[$h];
        foreach ($ad as $lab => $parts) $c['addresses'][] = ['label' => $lab] + array_merge(array_fill_keys(ADDRESS_PARTS, ''), $parts);
        // only a full name (Google's "Name", or a list made by hand)
        if ($c['first'] === '' && $c['last'] === '' && ($fn = $get($one['fullname'])) !== '') {
            $p = preg_split('/\s+/u', $fn) ?: [$fn];
            $c['last'] = count($p) > 1 ? (string)array_pop($p) : '';
            $c['first'] = implode(' ', $p);
        }
        foreach (CONTACT_LISTS as $k) $c[$k] = array_values(array_unique($c[$k], SORT_REGULAR));
        if (contact_display($c) !== '') $out[] = $c;
    }
    return $out;
}

/** A cell of a CSV, safe for spreadsheets (a value starting with = + - @ is not run as a formula). */
function csv_cell(string $s): string
{
    if ($s !== '' && strpbrk($s[0], '=+-@') !== false && !preg_match('/^\+?[\d\s().-]+$/', $s)) $s = "'" . $s;
    return preg_match('/[",\n\r;]/', $s) ? '"' . str_replace('"', '""', $s) . '"' : $s;
}

/** The contacts as a CSV that Google Contacts ('google') or Outlook ('outlook') imports. */
function csv_write(array $contacts, string $flavour = 'google'): string
{
    $rows = [];
    if ($flavour === 'outlook') {
        $head = ['First Name', 'Middle Name', 'Last Name', 'Title', 'Suffix', 'Nickname', 'Company', 'Department', 'Job Title', 'Business Street', 'Business City', 'Business State', 'Business Postal Code', 'Business Country/Region',
            'Home Street', 'Home City', 'Home State', 'Home Postal Code', 'Home Country/Region', 'Other Street', 'Other City', 'Other State', 'Other Postal Code', 'Other Country/Region',
            'Business Phone', 'Business Phone 2', 'Home Phone', 'Home Phone 2', 'Mobile Phone', 'Other Phone', 'Business Fax', 'Pager', 'E-mail Address', 'E-mail 2 Address', 'E-mail 3 Address', 'Birthday', 'Notes', 'Web Page', 'Categories'];
        $rows[] = $head;
        foreach ($contacts as $c) {
            $r = array_fill_keys($head, '');
            [$r['First Name'], $r['Middle Name'], $r['Last Name'], $r['Title'], $r['Suffix'], $r['Nickname'], $r['Company'], $r['Department'], $r['Job Title']] = [$c['first'], $c['middle'], $c['last'], $c['prefix'], $c['suffix'], $c['nickname'], $c['company'], $c['department'], $c['title']];
            foreach (['work' => 'Business', 'home' => 'Home', 'other' => 'Other'] as $lab => $w) {
                foreach ($c['addresses'] as $a) {
                    if (($a['label'] === $lab || ($lab === 'other' && !in_array($a['label'], ['work', 'home'], true))) && $r["$w Street"] === '') {
                        [$r["$w Street"], $r["$w City"], $r["$w State"], $r["$w Postal Code"], $r["$w Country/Region"]] = [$a['street'], $a['city'], $a['region'], $a['code'], $a['country']];
                    }
                }
            }
            $slots = ['work' => ['Business Phone', 'Business Phone 2'], 'home' => ['Home Phone', 'Home Phone 2'], 'mobile' => ['Mobile Phone'], 'fax' => ['Business Fax'], 'pager' => ['Pager'], 'other' => ['Other Phone']];
            foreach ($c['phones'] as $p) {
                foreach ($slots[$p['label']] ?? $slots['other'] as $s) if ($r[$s] === '') { $r[$s] = $p['value']; continue 2; }
                foreach (array_merge(...array_values($slots)) as $s) if ($r[$s] === '') { $r[$s] = $p['value']; break; }
            }
            foreach (array_slice($c['emails'], 0, 3) as $i => $m) $r[['E-mail Address', 'E-mail 2 Address', 'E-mail 3 Address'][$i]] = $m['value'];
            if ($c['birthday'] !== '' && $c['birthday'][0] !== '-') $r['Birthday'] = (int)substr($c['birthday'], 5, 2) . '/' . (int)substr($c['birthday'], 8, 2) . '/' . substr($c['birthday'], 0, 4);
            $r['Notes'] = $c['notes'];
            $r['Web Page'] = $c['urls'][0]['value'] ?? '';
            $r['Categories'] = implode(';', $c['categories']);
            $rows[] = array_values($r);
        }
    } else {
        $max = fn(string $k) => max(1, ...array_map(fn($c) => count($c[$k]), $contacts ?: [contact_blank()]));
        [$ne, $np, $na, $nu] = [$max('emails'), $max('phones'), $max('addresses'), $max('urls')];
        $head = ['First Name', 'Middle Name', 'Last Name', 'Name Prefix', 'Name Suffix', 'Nickname', 'Organization Name', 'Organization Title', 'Organization Department', 'Birthday', 'Notes', 'Labels'];
        for ($i = 1; $i <= $ne; $i++) array_push($head, "E-mail $i - Label", "E-mail $i - Value");
        for ($i = 1; $i <= $np; $i++) array_push($head, "Phone $i - Label", "Phone $i - Value");
        for ($i = 1; $i <= $na; $i++) array_push($head, "Address $i - Label", "Address $i - Street", "Address $i - City", "Address $i - Region", "Address $i - Postal Code", "Address $i - Country");
        for ($i = 1; $i <= $nu; $i++) array_push($head, "Website $i - Label", "Website $i - Value");
        $rows[] = $head;
        $glabel = fn(string $l) => ['home' => 'Home', 'work' => 'Work', 'mobile' => 'Mobile', 'main' => 'Main', 'fax' => 'Work Fax', 'pager' => 'Pager', 'school' => 'School', 'other' => 'Other'][$l] ?? $l;
        foreach ($contacts as $c) {
            $b = $c['birthday'];
            $labels = array_merge($c['categories'], ['* myContacts'], !empty($c['favorite']) ? ['* starred'] : []);
            $r = [$c['first'], $c['middle'], $c['last'], $c['prefix'], $c['suffix'], $c['nickname'], $c['company'], $c['title'], $c['department'], $b, $c['notes'], implode(' ::: ', $labels)];
            for ($i = 0; $i < $ne; $i++) array_push($r, isset($c['emails'][$i]) ? $glabel($c['emails'][$i]['label']) : '', $c['emails'][$i]['value'] ?? '');
            for ($i = 0; $i < $np; $i++) array_push($r, isset($c['phones'][$i]) ? $glabel($c['phones'][$i]['label']) : '', $c['phones'][$i]['value'] ?? '');
            for ($i = 0; $i < $na; $i++) { $a = $c['addresses'][$i] ?? null; array_push($r, $a ? $glabel($a['label']) : '', $a['street'] ?? '', $a['city'] ?? '', $a['region'] ?? '', $a['code'] ?? '', $a['country'] ?? ''); }
            for ($i = 0; $i < $nu; $i++) array_push($r, isset($c['urls'][$i]) ? $glabel($c['urls'][$i]['label']) : '', $c['urls'][$i]['value'] ?? '');
            $rows[] = $r;
        }
    }
    return "\xEF\xBB\xBF" . implode("\r\n", array_map(fn($r) => implode(',', array_map(fn($x) => csv_cell((string)$x), $r)), $rows)) . "\r\n";
}

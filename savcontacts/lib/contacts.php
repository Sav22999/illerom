<?php
/**
 * SavContacts — the contacts and their groups of an account: checking what the app sends, keeping it, finding it again
 * (the search the other apps of SavOffice use too), the duplicates and their merge, the files (lib/vcard.php).
 */

declare(strict_types=1);

require_once __DIR__ . '/vcard.php';

const PREF_KEYS = ['theme', 'sort', 'show', 'view'];
const GROUP_COLORS = ['#4338ca', '#0b7a87', '#1a7f37', '#b7791f', '#c4362f', '#c2307a', '#6a2cf0', '#0a78c2', '#4a5875', '#8f6500'];

function profile(array $u): array
{
    $st = q('SELECT * FROM ' . t('con_profiles') . ' WHERE user_id = ?', [$u['id']]);
    $p = $st->fetch();
    if ($p) return $p;
    q('INSERT IGNORE INTO ' . t('con_profiles') . ' (user_id, prefs, created_at) VALUES (?, ?, ?)', [$u['id'], '{}', now_utc()]);
    return ['user_id' => $u['id'], 'prefs' => '{}', 'created_at' => now_utc()];
}

function profile_prefs(array $p): array
{
    $d = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($d) ? array_intersect_key($d, array_flip(PREF_KEYS)) : [];
}

function jdec(?string $s): array
{
    $d = json_decode((string)$s, true);
    return is_array($d) ? $d : [];
}

/** A new public code (10 letters and digits) that no row of $table has yet. */
function new_code(string $table, string $col): string
{
    $abc = 'abcdefghijkmnopqrstuvwxyz23456789';
    for ($i = 0; $i < 20; $i++) {
        $c = '';
        for ($j = 0; $j < 10; $j++) $c .= $abc[random_int(0, strlen($abc) - 1)];
        if (!q('SELECT 1 FROM ' . t($table) . " WHERE `$col` = ?", [$c])->fetchColumn()) return $c;
    }
    throw new RuntimeException('no code');
}

function valid_code($v): string
{
    return is_string($v) && preg_match('/^[a-z0-9]{10}$/', $v) ? $v : '';
}

function uuid4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

/** Words without accents and in lowercase, to find "Lucrezia" also when written "lucrèzia". */
function fold_text(string $s): string
{
    $s = mb_strtolower($s);
    if (class_exists('Normalizer')) $s = preg_replace('/\p{Mn}+/u', '', (string)Normalizer::normalize($s, Normalizer::FORM_D)) ?? $s;
    else $s = strtr($s, ['à' => 'a', 'á' => 'a', 'â' => 'a', 'ä' => 'a', 'è' => 'e', 'é' => 'e', 'ê' => 'e', 'ë' => 'e', 'ì' => 'i', 'í' => 'i', 'î' => 'i', 'ï' => 'i', 'ò' => 'o', 'ó' => 'o', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'ú' => 'u', 'û' => 'u', 'ü' => 'u', 'ç' => 'c', 'ñ' => 'n']);
    return $s;
}

/** The digits of a phone number, without the country code of Italy, to recognise the same number written in two ways. */
function phone_key(string $s): string
{
    $d = preg_replace('/\D+/', '', $s) ?? '';
    if (strpos($d, '0039') === 0) $d = substr($d, 4);
    elseif (strpos($d, '39') === 0 && strlen($d) >= 11 && strpos(ltrim($s), '+') === 0) $d = substr($d, 2);
    return strlen($d) >= 6 ? substr($d, -10) : '';
}

function search_text(array $c): string
{
    $w = [contact_display($c), $c['first'], $c['last'], $c['nickname'], $c['company'], $c['department'], $c['title']];
    foreach ($c['emails'] as $e) $w[] = $e['value'];
    foreach ($c['phones'] as $p) { $w[] = $p['value']; $w[] = preg_replace('/\D+/', '', $p['value']); }
    foreach ($c['addresses'] as $a) $w[] = $a['city'];
    return mb_substr(fold_text(implode(' ', array_filter($w, 'strlen'))), 0, 4000);
}

// ---------------------------------------------------------------- checking what is sent

function clean_str($v, int $max): string
{
    if (!is_string($v) && !is_numeric($v)) return '';
    $v = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', (string)$v) ?? '');
    return mb_substr(preg_replace('/\s+/u', ' ', $v) ?? '', 0, $max);
}

function clean_multi($v, int $max): string
{
    if (!is_string($v)) return '';
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    return mb_substr(trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? ''), 0, $max);
}

function clean_label($v): string
{
    $l = label_word(clean_str($v, 40));
    return $l === '' ? 'other' : $l;
}

/** A list of {label, value} (emails, phones, websites): empty values left out, at most MAX_FIELDS. */
function clean_list($list, string $kind): array
{
    $out = [];
    if (!is_array($list)) return [];
    foreach ($list as $x) {
        if (!is_array($x)) continue;
        $v = clean_str($x['value'] ?? '', $kind === 'urls' ? 500 : 190);
        if ($v === '') continue;
        if ($kind === 'emails') $v = preg_replace('/^mailto:/i', '', $v);
        if ($kind === 'urls' && !preg_match('#^[a-z][a-z0-9+.-]*:#i', $v)) $v = 'https://' . $v;
        if ($kind === 'urls' && preg_match('#^(javascript|data|vbscript):#i', $v)) continue;
        $out[] = ['label' => clean_label($x['label'] ?? 'other'), 'value' => $v];
        if (count($out) >= MAX_FIELDS) break;
    }
    return $out;
}

function clean_addresses($list): array
{
    $out = [];
    if (!is_array($list)) return [];
    foreach ($list as $x) {
        if (!is_array($x)) continue;
        $a = ['label' => clean_label($x['label'] ?? 'home'), 'street' => clean_multi($x['street'] ?? '', 300)];
        foreach (['city', 'region', 'code', 'country'] as $k) $a[$k] = clean_str($x[$k] ?? '', 100);
        if (implode('', array_slice($a, 1)) === '') continue;
        $out[] = $a;
        if (count($out) >= MAX_FIELDS) break;
    }
    return $out;
}

/** A contact as the app (or a file) sends it, checked: the shape of lib/vcard.php plus groups (gids of this account). */
function clean_contact(array $b, array $gids): array
{
    $c = contact_blank();
    $max = ['prefix' => 40, 'first' => 100, 'middle' => 100, 'last' => 100, 'suffix' => 40, 'nickname' => 100, 'company' => 160, 'department' => 160, 'title' => 160];
    foreach (CONTACT_TEXT as $k) $c[$k] = clean_str($b[$k] ?? '', $max[$k]);
    $c['birthday'] = birthday_clean(clean_str($b['birthday'] ?? '', 10));
    $c['notes'] = clean_multi($b['notes'] ?? '', 5000);
    $c['emails'] = clean_list($b['emails'] ?? [], 'emails');
    $c['phones'] = clean_list($b['phones'] ?? [], 'phones');
    $c['urls'] = clean_list($b['urls'] ?? [], 'urls');
    $c['addresses'] = clean_addresses($b['addresses'] ?? []);
    $c['favorite'] = !empty($b['favorite']);
    $c['groups'] = array_values(array_intersect(array_map('strval', is_array($b['groups'] ?? null) ? $b['groups'] : []), $gids));
    return $c;
}

/** The photo as it is kept: a JPEG of 512 px at most, re-drawn (its metadata, the place where it was taken, go away). */
function photo_clean(string $bytes): ?string
{
    if ($bytes === '' || strlen($bytes) > 12 * 1048576) return null;
    $info = @getimagesizefromstring($bytes);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP], true)) return null;
    if (!function_exists('imagecreatefromstring')) return $info[2] === IMAGETYPE_JPEG && strlen($bytes) <= MAX_PHOTO_BYTES ? $bytes : null;
    if ($info[0] * $info[1] > 40000000) return null; // a picture too large to open safely
    $im = @imagecreatefromstring($bytes);
    if (!$im) return null;
    $w = imagesx($im); $h = imagesy($im);
    $side = min($w, $h); // square, from the middle: a contact's picture is round in the app
    $size = min(512, $side);
    $out = imagecreatetruecolor($size, $size);
    imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
    imagecopyresampled($out, $im, 0, 0, intdiv($w - $side, 2), intdiv($h - $side, 2), $size, $size, $side, $side);
    ob_start();
    imagejpeg($out, null, 84);
    $jpg = (string)ob_get_clean();
    imagedestroy($im);
    imagedestroy($out);
    return $jpg !== '' && strlen($jpg) <= MAX_PHOTO_BYTES ? $jpg : null;
}

// ---------------------------------------------------------------- rows

function groups_of(int $uid): array
{
    return q('SELECT gid, name, color, position FROM ' . t('con_groups') . ' WHERE user_id = ? ORDER BY position, id', [$uid])->fetchAll();
}

function group_ids(int $uid): array
{
    return array_map(fn($g) => $g['gid'], groups_of($uid));
}

const CONTACT_COLS = 'id, cid, uid, prefix, first, middle, last, suffix, nickname, company, department, title, birthday, emails, phones, addresses, urls, `groups`, notes, favorite, photo_rev, rev, created_at, updated_at, deleted_at, (other IS NOT NULL AND other <> \'[]\') AS has_other';

/** A row as lib/vcard.php reads it (with the names of its groups as categories). */
function row_contact(array $r, array $groupNames = []): array
{
    $c = contact_blank();
    foreach (CONTACT_TEXT as $k) $c[$k] = (string)$r[$k];
    $c['birthday'] = (string)$r['birthday'];
    $c['notes'] = (string)$r['notes'];
    foreach (CONTACT_LISTS as $k) $c[$k] = jdec($r[$k]);
    $c['groups'] = jdec($r['groups']);
    $c['categories'] = array_values(array_filter(array_map(fn($g) => $groupNames[$g] ?? null, $c['groups'])));
    $c['favorite'] = (bool)$r['favorite'];
    $c['uid'] = (string)$r['uid'];
    $c['other'] = array_key_exists('other', $r) ? jdec($r['other']) : [];
    $c['photo'] = $r['photo'] ?? null;
    $c['rev'] = gmdate('Ymd\THis\Z', strtotime($r['updated_at'] . ' UTC'));
    return $c;
}

/** A contact as the app shows it. */
function contact_api(array $r): array
{
    $c = row_contact($r);
    $out = ['id' => $r['cid']];
    foreach (CONTACT_TEXT as $k) $out[$k] = $c[$k];
    return $out + [
        'birthday' => $c['birthday'], 'notes' => $c['notes'], 'emails' => $c['emails'], 'phones' => $c['phones'], 'addresses' => $c['addresses'], 'urls' => $c['urls'],
        'groups' => $c['groups'], 'favorite' => $c['favorite'], 'photo' => (int)$r['photo_rev'] ?: null, 'extra' => !empty($r['has_other']),
        'created' => iso($r['created_at']), 'updated' => iso($r['updated_at']), 'deleted' => iso($r['deleted_at']),
    ];
}

function contacts_of(int $uid, bool $trash = false): array
{
    return q('SELECT ' . CONTACT_COLS . ' FROM ' . t('con_contacts') . ' WHERE user_id = ? AND deleted_at IS ' . ($trash ? 'NOT ' : '') . 'NULL', [$uid])->fetchAll();
}

function contact_row(int $uid, string $cid, bool $full = false): ?array
{
    $r = q('SELECT ' . ($full ? '*' : CONTACT_COLS) . ' FROM ' . t('con_contacts') . ' WHERE user_id = ? AND cid = ?', [$uid, $cid])->fetch();
    return $r ?: null;
}

/** Keeps a contact (new, or over the row $old): $photo false = leave it as it is, null = take it away, bytes = the new one. */
function store_contact(int $uid, array $c, ?array $old = null, $photo = false, ?array $other = null): string
{
    $vals = [];
    foreach (CONTACT_TEXT as $k) $vals[$k] = $c[$k];
    $vals['birthday'] = $c['birthday'];
    foreach (CONTACT_LISTS as $k) $vals[$k] = json_out(array_values($c[$k]));
    $vals['groups'] = json_out(array_values($c['groups'] ?? []));
    $vals['notes'] = $c['notes'];
    $vals['favorite'] = $c['favorite'] ? 1 : 0;
    $vals['search'] = search_text($c);
    if ($other !== null) $vals['other'] = $other ? json_out(array_values($other)) : null;
    if ($photo !== false) {
        $vals['photo'] = $photo;
        $vals['photo_rev'] = $photo === null ? 0 : (int)($old['photo_rev'] ?? 0) + 1 + random_int(0, 999) * 1000;
    }
    $vals['updated_at'] = now_utc();
    if ($old) {
        $set = implode(', ', array_map(fn($k) => "`$k` = ?", array_keys($vals)));
        q('UPDATE ' . t('con_contacts') . " SET $set, rev = rev + 1 WHERE id = ?", [...array_values($vals), $old['id']]);
        return $old['cid'];
    }
    $vals['cid'] = new_code('con_contacts', 'cid');
    $vals['user_id'] = $uid;
    $vals['uid'] = ($c['uid'] ?? '') !== '' ? $c['uid'] : uuid4();
    $vals['created_at'] = now_utc();
    $cols = implode(', ', array_map(fn($k) => "`$k`", array_keys($vals)));
    q('INSERT INTO ' . t('con_contacts') . " ($cols) VALUES (" . implode(',', array_fill(0, count($vals), '?')) . ')', array_values($vals));
    return $vals['cid'];
}

function count_contacts(int $uid): int
{
    return (int)q('SELECT COUNT(*) FROM ' . t('con_contacts') . ' WHERE user_id = ?', [$uid])->fetchColumn();
}

/** What an account keeps here, in bytes (it counts in its space of SavOffice). */
function con_bytes(int $uid): int
{
    return (int)q('SELECT COALESCE(SUM(LENGTH(cid) + LENGTH(first) + LENGTH(last) + LENGTH(company) + LENGTH(title) + COALESCE(LENGTH(emails), 0) + COALESCE(LENGTH(phones), 0)
        + COALESCE(LENGTH(addresses), 0) + COALESCE(LENGTH(urls), 0) + COALESCE(LENGTH(notes), 0) + COALESCE(LENGTH(other), 0) + COALESCE(LENGTH(photo), 0) + 200), 0) FROM ' . t('con_contacts') . ' WHERE user_id = ?', [$uid])->fetchColumn();
}

// ---------------------------------------------------------------- groups

/** The group of this name (any case), made when there is none: for the categories of the files. */
function group_by_name(int $uid, string $name, array &$cache): ?string
{
    $name = clean_str($name, 60);
    if ($name === '') return null;
    $k = mb_strtolower($name);
    if (!$cache) foreach (groups_of($uid) as $g) $cache[mb_strtolower($g['name'])] = $g['gid'];
    if (isset($cache[$k])) return $cache[$k];
    if (count($cache) >= MAX_GROUPS) return null;
    $gid = new_code('con_groups', 'gid');
    q('INSERT INTO ' . t('con_groups') . ' (gid, user_id, name, color, position, created_at) VALUES (?,?,?,?,?,?)', [$gid, $uid, $name, GROUP_COLORS[count($cache) % count(GROUP_COLORS)], count($cache), now_utc()]);
    return $cache[$k] = $gid;
}

// ---------------------------------------------------------------- files in

/**
 * Contacts read from a file become contacts of the account: one with the same UID as a contact already here takes its
 * place (a card exported and imported again does not make a copy); their categories become groups.
 * Returns [added, updated, skipped].
 */
function import_contacts(array $u, array $list): array
{
    $uid = (int)$u['id'];
    $cache = [];
    $added = $updated = $skipped = 0;
    $have = count_contacts($uid);
    $byUid = [];
    foreach (q('SELECT id, cid, uid, `groups`, favorite, photo_rev FROM ' . t('con_contacts') . ' WHERE user_id = ?', [$uid])->fetchAll() as $r) $byUid[$r['uid']] = $r;
    db()->beginTransaction();
    foreach ($list as $x) {
        if (!is_array($x)) { $skipped++; continue; }
        $gids = [];
        foreach ((array)($x['categories'] ?? []) as $name) if (is_string($name) && ($g = group_by_name($uid, $name, $cache))) $gids[] = $g;
        $c = clean_contact($x, array_merge(array_values($cache), $gids));
        $c['groups'] = array_values(array_unique(array_merge($c['groups'], $gids)));
        if (contact_display($c) === '') { $skipped++; continue; }
        $c['uid'] = clean_str($x['uid'] ?? '', 190);
        $other = array_values(array_filter(array_map(fn($o) => is_string($o) ? mb_substr($o, 0, 4000) : null, (array)($x['other'] ?? [])), 'is_string'));
        $photo = !empty($x['photo']) && is_string($x['photo']) ? photo_clean($x['photo']) : null;
        $old = $c['uid'] !== '' ? ($byUid[$c['uid']] ?? null) : null;
        if ($old) {
            $c['groups'] = array_values(array_unique(array_merge(jdec($old['groups']), $c['groups'])));
            $c['favorite'] = $c['favorite'] || $old['favorite'];
            store_contact($uid, $c, $old + ['cid' => $old['cid']], $photo !== null ? $photo : false, $other);
            q('UPDATE ' . t('con_contacts') . ' SET deleted_at = NULL WHERE id = ?', [$old['id']]);
            $updated++;
            continue;
        }
        if ($have >= MAX_CONTACTS) { $skipped++; continue; }
        $cid = store_contact($uid, $c, null, $photo, $other);
        if ($c['uid'] !== '') $byUid[$c['uid']] = ['id' => (int)db()->lastInsertId(), 'cid' => $cid, 'uid' => $c['uid'], 'groups' => json_out($c['groups']), 'favorite' => $c['favorite'], 'photo_rev' => 0];
        $have++;
        $added++;
    }
    db()->commit();
    return [$added, $updated, $skipped];
}

/** The contacts of a .savcon file, in the shape of lib/vcard.php (groups by name, the photo as bytes). */
function savcon_contacts(array $d): array
{
    if (($d['format'] ?? '') !== 'savcon' || !is_array($d['contacts'] ?? null)) return [];
    $names = [];
    foreach ((array)($d['groups'] ?? []) as $g) if (is_array($g) && isset($g['id'], $g['name'])) $names[(string)$g['id']] = (string)$g['name'];
    $out = [];
    foreach ($d['contacts'] as $c) {
        if (!is_array($c)) continue;
        $c['categories'] = array_values(array_filter(array_map(fn($g) => $names[(string)$g] ?? null, (array)($c['groups'] ?? []))));
        $c['groups'] = [];
        $c['photo'] = is_string($c['photo'] ?? null) && $c['photo'] !== '' ? base64_decode($c['photo'], true) : null;
        $out[] = $c;
    }
    return $out;
}

// ---------------------------------------------------------------- files out

/** The contacts to write in a file: all of them, some (cids), or one group; with their photos. */
function export_rows(int $uid, array $cids = [], string $group = ''): array
{
    $rows = q('SELECT * FROM ' . t('con_contacts') . ' WHERE user_id = ? AND deleted_at IS NULL ORDER BY last, first', [$uid])->fetchAll();
    if ($cids) $rows = array_values(array_filter($rows, fn($r) => in_array($r['cid'], $cids, true)));
    if ($group !== '') $rows = array_values(array_filter($rows, fn($r) => in_array($group, jdec($r['groups']), true)));
    return $rows;
}

function savcon_of(int $uid, array $rows): array
{
    $groups = groups_of($uid);
    $used = [];
    $contacts = [];
    foreach ($rows as $r) {
        $c = row_contact($r);
        foreach ($c['groups'] as $g) $used[$g] = true;
        $x = ['uid' => $c['uid']];
        foreach (CONTACT_TEXT as $k) $x[$k] = $c[$k];
        $x += ['birthday' => $c['birthday'], 'notes' => $c['notes'], 'emails' => $c['emails'], 'phones' => $c['phones'], 'addresses' => $c['addresses'], 'urls' => $c['urls'],
            'groups' => $c['groups'], 'favorite' => $c['favorite'], 'other' => $c['other'], 'photo' => $c['photo'] ? base64_encode($c['photo']) : null];
        $contacts[] = $x;
    }
    return ['format' => 'savcon', 'version' => 1, 'app' => 'SavContacts', 'exported' => gmdate('c'),
        'groups' => array_values(array_map(fn($g) => ['id' => $g['gid'], 'name' => $g['name'], 'color' => $g['color']], array_filter($groups, fn($g) => isset($used[$g['gid']])))), 'contacts' => $contacts];
}

// ---------------------------------------------------------------- duplicates

/**
 * Contacts that are probably the same person: the same email, the same phone number (written in any way) or the same
 * full name (accents and case aside). Returns groups of cids, two or more each, the biggest first.
 */
function duplicates_of(int $uid): array
{
    $rows = contacts_of($uid);
    $parent = [];
    $find = function ($x) use (&$parent, &$find) { while ($parent[$x] !== $x) { $parent[$x] = $parent[$parent[$x]]; $x = $parent[$x]; } return $x; };
    $keys = [];
    foreach ($rows as $r) {
        $parent[$r['cid']] = $r['cid'];
        $c = row_contact($r);
        $name = fold_text(trim($c['first'] . ' ' . $c['last']));
        if (mb_strlen($name) >= 3) $keys['n:' . preg_replace('/\s+/u', ' ', $name)][] = $r['cid'];
        foreach ($c['emails'] as $e) $keys['e:' . mb_strtolower($e['value'])][] = $r['cid'];
        foreach ($c['phones'] as $p) if (($k = phone_key($p['value'])) !== '') $keys['p:' . $k][] = $r['cid'];
    }
    foreach ($keys as $list) {
        $list = array_values(array_unique($list));
        for ($i = 1, $n = count($list); $i < $n; $i++) $parent[$find($list[$i])] = $find($list[0]);
    }
    $sets = [];
    foreach (array_keys($parent) as $cid) $sets[$find($cid)][] = $cid;
    $sets = array_values(array_filter($sets, fn($s) => count($s) > 1));
    usort($sets, fn($a, $b) => count($b) <=> count($a));
    return array_slice($sets, 0, 300);
}

/** Several contacts become the first one: what it lacks comes from the others, the lists are joined; the others go to the trash. */
function merge_contacts(array $u, array $cids): string
{
    $uid = (int)$u['id'];
    $rows = [];
    foreach ($cids as $cid) if (($r = contact_row($uid, $cid, true)) && !$r['deleted_at']) $rows[] = $r;
    if (count($rows) < 2) fail('merge_two', 422);
    $keep = row_contact($rows[0]);
    $photo = $rows[0]['photo'];
    $other = $keep['other'];
    foreach (array_slice($rows, 1) as $r) {
        $c = row_contact($r);
        foreach (CONTACT_TEXT as $k) if ($keep[$k] === '' && $c[$k] !== '') $keep[$k] = $c[$k];
        if ($keep['birthday'] === '' || ($keep['birthday'][0] === '-' && $c['birthday'] !== '' && $c['birthday'][0] !== '-' && substr($c['birthday'], 4) === substr($keep['birthday'], 1))) $keep['birthday'] = $c['birthday'] ?: $keep['birthday'];
        if ($c['notes'] !== '' && strpos($keep['notes'], $c['notes']) === false) $keep['notes'] = trim($keep['notes'] . "\n\n" . $c['notes']);
        foreach (CONTACT_LISTS as $k) {
            foreach ($c[$k] as $x) {
                $same = false;
                foreach ($keep[$k] as $y) {
                    if ($k === 'phones') $same = $same || (phone_key($x['value']) !== '' && phone_key($x['value']) === phone_key($y['value']));
                    elseif ($k === 'addresses') $same = $same || fold_text($x['street'] . $x['city']) === fold_text($y['street'] . $y['city']);
                    else $same = $same || mb_strtolower($x['value']) === mb_strtolower($y['value']);
                }
                if (!$same && count($keep[$k]) < MAX_FIELDS) $keep[$k][] = $x;
            }
        }
        $keep['groups'] = array_values(array_unique(array_merge($keep['groups'], $c['groups'])));
        $keep['favorite'] = $keep['favorite'] || $c['favorite'];
        if (!$photo && $r['photo']) $photo = $r['photo'];
        foreach ($c['other'] as $o) if (!in_array($o, $other, true) && count($other) < 60) $other[] = $o;
    }
    db()->beginTransaction();
    store_contact($uid, $keep, $rows[0], $photo ?: null, $other);
    $now = now_utc();
    foreach (array_slice($rows, 1) as $r) q('UPDATE ' . t('con_contacts') . ' SET deleted_at = ?, updated_at = ? WHERE id = ?', [$now, $now, $r['id']]);
    db()->commit();
    return $rows[0]['cid'];
}

// ---------------------------------------------------------------- for the other apps of SavOffice

/**
 * The contacts that match the words of $text (name, company, email, phone, city), best first: the ones whose name starts
 * with them, the favourites, then the others. $need: 'email' or 'phone' keeps only the ones that have one.
 */
function search_contacts(int $uid, string $text, int $limit = 10, string $group = '', string $need = ''): array
{
    $words = array_values(array_filter(preg_split('/\s+/u', fold_text(trim($text))) ?: [], 'strlen'));
    $sql = 'SELECT ' . CONTACT_COLS . ', search FROM ' . t('con_contacts') . ' WHERE user_id = ? AND deleted_at IS NULL';
    $args = [$uid];
    foreach (array_slice($words, 0, 6) as $w) { $sql .= ' AND search LIKE ?'; $args[] = '%' . addcslashes($w, '%_\\') . '%'; }
    if ($need === 'email') $sql .= " AND emails IS NOT NULL AND emails <> '[]'";
    if ($need === 'phone') $sql .= " AND phones IS NOT NULL AND phones <> '[]'";
    $sql .= ' ORDER BY favorite DESC, updated_at DESC LIMIT 500';
    $rows = q($sql, $args)->fetchAll();
    if ($group !== '') $rows = array_values(array_filter($rows, fn($r) => in_array($group, jdec($r['groups']), true)));
    $first = $words[0] ?? '';
    $score = function ($r) use ($first) {
        $name = fold_text(contact_display(row_contact($r)));
        $s = (int)$r['favorite'] * 2;
        if ($first !== '' && strpos($name, $first) === 0) $s += 6;
        elseif ($first !== '' && preg_match('/\b' . preg_quote($first, '/') . '/u', $name)) $s += 4;
        return $s;
    };
    usort($rows, fn($a, $b) => $score($b) <=> $score($a));
    return array_map(fn($r) => contact_brief($r), array_slice($rows, 0, max(1, min(50, $limit))));
}

/** What another app needs of a contact: who it is and how to reach them. */
function contact_brief(array $r): array
{
    $c = row_contact($r);
    return ['id' => $r['cid'], 'name' => contact_display($c), 'first' => $c['first'], 'last' => $c['last'], 'company' => $c['company'], 'title' => $c['title'],
        'emails' => $c['emails'], 'phones' => $c['phones'], 'groups' => $c['groups'], 'favorite' => $c['favorite'], 'birthday' => $c['birthday'],
        'photo' => (int)$r['photo_rev'] ? '../savcontacts/api/?r=con.photo&id=' . $r['cid'] . '&v=' . (int)$r['photo_rev'] : null,
        'url' => '../savcontacts/#/c/' . $r['cid']];
}

/**
 * The birthdays between two days (at most a year and a bit apart), as days of those years: [{id, name, day, year, age,
 * photo}] — age is null when the year of birth is not known. A 29 February falls on the 28th in other years.
 */
function birthdays_between(int $uid, string $from, string $to): array
{
    $f = strtotime($from . ' UTC');
    $l = strtotime($to . ' UTC');
    if (!$f || !$l || $l < $f || $l - $f > 400 * 86400) return [];
    $rows = q('SELECT ' . CONTACT_COLS . ' FROM ' . t('con_contacts') . " WHERE user_id = ? AND deleted_at IS NULL AND birthday <> ''", [$uid])->fetchAll();
    $out = [];
    for ($y = (int)gmdate('Y', $f); $y <= (int)gmdate('Y', $l); $y++) {
        foreach ($rows as $r) {
            $b = $r['birthday'];
            $m = (int)substr($b, -5, 2);
            $d = (int)substr($b, -2);
            if (!checkdate($m, $d, $y)) $d = 28; // 29 February in a year that has none
            $day = sprintf('%04d-%02d-%02d', $y, $m, $d);
            $t = strtotime($day . ' UTC');
            if ($t < $f || $t > $l) continue;
            $born = $b[0] === '-' ? null : (int)substr($b, 0, 4);
            $out[] = ['id' => $r['cid'], 'name' => contact_display(row_contact($r)), 'day' => $day, 'year' => $born, 'age' => $born ? $y - $born : null,
                'photo' => (int)$r['photo_rev'] ? '../savcontacts/api/?r=con.photo&id=' . $r['cid'] . '&v=' . (int)$r['photo_rev'] : null, 'url' => '../savcontacts/#/c/' . $r['cid']];
        }
    }
    usort($out, fn($a, $b) => strcmp($a['day'], $b['day']) ?: strcmp($a['name'], $b['name']));
    return $out;
}

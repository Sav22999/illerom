<?php
/**
 * SavContacts — CardDAV (RFC 6352 on WebDAV, RFC 4918), the minimum phones and mail programs need to keep the address
 * book in sync: iOS and macOS Contacts, DAVx⁵ on Android, Thunderbird. One address book per account.
 *
 *   dav/                                   the root: who is signed in (current-user-principal)
 *   dav/principals/<id>/                   the account: where its address books are (addressbook-home-set)
 *   dav/addressbooks/<id>/                 its address books: one
 *   dav/addressbooks/<id>/contacts/        the address book: PROPFIND (getctag, sync-token), REPORT (addressbook-multiget,
 *                                          addressbook-query, sync-collection)
 *   dav/addressbooks/<id>/contacts/<name>  one contact as a vCard: GET, PUT (If-Match / If-None-Match), DELETE
 *
 * Signing in: HTTP Basic, the email of the account and a password for the device made in the settings of SavContacts
 * (con_app_passwords: accounts made with SavAccount have no password of their own, and a phone should never hold it).
 * No session cookie, no CSRF: nothing here is reachable without those credentials.
 *
 * A card's name is its UID + ".vcf", or the name a client gave it when it made it (dav_name). Its ETag is the rev of the
 * contact (it grows at every change). A contact deleted from a device goes to the trash (30 days), as from the app; a
 * contact in the trash is gone for the devices. sync-token: the moment of the last sync (seconds), what changed since
 * then is sent again (the trash and the tombstones of con_tombstones say what went away).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/contacts.php';
require_once dirname(__DIR__, 2) . '/savdrive/lib/space.php';

const NS_D = 'DAV:';
const NS_C = 'urn:ietf:params:xml:ns:carddav';
const NS_CS = 'http://calendarserver.org/ns/';
const SYNC_PREFIX = 'https://www.illerom.eu/ns/savcontacts/sync/';
const MAX_CARD_BYTES = 1048576;

header('X-Robots-Tag: noindex');
header('X-Content-Type-Options: nosniff');
set_exception_handler(function (Throwable $e) {
    error_log('SavContacts DAV: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    plain(500, $e->getMessage() === 'not_installed' ? 'Not installed' : 'Server error');
});

function plain(int $code, string $text = '', array $headers = []): void
{
    http_response_code($code);
    foreach ($headers as $k => $v) header("$k: $v");
    if ($text !== '') { header('Content-Type: text/plain; charset=utf-8'); echo $text; }
    exit;
}

function x(string $s): string
{
    return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
}

// ---------------------------------------------------------------- where we are

$base = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/savcontacts/dav/index.php'))), '/') . '/';
$path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$rel = strpos($path, $base) === 0 ? substr($path, strlen($base)) : (rtrim($path, '/') . '/' === $base ? '' : ltrim($path, '/'));
$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($method === 'OPTIONS') {
    plain(200, '', ['DAV' => '1, 3, addressbook, extended-mkcol', 'Allow' => 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, REPORT', 'Content-Length' => '0']);
}
if (!credentials()) plain(503, 'Not installed');

// ---------------------------------------------------------------- signing in: the email and a password of a device

function dav_user(): array
{
    $user = $_SERVER['PHP_AUTH_USER'] ?? null;
    $pass = $_SERVER['PHP_AUTH_PW'] ?? null;
    if ($user === null) {
        // FastCGI / CGI: the header comes through the rewrite of dav/.htaccess
        $h = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (stripos($h, 'basic ') === 0) { $d = base64_decode(substr($h, 6), true); if ($d !== false && strpos($d, ':') !== false) [$user, $pass] = explode(':', $d, 2); }
    }
    // the test of the settings asks without the challenge, so that the browser shows no sign-in window of its own
    $ask = fn() => plain(401, 'Sign in with the email of your account and a password for this device, made in the settings of SavContacts.', empty($_SERVER['HTTP_X_SAVCONTACTS_TEST']) ? ['WWW-Authenticate' => 'Basic realm="SavContacts", charset="UTF-8"'] : []);
    if ($user === null || $pass === null || $user === '' || $pass === '') $ask();
    if (too_many_attempts('dav_login', 30, 15)) plain(429, 'Too many attempts', ['Retry-After' => '900']);
    $st = q('SELECT * FROM ' . t('users') . ' WHERE email = ?', [mb_strtolower(trim((string)$user))]);
    $u = $st->fetch();
    $ok = false;
    $pw = strtolower(preg_replace('/\s+/', '', (string)$pass) ?? '');
    if ($u) {
        foreach (q('SELECT id, hash FROM ' . t('con_app_passwords') . ' WHERE user_id = ?', [$u['id']])->fetchAll() as $p) {
            if (password_verify($pw, $p['hash'])) {
                $ok = true;
                q('UPDATE ' . t('con_app_passwords') . ' SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)', [now_utc(), $p['id'], gmdate('Y-m-d H:i:s', time() - 300)]);
                break;
            }
        }
    } else password_verify($pw, '$2y$12$GY4ONTARfNk7dPOEkul8SOodmL07a3kCRwOLFR8i/3pP8.Y5z9rMq'); // about the same time for an unknown address
    if (!$ok) { record_attempt('dav_login'); $ask(); }
    if ($u['status'] !== 'active' || empty($u['email_verified_at'])) plain(403, 'This account cannot sync.');
    $u['id'] = (int)$u['id'];
    return $u;
}

$u = dav_user();
$uid = $u['id'];
profile($u);

$P = [
    'root' => $base,
    'principal' => $base . 'principals/' . $uid . '/',
    'home' => $base . 'addressbooks/' . $uid . '/',
    'book' => $base . 'addressbooks/' . $uid . '/contacts/',
];
$parts = array_values(array_filter(explode('/', $rel), 'strlen'));
// which resource: root | principals | principal | home | book | card
$kind = null;
$cardName = null;
if (!$parts) $kind = 'root';
elseif ($parts[0] === 'principals') $kind = count($parts) === 1 ? 'principals' : ((string)$uid === ($parts[1] ?? '') && count($parts) === 2 ? 'principal' : null);
elseif ($parts[0] === 'addressbooks') {
    if (count($parts) >= 2 && $parts[1] !== (string)$uid) plain(403, 'Not your address book');
    if (count($parts) === 1) $kind = 'principals'; // a client that walks up gets pointed to the principal
    elseif (count($parts) === 2) $kind = 'home';
    elseif ($parts[2] === 'contacts' && count($parts) === 3) $kind = 'book';
    elseif ($parts[2] === 'contacts' && count($parts) === 4) { $kind = 'card'; $cardName = rawurldecode($parts[3]); }
}
if ($kind === null) plain(404, 'Not found');

// ---------------------------------------------------------------- the cards

const CARD_COLS = 'id, cid, uid, dav_name, rev, updated_at, deleted_at';

/** The name of a card in the address book (the last part of its address, not encoded). */
function card_name(array $r): string
{
    return $r['dav_name'] !== null && $r['dav_name'] !== '' ? (string)$r['dav_name'] : $r['uid'] . '.vcf';
}
function card_href(array $r): string
{
    return $GLOBALS['P']['book'] . rawurlencode(card_name($r));
}
function etag(array $r): string
{
    return '"' . $r['cid'] . '-' . (int)$r['rev'] . '"';
}
/** The contact of a card name, the ones in the trash too (null when there is none). */
function card_row(int $uid, string $name, bool $full = false): ?array
{
    $uidOf = preg_replace('/\.vcf$/i', '', $name);
    $r = q('SELECT ' . ($full ? '*' : CARD_COLS) . ' FROM ' . t('con_contacts') . ' WHERE user_id = ? AND (dav_name = ? OR (dav_name IS NULL AND uid = ?)) ORDER BY deleted_at IS NULL DESC LIMIT 1', [$uid, $name, $uidOf])->fetch();
    return $r ?: null;
}
function vcard_of(array $full, string $ver): string
{
    static $names = null;
    if ($names === null) $names = array_column(groups_of((int)$full['user_id']), 'name', 'gid');
    return vcard_write(row_contact($full, $names), $ver);
}
/** The CTag of the address book: changes whenever a card is added, changed, sent to the trash or deleted. */
function ctag(int $uid): string
{
    $a = q('SELECT COUNT(*) n, COALESCE(MAX(updated_at), \'\') m, COALESCE(SUM(rev), 0) s FROM ' . t('con_contacts') . ' WHERE user_id = ?', [$uid])->fetch();
    $b = (string)q('SELECT COALESCE(MAX(deleted_at), \'\') FROM ' . t('con_tombstones') . ' WHERE user_id = ?', [$uid])->fetchColumn();
    return md5($a['n'] . '|' . $a['m'] . '|' . $a['s'] . '|' . $b);
}
function sync_token(): string
{
    return SYNC_PREFIX . time();
}

// ---------------------------------------------------------------- the request body

/** The body as XML (null when empty), or 400. */
function xml_body(): ?DOMXPath
{
    $raw = (string)file_get_contents('php://input', false, null, 0, 2 * MAX_CARD_BYTES);
    if (trim($raw) === '') return null;
    $doc = new DOMDocument();
    $prev = libxml_use_internal_errors(true);
    $ok = $doc->loadXML($raw, LIBXML_NONET | LIBXML_NOCDATA);
    libxml_use_internal_errors($prev);
    if (!$ok) plain(400, 'Bad XML');
    $xp = new DOMXPath($doc);
    $xp->registerNamespace('d', NS_D);
    $xp->registerNamespace('c', NS_C);
    $xp->registerNamespace('cs', NS_CS);
    return $xp;
}
/** The properties asked ({ns}name), or null for all of them (allprop, or no body). */
function asked(?DOMXPath $xp): ?array
{
    if (!$xp) return null;
    $prop = $xp->query('//d:prop')->item(0);
    if (!$prop) return null;
    $out = [];
    foreach ($prop->childNodes as $n) if ($n instanceof DOMElement) $out[] = '{' . $n->namespaceURI . '}' . $n->localName;
    return $out;
}
/** The version of vCard a client asks for in address-data (3.0 unless it says 4.0). */
function asked_version(?DOMXPath $xp): string
{
    $n = $xp ? $xp->query('//c:address-data')->item(0) : null;
    return $n instanceof DOMElement && $n->getAttribute('version') === '4.0' ? '4.0' : '3.0';
}

// ---------------------------------------------------------------- answers: 207 Multi-Status

function prefix_of(string $ns): string
{
    return [NS_D => 'd', NS_C => 'card', NS_CS => 'cs'][$ns] ?? 'x';
}
/** One <response>: the properties found (200) and the ones asked and not there (404). $props: {ns}name => inner XML. */
function response(string $href, array $props, ?array $asked): string
{
    $found = $missing = '';
    $list = $asked ?? array_keys($props);
    foreach ($list as $k) {
        if (!preg_match('/^\{(.*)\}(.+)$/', $k, $m)) continue;
        $p = prefix_of($m[1]);
        $ns = $p === 'x' ? ' xmlns:x="' . x($m[1]) . '"' : '';
        if (array_key_exists($k, $props)) $found .= $props[$k] === '' ? "<$p:{$m[2]}$ns/>" : "<$p:{$m[2]}$ns>{$props[$k]}</$p:{$m[2]}>";
        else $missing .= "<$p:{$m[2]}$ns/>";
    }
    $out = '<d:response><d:href>' . x($href) . '</d:href>';
    if ($found !== '') $out .= '<d:propstat><d:prop>' . $found . '</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>';
    if ($missing !== '') $out .= '<d:propstat><d:prop>' . $missing . '</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>';
    return $out . '</d:response>';
}
function multistatus(string $inner, string $extra = ''): void
{
    http_response_code(207);
    header('Content-Type: application/xml; charset=utf-8');
    header('DAV: 1, 3, addressbook');
    echo '<?xml version="1.0" encoding="utf-8"?>' . "\n" . '<d:multistatus xmlns:d="DAV:" xmlns:card="' . NS_C . '" xmlns:cs="' . NS_CS . '">' . $inner . $extra . '</d:multistatus>';
    exit;
}

// ---------------------------------------------------------------- the properties of each resource

function common(array $u): array
{
    $P = $GLOBALS['P'];
    return [
        '{DAV:}current-user-principal' => '<d:href>' . x($P['principal']) . '</d:href>',
        '{DAV:}principal-collection-set' => '<d:href>' . x($P['root'] . 'principals/') . '</d:href>',
        '{DAV:}owner' => '<d:href>' . x($P['principal']) . '</d:href>',
        '{DAV:}supported-report-set' => '',
    ];
}
function privileges(bool $write): string
{
    $p = ['read', 'read-acl', 'read-current-user-privilege-set'];
    if ($write) $p = array_merge($p, ['write', 'write-content', 'write-properties', 'bind', 'unbind']);
    return implode('', array_map(fn($x) => "<d:privilege><d:$x/></d:privilege>", $p));
}
function props_of(string $kind, array $u, ?array $row = null, ?string $card = null): array
{
    $P = $GLOBALS['P'];
    $c = common($u);
    if ($kind === 'root' || $kind === 'principals') return $c + ['{DAV:}resourcetype' => '<d:collection/>', '{DAV:}displayname' => 'SavContacts', '{DAV:}current-user-privilege-set' => privileges(false)];
    if ($kind === 'principal') return $c + [
        '{DAV:}resourcetype' => '<d:collection/><d:principal/>', '{DAV:}displayname' => x((string)$u['name']), '{DAV:}principal-URL' => '<d:href>' . x($P['principal']) . '</d:href>',
        '{' . NS_C . '}addressbook-home-set' => '<d:href>' . x($P['home']) . '</d:href>',
        '{' . NS_CS . '}email-address-set' => '<cs:email-address>' . x((string)$u['email']) . '</cs:email-address>',
        '{DAV:}current-user-privilege-set' => privileges(false),
    ];
    if ($kind === 'home') return $c + ['{DAV:}resourcetype' => '<d:collection/>', '{DAV:}displayname' => 'SavContacts', '{DAV:}current-user-privilege-set' => privileges(false)];
    if ($kind === 'book') return array_merge($c, [
        '{DAV:}resourcetype' => '<d:collection/><card:addressbook/>', '{DAV:}displayname' => 'SavContacts',
        '{' . NS_C . '}addressbook-description' => x(((string)$u['ui_lang'] === 'it' ? 'I contatti di SavContacts' : 'The contacts of SavContacts')),
        '{' . NS_C . '}supported-address-data' => '<card:address-data-type content-type="text/vcard" version="3.0"/><card:address-data-type content-type="text/vcard" version="4.0"/>',
        '{' . NS_C . '}max-resource-size' => (string)MAX_CARD_BYTES,
        '{' . NS_CS . '}getctag' => x(ctag((int)$u['id'])), '{DAV:}sync-token' => x(sync_token()),
        '{DAV:}supported-report-set' => '<d:supported-report><d:report><card:addressbook-multiget/></d:report></d:supported-report><d:supported-report><d:report><card:addressbook-query/></d:report></d:supported-report><d:supported-report><d:report><d:sync-collection/></d:report></d:supported-report>',
        '{DAV:}current-user-privilege-set' => privileges(true),
    ]);
    // a card
    $out = ['{DAV:}resourcetype' => '', '{DAV:}getetag' => x(etag($row)), '{DAV:}getcontenttype' => 'text/vcard; charset=utf-8',
        '{DAV:}getlastmodified' => gmdate('D, d M Y H:i:s', strtotime($row['updated_at'] . ' UTC')) . ' GMT', '{DAV:}current-user-privilege-set' => privileges(true)];
    if ($card !== null) { $out['{' . NS_C . '}address-data'] = x($card); $out['{DAV:}getcontentlength'] = (string)strlen($card); }
    return $out;
}

/** The cards of the account (not the trash): light rows, or full ones when their vCards are needed. */
function cards(int $uid, bool $full = false): array
{
    return q('SELECT ' . ($full ? '*' : CARD_COLS) . ' FROM ' . t('con_contacts') . ' WHERE user_id = ? AND deleted_at IS NULL ORDER BY id', [$uid])->fetchAll();
}
/** The responses of some cards, with their vCards when address-data is asked. */
function card_responses(array $rows, ?array $asked, string $ver): string
{
    $wantData = $asked !== null && in_array('{' . NS_C . '}address-data', $asked, true);
    $out = '';
    foreach ($rows as $r) {
        if ($wantData && !array_key_exists('photo', $r)) $r = q('SELECT * FROM ' . t('con_contacts') . ' WHERE id = ?', [$r['id']])->fetch();
        $out .= response(card_href($r), props_of('card', $GLOBALS['u'], $r, $wantData ? vcard_of($r, $ver) : null), $asked ?? ['{DAV:}resourcetype', '{DAV:}getetag', '{DAV:}getcontenttype']);
    }
    return $out;
}

// ---------------------------------------------------------------- the methods

$depth = strtolower(trim((string)($_SERVER['HTTP_DEPTH'] ?? ($method === 'PROPFIND' ? '1' : '0'))));

switch ($method) {
    case 'PROPFIND':
        $xp = xml_body();
        $ask = asked($xp);
        if ($kind === 'card') {
            $r = card_row($uid, (string)$cardName);
            if (!$r || $r['deleted_at']) plain(404, 'Not found');
            multistatus(card_responses([$r], $ask, asked_version($xp)));
        }
        $here = ['root' => $P['root'], 'principals' => $P['root'] . 'principals/', 'principal' => $P['principal'], 'home' => $P['home'], 'book' => $P['book']][$kind];
        $out = response($here, props_of($kind, $u), $ask);
        if ($depth !== '0') {
            if ($kind === 'root') $out .= response($P['principal'], props_of('principal', $u), $ask);
            if ($kind === 'principals') $out .= response($P['principal'], props_of('principal', $u), $ask);
            if ($kind === 'home') $out .= response($P['book'], props_of('book', $u), $ask);
            if ($kind === 'book') $out .= card_responses(cards($uid), $ask, asked_version($xp));
        }
        multistatus($out);

    case 'PROPPATCH':
        // names and colours of the address book are kept by SavContacts: every change is refused, politely
        $xp = xml_body();
        $out = '';
        foreach ($xp ? $xp->query('//d:set/d:prop/* | //d:remove/d:prop/*') : [] as $n) {
            $p = prefix_of($n->namespaceURI);
            $out .= $p === 'x' ? '<x:' . $n->localName . ' xmlns:x="' . x((string)$n->namespaceURI) . '"/>' : "<$p:{$n->localName}/>";
        }
        $here = $kind === 'card' ? $P['book'] . rawurlencode((string)$cardName) : ($P[$kind] ?? $P['root']);
        multistatus('<d:response><d:href>' . x($here) . '</d:href><d:propstat><d:prop>' . $out . '</d:prop><d:status>HTTP/1.1 403 Forbidden</d:status></d:propstat></d:response>');

    case 'REPORT':
        if ($kind !== 'book') plain(403, 'Reports are answered by the address book');
        $xp = xml_body();
        if (!$xp) plain(400, 'Empty report');
        $root = $xp->document->documentElement;
        $ask = asked($xp);
        $ver = asked_version($xp);
        $name = $root->localName;
        if ($name === 'addressbook-multiget') {
            $out = '';
            foreach ($xp->query('//d:href') as $hr) {
                $href = trim($hr->textContent);
                $r = card_row($uid, rawurldecode(basename((string)parse_url($href, PHP_URL_PATH))), true);
                if ($r && !$r['deleted_at']) $out .= card_responses([$r], $ask, $ver);
                else $out .= '<d:response><d:href>' . x($href) . '</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>';
            }
            multistatus($out);
        }
        if ($name === 'addressbook-query') {
            // filters are not applied: every card is sent (the clients that use it filter themselves); a limit is kept
            $limit = (int)($xp->query('//c:limit/c:nresults')->item(0)->textContent ?? 0);
            $rows = cards($uid);
            if ($limit > 0) $rows = array_slice($rows, 0, $limit);
            multistatus(card_responses($rows, $ask, $ver));
        }
        if ($name === 'sync-collection') {
            $tok = trim((string)($xp->query('//d:sync-token')->item(0)->textContent ?? ''));
            $now = time();
            if ($tok === '') {
                multistatus(card_responses(cards($uid), $ask, $ver), '<d:sync-token>' . x(SYNC_PREFIX . $now) . '</d:sync-token>');
            }
            if (strpos($tok, SYNC_PREFIX) !== 0 || !ctype_digit(substr($tok, strlen(SYNC_PREFIX)))) $since = -1;
            else $since = (int)substr($tok, strlen(SYNC_PREFIX));
            if ($since < $now - 80 * 86400 || $since > $now + 60) {
                // a token this server does not know (or too old for the tombstones kept): the client syncs everything again
                http_response_code(403);
                header('Content-Type: application/xml; charset=utf-8');
                echo '<?xml version="1.0" encoding="utf-8"?><d:error xmlns:d="DAV:"><d:valid-sync-token/></d:error>';
                exit;
            }
            $at = gmdate('Y-m-d H:i:s', $since);
            $rows = q('SELECT ' . CARD_COLS . ' FROM ' . t('con_contacts') . ' WHERE user_id = ? AND updated_at >= ? ORDER BY id', [$uid, $at])->fetchAll();
            $out = card_responses(array_values(array_filter($rows, fn($r) => !$r['deleted_at'])), $ask, $ver);
            foreach (array_filter($rows, fn($r) => $r['deleted_at']) as $r) $out .= '<d:response><d:href>' . x(card_href($r)) . '</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>';
            foreach (q('SELECT uid, dav_name FROM ' . t('con_tombstones') . ' WHERE user_id = ? AND deleted_at >= ?', [$uid, $at])->fetchAll() as $r) {
                $out .= '<d:response><d:href>' . x(card_href($r)) . '</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>';
            }
            multistatus($out, '<d:sync-token>' . x(SYNC_PREFIX . $now) . '</d:sync-token>');
        }
        plain(403, 'Report not supported');

    case 'GET':
    case 'HEAD':
        if ($kind !== 'card') plain(200, "SavContacts CardDAV\n", ['DAV' => '1, 3, addressbook']);
        $r = card_row($uid, (string)$cardName, true);
        if (!$r || $r['deleted_at']) plain(404, 'Not found');
        $ver = stripos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'version=4.0') !== false ? '4.0' : '3.0';
        $card = vcard_of($r, $ver);
        header('Content-Type: text/vcard; charset=utf-8');
        header('ETag: ' . etag($r));
        header('Last-Modified: ' . gmdate('D, d M Y H:i:s', strtotime($r['updated_at'] . ' UTC')) . ' GMT');
        header('Content-Length: ' . strlen($card));
        if ($method === 'GET') echo $card;
        exit;

    case 'PUT':
        if ($kind !== 'card') plain(405, 'Only cards can be written', ['Allow' => 'OPTIONS, PROPFIND, REPORT']);
        $name = (string)$cardName;
        if ($name === '' || strlen($name) > 190 || preg_match('/[\x00-\x1F\/\\\\]/', $name)) plain(400, 'Bad name');
        $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($len > MAX_CARD_BYTES) plain(413, 'The card is too big');
        $text = (string)file_get_contents('php://input', false, null, 0, MAX_CARD_BYTES + 1);
        if (strlen($text) > MAX_CARD_BYTES) plain(413, 'The card is too big');
        $parsed = vcard_parse($text);
        if (count($parsed) !== 1) plain(415, 'One vCard is expected', []);
        $card = $parsed[0];
        $old = card_row($uid, $name, true);
        $live = $old && !$old['deleted_at'];
        $ifMatch = trim((string)($_SERVER['HTTP_IF_MATCH'] ?? ''));
        $ifNone = trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
        if ($ifNone === '*' && $live) plain(412, 'It exists already');
        if ($ifMatch !== '' && ($ifMatch === '*' ? !$live : (!$live || !in_array(etag($old), array_map('trim', explode(',', $ifMatch)), true)))) plain(412, 'It changed meanwhile');
        if (!$live && count_contacts($uid) >= MAX_CONTACTS) plain(507, 'The address book is full');
        if (!savspace_allows((string)$u['email'], 'savcontacts', strlen($text), con_bytes($uid))) plain(507, 'The space of SavOffice is full');
        // the groups of its categories (made when missing); a card without categories keeps the groups it had (some
        // phones drop the field), as it keeps being a favourite when the field of SavContacts is not there
        $cache = [];
        $gids = [];
        foreach ($card['categories'] as $g) if (($id = group_by_name($uid, $g, $cache))) $gids[] = $id;
        $c = clean_contact($card, array_values(array_unique(array_merge(group_ids($uid), $gids))));
        $c['groups'] = $card['categories'] ? array_values(array_unique($gids)) : ($old ? jdec($old['groups']) : []);
        if (!preg_match('/^X-SAVCONTACTS-FAVORITE:/mi', $text) && $old) $c['favorite'] = (bool)$old['favorite'];
        if (contact_display($c) === '') plain(422, 'A contact needs a name, a company, an email or a phone');
        $c['uid'] = clean_str($card['uid'], 190) ?: ($old['uid'] ?? preg_replace('/\.vcf$/i', '', $name));
        $photo = !empty($card['photo']) ? photo_clean($card['photo']) : null;
        $other = array_values(array_filter(array_map(fn($o) => is_string($o) ? mb_substr($o, 0, 4000) : null, $card['other']), 'is_string'));
        db()->beginTransaction();
        $cid = store_contact($uid, $c, $old, $photo, $other);
        $davName = $name === $c['uid'] . '.vcf' ? null : $name;
        q('UPDATE ' . t('con_contacts') . ' SET dav_name = ?, uid = ?, deleted_at = NULL WHERE cid = ?', [$davName, $c['uid'], $cid]);
        db()->commit();
        $r = card_row($uid, $name);
        plain($live ? 204 : 201, '', ['ETag' => etag($r)]);

    case 'DELETE':
        if ($kind !== 'card') plain(403, 'The address book cannot be deleted from here');
        $r = card_row($uid, (string)$cardName);
        if (!$r || $r['deleted_at']) plain(404, 'Not found');
        $ifMatch = trim((string)($_SERVER['HTTP_IF_MATCH'] ?? ''));
        if ($ifMatch !== '' && $ifMatch !== '*' && !in_array(etag($r), array_map('trim', explode(',', $ifMatch)), true)) plain(412, 'It changed meanwhile');
        // to the trash, as from the app: it can come back for 30 days
        q('UPDATE ' . t('con_contacts') . ' SET deleted_at = ?, rev = rev + 1, updated_at = ? WHERE id = ?', [now_utc(), now_utc(), $r['id']]);
        plain(204);

    case 'MKCOL':
    case 'MOVE':
    case 'COPY':
    case 'LOCK':
    case 'UNLOCK':
        plain(403, 'Not allowed: SavContacts has one address book per account');

    default:
        plain(405, 'Method not allowed', ['Allow' => 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, REPORT']);
}

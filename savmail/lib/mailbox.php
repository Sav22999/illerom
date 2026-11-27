<?php
/**
 * SavMail — the mailboxes of a person (kept in the vault) and what the app does with them through IMAP.
 *
 * A mailbox in the vault: {id, email, name (shown to who receives), color, provider, auth (password | xoauth2),
 * imap {host, port, tls, user}, smtp {…}, secret (password) | oauth {refresh, access, exp}, sentCopy (keep a copy of what
 * is sent in Sent: not for Gmail and Outlook, which do it by themselves), signature (HTML), special {sent, drafts, trash,
 * junk, archive}: the mailboxes found for each role}.
 */

declare(strict_types=1);

const ML_PAGE = 50;
const ML_ROLES = ['inbox', 'drafts', 'sent', 'archive', 'junk', 'trash'];
/** Names of the special mailboxes on servers without SPECIAL-USE (lower case, compared with the last level of the name). */
const ML_ROLE_NAMES = [
    'sent' => ['sent', 'sent items', 'sent messages', 'sent mail', 'posta inviata', 'inviata', 'inviati', 'elementi inviati', 'messaggi inviati'],
    'drafts' => ['drafts', 'draft', 'bozze', 'bozza'],
    'trash' => ['trash', 'deleted', 'deleted items', 'deleted messages', 'bin', 'cestino', 'posta eliminata', 'elementi eliminati'],
    'junk' => ['junk', 'spam', 'junk e-mail', 'junk email', 'bulk mail', 'posta indesiderata', 'indesiderata'],
    'archive' => ['archive', 'archives', 'archivio', 'all mail', 'tutti i messaggi'],
];

function ml_new_id(): string
{
    return b64u(random_bytes(6));
}

/** A mailbox as the app sees it: no password, no token. */
function ml_account_out(array $a): array
{
    return ['id' => $a['id'], 'email' => $a['email'], 'name' => $a['name'] ?? '', 'color' => $a['color'] ?? '', 'provider' => $a['provider'] ?? 'custom', 'auth' => $a['auth'] ?? 'password',
        'imap' => $a['imap'], 'smtp' => $a['smtp'], 'sentCopy' => !empty($a['sentCopy']), 'signature' => $a['signature'] ?? '', 'special' => (object)($a['special'] ?? [])];
}

function ml_account(array $data, string $id): array
{
    foreach ($data['accounts'] as $a) if ($a['id'] === $id) return $a;
    fail('account_not_found', 404);
    return [];
}

/** A Microsoft access token that still works: renewed (and the new tokens saved in the vault) when it is old. */
function ml_access_token(array $u, string $vk, array &$a): string
{
    $o = $a['oauth'] ?? [];
    if (!empty($o['access']) && (int)($o['exp'] ?? 0) > time()) return (string)$o['access'];
    if (empty($o['refresh'])) throw new MlMailError('auth', 'signed out');
    $n = ml_oauth_refresh((string)$o['refresh']);
    $a['oauth'] = ['refresh' => $n['refresh'] ?? $o['refresh'], 'access' => $n['access'], 'exp' => $n['exp']];
    $id = $a['id'];
    $fresh = $a['oauth'];
    ml_vault_mutate($u, $vk, function ($d) use ($id, $fresh) { foreach ($d['accounts'] as &$x) if ($x['id'] === $id) $x['oauth'] = $fresh; return $d; });
    return $n['access'];
}

/** IMAP, signed in to the mailbox. */
function ml_imap(array $u, string $vk, array &$a): MlImap
{
    $im = new MlImap((string)$a['imap']['host'], (int)$a['imap']['port'], (string)$a['imap']['tls']);
    if (($a['auth'] ?? 'password') === 'xoauth2') $im->xoauth2((string)$a['imap']['user'], ml_access_token($u, $vk, $a));
    else $im->login((string)$a['imap']['user'], (string)($a['secret'] ?? ''));
    return $im;
}

/** SMTP, signed in to the mailbox. */
function ml_smtp(array $u, string $vk, array &$a): MlSmtp
{
    $s = new MlSmtp((string)$a['smtp']['host'], (int)$a['smtp']['port'], (string)$a['smtp']['tls']);
    if (($a['auth'] ?? 'password') === 'xoauth2') $s->xoauth2((string)$a['smtp']['user'], ml_access_token($u, $vk, $a));
    else $s->login((string)$a['smtp']['user'], (string)($a['secret'] ?? ''));
    return $s;
}

/** The role of a mailbox (inbox, sent, drafts, trash, junk, archive) from its SPECIAL-USE attributes or its name. */
function ml_role(array $f): string
{
    if (strtoupper($f['raw']) === 'INBOX') return 'inbox';
    foreach (['sent' => 'sent', 'drafts' => 'drafts', 'trash' => 'trash', 'junk' => 'junk', 'archive' => 'archive', 'all' => 'archive'] as $attr => $role) if (in_array($attr, $f['attrs'], true)) return $role;
    $leaf = mb_strtolower(trim((string)(($f['delim'] ?? '') !== '' ? substr(strrchr('x' . $f['delim'] . $f['name'], $f['delim']), 1) : $f['name'])));
    foreach (ML_ROLE_NAMES as $role => $names) if (in_array($leaf, $names, true)) return $role;
    return '';
}

/** The mailboxes of the account, each with its role, unread and total messages; and the mailbox of each role. */
function ml_folders(MlImap $im): array
{
    $list = array_values(array_filter($im->folders(), fn($f) => !in_array('noselect', $f['attrs'], true) && !in_array('nonexistent', $f['attrs'], true)));
    $special = [];
    foreach ($list as &$f) {
        $f['role'] = ml_role($f);
        // the first one found for a role wins (Gmail: "All Mail" is \All, used as the archive)
        if ($f['role'] !== '' && $f['role'] !== 'inbox' && !isset($special[$f['role']])) $special[$f['role']] = $f['raw'];
        elseif ($f['role'] !== '' && $f['role'] !== 'inbox' && $special[$f['role']] !== $f['raw']) $f['role'] = '';
    }
    unset($f);
    $st = $im->statuses(array_slice(array_column($list, 'raw'), 0, 60));
    foreach ($list as &$f) { $f['unread'] = $st[$f['raw']]['unread'] ?? null; $f['total'] = $st[$f['raw']]['total'] ?? null; unset($f['attrs']); }
    unset($f);
    usort($list, function ($x, $y) {
        $rx = array_search($x['role'], ML_ROLES, true);
        $ry = array_search($y['role'], ML_ROLES, true);
        if ($rx !== $ry) return ($rx === false ? 99 : $rx) <=> ($ry === false ? 99 : $ry);
        return strnatcasecmp($x['name'], $y['name']);
    });
    return ['folders' => $list, 'special' => $special];
}

/** A row of the list of messages, from FETCH (UID FLAGS INTERNALDATE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (…)]). */
function ml_row(array $m): array
{
    $head = '';
    foreach ($m as $k => $v) if (strpos($k, 'BODY[HEADER') === 0) $head = (string)$v;
    $h = ml_headers($head);
    $flags = array_map(fn($f) => strtolower((string)$f), is_array($m['FLAGS'] ?? null) ? $m['FLAGS'] : []);
    [$ct] = ml_params(ml_h($h, 'content-type') ?: 'text/plain');
    $from = ml_addresses(ml_h($h, 'from'));
    return ['uid' => (int)$m['UID'], 'from' => $from[0] ?? ['name' => '', 'email' => ''], 'to' => array_slice(ml_addresses(ml_h($h, 'to')), 0, 5),
        'subject' => mb_substr(ml_words(ml_h($h, 'subject')), 0, 300), 'date' => ml_date(ml_h($h, 'date')) ?? ml_date((string)($m['INTERNALDATE'] ?? '')),
        'size' => (int)($m['RFC822.SIZE'] ?? 0), 'seen' => in_array('\\seen', $flags, true), 'flagged' => in_array('\\flagged', $flags, true),
        'answered' => in_array('\\answered', $flags, true), 'draft' => in_array('\\draft', $flags, true),
        'att' => isset($m['BODYSTRUCTURE']) && is_array($m['BODYSTRUCTURE']) ? ml_bs_att($m['BODYSTRUCTURE']) : in_array($ct, ['multipart/mixed', 'application/octet-stream', 'application/pdf', 'application/zip'], true)];
}

/**
 * Whether a message has a real attachment, from its BODYSTRUCTURE (RFC 3501 §7.4.2): a part marked "attachment", or a file
 * that is not the text of the message. Not the pictures shown inside the text (an image with a Content-ID in a
 * multipart/related, or inline): Gmail's has:attachment counts those, the reader of SavMail does not list them.
 */
function ml_bs_att(array $bs, bool $related = false): bool
{
    if (isset($bs[0]) && is_array($bs[0])) { // multipart: the parts, then the subtype
        $sub = '';
        foreach ($bs as $x) if (is_string($x)) { $sub = strtolower($x); break; }
        foreach ($bs as $x) if (is_array($x) && isset($x[0]) && (is_array($x[0]) || is_string($x[0])) && count($x) >= 2 && ml_bs_att($x, $related || $sub === 'related')) return true;
        return false;
    }
    if (!is_string($bs[0] ?? null) || !is_string($bs[1] ?? null)) return false;
    $type = strtolower($bs[0] . '/' . $bs[1]);
    $params = ml_bs_params($bs[2] ?? null);
    $cid = is_string($bs[3] ?? null) && $bs[3] !== '';
    // where the disposition is: after the 7 basic fields, the lines of text (text/*), or envelope, body and lines (message/rfc822), then the MD5
    $at = strpos($type, 'text/') === 0 ? 9 : ($type === 'message/rfc822' ? 11 : 8);
    $disp = is_array($bs[$at] ?? null) ? $bs[$at] : null;
    $dtype = $disp && is_string($disp[0] ?? null) ? strtolower($disp[0]) : '';
    $named = isset($params['name']) || isset(ml_bs_params($disp[1] ?? null)['filename']);
    // a picture called by the text (cid:): part of the text even when the sender marked it "attachment", as the reader shows it
    if (strpos($type, 'image/') === 0 && $cid && ($related || $dtype !== 'attachment')) return false;
    if ($dtype === 'attachment') return true;
    if (strpos($type, 'multipart/') === 0) return false;
    if (in_array($type, ['text/plain', 'text/html'], true)) return false;            // the text of the message
    if (strpos($type, 'image/') === 0 && ($related || $dtype === 'inline')) return false; // a picture in the text
    if ($type === 'message/rfc822' || $type === 'text/calendar') return true;
    return $named || strpos($type, 'application/') === 0 || strpos($type, 'audio/') === 0 || strpos($type, 'video/') === 0;
}

function ml_bs_params($list): array
{
    $out = [];
    if (!is_array($list)) return $out;
    for ($i = 0; $i + 1 < count($list); $i += 2) if (is_string($list[$i])) $out[strtolower(rtrim($list[$i], '*'))] = $list[$i + 1];
    return $out;
}

const ML_LIST_ITEMS = 'UID FLAGS INTERNALDATE RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE CONTENT-TYPE)]';

/** A page of a mailbox, newest first; with a search, the messages that match (in the sender, recipients, subject or text). */
function ml_list(MlImap $im, string $raw, int $page, string $search, string $filter = ''): array
{
    return ml_list_from($im, $raw, $page * ML_PAGE, $search, $filter);
}

/**
 * The search keys of a filter of the list: unread, read, flagged, att (with attachments), label:<name> (Gmail labels,
 * inside any folder). Done by the mail server, so it covers the whole folder, not only what was loaded. [] when none.
 */
function ml_filter_keys(MlImap $im, string $filter): array
{
    $gmail = $im->has('X-GM-EXT-1');
    switch ($filter) {
        case 'unread': return ['UNSEEN'];
        case 'read': return ['SEEN'];
        case 'flagged': return ['FLAGGED'];
        case 'att': return $gmail ? ['X-GM-RAW "has:attachment"'] : ['OR HEADER Content-Type "multipart/mixed" HEADER Content-Type "application/"'];
    }
    if (strpos($filter, 'label:') === 0 && $gmail) {
        $l = substr($filter, 6);
        if ($l !== '' && strlen($l) <= 500) return ['X-GM-LABELS ', MlImap::q($l)];
    }
    return [];
}

/** Like ml_list, but after the newest $skip messages (the unified folders go on mailbox by mailbox). */
function ml_list_from(MlImap $im, string $raw, int $skip, string $search, string $filter = ''): array
{
    $box = $im->select($raw);
    $keys = ml_filter_keys($im, $filter);
    if ($search === '' && !$keys) {
        $n = $box['exists'];
        $hi = $n - $skip;
        if ($hi < 1) return ['total' => $n, 'messages' => [], 'uidnext' => $box['uidnext']];
        $lo = max(1, $hi - ML_PAGE + 1);
        $rows = array_map('ml_row', $im->fetch("$lo:$hi", ML_LIST_ITEMS, false));
        usort($rows, fn($a, $b) => $b['uid'] <=> $a['uid']);
        return ['total' => $n, 'messages' => $rows, 'uidnext' => $box['uidnext']];
    }
    // the filter and the words searched together (IMAP: keys next to each other must all match)
    $parts = [];
    if ($search !== '') {
        $q = MlImap::q($search);
        $parts = ['OR OR OR FROM ', $q, ' TO ', $q, ' SUBJECT ', $q, ' BODY ', $q];
    }
    if ($keys) $parts = array_merge($keys, $parts ? [' '] : [], $parts);
    $lit = false;
    foreach ($parts as $p) if (is_array($p) && isset($p['lit'])) $lit = true;
    $uids = $im->search(...array_merge([$lit ? 'CHARSET UTF-8 ' : ''], $parts));
    rsort($uids);
    if ($filter === 'att') {
        // the search only narrows it down (Gmail counts the pictures inside the text as attachments): the structure of each
        // message decides, read in blocks from the newest until this page is full
        $found = [];
        $done = 0;
        $need = $skip + ML_PAGE + 1;
        while ($done < count($uids) && count($found) < $need) {
            $block = array_slice($uids, $done, 300);
            $done += count($block);
            $att = [];
            foreach ($im->fetch(implode(',', $block), 'UID BODYSTRUCTURE') as $x) if (is_array($x['BODYSTRUCTURE'] ?? null) && ml_bs_att($x['BODYSTRUCTURE'])) $att[(int)$x['UID']] = true;
            foreach ($block as $uid) if (isset($att[$uid])) $found[] = $uid;
        }
        $more = count($found) > $skip + ML_PAGE || $done < count($uids);
        $slice = array_slice($found, $skip, ML_PAGE);
        $total = $done >= count($uids) ? count($found) : null; // not known until every candidate was looked at
        if (!$slice) return ['total' => $total ?? count($found), 'messages' => [], 'uidnext' => $box['uidnext'], 'more' => false];
        $rows = array_map('ml_row', $im->fetch(implode(',', $slice), ML_LIST_ITEMS));
        usort($rows, fn($a, $b) => $b['uid'] <=> $a['uid']);
        return ['total' => $total, 'messages' => $rows, 'uidnext' => $box['uidnext'], 'more' => $more];
    }
    $total = count($uids);
    $slice = array_slice($uids, $skip, ML_PAGE);
    if (!$slice) return ['total' => $total, 'messages' => [], 'uidnext' => $box['uidnext']];
    $rows = array_map('ml_row', $im->fetch(implode(',', $slice), ML_LIST_ITEMS));
    usort($rows, fn($a, $b) => $b['uid'] <=> $a['uid']);
    return ['total' => $total, 'messages' => $rows, 'uidnext' => $box['uidnext']];
}

/** A whole message, read from the server (its size is checked first). */
function ml_fetch_raw(MlImap $im, string $raw, int $uid): array
{
    $im->select($raw);
    $meta = $im->fetch((string)$uid, 'UID FLAGS RFC822.SIZE');
    if (!$meta) fail('message_gone', 404);
    if ((int)($meta[0]['RFC822.SIZE'] ?? 0) > 40000000) fail('message_big', 413);
    $m = $im->fetch((string)$uid, 'UID BODY.PEEK[]');
    if (!$m || !isset($m[0]['BODY[]'])) fail('message_gone', 404);
    return [(string)$m[0]['BODY[]'], array_map(fn($f) => strtolower((string)$f), is_array($meta[0]['FLAGS'] ?? null) ? $meta[0]['FLAGS'] : [])];
}

/** What the reader needs of a message: headers, safe HTML, plain text, attachments. */
function ml_message(string $rawMsg, array $flags, int $uid, bool $images): array
{
    $tree = ml_parse($rawMsg);
    $h = $tree['headers'];
    $c = ml_content($tree);
    $html = implode('<hr>', $c['html']);
    $text = implode("\n\n", $c['text']);
    $safe = $html !== '' ? ml_sanitize($html, $c['cid'], $images) : ['html' => ml_text_html($text), 'css' => '', 'held' => 0];
    // pictures shown inside the text are not listed again as attachments
    $atts = array_values(array_filter($c['atts'], fn($x) => $x['cid'] === '' || stripos($html, 'cid:' . $x['cid']) === false));
    $unsub = '';
    if (preg_match('/<(https:[^>]+)>/', ml_h($h, 'list-unsubscribe'), $m)) $unsub = $m[1];
    elseif (preg_match('/<(mailto:[^>]+)>/', ml_h($h, 'list-unsubscribe'), $m)) $unsub = $m[1];
    return ['uid' => $uid, 'subject' => mb_substr(ml_words(ml_h($h, 'subject')), 0, 500), 'from' => ml_addresses(ml_h($h, 'from'))[0] ?? ['name' => '', 'email' => ''],
        'to' => ml_addresses(implode(', ', $h['to'] ?? [])), 'cc' => ml_addresses(implode(', ', $h['cc'] ?? [])), 'replyTo' => ml_addresses(ml_h($h, 'reply-to')),
        'date' => ml_date(ml_h($h, 'date')), 'messageId' => trim(ml_h($h, 'message-id')), 'references' => trim(ml_h($h, 'references')), 'inReplyTo' => trim(ml_h($h, 'in-reply-to')),
        'html' => $safe['html'], 'css' => $safe['css'], 'held' => $safe['held'], 'text' => $text !== '' ? $text : ml_html_text($html), 'atts' => $atts,
        'seen' => in_array('\\seen', $flags, true), 'flagged' => in_array('\\flagged', $flags, true), 'unsubscribe' => mb_substr($unsub, 0, 500)];
}

/** "12,15,40" from a list of UIDs (or fails). */
function ml_uidset($list): string
{
    $u = array_values(array_unique(array_filter(array_map('intval', is_array($list) ? array_slice($list, 0, 1000) : []), fn($x) => $x > 0)));
    if (!$u) fail('bad_request', 422);
    return implode(',', $u);
}

/** The mailbox of a role, created when the server has none (only drafts and sent are created). */
function ml_role_box(MlImap $im, array &$a, string $role): ?string
{
    if (!empty($a['special'][$role])) return $a['special'][$role];
    $f = ml_folders($im);
    $a['special'] = $f['special'];
    if (!empty($a['special'][$role])) return $a['special'][$role];
    if (!in_array($role, ['drafts', 'sent', 'trash', 'archive'], true)) return null;
    $name = ['drafts' => 'Drafts', 'sent' => 'Sent', 'trash' => 'Trash', 'archive' => 'Archive'][$role];
    try { $im->create($name); } catch (MlMailError $e) { /* it may exist under another name: the server says no */ }
    return $a['special'][$role] = $name;
}

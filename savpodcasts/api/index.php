<?php
/**
 * SavPodcasts — JSON API.  api/index.php?r=<action>
 *
 * Accounts:   the ones of SavSchedules (same users, same session): auth.config, auth.me, auth.register, auth.login (and the
 *             routes of ../identity/identity.php), auth.resend, auth.verify, auth.logout, auth.password, auth.forgot,
 *             auth.reset, auth.profile, auth.export, auth.delete
 * Podcasts:   pod.init, pod.prefs, pod.home, pod.refresh, pod.search, pod.popular, pod.browse, pod.open, pod.podcast, pod.episode,
 *             pod.subscribe, pod.unsubscribe, pod.sub_settings, pod.seen
 * Listening:  pod.progress, pod.mark, pod.mark_all, pod.forget, pod.star, pod.library, pod.queue, pod.queue_set, pod.queue_add,
 *             pod.queue_remove
 * Files:      pod.import (OPML), pod.export_opml
 * Pictures:   img — the artwork of a podcast, read by the server and made smaller (the publisher never sees the listener)
 *
 * Every POST of a signed-in user needs the X-CSRF-Token header (given at sign-in).
 */

declare(strict_types=1);

require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/feeds.php';
require __DIR__ . '/../lib/catalog.php';

header('X-Robots-Tag: noindex');
set_exception_handler(function (Throwable $e) {
    if ($e->getMessage() === 'not_installed') fail('not_installed', 503);
    if (db_in_transaction()) db()->rollBack();
    error_log('SavPodcasts API: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send_json(['ok' => false, 'error' => 'server', 'detail' => config_value('debug', false) ? $e->getMessage() : null], 500);
});

$r = (string)($_GET['r'] ?? '');

if ($r === 'auth.config' && !credentials()) send_json(['ok' => true, 'installed' => false]);
if (!credentials()) fail('not_installed', 503);

if ($r === 'img') serve_img();

if ($_SERVER['REQUEST_METHOD'] === 'POST' && stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) fail('bad_request', 415);
remember_app_url();

function only(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) fail('bad_request', 405);
}

function writer(bool $unverifiedOk = false): array
{
    only('POST');
    $u = require_user($unverifiedOk);
    require_csrf($u);
    return $u;
}

function reader(): array
{
    only('GET');
    return require_user();
}

function validate_password(string $pw): void
{
    if (mb_strlen($pw) < 8) fail('password_short', 422);
    if (mb_strlen($pw) > 200) fail('password_long', 422);
}

function ui_lang(array $b): string
{
    $l = (string)($b['lang'] ?? '');
    return in_array($l, LANGS, true) ? $l : 'en';
}

function valid_email(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) fail('email_invalid', 422);
}

function user_row(int $id): array
{
    $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: [];
}

function new_user(string $name, string $email, string $hash, ?string $googleSub, string $lang): int
{
    db()->prepare('INSERT INTO ' . t('users') . ' (name, email, password_hash, google_sub, ui_lang, created_at, last_login_at) VALUES (?,?,?,?,?,?,?)')
        ->execute([$name, $email, $hash, $googleSub, $lang, now_utc(), now_utc()]);
    return (int)db()->lastInsertId();
}

function signed_in(int $uid): void
{
    db()->prepare('UPDATE ' . t('users') . ' SET last_login_at = ? WHERE id = ?')->execute([now_utc(), $uid]);
    $csrf = create_auth_session($uid);
    send_json(['ok' => true, 'user' => public_user(user_row($uid)), 'csrf' => $csrf]);
}

/** Too many searches or new feeds from one address: a gentle limit, the catalogues are run by volunteers. */
function limit(string $kind, int $max, int $minutes): void
{
    if (too_many_attempts($kind, $max, $minutes)) fail('rate_limited', 429);
    record_attempt($kind);
}

// ---------- pictures ----------

/**
 * img: a picture of a publisher (artwork of a podcast or an episode), read by the server, made at most w pixels wide and
 * kept in cache/img/ (or the temporary folder). Only addresses signed by img_url() are read, so nobody can use the
 * server to fetch something else. A picture that cannot be read is remembered for a day.
 */
function serve_img(): void
{
    $w = (int)($_GET['w'] ?? 0);
    $src = base64_decode(strtr((string)($_GET['u'] ?? ''), '-_', '+/'), true);
    $alt = isset($_GET['a']) ? base64_decode(strtr((string)$_GET['a'], '-_', '+/'), true) : '';
    if (!in_array($w, IMG_SIZES, true) || $src === false || $src === '' || $alt === false || !hash_equals(substr(hash_hmac('sha256', $w . '|' . $src . '|' . $alt, img_key()), 0, 24), (string)($_GET['s'] ?? ''))) {
        http_response_code(404);
        exit;
    }
    $dir = dirname(__DIR__) . '/cache/img';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
    if (!is_dir($dir) || !is_writable($dir)) { $dir = sys_get_temp_dir() . '/savpodcasts-img'; if (!is_dir($dir)) @mkdir($dir, 0775, true); }
    $name = $dir . '/' . sha1($w . '|' . $src . '|' . $alt);
    $send = function (string $file, string $type) {
        header('Content-Type: ' . $type);
        header('Cache-Control: public, max-age=31536000, immutable');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'");
        header('Content-Length: ' . filesize($file));
        readfile($file);
        exit;
    };
    foreach (['.jpg' => 'image/jpeg', '.png' => 'image/png', '.webp' => 'image/webp', '.gif' => 'image/gif'] as $ext => $type) if (is_file($name . $ext)) $send($name . $ext, $type);
    $gone = function () use ($name) {
        @file_put_contents($name . '.fail', (string)time());
        http_response_code(404);
        header('Cache-Control: no-store');
        exit;
    };
    // a picture that could not be read is not asked again for 6 hours
    if (is_file($name . '.fail') && filemtime($name . '.fail') > time() - 21600) { http_response_code(404); header('Cache-Control: no-store'); exit; }
    $types = [IMAGETYPE_JPEG => ['.jpg', 'image/jpeg'], IMAGETYPE_PNG => ['.png', 'image/png'], IMAGETYPE_GIF => ['.gif', 'image/gif'], IMAGETYPE_WEBP => ['.webp', 'image/webp']];
    $res = $info = null;
    foreach (array_filter([$src, $alt]) as $from) {
        $res = net_fetch($from, ['max' => 12000000, 'accept' => 'image/avif;q=0, image/webp, image/jpeg, image/png, image/*;q=0.8'], 10);
        $info = $res['ok'] && $res['status'] === 200 && $res['body'] !== '' ? @getimagesizefromstring($res['body']) : null;
        if ($info && isset($types[$info[2]]) && $info[0] >= 1 && $info[1] >= 1 && $info[0] * $info[1] <= 40000000) break;
        $info = null;
    }
    if (!$info) $gone();
    [$ext, $type] = $types[$info[2]];
    // made smaller with GD (always as JPEG on white: artwork has no need of transparency); without GD, as it came when small
    if (function_exists('imagecreatefromstring') && function_exists('imagejpeg')) {
        @ini_set('memory_limit', '256M');
        $im = @imagecreatefromstring($res['body']);
        if ($im) {
            $sw = imagesx($im);
            $sh = imagesy($im);
            $scale = min(1, $w / max($sw, $sh));
            $dw = max(1, (int)round($sw * $scale));
            $dh = max(1, (int)round($sh * $scale));
            $out = imagecreatetruecolor($dw, $dh);
            imagefill($out, 0, 0, imagecolorallocate($out, 255, 255, 255));
            imagecopyresampled($out, $im, 0, 0, 0, 0, $dw, $dh, $sw, $sh);
            $tmp = $name . '.tmp' . getmypid();
            imageinterlace($out, true);
            if (imagejpeg($out, $tmp, 84)) { rename($tmp, $name . '.jpg'); $send($name . '.jpg', 'image/jpeg'); }
        }
    }
    if (strlen($res['body']) > 1500000) $gone();
    file_put_contents($name . $ext, $res['body']);
    $send($name . $ext, $type);
}

// ---------- SavAccount: signing in and joining an account that already exists ----------

require dirname(__DIR__, 2) . '/identity/identity.php';

/** The language of the messages of the sign-in: the app sends it with every request. */
function identity_lang(): string
{
    $h = strtolower((string)($_SERVER['HTTP_X_LANG'] ?? ($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '')));
    return strpos($h, 'it') === 0 ? 'it' : 'en';
}

identity_setup([
    'name' => 'SavPodcasts', 'cookie' => 'savpodcasts', 'lang' => fn() => identity_lang(),
    'fail' => function (string $code, int $http): void {
        fail($code, $http);
    },
    'accepted' => fn(array $b) => !empty($b['acceptTerms']),
    'create' => fn(array $who, array $b) => new_user($who['name'] ?: explode('@', $who['email'])[0], $who['email'], '', null, ui_lang($b)),
    'writer' => fn() => writer(),
]);
identity_route($r);

// ---------- podcasts: helpers ----------

/** The settings of SavPodcasts of an account (created the first time). */
function profile(array $u): array
{
    $p = q('SELECT * FROM ' . t('pod_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    if (!$p) {
        q('INSERT IGNORE INTO ' . t('pod_profiles') . ' (user_id, prefs, created_at) VALUES (?,?,?)', [$u['id'], '{}', now_utc()]);
        $p = q('SELECT * FROM ' . t('pod_profiles') . ' WHERE user_id = ?', [$u['id']])->fetch();
    }
    return $p;
}

function profile_prefs(array $p): array
{
    $x = json_decode((string)($p['prefs'] ?? ''), true);
    return is_array($x) ? $x : [];
}

function id_of($v): int
{
    return is_numeric($v) && (int)$v > 0 && (int)$v < 4294967295 ? (int)$v : 0;
}

function ids_of($v, int $max = 500): array
{
    return array_values(array_unique(array_filter(array_map('id_of', is_array($v) ? array_slice($v, 0, $max) : []))));
}

function feed_or_404($id): array
{
    $f = feed_row(id_of($id));
    if (!$f) fail('not_found', 404);
    return $f;
}

function episode_or_404(int $id): array
{
    $e = q('SELECT id, feed_id FROM ' . t('pod_episodes') . ' WHERE id = ?', [$id])->fetch();
    if (!$e) fail('not_found', 404);
    return $e;
}

function sub_settings_clean($s): array
{
    $s = is_array($s) ? $s : [];
    $o = [];
    if (isset($s['speed']) && is_numeric($s['speed'])) $o['speed'] = max(0.5, min(3, round((float)$s['speed'] * 20) / 20));
    if (isset($s['skip']) && is_numeric($s['skip'])) $o['skip'] = max(0, min(600, (int)$s['skip']));
    if (isset($s['skipEnd']) && is_numeric($s['skipEnd'])) $o['skipEnd'] = max(0, min(600, (int)$s['skipEnd']));
    return $o;
}

/** The podcasts an account follows, with how many episodes came out since it last opened each one. */
function subs_of(int $uid): array
{
    $rows = q('SELECT f.*, s.settings AS s_settings, s.seen_at AS s_seen, s.added_at AS s_added,
            (SELECT COUNT(*) FROM ' . t('pod_episodes') . ' e LEFT JOIN ' . t('pod_states') . ' st ON st.episode_id = e.id AND st.user_id = s.user_id
              WHERE e.feed_id = f.id AND e.pub_at > COALESCE(s.seen_at, s.added_at) AND COALESCE(st.done, 0) = 0) AS n_new
        FROM ' . t('pod_subs') . ' s JOIN ' . t('pod_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? ORDER BY f.latest_at IS NULL, f.latest_at DESC', [$uid])->fetchAll();
    return array_map(fn($f) => out_feed($f) + ['new' => (int)$f['n_new'], 'settings' => (object)sub_settings_clean(json_decode((string)$f['s_settings'], true)), 'added' => iso($f['s_added'])], $rows);
}

function queue_of(int $uid): array
{
    return array_map('out_episode', q(ep_select() . ' JOIN ' . t('pod_queue') . ' qu ON qu.episode_id = e.id AND qu.user_id = ? ORDER BY qu.sort, qu.added_at', [$uid, $uid])->fetchAll());
}

function set_state(int $uid, int $eid, array $set): void
{
    $cols = array_keys($set);
    $ins = 'INSERT INTO ' . t('pod_states') . ' (user_id, episode_id, ' . implode(', ', $cols) . ', updated_at) VALUES (?,?,' . implode(',', array_fill(0, count($cols), '?')) . ',?)';
    $upd = implode(', ', array_map(fn($c) => "$c = VALUES($c)", $cols)) . ', updated_at = VALUES(updated_at)';
    q("$ins ON DUPLICATE KEY UPDATE $upd", array_merge([$uid, $eid], array_values($set), [now_utc()]));
}

function count_subs(int $fid): void
{
    q('UPDATE ' . t('pod_feeds') . ' SET subs = (SELECT COUNT(*) FROM ' . t('pod_subs') . ' WHERE feed_id = ?) WHERE id = ?', [$fid, $fid]);
}

/** The feeds of the results of a catalogue that are already known: their id here and whether the account follows them. */
function mark_known(array $list, int $uid): array
{
    if (!$list) return $list;
    $hashes = array_map(fn($x) => url_hash($x['url']), $list);
    $in = implode(',', array_fill(0, count($hashes), '?'));
    $known = [];
    foreach (q('SELECT f.id, f.url_hash, s.user_id AS sub FROM ' . t('pod_feeds') . ' f LEFT JOIN ' . t('pod_subs') . " s ON s.feed_id = f.id AND s.user_id = ? WHERE f.url_hash IN ($in)", array_merge([$uid], $hashes))->fetchAll() as $k) $known[$k['url_hash']] = $k;
    foreach ($list as $i => $x) {
        $k = $known[$hashes[$i]] ?? null;
        $list[$i]['id'] = $k ? (int)$k['id'] : null;
        $list[$i]['sub'] = $k && $k['sub'] !== null;
    }
    return $list;
}

/** The feeds an OPML file lists (outline xmlUrl, at any depth). */
function opml_urls(string $xml): array
{
    $prev = libxml_use_internal_errors(true);
    $sx = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    if ($sx === false) return [];
    $out = [];
    foreach ($sx->xpath('//outline') ?: [] as $o) {
        foreach ($o->attributes() as $k => $v) {
            if (strtolower((string)$k) !== 'xmlurl') continue;
            $u = net_clean_url((string)$v);
            if ($u !== '') $out[url_hash($u)] = $u;
        }
    }
    return array_values($out);
}

/** Feeds of an account to bring up to date now: never read first, then the oldest. */
function stale_subs(int $uid, int $limit): array
{
    $m = (int)config_value('refresh_minutes', 30);
    $rows = q('SELECT f.* FROM ' . t('pod_subs') . ' s JOIN ' . t('pod_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? AND (f.checked_at IS NULL OR f.checked_at < ?)
        ORDER BY f.fetched_at IS NOT NULL, f.checked_at LIMIT ' . (int)($limit * 3), [$uid, gmdate('Y-m-d H:i:s', time() - $m * 60)])->fetchAll();
    return array_slice(array_values(array_filter($rows, fn($f) => feed_stale($f))), 0, $limit);
}

function x(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_XML1, 'UTF-8');
}

switch ($r) {

    // ================================================================ accounts

    case 'auth.config':
        send_json(['ok' => true, 'installed' => true, 'savAccount' => sav_enabled(), 'mailReady' => mail_settings() !== null]);

    case 'auth.me':
        only('GET');
        $u = current_user();
        if (!$u || $u['status'] !== 'active') send_json(['ok' => true, 'user' => null]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id'])), 'csrf' => $u['csrf_token']]);

    case 'auth.register':
        only('POST');
        if (too_many_attempts('register', 5, 60)) fail('rate_limited', 429);
        $b = body();
        $name = s($b, 'name', 80);
        $email = mb_strtolower(s($b, 'email', 190));
        $pw = (string)($b['password'] ?? '');
        if (mb_strlen($name) < 2) fail('name_required', 422);
        valid_email($email);
        validate_password($pw);
        if (empty($b['acceptTerms'])) fail('terms_required', 422);
        // The same answer whether the address is new or already registered, so nobody can find out who has an account
        $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE email = ?');
        $st->execute([$email]);
        $row = $st->fetch();
        record_attempt('register');
        if (!$row) send_account_link(user_row(new_user($name, $email, password_hash($pw, PASSWORD_DEFAULT), null, ui_lang($b))), ui_lang($b), 'verify');
        elseif (empty($row['email_verified_at']) && $row['status'] === 'active' && !too_many_attempts('verify_mail', 3, 60)) {
            record_attempt('verify_mail');
            send_account_link($row, ui_lang($b), 'verify');
        }
        send_json(['ok' => true, 'checkEmail' => true]);

    case 'auth.login':
        only('POST');
        if (too_many_attempts('login', 10, 15)) fail('rate_limited', 429);
        $b = body();
        $email = mb_strtolower(s($b, 'email', 190));
        $pw = (string)($b['password'] ?? '');
        $st = db()->prepare('SELECT * FROM ' . t('users') . ' WHERE email = ?');
        $st->execute([$email]);
        $row = $st->fetch();
        // One answer for an unknown address, a wrong password and an account without a password, in about the same time
        $ok = $row && $row['password_hash'] !== '' ? password_verify($pw, $row['password_hash']) : password_hash($pw, PASSWORD_DEFAULT) === '';
        if (!$ok) {
            record_attempt('login');
            fail('bad_credentials', 401);
        }
        if ($row['status'] !== 'active') fail('disabled', 403);
        clear_attempts('login');
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $row['id']]);
        signed_in((int)$row['id']);

    case 'auth.resend':
        $u = writer(true);
        if (!empty($u['email_verified_at'])) send_json(['ok' => true, 'user' => public_user(user_row((int)$u['id']))]);
        if (too_many_attempts('verify_mail', 3, 60)) fail('rate_limited', 429);
        record_attempt('verify_mail');
        send_account_link(user_row((int)$u['id']), ui_lang(body()), 'verify');
        send_json(['ok' => true]);

    case 'auth.verify':
        // The link of the email opens the app, which asks for this with a button: mail scanners that open links do nothing
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $token = (string)(body()['token'] ?? '');
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . ' WHERE token_hash = ? AND purpose = \'verify\' AND expires_at > ?');
        $st->execute([hash('sha256', $token), now_utc()]);
        $uid = (int)$st->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        db()->prepare('UPDATE ' . t('users') . ' SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([now_utc(), $uid]);
        db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ? AND purpose = \'verify\'')->execute([$uid]);
        if (user_row($uid)['status'] !== 'active') fail('disabled', 403);
        signed_in($uid);

    case 'auth.logout':
        only('POST');
        $u = current_user();
        if ($u) require_csrf($u);
        destroy_auth_session();
        send_json(['ok' => true]);

    case 'auth.password':
        $u = writer();
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['current'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        $pw = (string)($b['password'] ?? '');
        validate_password($pw);
        db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ? WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.forgot':
        // The same answer whether the address has an account or not
        only('POST');
        if (too_many_attempts('forgot', 5, 60)) fail('rate_limited', 429);
        record_attempt('forgot');
        $b = body();
        $st = db()->prepare('SELECT * FROM ' . t('users') . " WHERE email = ? AND status = 'active'");
        $st->execute([mb_strtolower(s($b, 'email', 190))]);
        $row = $st->fetch();
        if ($row) send_account_link($row, ui_lang($b), 'reset');
        send_json(['ok' => true]);

    case 'auth.reset':
        // The link proves the address too. Every other session of the account ends.
        only('POST');
        if (too_many_attempts('verify', 20, 15)) fail('rate_limited', 429);
        $b = body();
        $pw = (string)($b['password'] ?? '');
        validate_password($pw);
        $st = db()->prepare('SELECT user_id FROM ' . t('email_tokens') . " WHERE token_hash = ? AND purpose = 'reset' AND expires_at > ?");
        $st->execute([hash('sha256', (string)($b['token'] ?? '')), now_utc()]);
        $uid = (int)$st->fetchColumn();
        if (!$uid) {
            record_attempt('verify');
            fail('token_invalid', 410);
        }
        if (user_row($uid)['status'] !== 'active') fail('disabled', 403);
        db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?')->execute([password_hash($pw, PASSWORD_DEFAULT), now_utc(), $uid]);
        db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ?')->execute([$uid]);
        db()->prepare('DELETE FROM ' . t('auth_tokens') . ' WHERE user_id = ?')->execute([$uid]);
        signed_in($uid);

    case 'auth.profile':
        // Name and language of the app (also the language of the platform's emails). The email never changes.
        $u = writer(true);
        $b = body();
        $name = s($b, 'name', 80);
        if ($name !== '' && mb_strlen($name) < 2) fail('name_required', 422);
        db()->prepare('UPDATE ' . t('users') . ' SET name = IF(? = \'\', name, ?), ui_lang = ? WHERE id = ?')->execute([$name, $name, ui_lang($b), $u['id']]);
        send_json(['ok' => true, 'user' => public_user(user_row($u['id']))]);

    case 'auth.export':
        // Everything SavPodcasts keeps of the account, as one JSON file (polls, calendars, notebooks… are exported by their apps)
        $u = reader();
        $p = profile($u);
        $subs = q('SELECT f.url, f.title, s.settings, s.added_at FROM ' . t('pod_subs') . ' s JOIN ' . t('pod_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? ORDER BY s.added_at', [$u['id']])->fetchAll();
        $states = q('SELECT f.url AS feed, e.title, e.audio, s.pos, s.dur, s.done, s.starred, s.played_at, s.updated_at FROM ' . t('pod_states') . ' s JOIN ' . t('pod_episodes') . ' e ON e.id = s.episode_id
            JOIN ' . t('pod_feeds') . ' f ON f.id = e.feed_id WHERE s.user_id = ? ORDER BY s.updated_at', [$u['id']])->fetchAll();
        $queue = q('SELECT f.url AS feed, e.title, e.audio FROM ' . t('pod_queue') . ' qu JOIN ' . t('pod_episodes') . ' e ON e.id = qu.episode_id JOIN ' . t('pod_feeds') . ' f ON f.id = e.feed_id
            WHERE qu.user_id = ? ORDER BY qu.sort', [$u['id']])->fetchAll();
        header('Content-Disposition: attachment; filename="savpodcasts-data.json"');
        send_json(['app' => 'SavPodcasts', 'exported' => gmdate('c'), 'account' => ['name' => $u['name'], 'email' => $u['email'], 'created' => iso($u['created_at'])],
            'prefs' => profile_prefs($p),
            'following' => array_map(fn($s) => ['feed' => $s['url'], 'title' => $s['title'], 'since' => iso($s['added_at']), 'settings' => json_decode((string)$s['settings'], true) ?: new stdClass()], $subs),
            'episodes' => array_map(fn($s) => ['feed' => $s['feed'], 'title' => $s['title'], 'audio' => $s['audio'], 'position' => (int)$s['pos'], 'duration' => (int)$s['dur'], 'played' => (bool)$s['done'],
                'starred' => (bool)$s['starred'], 'playedAt' => iso($s['played_at']), 'updated' => iso($s['updated_at'])], $states),
            'queue' => $queue]);

    case 'auth.delete':
        $u = writer(true);
        $b = body();
        $row = user_row($u['id']);
        if ($row['password_hash'] !== '' && !password_verify((string)($b['password'] ?? ''), $row['password_hash'])) fail('bad_password', 422);
        $fids = q('SELECT feed_id FROM ' . t('pod_subs') . ' WHERE user_id = ?', [$u['id']])->fetchAll(PDO::FETCH_COLUMN);
        db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$u['id']]);
        foreach ($fids as $fid) count_subs((int)$fid);
        set_auth_cookie('', time() - 3600);
        send_json(['ok' => true]);

    // ================================================================ podcasts

    case 'pod.init':
        // Everything the app needs to start: settings, the podcasts followed, the queue
        $u = reader();
        $p = profile($u);
        send_json(['ok' => true, 'prefs' => (object)profile_prefs($p), 'subs' => subs_of($u['id']), 'queue' => queue_of($u['id']), 'catalog' => catalog_source(),
            'pending' => (int)q('SELECT COUNT(*) FROM ' . t('pod_subs') . ' s JOIN ' . t('pod_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? AND f.fetched_at IS NULL AND f.fails < 3', [$u['id']])->fetchColumn()]);

    case 'pod.prefs':
        // Settings of SavPodcasts (speed, skips, theme…): read only by the app
        $u = writer();
        profile($u);
        $p = json_out((object)(is_array(body()['prefs'] ?? null) ? body()['prefs'] : []));
        if (strlen($p) > 6000) fail('bad_request', 413);
        q('UPDATE ' . t('pod_profiles') . ' SET prefs = ? WHERE user_id = ?', [$p, $u['id']]);
        send_json(['ok' => true]);

    case 'pod.home':
        // The new episodes of the podcasts followed (newest first; before: older than that date), what is half listened and
        // what was listened to the end lately
        $u = reader();
        $before = parse_date((string)($_GET['before'] ?? ''));
        $args = [$u['id'], $u['id']];
        $where = '';
        if ($before) { $where = ' WHERE e.pub_at < ?'; $args[] = $before; }
        $latest = q(ep_select() . ' JOIN ' . t('pod_subs') . ' sub ON sub.feed_id = e.feed_id AND sub.user_id = ?' . $where . ' ORDER BY e.pub_at DESC, e.id DESC LIMIT 40', $args)->fetchAll();
        $cont = $before ? [] : q(ep_select() . ' WHERE s.pos > 0 AND s.done = 0 ORDER BY s.updated_at DESC LIMIT 12', [$u['id']])->fetchAll();
        // played, and listened to in the player lately (marked as played without listening does not count): to listen again
        $again = $before ? [] : q(ep_select() . ' WHERE s.done = 1 AND s.played_at IS NOT NULL ORDER BY s.played_at DESC LIMIT 10', [$u['id']])->fetchAll();
        send_json(['ok' => true, 'latest' => array_map('out_episode', $latest), 'continue' => array_map('out_episode', $cont), 'again' => array_map('out_episode', $again), 'more' => count($latest) === 40]);

    case 'pod.refresh':
        // Brings up to date the podcasts followed that are old (several at once, ~10 seconds at most); the app asks again
        // while something is left (pending: feeds never read yet, after an OPML import)
        $u = writer();
        $todo = stale_subs($u['id'], 12);
        $res = $todo ? refresh_feeds($todo, 10) : [];
        $pending = (int)q('SELECT COUNT(*) FROM ' . t('pod_subs') . ' s JOIN ' . t('pod_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? AND f.fetched_at IS NULL AND f.fails < 3', [$u['id']])->fetchColumn();
        send_json(['ok' => true, 'updated' => count(array_filter($res, fn($x) => $x === 'new')), 'checked' => count($res), 'pending' => $pending]);

    case 'pod.search':
        $u = reader();
        limit('pod_search', 90, 10);
        $term = s($_GET, 'q', 200);
        // an address of a feed is opened as it is
        $url = preg_match('#^(https?|feed|itpc|pcast)://|^[\w.-]+\.[a-z]{2,}/\S*$#i', $term) ? net_clean_url($term) : '';
        if ($url !== '') send_json(['ok' => true, 'url' => $url, 'results' => []]);
        $lang = s($_GET, 'lang', 5);
        send_json(['ok' => true, 'results' => mark_known(catalog_search($term, in_array($lang, LANGS, true) ? $lang : ''), $u['id']), 'source' => catalog_source()]);

    case 'pod.popular':
        $u = reader();
        limit('pod_search', 90, 10);
        $lang = preg_match('/^[a-z]{2}$/', (string)($_GET['lang'] ?? '')) ? (string)$_GET['lang'] : '';
        send_json(['ok' => true, 'results' => mark_known(catalog_popular($lang), $u['id']), 'source' => catalog_source()]);

    case 'pod.browse':
        // The podcasts of an author (by=author) or of a category (by=category, as written in the feeds: "News"…): the ones
        // this server already knows, then the ones of the open catalogue; the language of the app first
        $u = reader();
        limit('pod_search', 90, 10);
        $by = (string)($_GET['by'] ?? '');
        $v = s($_GET, 'v', 120);
        $lang = preg_match('/^[a-z]{2}$/', (string)($_GET['lang'] ?? '')) ? (string)$_GET['lang'] : '';
        if (!in_array($by, ['author', 'category'], true) || mb_strlen($v) < 2) fail('bad_request', 422);
        $local = [];
        $like = '%' . addcslashes($v, '%_\\') . '%';
        $rows = q('SELECT * FROM ' . t('pod_feeds') . ' WHERE fetched_at IS NOT NULL AND ' . ($by === 'author' ? 'author' : 'cats') . ' LIKE ? ORDER BY subs DESC, latest_at DESC LIMIT 200', [$like])->fetchAll();
        foreach ($rows as $f) {
            $ok = $by === 'author' ? by_author($f['author'], $v) : in_array(mb_strtolower($v), array_map('mb_strtolower', explode(', ', $f['cats'])), true);
            if ($by === 'category' && $lang !== '' && $f['lang'] !== '' && strpos($f['lang'], $lang) !== 0) $ok = false;
            if ($ok) $local[] = ['url' => $f['url'], 'title' => $f['title'], 'author' => $f['author'], 'image' => img_url($f['image'], 200), 'descr' => plain($f['descr'], 260),
                'lang' => $f['lang'], 'episodes' => (int)$f['n_episodes'] ?: null, 'latest' => iso($f['latest_at']), 'cats' => $f['cats'] !== '' ? explode(', ', $f['cats']) : []];
        }
        $far = $by === 'author' ? catalog_by_author($v) : catalog_by_category($v, $lang);
        $seen = [];
        $all = [];
        foreach (array_merge($local, $far) as $x) { $h = url_hash($x['url']); if (!isset($seen[$h])) { $seen[$h] = 1; $all[] = $x; } }
        if ($by === 'author' && $lang !== '') usort($all, fn($a, $b) => (strpos((string)$b['lang'], $lang) === 0) <=> (strpos((string)$a['lang'], $lang) === 0));
        send_json(['ok' => true, 'results' => mark_known(array_slice($all, 0, 120), $u['id']), 'source' => catalog_source()]);

    case 'pod.open':
        // A podcast from its feed (a result of the catalogue, an address typed): read now when new or old; its id here
        $u = writer();
        $b = body();
        $url = net_clean_url(s($b, 'url', 2000));
        if ($url === '') fail('feed_bad_url', 422);
        $f = q('SELECT * FROM ' . t('pod_feeds') . ' WHERE url_hash = ?', [url_hash($url)])->fetch();
        if (!$f || !$f['fetched_at'] || feed_stale($f)) {
            limit('pod_open', 60, 10);
            $f = $f ?: feed_for_url($url);
            refresh_feed($f, true);
            $f = feed_row((int)$f['id']);
        }
        if (!$f['fetched_at']) {
            $err = $f['error'];
            // a feed that could never be read is not kept, unless someone follows it
            if (!(int)$f['subs']) q('DELETE FROM ' . t('pod_feeds') . ' WHERE id = ? AND fetched_at IS NULL AND subs = 0', [$f['id']]);
            fail($err === 'not_feed' ? 'feed_not_podcast' : ($err === 'blocked' || $err === 'bad_url' ? 'feed_bad_url' : 'feed_unreadable'), 422);
        }
        send_json(['ok' => true, 'id' => (int)$f['id']]);

    case 'pod.podcast':
        // A podcast with its episodes (100 at a time; sort new | old; only: unplayed)
        $u = reader();
        $f = feed_or_404($_GET['id'] ?? 0);
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        if ($offset === 0 && feed_stale($f) && empty($_GET['quick'])) { refresh_feed($f); $f = feed_row((int)$f['id']); }
        $sub = q('SELECT * FROM ' . t('pod_subs') . ' WHERE user_id = ? AND feed_id = ?', [$u['id'], $f['id']])->fetch();
        $order = ($_GET['sort'] ?? '') === 'old' ? 'e.pub_at ASC, e.id ASC' : 'e.pub_at DESC, e.id DESC';
        $only = ($_GET['only'] ?? '') === 'unplayed' ? ' AND COALESCE(s.done, 0) = 0' : '';
        $term = s($_GET, 'q', 100);
        $args = [$u['id'], $f['id']];
        if ($term !== '') { $only .= ' AND (e.title LIKE ? OR e.summary LIKE ?)'; $like = '%' . addcslashes($term, '%_\\') . '%'; array_push($args, $like, $like); }
        $eps = q(ep_select() . " WHERE e.feed_id = ?$only ORDER BY $order LIMIT 100 OFFSET $offset", $args)->fetchAll();
        $total = (int)q('SELECT COUNT(*) FROM ' . t('pod_episodes') . ' e LEFT JOIN ' . t('pod_states') . ' s ON s.episode_id = e.id AND s.user_id = ? WHERE e.feed_id = ?' . $only, $args)->fetchColumn();
        send_json(['ok' => true, 'podcast' => out_feed($f, true) + ['sub' => (bool)$sub, 'settings' => (object)sub_settings_clean(json_decode((string)($sub['settings'] ?? ''), true)), 'seen' => iso($sub['seen_at'] ?? null)],
            'episodes' => array_map('out_episode', $eps), 'total' => $total]);

    case 'pod.episode':
        $u = reader();
        $e = q(ep_select(true) . ' WHERE e.id = ?', [$u['id'], id_of($_GET['id'] ?? 0)])->fetch();
        if (!$e) fail('not_found', 404);
        $f = feed_row((int)$e['feed_id']);
        $sub = (bool)q('SELECT 1 FROM ' . t('pod_subs') . ' WHERE user_id = ? AND feed_id = ?', [$u['id'], $f['id']])->fetchColumn();
        send_json(['ok' => true, 'episode' => out_episode($e, true), 'podcast' => out_feed($f) + ['sub' => $sub]]);

    case 'pod.subscribe':
        $u = writer();
        $f = feed_or_404(body()['id'] ?? 0);
        if ((int)q('SELECT COUNT(*) FROM ' . t('pod_subs') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_SUBS) fail('too_many', 422);
        q('INSERT IGNORE INTO ' . t('pod_subs') . ' (user_id, feed_id, seen_at, added_at) VALUES (?,?,?,?)', [$u['id'], $f['id'], now_utc(), now_utc()]);
        count_subs((int)$f['id']);
        send_json(['ok' => true, 'subs' => subs_of($u['id'])]);

    case 'pod.unsubscribe':
        $u = writer();
        $f = feed_or_404(body()['id'] ?? 0);
        q('DELETE FROM ' . t('pod_subs') . ' WHERE user_id = ? AND feed_id = ?', [$u['id'], $f['id']]);
        count_subs((int)$f['id']);
        send_json(['ok' => true, 'subs' => subs_of($u['id'])]);

    case 'pod.sub_settings':
        // Speed and skips of one podcast followed
        $u = writer();
        $b = body();
        $f = feed_or_404($b['id'] ?? 0);
        $set = sub_settings_clean($b['settings'] ?? []);
        q('UPDATE ' . t('pod_subs') . ' SET settings = ? WHERE user_id = ? AND feed_id = ?', [$set ? json_out($set) : null, $u['id'], $f['id']]);
        send_json(['ok' => true, 'settings' => (object)$set]);

    case 'pod.seen':
        // The podcast was opened: its episodes up to now are no longer "new"
        $u = writer();
        q('UPDATE ' . t('pod_subs') . ' SET seen_at = ? WHERE user_id = ? AND feed_id = ?', [now_utc(), $u['id'], id_of(body()['id'] ?? 0)]);
        send_json(['ok' => true]);

    // ================================================================ listening

    case 'pod.progress':
        // Where the listener is (seconds), sent while playing and when it stops; done: played to the end
        $u = writer();
        $b = body();
        $e = episode_or_404(id_of($b['id'] ?? 0));
        $dur = max(0, min(86400 * 2, (int)($b['dur'] ?? 0)));
        $pos = max(0, min(86400 * 2, (int)($b['pos'] ?? 0)));
        // a position at the very end is the end: the episode is played (whatever order the requests arrive in)
        if (!empty($b['done']) || ($dur > 0 && $pos >= $dur - 2)) {
            set_state($u['id'], (int)$e['id'], ['pos' => 0, 'dur' => $dur, 'done' => 1, 'played_at' => now_utc()]);
            q('DELETE FROM ' . t('pod_queue') . ' WHERE user_id = ? AND episode_id = ?', [$u['id'], $e['id']]);
        } else {
            set_state($u['id'], (int)$e['id'], ['pos' => $pos, 'dur' => $dur, 'done' => 0, 'played_at' => now_utc()]);
        }
        // the true length of the audio, when the feed did not say it
        if ($dur > 0) q('UPDATE ' . t('pod_episodes') . ' SET duration = ? WHERE id = ? AND duration = 0', [$dur, $e['id']]);
        send_json(['ok' => true]);

    case 'pod.mark':
        // Episodes marked as played (or not); played ones leave the queue
        $u = writer();
        $b = body();
        $ids = ids_of($b['ids'] ?? []);
        if (!$ids) fail('bad_request', 422);
        $in = implode(',', array_fill(0, count($ids), '?'));
        $done = !empty($b['done']);
        $known = q('SELECT id FROM ' . t('pod_episodes') . " WHERE id IN ($in)", $ids)->fetchAll(PDO::FETCH_COLUMN);
        foreach ($known as $id) set_state($u['id'], (int)$id, ['pos' => 0, 'done' => $done ? 1 : 0]);
        if ($done) q('DELETE FROM ' . t('pod_queue') . " WHERE user_id = ? AND episode_id IN ($in)", array_merge([$u['id']], $ids));
        send_json(['ok' => true]);

    case 'pod.mark_all':
        // Every episode of a podcast played (or none)
        $u = writer();
        $b = body();
        $f = feed_or_404($b['id'] ?? 0);
        if (!empty($b['done'])) {
            q('INSERT INTO ' . t('pod_states') . ' (user_id, episode_id, pos, done, updated_at) SELECT ?, id, 0, 1, ? FROM ' . t('pod_episodes') . ' WHERE feed_id = ?
                ON DUPLICATE KEY UPDATE done = 1, pos = 0, updated_at = VALUES(updated_at)', [$u['id'], now_utc(), $f['id']]);
            q('DELETE qu FROM ' . t('pod_queue') . ' qu JOIN ' . t('pod_episodes') . ' e ON e.id = qu.episode_id WHERE qu.user_id = ? AND e.feed_id = ?', [$u['id'], $f['id']]);
        } else {
            q('UPDATE ' . t('pod_states') . ' s JOIN ' . t('pod_episodes') . ' e ON e.id = s.episode_id SET s.done = 0, s.pos = 0, s.updated_at = ? WHERE s.user_id = ? AND e.feed_id = ?', [now_utc(), $u['id'], $f['id']]);
        }
        send_json(['ok' => true]);

    case 'pod.forget':
        // An episode started and not liked: out of "Continue listening" and of the history (its position and when it was
        // played are forgotten; starred stays). It answers what was there, so restore can put it back (undo).
        $u = writer();
        $b = body();
        $e = episode_or_404(id_of($b['id'] ?? 0));
        $was = q('SELECT pos, played_at FROM ' . t('pod_states') . ' WHERE user_id = ? AND episode_id = ?', [$u['id'], $e['id']])->fetch() ?: ['pos' => 0, 'played_at' => null];
        if (is_array($b['restore'] ?? null)) {
            $r = $b['restore'];
            $at = parse_date((string)($r['played'] ?? ''));
            set_state($u['id'], (int)$e['id'], ['pos' => max(0, min(86400 * 2, (int)($r['pos'] ?? 0))), 'done' => 0, 'played_at' => $at]);
        } else {
            set_state($u['id'], (int)$e['id'], ['pos' => 0, 'done' => 0, 'played_at' => null]);
        }
        send_json(['ok' => true, 'was' => ['pos' => (int)$was['pos'], 'played' => iso($was['played_at'])]]);

    case 'pod.star':
        $u = writer();
        $b = body();
        $e = episode_or_404(id_of($b['id'] ?? 0));
        set_state($u['id'], (int)$e['id'], ['starred' => !empty($b['on']) ? 1 : 0]);
        send_json(['ok' => true]);

    case 'pod.library':
        // starred: episodes kept · history: played lately (to the end or not) · progress: half listened
        $u = reader();
        $tab = (string)($_GET['tab'] ?? 'starred');
        $offset = max(0, (int)($_GET['offset'] ?? 0));
        if ($tab === 'history') $sql = ep_select() . ' WHERE s.played_at IS NOT NULL ORDER BY s.played_at DESC';
        elseif ($tab === 'progress') $sql = ep_select() . ' WHERE s.pos > 0 AND s.done = 0 ORDER BY s.updated_at DESC';
        else $sql = ep_select() . ' WHERE s.starred = 1 ORDER BY s.updated_at DESC';
        $rows = q("$sql LIMIT 60 OFFSET $offset", [$u['id']])->fetchAll();
        send_json(['ok' => true, 'episodes' => array_map('out_episode', $rows), 'more' => count($rows) === 60]);

    case 'pod.queue':
        $u = reader();
        send_json(['ok' => true, 'queue' => queue_of($u['id'])]);

    case 'pod.queue_set':
        // The whole queue in a new order (episodes left out leave it)
        $u = writer();
        $ids = ids_of(body()['ids'] ?? [], MAX_QUEUE);
        db()->beginTransaction();
        q('DELETE FROM ' . t('pod_queue') . ' WHERE user_id = ?', [$u['id']]);
        if ($ids) {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $known = array_flip(q('SELECT id FROM ' . t('pod_episodes') . " WHERE id IN ($in)", $ids)->fetchAll(PDO::FETCH_COLUMN));
            $now = now_utc();
            $n = 0;
            foreach ($ids as $id) if (isset($known[$id])) q('INSERT INTO ' . t('pod_queue') . ' (user_id, episode_id, sort, added_at) VALUES (?,?,?,?)', [$u['id'], $id, $n++, $now]);
        }
        db()->commit();
        send_json(['ok' => true, 'queue' => queue_of($u['id'])]);

    case 'pod.queue_add':
        // at: next (first in the queue) | last
        $u = writer();
        $b = body();
        $e = episode_or_404(id_of($b['id'] ?? 0));
        if ((int)q('SELECT COUNT(*) FROM ' . t('pod_queue') . ' WHERE user_id = ?', [$u['id']])->fetchColumn() >= MAX_QUEUE) fail('queue_full', 422);
        $next = ($b['at'] ?? '') === 'next';
        $sort = (int)q('SELECT ' . ($next ? 'COALESCE(MIN(sort), 1) - 1' : 'COALESCE(MAX(sort), -1) + 1') . ' FROM ' . t('pod_queue') . ' WHERE user_id = ?', [$u['id']])->fetchColumn();
        q('INSERT INTO ' . t('pod_queue') . ' (user_id, episode_id, sort, added_at) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE sort = VALUES(sort)', [$u['id'], $e['id'], $sort, now_utc()]);
        send_json(['ok' => true, 'queue' => queue_of($u['id'])]);

    case 'pod.queue_remove':
        $u = writer();
        $ids = ids_of(body()['ids'] ?? [body()['id'] ?? 0]);
        if ($ids) q('DELETE FROM ' . t('pod_queue') . ' WHERE user_id = ? AND episode_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', array_merge([$u['id']], $ids));
        send_json(['ok' => true, 'queue' => queue_of($u['id'])]);

    // ================================================================ files

    case 'pod.import':
        // An OPML file (the list of podcasts of another app): each feed is followed; they are read afterwards by pod.refresh
        $u = writer();
        $xml = (string)(body()['opml'] ?? '');
        if ($xml === '' || strlen($xml) > 3000000) fail('opml_invalid', 422);
        $urls = opml_urls($xml);
        if (!$urls) fail('opml_invalid', 422);
        $have = (int)q('SELECT COUNT(*) FROM ' . t('pod_subs') . ' WHERE user_id = ?', [$u['id']])->fetchColumn();
        $added = 0;
        foreach ($urls as $url) {
            if ($have + $added >= MAX_SUBS) break;
            $f = feed_for_url($url);
            $n = q('INSERT IGNORE INTO ' . t('pod_subs') . ' (user_id, feed_id, seen_at, added_at) VALUES (?,?,?,?)', [$u['id'], $f['id'], now_utc(), now_utc()])->rowCount();
            if ($n) { $added++; count_subs((int)$f['id']); }
        }
        send_json(['ok' => true, 'found' => count($urls), 'added' => $added, 'subs' => subs_of($u['id'])]);

    case 'pod.export_opml':
        // The podcasts followed as OPML, for any other podcast app
        $u = reader();
        $rows = q('SELECT f.url, f.title, f.link FROM ' . t('pod_subs') . ' s JOIN ' . t('pod_feeds') . ' f ON f.id = s.feed_id WHERE s.user_id = ? ORDER BY f.title', [$u['id']])->fetchAll();
        header('Content-Type: text/x-opml; charset=utf-8');
        header('Content-Disposition: attachment; filename="savpodcasts.opml"');
        header('Cache-Control: no-store');
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n<opml version=\"2.0\">\n  <head>\n    <title>SavPodcasts</title>\n    <dateCreated>" . gmdate(DATE_RFC2822) . "</dateCreated>\n  </head>\n  <body>\n";
        foreach ($rows as $f) echo '    <outline type="rss" text="' . x($f['title']) . '" title="' . x($f['title']) . '" xmlUrl="' . x($f['url']) . '"' . ($f['link'] !== '' ? ' htmlUrl="' . x($f['link']) . '"' : '') . "/>\n";
        echo "  </body>\n</opml>\n";
        exit;

    default:
        fail('not_found', 404);
}

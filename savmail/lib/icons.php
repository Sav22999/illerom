<?php
/**
 * SavMail — the icon of a sender's domain, for the avatar in the list (ciaone.it → https://ciaone.it/apple-touch-icon.png,
 * favicon.svg, favicon.png, favicon.ico…). The server fetches it, not the browser: the sender's site never learns who reads
 * its mail or when. Nothing is stored here: the browser keeps the answer in its cache for a week (a missing icon for a day).
 *
 * Only HTTPS, only public addresses (each redirect checked again, two at most, the address pinned so that DNS cannot change
 * it in between), small files, real pictures (their first bytes say so). Domains of free mail (gmail.com…) have no icon of
 * their own person: the app keeps the initials for them and does not ask.
 */

declare(strict_types=1);

const ML_ICON_PATHS = ['/apple-touch-icon.png', '/favicon.svg', '/icon.svg', '/favicon.png', '/icon.png', '/favicon.ico'];
const ML_ICON_MAX = 300000;
const ML_FREE_MAIL = ['gmail.com', 'googlemail.com', 'outlook.com', 'outlook.it', 'hotmail.com', 'hotmail.it', 'live.com', 'live.it', 'msn.com', 'yahoo.com', 'yahoo.it',
    'ymail.com', 'rocketmail.com', 'icloud.com', 'me.com', 'mac.com', 'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it', 'tim.it', 'fastwebnet.it', 'email.it', 'inwind.it', 'iol.it',
    'blu.it', 'giallo.it', 'aol.com', 'gmx.com', 'gmx.net', 'gmx.de', 'gmx.it', 'web.de', 'proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me', 'tutanota.com', 'tuta.io', 'zoho.com',
    'mail.com', 'yandex.com', 'yandex.ru', 'qq.com', '163.com', 'pec.it', 'legalmail.it', 'postecert.it'];

/** The domain to look at for an address, or '' (free mail, or not a domain). */
function ml_icon_domain(string $d): string
{
    $d = strtolower(trim($d, " .\t"));
    if (!preg_match('/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/', $d)) return '';
    return in_array($d, ML_FREE_MAIL, true) ? '' : $d;
}

/** "news.shop.ciaone.co.uk" → "ciaone.co.uk": the name people registered (good enough without the whole public suffix list). */
function ml_icon_base(string $d): string
{
    $p = explode('.', $d);
    $n = count($p);
    if ($n <= 2) return $d;
    $two = in_array($p[$n - 2], ['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'gob', 'or', 'ne'], true) && strlen($p[$n - 1]) === 2;
    return implode('.', array_slice($p, $two ? -3 : -2));
}

/** A public address of the host, or null. */
function ml_icon_ip(string $host): ?string
{
    $ips = gethostbynamel($host) ?: [];
    foreach ($ips as $ip) if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return null;
    return $ips[0] ?? null;
}

/** What a picture is, from its first bytes; null when it is not one. */
function ml_icon_type(string $b): ?string
{
    if (strncmp($b, "\x89PNG\r\n\x1a\n", 8) === 0) return 'image/png';
    if (strncmp($b, "\x00\x00\x01\x00", 4) === 0) return 'image/x-icon';
    if (strncmp($b, 'GIF8', 4) === 0) return 'image/gif';
    if (strncmp($b, "\xff\xd8\xff", 3) === 0) return 'image/jpeg';
    if (strncmp($b, 'RIFF', 4) === 0 && substr($b, 8, 4) === 'WEBP') return 'image/webp';
    $head = strtolower(ltrim(substr($b, 0, 600), "\xef\xbb\xbf \t\r\n"));
    if (preg_match('/^(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/s', $head)) return 'image/svg+xml';
    return null;
}

/** One HTTPS GET, the address pinned; [status, body, location]. */
function ml_icon_get(string $url, int &$budget)
{
    $u = parse_url($url);
    if (($u['scheme'] ?? '') !== 'https' || empty($u['host']) || (isset($u['port']) && (int)$u['port'] !== 443)) return null;
    $ip = ml_icon_ip($u['host']);
    if (!$ip) return null;
    $body = '';
    $h = curl_init($url);
    curl_setopt_array($h, [CURLOPT_RESOLVE => [$u['host'] . ':443:' . $ip], CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => max(1, min(3, $budget)), CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; SavMail icons)', CURLOPT_HEADER => false,
        CURLOPT_HTTPHEADER => ['Accept: image/avif,image/webp,image/svg+xml,image/png,image/*;q=0.8'],
        CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body) { $body .= $chunk; return strlen($body) > ML_ICON_MAX ? 0 : strlen($chunk); }]);
    $t = microtime(true);
    curl_exec($h);
    $budget -= (int)ceil(microtime(true) - $t);
    $code = (int)curl_getinfo($h, CURLINFO_RESPONSE_CODE);
    $loc = (string)curl_getinfo($h, CURLINFO_REDIRECT_URL);
    $failed = curl_errno($h) !== 0 && strlen($body) <= ML_ICON_MAX;
    return $failed && $code === 0 ? false : [$code, $body, $loc];
}

/** [type, bytes] of the icon of a domain, or null. */
function ml_favicon(string $domain): ?array
{
    $budget = 7; // seconds for all the tries together
    $base = ml_icon_base($domain);
    $hosts = array_values(array_unique(array_filter([$domain, $base, 'www.' . $base])));
    foreach ($hosts as $host) {
        foreach (ML_ICON_PATHS as $path) {
            if ($budget <= 0) return null;
            $url = 'https://' . $host . $path;
            for ($hop = 0; $hop < 3; $hop++) {
                $r = ml_icon_get($url, $budget);
                if ($r === false) continue 3; // the host does not answer: the next host
                if ($r === null) break;
                [$code, $body, $loc] = $r;
                if ($code >= 300 && $code < 400 && $loc !== '') { $url = $loc; continue; }
                if ($code === 200 && strlen($body) >= 60 && strlen($body) <= ML_ICON_MAX && ($type = ml_icon_type($body))) return [$type, $body];
                break;
            }
        }
    }
    return null;
}

<?php
/**
 * SavCalendar — reading a calendar from another site (a subscription). The address is given by a person, so the server
 * must never be used to reach what is not public: only http and https (webcal is https), only public addresses (the
 * name is resolved here and the connection is pinned to that address, so a second answer of the DNS cannot point it
 * elsewhere), at most 3 redirections (each one checked again), a size limit and a time limit.
 */

declare(strict_types=1);

/** "webcal://…" and friends as an https address, or '' when it is not an address we read. */
function sub_url(string $url): string
{
    $url = trim($url);
    if (preg_match('~^webcals?://~i', $url)) $url = 'https://' . preg_replace('~^webcals?://~i', '', $url);
    if (!preg_match('~^https?://~i', $url) || strlen($url) > 1000) return '';
    $p = parse_url($url);
    if (!$p || empty($p['host']) || isset($p['user']) || isset($p['pass'])) return '';
    if (isset($p['port']) && !in_array((int)$p['port'], [80, 443, 8080, 8443], true) && getenv('SAVCALENDAR_TEST_LOCAL') !== '1') return '';
    return $url;
}

/** A public IP address for a host name, or '' (private, local, reserved and the like are refused). */
function public_ip(string $host): string
{
    $host = trim($host, '[]');
    // local tests only: the environment of the test server lets the subscriptions read 127.0.0.1
    if (getenv('SAVCALENDAR_TEST_LOCAL') === '1' && in_array($host, ['127.0.0.1', 'localhost'], true)) return '127.0.0.1';
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : [];
    if (!$ips) {
        $recs = @dns_get_record($host, DNS_A + DNS_AAAA) ?: [];
        foreach ($recs as $r) $ips[] = $r['ip'] ?? ($r['ipv6'] ?? '');
        if (!$ips) { $v4 = gethostbyname($host); if ($v4 !== $host) $ips[] = $v4; }
    }
    foreach ($ips as $ip) {
        if (!$ip) continue;
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return '';
        // what FILTER_FLAG_NO_RES_RANGE lets through: shared address space, IPv4 mapped in IPv6, unique local IPv6
        if (preg_match('/^(100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.|::ffff:|f[cd]|fe[89ab])/i', $ip)) return '';
    }
    foreach ($ips as $ip) if ($ip) return $ip;
    return '';
}

/**
 * Downloads a calendar: ['ok' => true, 'body' => …, 'etag', 'modified'] · ['ok' => true, 'same' => true] (304) ·
 * ['ok' => false, 'error' => code]. $etag and $modified: what the last answer said, to read it again only if it changed.
 */
function fetch_calendar(string $url, string $etag = '', string $modified = ''): array
{
    if (!function_exists('curl_init')) return ['ok' => false, 'error' => 'sub_unreachable'];
    for ($hop = 0; $hop < 4; $hop++) {
        $url = sub_url($url);
        if ($url === '') return ['ok' => false, 'error' => 'sub_url'];
        $p = parse_url($url);
        $host = $p['host'];
        $port = (int)($p['port'] ?? (strtolower($p['scheme']) === 'https' ? 443 : 80));
        $ip = public_ip($host);
        if (getenv('SAVCALENDAR_TEST_LOCAL') === '1' && $ip === '127.0.0.1') $port = (int)($p['port'] ?? 80);
        if ($ip === '') return ['ok' => false, 'error' => 'sub_url'];
        $headers = ['Accept: text/calendar, text/plain;q=0.8, */*;q=0.5', 'User-Agent: SavCalendar/1.0 (+https://www.illerom.eu/savcalendar/)'];
        if ($etag !== '') $headers[] = 'If-None-Match: ' . $etag;
        if ($modified !== '') $headers[] = 'If-Modified-Since: ' . $modified;
        $body = '';
        $too = false;
        $resp = [];
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RESOLVE => [$host . ':' . $port . ':' . (strpos($ip, ':') !== false ? '[' . $ip . ']' : $ip)],
            CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 15, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_ENCODING => '',
            CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$resp) { if (preg_match('/^([A-Za-z\-]+):\s*(.*)$/', trim($line), $m)) $resp[strtolower($m[1])] = $m[2]; return strlen($line); },
            CURLOPT_WRITEFUNCTION => function ($c, $chunk) use (&$body, &$too) { $body .= $chunk; if (strlen($body) > MAX_ICS_BYTES) { $too = true; return 0; } return strlen($chunk); },
        ]);
        curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_errno($ch);
        if (PHP_VERSION_ID < 80000) curl_close($ch);
        if ($too) return ['ok' => false, 'error' => 'sub_big'];
        if (in_array($code, [301, 302, 303, 307, 308], true) && !empty($resp['location'])) {
            $loc = $resp['location'];
            if (!preg_match('~^[a-z]+://~i', $loc)) $loc = $p['scheme'] . '://' . $host . ($loc[0] === '/' ? '' : '/') . $loc;
            $url = $loc;
            continue;
        }
        if ($code === 304) return ['ok' => true, 'same' => true];
        if ($err || $code === 0) return ['ok' => false, 'error' => 'sub_unreachable'];
        if ($code === 401 || $code === 403) return ['ok' => false, 'error' => 'sub_private'];
        if ($code === 404 || $code === 410) return ['ok' => false, 'error' => 'sub_gone'];
        if ($code >= 400) return ['ok' => false, 'error' => 'sub_unreachable'];
        if (stripos(ltrim($body), 'BEGIN:VCALENDAR') !== 0 && stripos(ltrim(preg_replace('/^\xEF\xBB\xBF/', '', $body)), 'BEGIN:VCALENDAR') !== 0) return ['ok' => false, 'error' => 'sub_not_ics'];
        return ['ok' => true, 'body' => $body, 'etag' => mb_substr($resp['etag'] ?? '', 0, 250), 'modified' => mb_substr($resp['last-modified'] ?? '', 0, 100)];
    }
    return ['ok' => false, 'error' => 'sub_unreachable'];
}

<?php
/**
 * SavPodcasts — reading addresses of the Internet (feeds, pictures, catalogues) without opening the server to abuse.
 *
 * Feeds are addresses people type: before every request (and every redirect) the name is resolved here and only public
 * addresses are accepted (never the server itself, the local network or reserved ranges); curl is then pinned to the
 * address that was checked (CURLOPT_RESOLVE), so a name cannot change its answer in between. Redirects are followed by
 * hand (at most 5), answers are cut at a size limit, and many addresses are read at once with curl_multi.
 */

declare(strict_types=1);

const NET_AGENT = 'SavPodcasts/1.0 (+https://www.illerom.eu/savpodcasts/; podcast player)';
const NET_HOPS = 5;

/** The address cleaned up (feed://, itpc://, pcast://, no scheme…), or '' when it cannot be an address of the Internet. */
function net_clean_url(string $u): string
{
    $u = trim(preg_replace('/[\x00-\x20\x7F]+/', '', $u) ?? '');
    if ($u === '') return '';
    $u = preg_replace('#^(feed|itpc|pcast|podcast)://#i', 'https://', $u) ?? $u;
    $u = preg_replace('#^feed:(https?://)#i', '$1', $u) ?? $u;
    if (!preg_match('#^[a-z][a-z0-9+.-]*://#i', $u)) $u = 'https://' . $u;
    $p = parse_url($u);
    if (!$p || !in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) || empty($p['host']) || isset($p['user']) || isset($p['pass'])) return '';
    if (strlen($u) > 2000) return '';
    return $u;
}

/** Resolves a relative address against the one it came from (for redirects and relative links). */
function net_resolve(string $base, string $rel): string
{
    $rel = trim($rel);
    if ($rel === '') return $base;
    if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $rel)) return $rel;
    $b = parse_url($base);
    if (!$b) return $rel;
    $root = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
    if (strpos($rel, '//') === 0) return $b['scheme'] . ':' . $rel;
    if ($rel[0] === '/') return $root . $rel;
    $dir = preg_replace('#/[^/]*$#', '/', $b['path'] ?? '/');
    return $root . $dir . $rel;
}

/** A public IP address of the host of $url, or '' (private, reserved, unknown). */
function net_public_ip(string $host): string
{
    $host = strtolower(trim($host, '[]'));
    if ($host === 'localhost' || substr($host, -6) === '.local' || substr($host, -9) === '.internal' || substr($host, -10) === '.localhost') return '';
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) $ips = [$host];
    else {
        $v4 = @gethostbynamel($host);
        if ($v4) $ips = $v4;
        if (!$ips && function_exists('dns_get_record')) {
            foreach ((array)@dns_get_record($host, DNS_AAAA) as $r) if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
        }
    }
    if (!$ips) return '';
    // every answer must be public: a name that answers with one public and one private address is refused
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return '';
        if (preg_match('/^(0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|169\.254\.|192\.0\.0\.|198\.1[89]\.)/', $ip)) return '';
        if (stripos($ip, 'fc') === 0 || stripos($ip, 'fd') === 0 || stripos($ip, 'fe80') === 0 || $ip === '::1' || stripos($ip, '::ffff:') === 0) return '';
    }
    return $ips[0];
}

/**
 * Reads several addresses at once. $reqs: key => ['url', 'max' (bytes), 'etag', 'modified', 'accept', 'headers' (list)].
 * Answers, with the same keys: ['ok', 'status', 'body', 'type', 'url' (the last address, after redirects), 'moved' (the
 * address after permanent redirects only), 'etag', 'modified', 'error'].
 * error: bad_url · blocked · timeout · too_big · http · network.
 */
function net_fetch_many(array $reqs, int $timeout = 12): array
{
    $out = [];
    $todo = [];
    foreach ($reqs as $k => $r) {
        $u = net_clean_url((string)($r['url'] ?? ''));
        if ($u === '') { $out[$k] = ['ok' => false, 'status' => 0, 'error' => 'bad_url']; continue; }
        $todo[$k] = $r + ['url' => $u, 'hops' => 0, 'moved' => $u, 'permanent' => true];
        $todo[$k]['url'] = $u;
    }
    $deadline = microtime(true) + $timeout;
    while ($todo) {
        $mh = curl_multi_init();
        $handles = [];
        $bufs = [];
        foreach ($todo as $k => $r) {
            $p = parse_url($r['url']);
            $port = (int)($p['port'] ?? (strtolower($p['scheme']) === 'https' ? 443 : 80));
            $ip = net_public_ip((string)$p['host']);
            if ($ip === '') { $out[$k] = ['ok' => false, 'status' => 0, 'error' => 'blocked', 'url' => $r['url']]; continue; }
            $max = (int)($r['max'] ?? 15000000);
            $bufs[$k] = ['body' => '', 'headers' => [], 'big' => false];
            $ch = curl_init($r['url']);
            $hdr = ['Accept: ' . ($r['accept'] ?? 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5')];
            if (!empty($r['etag'])) $hdr[] = 'If-None-Match: ' . $r['etag'];
            if (!empty($r['modified'])) $hdr[] = 'If-Modified-Since: ' . $r['modified'];
            foreach ((array)($r['headers'] ?? []) as $x) $hdr[] = $x;
            $left = max(2, (int)ceil($deadline - microtime(true)));
            curl_setopt_array($ch, [
                CURLOPT_RESOLVE => [$p['host'] . ':' . $port . ':' . (strpos($ip, ':') !== false ? '[' . $ip . ']' : $ip)],
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_CONNECTTIMEOUT => min(6, $left),
                CURLOPT_TIMEOUT => $left,
                CURLOPT_USERAGENT => NET_AGENT,
                CURLOPT_HTTPHEADER => $hdr,
                CURLOPT_ENCODING => '',
                CURLOPT_SSL_VERIFYPEER => true,
                CURLOPT_HEADERFUNCTION => function ($ch, $line) use (&$bufs, $k) {
                    $t = trim($line);
                    if (preg_match('#^HTTP/\S+\s+\d+#', $t)) $bufs[$k]['headers'] = [];
                    elseif (strpos($t, ':') !== false) { [$n, $v] = explode(':', $t, 2); $bufs[$k]['headers'][strtolower(trim($n))] = trim($v); }
                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => function ($ch, $data) use (&$bufs, $k, $max) {
                    if (strlen($bufs[$k]['body']) + strlen($data) > $max) { $bufs[$k]['big'] = true; return 0; }
                    $bufs[$k]['body'] .= $data;
                    return strlen($data);
                },
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[$k] = $ch;
        }
        do {
            $st = curl_multi_exec($mh, $running);
            if ($running) curl_multi_select($mh, 1.0);
        } while ($running && $st === CURLM_OK);
        $next = [];
        foreach ($handles as $k => $ch) {
            $r = $todo[$k];
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $errno = curl_errno($ch);
            $b = $bufs[$k];
            curl_multi_remove_handle($mh, $ch);
            unset($handles[$k]); // curl_close() is a no-op since PHP 8 and deprecated in 8.5: the handle goes with its last reference
            if ($b['big']) { $out[$k] = ['ok' => false, 'status' => $code, 'error' => 'too_big', 'url' => $r['url']]; continue; }
            if ($errno) { $out[$k] = ['ok' => false, 'status' => 0, 'error' => $errno === CURLE_OPERATION_TIMEDOUT ? 'timeout' : 'network', 'url' => $r['url']]; continue; }
            if (in_array($code, [301, 302, 303, 307, 308], true) && !empty($b['headers']['location'])) {
                if ($r['hops'] >= NET_HOPS) { $out[$k] = ['ok' => false, 'status' => $code, 'error' => 'network', 'url' => $r['url']]; continue; }
                $to = net_clean_url(net_resolve($r['url'], $b['headers']['location']));
                if ($to === '') { $out[$k] = ['ok' => false, 'status' => $code, 'error' => 'bad_url', 'url' => $r['url']]; continue; }
                $r['permanent'] = $r['permanent'] && in_array($code, [301, 308], true);
                if ($r['permanent']) $r['moved'] = $to;
                $r['url'] = $to;
                $r['hops']++;
                $next[$k] = $r;
                continue;
            }
            $out[$k] = [
                'ok' => $code >= 200 && $code < 300 || $code === 304,
                'status' => $code,
                'body' => $b['body'],
                'type' => strtolower((string)($b['headers']['content-type'] ?? '')),
                'url' => $r['url'],
                'moved' => $r['moved'],
                'etag' => mb_substr((string)($b['headers']['etag'] ?? ''), 0, 250),
                'modified' => mb_substr((string)($b['headers']['last-modified'] ?? ''), 0, 60),
                'error' => $code >= 200 && $code < 300 || $code === 304 ? '' : 'http',
            ];
        }
        curl_multi_close($mh);
        $todo = microtime(true) < $deadline ? $next : [];
        foreach ($next as $k => $r) if (!$todo) $out[$k] = ['ok' => false, 'status' => 0, 'error' => 'timeout', 'url' => $r['url']];
    }
    return $out;
}

function net_fetch(string $url, array $opt = [], int $timeout = 12): array
{
    return net_fetch_many(['x' => ['url' => $url] + $opt], $timeout)['x'];
}

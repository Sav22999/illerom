<?php
/**
 * SavMail — the settings of well-known mail providers, and finding the settings of any address:
 *   1. a provider of the list below (by the domain of the address);
 *   2. the database of Thunderbird (autoconfig.thunderbird.net, the settings of thousands of providers);
 *   3. the MX records of the domain (a domain of one's own hosted by Google, Microsoft or Aruba);
 *   4. a guess: imap.<domain> and smtp.<domain>.
 * Everything found can be changed by hand. auth: password (the password of the mailbox), apppw (a password for apps made in
 * the account of the provider: two-step verification on), oauth (sign in with the provider), none (not possible here).
 */

declare(strict_types=1);

const ML_PROVIDERS = [
    'gmail' => ['name' => 'Gmail', 'imap' => ['imap.gmail.com', 993, 'ssl'], 'smtp' => ['smtp.gmail.com', 465, 'ssl'], 'auth' => 'apppw', 'sentCopy' => false,
        'help' => 'https://myaccount.google.com/apppasswords', 'domains' => ['gmail.com', 'googlemail.com'], 'mx' => ['google.com', 'googlemail.com']],
    'outlook' => ['name' => 'Outlook', 'imap' => ['outlook.office365.com', 993, 'ssl'], 'smtp' => ['smtp.office365.com', 587, 'starttls'], 'auth' => 'oauth', 'sentCopy' => false,
        'help' => '', 'domains' => ['outlook.com', 'outlook.it', 'hotmail.com', 'hotmail.it', 'live.com', 'live.it', 'msn.com'], 'mx' => ['outlook.com', 'protection.outlook.com']],
    'yahoo' => ['name' => 'Yahoo Mail', 'imap' => ['imap.mail.yahoo.com', 993, 'ssl'], 'smtp' => ['smtp.mail.yahoo.com', 465, 'ssl'], 'auth' => 'apppw', 'sentCopy' => true,
        'help' => 'https://login.yahoo.com/account/security', 'domains' => ['yahoo.com', 'yahoo.it', 'ymail.com', 'rocketmail.com'], 'mx' => ['yahoodns.net']],
    'icloud' => ['name' => 'iCloud Mail', 'imap' => ['imap.mail.me.com', 993, 'ssl'], 'smtp' => ['smtp.mail.me.com', 587, 'starttls'], 'auth' => 'apppw', 'sentCopy' => true,
        'help' => 'https://account.apple.com/account/manage', 'domains' => ['icloud.com', 'me.com', 'mac.com'], 'mx' => ['mail.icloud.com']],
    'aruba' => ['name' => 'Aruba', 'imap' => ['imaps.aruba.it', 993, 'ssl'], 'smtp' => ['smtps.aruba.it', 465, 'ssl'], 'auth' => 'password', 'sentCopy' => true,
        'help' => '', 'domains' => ['aruba.it'], 'mx' => ['aruba.it']],
    'libero' => ['name' => 'Libero Mail', 'imap' => ['imapmail.libero.it', 993, 'ssl'], 'smtp' => ['smtp.libero.it', 465, 'ssl'], 'auth' => 'password', 'sentCopy' => true,
        'help' => '', 'domains' => ['libero.it', 'inwind.it', 'iol.it', 'blu.it', 'giallo.it'], 'mx' => ['libero.it', 'iol.it']],
    'tiscali' => ['name' => 'Tiscali', 'imap' => ['imap.tiscali.it', 993, 'ssl'], 'smtp' => ['smtp.tiscali.it', 465, 'ssl'], 'auth' => 'password', 'sentCopy' => true,
        'help' => '', 'domains' => ['tiscali.it'], 'mx' => ['tiscali.it']],
    'proton' => ['name' => 'Proton Mail', 'imap' => ['', 0, 'ssl'], 'smtp' => ['', 0, 'ssl'], 'auth' => 'none', 'sentCopy' => false,
        'help' => '', 'domains' => ['proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me'], 'mx' => ['protonmail.ch']],
];

/** What the app shows of a provider. */
function ml_provider_out(string $id, string $email = ''): array
{
    $p = ML_PROVIDERS[$id];
    return ['provider' => $id, 'name' => $p['name'], 'auth' => $p['auth'] === 'oauth' && !ml_oauth_ready() ? 'oauth_off' : $p['auth'], 'help' => $p['help'], 'sentCopy' => $p['sentCopy'],
        'imap' => ['host' => $p['imap'][0], 'port' => $p['imap'][1], 'tls' => $p['imap'][2], 'user' => $email],
        'smtp' => ['host' => $p['smtp'][0], 'port' => $p['smtp'][1], 'tls' => $p['smtp'][2], 'user' => $email]];
}

function ml_presets(): array
{
    return array_values(array_map(fn($id) => ml_provider_out($id) + ['domains' => ML_PROVIDERS[$id]['domains']], array_keys(ML_PROVIDERS)));
}

/** The settings for an address (see the top of the file). */
function ml_discover(string $email): array
{
    $email = mb_strtolower(trim($email));
    $domain = substr(strrchr($email, '@') ?: '', 1);
    if ($domain === '' || !preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $domain)) fail('email_invalid', 422);
    foreach (ML_PROVIDERS as $id => $p) if (in_array($domain, $p['domains'], true)) return ml_provider_out($id, $email) + ['found' => 'known'];
    $isp = ml_ispdb($domain, $email);
    if ($isp) return $isp;
    $mx = [];
    if (@getmxrr($domain, $hosts)) $mx = array_map('strtolower', $hosts);
    // a mail host with the name of the domain (mx.example.it) is often the provider's under another name: its reverse DNS tells
    if ($mx && ($ip = gethostbyname($mx[0])) !== $mx[0] && ($ptr = @gethostbyaddr($ip)) && $ptr !== $ip) $mx[] = strtolower($ptr);
    foreach (ML_PROVIDERS as $id => $p) foreach ($mx as $h) foreach ($p['mx'] as $end) if ($h === $end || substr($h, -strlen($end) - 1) === '.' . $end) return ml_provider_out($id, $email) + ['found' => 'mx'];
    return ['provider' => 'custom', 'name' => $domain, 'auth' => 'password', 'help' => '', 'sentCopy' => true, 'found' => 'guess',
        'imap' => ['host' => 'imap.' . $domain, 'port' => 993, 'tls' => 'ssl', 'user' => $email], 'smtp' => ['host' => 'smtp.' . $domain, 'port' => 465, 'tls' => 'ssl', 'user' => $email]];
}

/** The database of Thunderbird: <clientConfig> with an IMAP server and an SMTP server. */
function ml_ispdb(string $domain, string $email): ?array
{
    if (!function_exists('curl_init')) return null;
    $h = curl_init('https://autoconfig.thunderbird.net/v1.1/' . rawurlencode($domain));
    curl_setopt_array($h, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 4, CURLOPT_TIMEOUT => 6, CURLOPT_USERAGENT => 'SavMail', CURLOPT_PROTOCOLS => CURLPROTO_HTTPS]);
    $xml = curl_exec($h);
    $code = (int)curl_getinfo($h, CURLINFO_RESPONSE_CODE);
    if ($code !== 200 || !is_string($xml) || strlen($xml) > 200000) return null;
    $prev = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET);
    libxml_use_internal_errors($prev);
    if (!$doc || !isset($doc->emailProvider)) return null;
    $local = explode('@', $email)[0];
    $pick = function ($list) use ($email, $local, $domain) {
        foreach ($list as $s) {
            $sock = strtoupper((string)$s->socketType);
            $tls = $sock === 'SSL' ? 'ssl' : ($sock === 'STARTTLS' ? 'starttls' : '');
            if ($tls === '') continue;
            $user = str_replace(['%EMAILADDRESS%', '%EMAILLOCALPART%', '%EMAILDOMAIN%'], [$email, $local, $domain], (string)$s->username);
            $auth = strtolower((string)$s->authentication);
            return ['host' => strtolower((string)$s->hostname), 'port' => (int)$s->port, 'tls' => $tls, 'user' => $user ?: $email, 'oauth' => $auth === 'oauth2'];
        }
        return null;
    };
    $in = [];
    foreach ($doc->emailProvider->incomingServer as $s) if ((string)$s['type'] === 'imap') $in[] = $s;
    $out = [];
    foreach ($doc->emailProvider->outgoingServer as $s) if ((string)$s['type'] === 'smtp') $out[] = $s;
    $i = $pick($in);
    $o = $pick($out);
    if (!$i || !$o) return null;
    $oauthOnly = $i['oauth'];
    unset($i['oauth'], $o['oauth']);
    return ['provider' => 'custom', 'name' => (string)($doc->emailProvider->displayShortName ?: $domain), 'auth' => $oauthOnly ? 'oauth_other' : 'password', 'help' => '', 'sentCopy' => true,
        'found' => 'ispdb', 'imap' => $i, 'smtp' => $o];
}

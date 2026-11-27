<?php
/**
 * SavAwards — outgoing email: confirming the address, a new password, and the answers of the staff to edit requests and
 * product suggestions. Sender: $mail_config in credentials.php, otherwise the settings of the site (/.mail-config.php).
 * Messages leave after the JSON response. Without SMTP and with $debug on, the links go to the PHP error log.
 */

declare(strict_types=1);

function mail_settings(): ?array
{
    static $cfg = false;
    if ($cfg !== false) return $cfg;
    $cfg = null;
    $c = config_value('mail', null);
    if ($c === false) return $cfg;
    if (!is_array($c) || empty($c['smtp_host'])) {
        $site = dirname(__DIR__, 2) . '/.mail-config.php';
        $c = is_file($site) ? (require $site) : null;
    }
    if (is_array($c) && !empty($c['smtp_host']) && !empty($c['from_email'])) {
        $c['from_name'] = $c['from_name'] ?? APP_NAME;
        $cfg = $c;
    }
    return $cfg;
}

function queue_mail(string $to, string $name, string $subject, string $html, string $text): void
{
    static $queue = null;
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return;
    if (!mail_settings()) {
        if (config_value('debug', false)) error_log("SavAwards mail (not sent, no SMTP) to $to: $subject\n$text");
        return;
    }
    if (PHP_SAPI === 'cli') {
        $r = smtp_send_all(mail_settings(), [compact('to', 'name', 'subject', 'html', 'text')]);
        if (!$r[0]['ok']) error_log('SavAwards mail not sent: ' . $r[0]['error']);
        return;
    }
    if ($queue === null) {
        $queue = new ArrayObject();
        register_shutdown_function(function () use ($queue) {
            if (!count($queue)) return;
            if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
            ignore_user_abort(true);
            @set_time_limit(60);
            foreach (smtp_send_all(mail_settings(), $queue->getArrayCopy()) as $i => $r) {
                if (!$r['ok']) error_log('SavAwards mail #' . $i . ' not sent: ' . $r['error']);
            }
        });
    }
    $queue->append(compact('to', 'name', 'subject', 'html', 'text'));
}

const VERIFY_HOURS = 48;
const RESET_HOURS = 2;

const MAIL_TEXT = [
    'en' => [
        'footer' => 'Automatic email sent by SavAwards. Please do not reply to this message.',
        'verify_subject' => 'Confirm your email for SavAwards', 'verify_title' => 'Welcome to SavAwards',
        'verify_body' => 'Confirm that this address is yours to start writing reviews, comments and saving your favourite software.', 'verify_button' => 'Confirm my email',
        'verify_expires' => 'The link works for 48 hours. If you didn’t create an account, you can ignore this email.',
        'reset_subject' => 'A new password for SavAwards', 'reset_title' => 'Choose a new password',
        'reset_body' => 'Use this link to choose a new password.', 'reset_button' => 'Choose a password',
        'reset_expires' => 'The link works for 2 hours and only once. If you didn’t ask for it, ignore this email: your password stays the same.',
        'hello' => 'Hi {name},',
        'req_subject' => 'Your request about {product}', 'req_title_accepted' => 'Your request was accepted', 'req_title_rejected' => 'About your request',
        'req_accepted' => 'Thank you: the change you proposed for {product} was accepted.', 'req_rejected' => 'The change you proposed for {product} was not applied.',
        'sug_subject' => 'Your suggestion: {product}', 'sug_title_accepted' => 'Your suggestion was accepted', 'sug_title_rejected' => 'About your suggestion',
        'sug_accepted' => 'Thank you: {product} will be analysed and added to SavAwards.', 'sug_rejected' => '{product} will not be added for now.',
        'reply' => 'Note from the staff: {reply}', 'open' => 'Open SavAwards',
    ],
    'it' => [
        'footer' => 'Email automatica inviata da SavAwards. Non rispondere a questo messaggio.',
        'verify_subject' => 'Conferma la tua email per SavAwards', 'verify_title' => 'Benvenuto in SavAwards',
        'verify_body' => 'Conferma che questo indirizzo è tuo per iniziare a scrivere recensioni, commenti e salvare i tuoi software preferiti.', 'verify_button' => 'Conferma la mia email',
        'verify_expires' => 'Il link vale 48 ore. Se non hai creato un account, puoi ignorare questa email.',
        'reset_subject' => 'Una nuova password per SavAwards', 'reset_title' => 'Scegli una nuova password',
        'reset_body' => 'Usa questo link per scegliere una nuova password.', 'reset_button' => 'Scegli la password',
        'reset_expires' => 'Il link vale 2 ore e si usa una volta sola. Se non l’hai chiesto tu, ignora questa email: la password resta la stessa.',
        'hello' => 'Ciao {name},',
        'req_subject' => 'La tua richiesta su {product}', 'req_title_accepted' => 'La tua richiesta è stata accolta', 'req_title_rejected' => 'Sulla tua richiesta',
        'req_accepted' => 'Grazie: la modifica che hai proposto per {product} è stata accolta.', 'req_rejected' => 'La modifica che hai proposto per {product} non è stata applicata.',
        'sug_subject' => 'Il tuo suggerimento: {product}', 'sug_title_accepted' => 'Il tuo suggerimento è stato accolto', 'sug_title_rejected' => 'Sul tuo suggerimento',
        'sug_accepted' => 'Grazie: {product} sarà analizzato e aggiunto a SavAwards.', 'sug_rejected' => 'Per ora {product} non sarà aggiunto.',
        'reply' => 'Nota dello staff: {reply}', 'open' => 'Apri SavAwards',
    ],
];

function mail_t(string $lang): array
{
    return MAIL_TEXT[$lang] ?? MAIL_TEXT['en'];
}

function fill(string $s, array $vars): string
{
    foreach ($vars as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
    return $s;
}

function mail_button(string $url, string $label, string $color = '#1d3fb8'): string
{
    return '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:12px;background:' . e($color) . '">'
        . '<a href="' . e($url) . '" style="display:inline-block;padding:12px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px">' . e($label) . '</a></td></tr></table>';
}

function mail_layout(string $lang, string $title, array $blocks, string $footer = ''): string
{
    $T = mail_t($lang);
    $logo = app_url() . 'icons/icon-192.png';
    return '<!DOCTYPE html><html lang="' . e($lang) . '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . e($title) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#F2F4FB;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#141B33">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4FB"><tr><td align="center" style="padding:32px 16px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">'
        . '<tr><td style="padding:0 4px 18px"><img src="' . e($logo) . '" width="36" height="36" alt="" style="vertical-align:middle;border-radius:9px"> '
        . '<span style="font-size:19px;font-weight:800;vertical-align:middle;letter-spacing:-.02em">SavAwards</span></td></tr>'
        . '<tr><td style="background:#ffffff;border-radius:18px;padding:28px 28px 26px;border:1px solid #DCE2F3;font-size:15px;line-height:1.55">'
        . '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;letter-spacing:-.02em">' . e($title) . '</h1>'
        . implode('', $blocks)
        . '</td></tr><tr><td style="padding:16px 4px 0;font-size:12px;color:#5A6482">' . e($footer ?: $T['footer']) . '</td></tr>'
        . '</table></td></tr></table></body></html>';
}

function p_html(string $text, string $style = 'margin:0 0 14px'): string
{
    return '<p style="' . $style . '">' . nl2br(e($text)) . '</p>';
}

function send_notice(string $to, string $name, string $lang, string $subject, string $title, array $paragraphs, ?string $url = null, string $button = ''): void
{
    $paragraphs = array_values(array_filter($paragraphs, fn($p) => $p !== ''));
    $blocks = array_map(fn($p) => p_html($p), $paragraphs);
    if ($url) $blocks[] = '<div style="padding-top:6px">' . mail_button($url, $button) . '</div>';
    queue_mail($to, $name, $subject, mail_layout($lang, $title, $blocks), implode("\n\n", $paragraphs) . ($url ? "\n\n$url" : ''));
}

/** A new single-use link ('verify' or 'reset'); the older ones of the same kind stop working. */
function send_account_link(array $user, string $lang, string $purpose): void
{
    $token = bin2hex(random_bytes(32));
    $hours = $purpose === 'reset' ? RESET_HOURS : VERIFY_HOURS;
    q('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ? AND purpose = ?', [$user['id'], $purpose]);
    q('INSERT INTO ' . t('email_tokens') . ' (token_hash, user_id, purpose, created_at, expires_at) VALUES (?,?,?,?,?)',
        [hash('sha256', $token), $user['id'], $purpose, now_utc(), gmdate('Y-m-d H:i:s', time() + $hours * 3600)]);
    $T = mail_t($lang);
    $url = app_url() . '#/' . $purpose . '/' . $token;
    if (!mail_settings()) {
        error_log(config_value('debug', false) ? "SavAwards $purpose link for user #" . $user['id'] . ': ' . $url : 'SavAwards: email is not configured');
        return;
    }
    send_notice((string)$user['email'], (string)$user['name'], $lang, $T[$purpose . '_subject'], $T[$purpose . '_title'],
        [fill($T['hello'], ['name' => $user['name']]), $T[$purpose . '_body'], $T[$purpose . '_expires']], $url, $T[$purpose . '_button']);
}

/** To who sent an edit request ('req') or a suggestion ('sug'): the staff accepted it or not. */
function send_outcome(?int $uid, string $kind, bool $accepted, string $product, string $reply, string $url): void
{
    if (!$uid) return;
    $u = user_row($uid);
    if (!$u || $u['status'] !== 'active') return;
    $lang = 'en';
    $T = mail_t($lang);
    $state = $accepted ? 'accepted' : 'rejected';
    send_notice((string)$u['email'], (string)$u['name'], $lang, fill($T[$kind . '_subject'], ['product' => $product]), $T[$kind . '_title_' . $state],
        [fill($T['hello'], ['name' => $u['name']]), fill($T[$kind . '_' . $state], ['product' => $product]), $reply !== '' ? fill($T['reply'], ['reply' => $reply]) : ''], $url, $T['open']);
}

/**
 * Sends the messages over one SMTP connection. Each message: to, name, subject, html, text and optionally headers
 * (extra header lines). Returns one ['ok' => bool, 'temp' => bool, 'error' => string] per message, in the same order.
 *
 * temp = the server said "not now" (a 4xx reply: too many messages, greylisting, mailbox busy) or the connection
 * failed: the message should be tried again later. A temporary error stops the batch at once (the server is throttling
 * us: insisting would only get the address blocked). A permanent error (5xx: unknown address…) fails that message only.
 * $after($i, $result) runs after each message; $pauseMs waits between messages (gentler on the provider's limits).
 */
function smtp_send_all(?array $cfg, array $messages, ?callable $after = null, int $pauseMs = 0): array
{
    if (!$cfg) return array_map(fn() => ['ok' => false, 'temp' => true, 'error' => 'mail not configured'], $messages);
    $out = [];
    $stop = false;
    try {
        $c = new SdSmtp($cfg);
        $first = true;
        foreach ($messages as $i => $m) {
            if (!$first && $pauseMs > 0) usleep($pauseMs * 1000);
            $first = false;
            try {
                $c->send($m['to'], $m['name'] ?? '', $m['subject'], $m['html'], $m['text'], $m['headers'] ?? []);
                $out[$i] = ['ok' => true, 'temp' => false, 'error' => ''];
            } catch (Throwable $e) {
                $temp = smtp_error_is_temporary($e->getMessage());
                $out[$i] = ['ok' => false, 'temp' => $temp, 'error' => $e->getMessage()];
                if ($temp) $stop = true;
                else $c->reset();
            }
            if ($after) $after($i, $out[$i]);
            if ($stop) break;
        }
        $c->close();
    } catch (Throwable $e) {
        // could not connect or log in: nothing was refused, everything is tried again later
        foreach ($messages as $i => $m) {
            if (isset($out[$i])) continue;
            $out[$i] = ['ok' => false, 'temp' => true, 'error' => $e->getMessage()];
            if ($after) $after($i, $out[$i]);
        }
    }
    // messages after a temporary stop were not attempted
    foreach ($messages as $i => $m) if (!isset($out[$i])) $out[$i] = ['ok' => false, 'temp' => true, 'error' => 'not attempted'];
    ksort($out);
    return $out;
}

/** 4xx replies and lost connections are temporary; 5xx replies are permanent. */
function smtp_error_is_temporary(string $error): bool
{
    if (preg_match('/\((\d{3})\)/', $error, $m)) return $m[1][0] === '4' || $m[1] === '000';
    return true; // connection lost, timeout…
}

final class SdSmtp
{
    private $fp;
    private array $c;

    public function __construct(array $cfg)
    {
        $this->c = $cfg;
        $enc = strtolower((string)($cfg['smtp_encryption'] ?? 'ssl'));
        $port = (int)($cfg['smtp_port'] ?? ($enc === 'ssl' ? 465 : 587));
        $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $cfg['smtp_host']]]);
        $scheme = $enc === 'ssl' ? 'ssl://' : 'tcp://';
        $fp = @stream_socket_client($scheme . $cfg['smtp_host'] . ':' . $port, $no, $str, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$fp) throw new RuntimeException('SMTP connection failed (' . $no . ')');
        stream_set_timeout($fp, 20);
        $this->fp = $fp;
        $this->expect(220);
        $host = preg_replace('/[^a-z0-9.-]/i', '', (string)($_SERVER['SERVER_NAME'] ?? '')) ?: 'localhost';
        $this->cmd('EHLO ' . $host, 250);
        if ($enc === 'tls') {
            $this->cmd('STARTTLS', 220);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) throw new RuntimeException('STARTTLS failed');
            $this->cmd('EHLO ' . $host, 250);
        }
        if (!empty($cfg['smtp_user'])) {
            $this->cmd('AUTH LOGIN', 334);
            $this->cmd(base64_encode((string)$cfg['smtp_user']), 334);
            $this->cmd(base64_encode((string)($cfg['smtp_password'] ?? '')), 235, 'SMTP authentication failed'); // never logged
        }
    }

    private function expect($ok, string $what = ''): void
    {
        $reply = '';
        while (($l = fgets($this->fp, 1024)) !== false) {
            $reply .= $l;
            if (strlen($l) < 4 || $l[3] !== '-') break;
        }
        $code = (int)substr($reply, 0, 3);
        if (!in_array($code, (array)$ok, true)) throw new RuntimeException(($what ?: 'unexpected SMTP reply') . ' (' . $code . ')');
    }

    private function cmd(string $line, $ok, string $what = ''): void
    {
        if (@fwrite($this->fp, $line . "\r\n") === false) throw new RuntimeException('SMTP connection lost');
        $this->expect($ok, $what);
    }

    public function send(string $to, string $name, string $subject, string $html, string $text, array $extra = []): void
    {
        $from = (string)$this->c['from_email'];
        $this->cmd('MAIL FROM:<' . $from . '>', 250);
        $this->cmd('RCPT TO:<' . str_replace(["\r", "\n", '<', '>'], '', $to) . '>', [250, 251], 'recipient refused');
        $this->cmd('DATA', 354);
        $b = 'sd-' . bin2hex(random_bytes(12));
        $domain = substr(strrchr($from, '@') ?: '@localhost', 1);
        $h = [
            'Date: ' . date('r'),
            'From: ' . self::addr($from, (string)($this->c['from_name'] ?? APP_NAME)),
            'To: ' . self::addr($to, $name),
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'Message-ID: <' . bin2hex(random_bytes(16)) . '@' . $domain . '>',
            'MIME-Version: 1.0',
        ];
        if (!empty($this->c['reply_to']) && filter_var($this->c['reply_to'], FILTER_VALIDATE_EMAIL)) $h[] = 'Reply-To: ' . self::addr((string)$this->c['reply_to']);
        foreach ($extra as $line) $h[] = str_replace(["\r", "\n"], '', (string)$line);
        $h[] = 'Content-Type: multipart/alternative; boundary="' . $b . '"';
        $part = fn(string $type, string $body) => '--' . $b . "\r\nContent-Type: " . $type . "; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            . rtrim(chunk_split(base64_encode($body), 76, "\r\n")) . "\r\n";
        // Base64 lines never start with a dot: no dot-stuffing needed
        $this->cmd(implode("\r\n", $h) . "\r\n\r\n" . $part('text/plain', $text) . $part('text/html', $html) . '--' . $b . "--\r\n.", 250, 'message refused');
    }

    private static function addr(string $email, string $name = ''): string
    {
        $email = str_replace(["\r", "\n", '<', '>'], '', $email);
        $name = trim(str_replace(["\r", "\n", '"'], '', $name));
        return $name === '' ? $email : '=?UTF-8?B?' . base64_encode($name) . '?= <' . $email . '>';
    }

    public function reset(): void
    {
        try {
            $this->cmd('RSET', 250);
        } catch (Throwable $e) { /* connection lost */
        }
    }

    public function close(): void
    {
        if ($this->fp) {
            @fwrite($this->fp, "QUIT\r\n");
            @fclose($this->fp);
            $this->fp = null;
        }
    }
}

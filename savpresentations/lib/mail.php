<?php
/**
 * SavPresentations — outgoing email: $mail_config in credentials.php, otherwise the site's settings (/.mail-config.php).
 * Messages leave after the JSON response (fastcgi_finish_request). Without SMTP and with $debug on, the texts are
 * written to the PHP error log so the flows can be tested locally.
 */

declare(strict_types=1);

// ---------------------------------------------------------------- platform sender

/** SMTP settings of the platform, or null when sending email is not configured. */
function mail_settings(): ?array
{
    static $cfg = false;
    if ($cfg !== false) return $cfg;
    $cfg = null;
    $c = config_value('mail', null);
    if ($c === false) return $cfg; // switched off in credentials.php: never fall back to the site's settings
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

/** Adds a platform message to the queue sent at the end of the request (or right away from the command line). */
function queue_mail(string $to, string $name, string $subject, string $html, string $text): void
{
    static $queue = null;
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return;
    if (!mail_settings()) {
        if (config_value('debug', false)) error_log("SavPresentations mail (not sent, no SMTP) to $to: $subject\n$text");
        return;
    }
    if (PHP_SAPI === 'cli') {
        $r = smtp_send_all(mail_settings(), [compact('to', 'name', 'subject', 'html', 'text')]);
        if (!$r[0]['ok']) error_log('SavPresentations mail not sent: ' . $r[0]['error']);
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
                if (!$r['ok']) error_log('SavPresentations mail #' . $i . ' not sent: ' . $r['error']);
            }
        });
    }
    $queue->append(compact('to', 'name', 'subject', 'html', 'text'));
}

const VERIFY_HOURS = 48;
const RESET_HOURS = 2;

const MAIL_TEXT = [
    'en' => [
        'footer' => 'Automatic email sent by SavPresentations. Please do not reply to this message.',
        'hello' => 'Hi {name},',
        'verify_subject' => 'Confirm your email for SavPresentations', 'verify_title' => 'Welcome to SavPresentations',
        'verify_body' => 'Confirm that this address is yours to start creating presentations.', 'verify_button' => 'Confirm my email',
        'verify_expires' => 'The link works for 48 hours. If you didn’t create an account, you can ignore this email.',
        'reset_subject' => 'Choose a new password for SavPresentations', 'reset_title' => 'A new password',
        'reset_body' => 'Someone (hopefully you) asked to change the password of this account.', 'reset_button' => 'Choose a new password',
        'reset_expires' => 'The link works once, for 2 hours. If it wasn’t you, ignore this email: nothing changes.',
        'share_subject' => '{by} shared “{title}” with you', 'share_title' => 'A presentation for you',
        'share_body' => '{by} shared the presentation “{title}” with you. You can: {role}.',
        'share_signup' => 'Create a free account with this email address to open it.', 'share_button' => 'Open the presentation',
        'share_warn' => 'If you don’t know who sent it, don’t open its links: you can report it from the presentation itself.',
        'role_viewer' => 'view it', 'role_commenter' => 'view and comment', 'role_editor' => 'view, comment and edit',
        'comment_subject' => 'New comment on “{title}”', 'comment_title' => 'New comment', 'comment_body' => '{by} wrote on “{title}”:', 'comment_button' => 'See the comment',
        'block_subject' => 'Your SavPresentations account has been blocked', 'block_title' => 'Account blocked',
        'block_body' => 'Your account has been blocked by the administrators. Reason: {reason}.',
        'block_contact' => 'Your presentations can no longer be opened by anybody. If you think this is a mistake, write from the contact page of saveriomorelli.com.',
        'unblock_subject' => 'Your SavPresentations account works again', 'unblock_title' => 'Account unblocked', 'unblock_body' => 'Your account has been unblocked: you can sign in again.',
        'reason_spam' => 'spam', 'reason_phishing' => 'phishing or scam', 'reason_abuse' => 'abusive content', 'reason_illegal' => 'illegal content', 'reason_copyright' => 'copyright infringement', 'reason_other' => 'breach of the terms of use',
    ],
    'it' => [
        'footer' => 'Email automatica inviata da SavPresentations. Non rispondere a questo messaggio.',
        'hello' => 'Ciao {name},',
        'verify_subject' => 'Conferma la tua email per SavPresentations', 'verify_title' => 'Ti diamo il benvenuto su SavPresentations',
        'verify_body' => 'Conferma che questo indirizzo è tuo per iniziare a creare presentazioni.', 'verify_button' => 'Conferma la mia email',
        'verify_expires' => 'Il link vale 48 ore. Se non hai creato tu l’account, ignora questa email.',
        'reset_subject' => 'Scegli una nuova password per SavPresentations', 'reset_title' => 'Una nuova password',
        'reset_body' => 'Qualcuno (speriamo tu) ha chiesto di cambiare la password di questo account.', 'reset_button' => 'Scegli una nuova password',
        'reset_expires' => 'Il link vale una volta sola, per 2 ore. Se non sei stato tu, ignora questa email: non cambia nulla.',
        'share_subject' => '{by} ha condiviso con te “{title}”', 'share_title' => 'Una presentazione per te',
        'share_body' => '{by} ha condiviso con te la presentazione “{title}”. Puoi: {role}.',
        'share_signup' => 'Per aprirla crea un account gratuito con questo indirizzo email.', 'share_button' => 'Apri la presentazione',
        'share_warn' => 'Se non sai chi te l’ha mandata, non aprire i suoi link: puoi segnalarla dalla presentazione stessa.',
        'role_viewer' => 'vederla', 'role_commenter' => 'vederla e commentarla', 'role_editor' => 'vederla, commentarla e modificarla',
        'comment_subject' => 'Nuovo commento su “{title}”', 'comment_title' => 'Nuovo commento', 'comment_body' => '{by} ha scritto su “{title}”:', 'comment_button' => 'Vedi il commento',
        'block_subject' => 'Il tuo account SavPresentations è stato bloccato', 'block_title' => 'Account bloccato',
        'block_body' => 'Il tuo account è stato bloccato dagli amministratori. Motivo: {reason}.',
        'block_contact' => 'Le tue presentazioni non possono più essere aperte da nessuno. Se pensi sia un errore, scrivi dalla pagina dei contatti di saveriomorelli.com.',
        'unblock_subject' => 'Il tuo account SavPresentations funziona di nuovo', 'unblock_title' => 'Account sbloccato', 'unblock_body' => 'Il tuo account è stato sbloccato: puoi accedere di nuovo.',
        'reason_spam' => 'spam', 'reason_phishing' => 'phishing o truffa', 'reason_abuse' => 'contenuti offensivi', 'reason_illegal' => 'contenuti illegali', 'reason_copyright' => 'violazione del diritto d’autore', 'reason_other' => 'violazione dei termini d’uso',
    ],
];

function mail_t(string $lang): array
{
    return MAIL_TEXT[$lang] ?? MAIL_TEXT['en'];
}

function fill(string $text, array $vars): string
{
    foreach ($vars as $k => $v) $text = str_replace('{' . $k . '}', (string)$v, $text);
    return $text;
}

function mail_button(string $url, string $label, string $color = '#6D3BEF'): string
{
    return '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:' . e($color) . '">'
        . '<a href="' . e($url) . '" style="display:inline-block;padding:12px 26px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px">' . e($label) . '</a></td></tr></table>';
}

/** Layout of the platform's own emails: logo, title, content card, footer (inline styles for email clients). */
function mail_layout(string $lang, string $title, array $blocks, string $footer = ''): string
{
    $T = mail_t($lang);
    $logo = app_url() . 'icons/icon-192.png';
    return '<!DOCTYPE html><html lang="' . e($lang) . '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' . e($title) . '</title></head>'
        . '<body style="margin:0;padding:0;background:#F3F0FA;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1B1530">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F0FA"><tr><td align="center" style="padding:32px 16px">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">'
        . '<tr><td style="padding:0 4px 18px"><img src="' . e($logo) . '" width="36" height="36" alt="" style="vertical-align:middle;border-radius:9px"> '
        . '<span style="font-size:19px;font-weight:800;vertical-align:middle;letter-spacing:-.02em">SavPresentations</span></td></tr>'
        . '<tr><td style="background:#ffffff;border-radius:18px;padding:28px 28px 26px;border:1px solid #E4DDF2;font-size:15px;line-height:1.55">'
        . '<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;letter-spacing:-.02em">' . e($title) . '</h1>'
        . implode('', $blocks)
        . '</td></tr><tr><td style="padding:16px 4px 0;font-size:12px;color:#645C7C">' . e($footer ?: $T['footer']) . '</td></tr>'
        . '</table></td></tr></table></body></html>';
}

function p_html(string $text, string $style = 'margin:0 0 14px'): string
{
    return '<p style="' . $style . '">' . nl2br(e($text)) . '</p>';
}

/** A platform notice: title, paragraphs, optional button. */
function send_notice(string $to, string $name, string $lang, string $subject, string $title, array $paragraphs, ?string $url = null, string $button = ''): void
{
    $blocks = array_map(fn($p) => p_html($p), array_filter($paragraphs, fn($p) => $p !== ''));
    if ($url) $blocks[] = '<div style="padding-top:6px">' . mail_button($url, $button) . '</div>';
    $text = implode("\n\n", array_filter($paragraphs, fn($p) => $p !== '')) . ($url ? "\n\n$url" : '');
    queue_mail($to, $name, $subject, mail_layout($lang, $title, $blocks), $text);
}

/** A new single-use link for this account ($kind: verify or reset); the older ones of that kind stop working. */
function send_account_link(array $user, string $lang, string $kind): void
{
    $token = bin2hex(random_bytes(32));
    $hours = $kind === 'reset' ? RESET_HOURS : VERIFY_HOURS;
    db()->prepare('DELETE FROM ' . t('email_tokens') . ' WHERE user_id = ? AND purpose = ?')->execute([$user['id'], $kind]); // the links of the suite (../../identity/suite.php): "purpose"
    db()->prepare('INSERT INTO ' . t('email_tokens') . ' (token_hash, user_id, purpose, created_at, expires_at) VALUES (?,?,?,?,?)')
        ->execute([hash('sha256', $token), $user['id'], $kind, now_utc(), gmdate('Y-m-d H:i:s', time() + $hours * 3600)]);
    $T = mail_t($lang);
    $url = app_url() . '?' . $kind . '=' . $token;
    if (!mail_settings()) {
        error_log(config_value('debug', false) ? "SavPresentations $kind link for user #" . $user['id'] . ': ' . $url : 'SavPresentations: email is not configured, accounts cannot be confirmed');
        return;
    }
    send_notice((string)$user['email'], (string)$user['name'], $lang, $T[$kind . '_subject'], $T[$kind . '_title'],
        [fill($T['hello'], ['name' => $user['name']]), $T[$kind . '_body'], $T[$kind . '_expires']], $url, $T[$kind . '_button']);
}

// ---------------------------------------------------------------- minimal SMTP client (no libraries)

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
        $c = new SpSmtp($cfg);
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

final class SpSmtp
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
        $b = 'sp-' . bin2hex(random_bytes(12));
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

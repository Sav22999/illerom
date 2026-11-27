<?php
/**
 * SavMail — sending from a person's own mailbox: SMTP submission (RFC 6409) over TLS (port 465) or STARTTLS (587), signed
 * in with AUTH PLAIN, LOGIN or XOAUTH2 (Outlook). The message is written by ml_build() (lib/mime.php); here it only
 * travels: dot-stuffing, one RCPT per recipient, the size the server accepts.
 */

declare(strict_types=1);

final class MlSmtp
{
    private $fp;
    private array $ext = [];

    public function __construct(string $host, int $port, string $tls)
    {
        $this->fp = ml_socket($host, $port, $tls, 25);
        $this->expect(220);
        $this->ehlo();
        if ($tls === 'starttls') {
            if (!isset($this->ext['STARTTLS'])) throw new MlMailError('tls', 'no STARTTLS');
            $this->cmd('STARTTLS', 220);
            ml_tls_up($this->fp);
            $this->ehlo();
        }
    }

    private function ehlo(): void
    {
        $host = preg_replace('/[^a-z0-9.-]/i', '', (string)($_SERVER['SERVER_NAME'] ?? '')) ?: 'localhost';
        $lines = $this->cmd('EHLO ' . $host, 250);
        $this->ext = [];
        foreach (array_slice($lines, 1) as $l) {
            $w = preg_split('/[\s=]+/', strtoupper(trim(substr($l, 4))));
            $this->ext[$w[0]] = array_slice($w, 1);
        }
    }

    /** Reads a reply; throws when its code is not one of $ok. Returns its lines. */
    private function expect($ok, string $kind = 'refused'): array
    {
        $lines = [];
        while (($l = fgets($this->fp, 2048)) !== false) {
            $lines[] = rtrim($l, "\r\n");
            if (strlen($l) < 4 || $l[3] !== '-') break;
        }
        if (!$lines) throw new MlMailError('connect', 'connection closed');
        $code = (int)substr($lines[0], 0, 3);
        if (!in_array($code, (array)$ok, true)) throw new MlMailError($kind, implode(' ', array_map(fn($x) => substr($x, 4), $lines)) . " ($code)");
        return $lines;
    }

    private function cmd(string $line, $ok, string $kind = 'refused'): array
    {
        if (@fwrite($this->fp, $line . "\r\n") === false) throw new MlMailError('connect', 'connection lost');
        return $this->expect($ok, $kind);
    }

    public function login(string $user, string $pass): void
    {
        $auth = $this->ext['AUTH'] ?? [];
        if (in_array('PLAIN', $auth, true) || !$auth) $this->cmd('AUTH PLAIN ' . base64_encode("\0$user\0$pass"), 235, 'auth');
        else {
            $this->cmd('AUTH LOGIN', 334, 'auth');
            $this->cmd(base64_encode($user), 334, 'auth');
            $this->cmd(base64_encode($pass), 235, 'auth');
        }
    }

    public function xoauth2(string $user, string $token): void
    {
        try {
            $this->cmd('AUTH XOAUTH2 ' . base64_encode("user=$user\x01auth=Bearer $token\x01\x01"), 235, 'auth');
        } catch (MlMailError $e) {
            if (strpos($e->server, '(334)') !== false) { try { $this->cmd('', 235, 'auth'); } catch (MlMailError $x) { throw new MlMailError('auth', $e->server); } }
            throw $e;
        }
    }

    /** The largest message the server takes, when it says it (0: not said). */
    public function maxSize(): int
    {
        return (int)($this->ext['SIZE'][0] ?? 0);
    }

    /** Sends a whole message (CRLF lines) to every address of $rcpt. */
    public function send(string $from, array $rcpt, string $message): void
    {
        $clean = fn($a) => str_replace(["\r", "\n", '<', '>', ' '], '', $a);
        $max = $this->maxSize();
        if ($max > 0 && strlen($message) > $max) throw new MlMailError('big');
        $this->cmd('MAIL FROM:<' . $clean($from) . '>' . ($max > 0 ? ' SIZE=' . strlen($message) : ''), 250);
        foreach ($rcpt as $to) $this->cmd('RCPT TO:<' . $clean($to) . '>', [250, 251], 'rcpt');
        $this->cmd('DATA', 354);
        $body = preg_replace('/^\./m', '..', $message) ?? $message; // a line that starts with a dot gets one more
        if (substr($body, -2) !== "\r\n") $body .= "\r\n";
        for ($done = 0, $len = strlen($body); $done < $len;) {
            $w = @fwrite($this->fp, substr($body, $done, 65536));
            if (!$w) throw new MlMailError('connect', 'connection lost');
            $done += $w;
        }
        $this->cmd('.', 250);
    }

    public function close(): void
    {
        if (!$this->fp) return;
        @fwrite($this->fp, "QUIT\r\n");
        @fclose($this->fp);
        $this->fp = null;
    }

    public function __destruct()
    {
        $this->close();
    }
}

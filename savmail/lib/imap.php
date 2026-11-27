<?php
/**
 * SavMail — a small IMAP4rev1 client (RFC 3501, with LITERAL+, MOVE, UIDPLUS, SPECIAL-USE, SASL-IR and XOAUTH2 when the
 * server has them), on a TLS socket: no PHP extension needed (ext-imap has no XOAUTH2 and is gone from PHP 8.4).
 * One connection per request of the app: connect, sign in, do the work, log out.
 *
 * Responses are read whole (literals included: "{123}\r\n" + 123 bytes) and parsed into nested arrays: atoms and strings
 * as PHP strings, NIL as null, parenthesised lists as arrays. Square brackets stay inside their atom (BODY[HEADER],
 * [UIDVALIDITY 7]), as the grammar wants.
 *
 * ml_net_check() runs before every connection (IMAP and SMTP): known mail ports only, TLS always, and never a server of
 * the local network — the API must not become a way to knock on doors inside the hosting.
 */

declare(strict_types=1);

final class MlMailError extends RuntimeException
{
    /** kind: host (bad or private address), connect, tls, auth (wrong user or password), proto, refused (a NO), big */
    public string $kind;
    public string $server;

    public function __construct(string $kind, string $server = '')
    {
        parent::__construct($kind . ($server !== '' ? ': ' . $server : ''));
        $this->kind = $kind;
        $this->server = mb_substr(preg_replace('/[\x00-\x1F\x7F]+/', ' ', $server) ?? '', 0, 300);
    }
}

const ML_PORTS = [993, 143, 465, 587, 25, 2525];

/** Host and port a mailbox may use; throws MlMailError('host') otherwise. */
function ml_net_check(string $host, int $port, string $tls): void
{
    $private = (bool)config_value('private_hosts', false);
    if (!preg_match('/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i', $host)) throw new MlMailError('host');
    if (!$private && (!in_array($port, ML_PORTS, true) || $tls === 'none')) throw new MlMailError('host');
    if (!in_array($tls, ['ssl', 'starttls', 'none'], true)) throw new MlMailError('host');
    if ($private) return;
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
    if (!filter_var($host, FILTER_VALIDATE_IP)) foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $r) if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
    if (!$ips) throw new MlMailError('host', 'unknown host');
    foreach ($ips as $ip) if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) throw new MlMailError('host', 'private address');
}

/** A TLS (or plain, then STARTTLS) socket to a mail server. */
function ml_socket(string $host, int $port, string $tls, int $timeout = 20)
{
    ml_net_check($host, $port, $tls);
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host, 'SNI_enabled' => true]]);
    $fp = @stream_socket_client(($tls === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port, $no, $str, $timeout, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) throw new MlMailError($no === 0 && $tls === 'ssl' ? 'tls' : 'connect', (string)$str);
    stream_set_timeout($fp, $timeout);
    return $fp;
}

function ml_tls_up($fp): void
{
    if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | (defined('STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT') ? STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT : 0))) throw new MlMailError('tls');
}

/** Mailbox names travel as modified UTF-7 (RFC 3501 §5.1.3); people read them in UTF-8. */
function ml_mbox_name(string $raw): string
{
    if (!preg_match('/&[^-]*-/', $raw)) return $raw;
    $s = @mb_convert_encoding($raw, 'UTF-8', 'UTF7-IMAP');
    return is_string($s) && $s !== '' ? $s : $raw;
}

function ml_mbox_raw(string $utf8): string
{
    if (!preg_match('/[^\x20-\x7e]|&/', $utf8)) return $utf8;
    return (string)mb_convert_encoding($utf8, 'UTF7-IMAP', 'UTF-8');
}

final class MlImap
{
    private $fp;
    private int $n = 0;
    public array $caps = [];
    public ?string $selected = null;
    public array $box = [];

    public function __construct(string $host, int $port, string $tls)
    {
        $this->fp = ml_socket($host, $port, $tls);
        $g = $this->readLine();
        if (stripos($g, '* OK') !== 0 && stripos($g, '* PREAUTH') !== 0) throw new MlMailError('proto', $g);
        if ($tls === 'starttls') {
            $this->capability();
            if (!$this->has('STARTTLS')) throw new MlMailError('tls', 'no STARTTLS');
            $this->run('STARTTLS');
            ml_tls_up($this->fp);
        }
        $this->capability();
    }

    public function has(string $cap): bool
    {
        return in_array(strtoupper($cap), $this->caps, true);
    }

    // ------------------------------------------------------------ wire

    private function readLine(): string
    {
        $l = fgets($this->fp);
        if ($l === false) {
            $m = stream_get_meta_data($this->fp);
            throw new MlMailError('connect', !empty($m['timed_out']) ? 'timeout' : 'connection closed');
        }
        return $l;
    }

    private function readBytes(int $n): string
    {
        if ($n > 60000000) throw new MlMailError('big');
        $out = '';
        while (strlen($out) < $n) {
            $c = fread($this->fp, min(65536, $n - strlen($out)));
            if ($c === false || ($c === '' && feof($this->fp))) throw new MlMailError('connect', 'connection closed');
            if ($c === '') { $m = stream_get_meta_data($this->fp); if (!empty($m['timed_out'])) throw new MlMailError('connect', 'timeout'); }
            $out .= $c;
        }
        return $out;
    }

    private function write(string $s): void
    {
        for ($done = 0, $len = strlen($s); $done < $len;) {
            $w = @fwrite($this->fp, substr($s, $done, 65536));
            if ($w === false || $w === 0) throw new MlMailError('connect', 'connection lost');
            $done += $w;
        }
    }

    /** A whole response: its line with each literal replaced by "\0<index>\0", and the literals. */
    private function readResponse(): array
    {
        $buf = '';
        $lits = [];
        $line = $this->readLine();
        while (preg_match('/\{(\d+)\+?\}\r?\n$/', $line, $m)) {
            $buf .= substr($line, 0, -strlen($m[0])) . "\0" . count($lits) . "\0";
            $lits[] = $this->readBytes((int)$m[1]);
            $line = $this->readLine();
        }
        return [$buf . rtrim($line, "\r\n"), $lits];
    }

    /** IMAP quoting: a quoted string when it is plain ASCII, otherwise a literal. */
    private static function str($x): string
    {
        return is_string($x) ? $x : '';
    }

    public static function q(string $s): array
    {
        return preg_match('/^[\x20-\x7e]*$/', $s) && strlen($s) < 1000 ? ['raw' => '"' . addcslashes($s, "\"\\") . '"'] : ['lit' => $s];
    }

    /**
     * Sends a command made of pieces (strings as they are, ['raw' => …], ['lit' => …]) and reads until its tagged reply.
     * Returns the untagged responses, parsed. A NO or BAD throws MlMailError('refused', text of the server).
     */
    public function run(...$parts): array
    {
        $tag = 'S' . (++$this->n);
        $plus = $this->has('LITERAL+');
        $chunks = []; // without LITERAL+ each literal waits for the "+" of the server: what goes before it is a chunk
        $cur = $tag . ' ';
        foreach ($parts as $p) {
            if (is_string($p)) $cur .= $p;
            elseif (isset($p['raw'])) $cur .= $p['raw'];
            elseif ($plus) $cur .= '{' . strlen($p['lit']) . "+}\r\n" . $p['lit'];
            else { $chunks[] = $cur . '{' . strlen($p['lit']) . "}\r\n"; $cur = $p['lit']; }
        }
        $untagged = [];
        foreach ($chunks as $c) {
            $this->write($c);
            while (true) {
                [$l, $lits] = $this->readResponse();
                if ($l !== '' && $l[0] === '+') break;
                if (strpos($l, $tag . ' ') === 0) throw new MlMailError('refused', substr($l, strlen($tag) + 1));
                $untagged[] = self::parse($l, $lits);
            }
        }
        $this->write($cur . "\r\n");
        while (true) {
            [$l, $lits] = $this->readResponse();
            if ($l === '') continue;
            if ($l[0] === '+') { // a SASL challenge: the answer prepared for it, otherwise an empty line that ends it
                $this->write(($this->reply ?? '') . "\r\n");
                $this->reply = null;
                continue;
            }
            if (strpos($l, $tag . ' ') === 0) {
                $rest = substr($l, strlen($tag) + 1);
                if (stripos($rest, 'OK') !== 0) throw new MlMailError(stripos($rest, 'BAD') === 0 ? 'proto' : 'refused', $rest);
                if (preg_match('/\[CAPABILITY ([^\]]*)\]/i', $rest, $m)) $this->caps = array_map('strtoupper', preg_split('/\s+/', trim($m[1])));
                $this->last = $rest;
                return $untagged;
            }
            $t = self::parse($l, $lits);
            if (($t[0] ?? '') === '*' && strtoupper(self::str($t[1] ?? null)) === 'BYE') throw new MlMailError('connect', $l);
            $untagged[] = $t;
        }
    }

    public string $last = '';
    private ?string $reply = null;

    /** Parses one response into tokens. */
    public static function parse(string $s, array $lits): array
    {
        $i = 0;
        $n = strlen($s);
        $read = function () use (&$read, $s, $n, &$i, $lits) {
            $list = [];
            while ($i < $n) {
                $c = $s[$i];
                if ($c === ' ') { $i++; continue; }
                if ($c === ')') { $i++; return $list; }
                if ($c === '(') { $i++; $list[] = $read(); continue; }
                if ($c === '"') {
                    $i++;
                    $str = '';
                    while ($i < $n && $s[$i] !== '"') { if ($s[$i] === '\\' && $i + 1 < $n) $i++; $str .= $s[$i++]; }
                    $i++;
                    $list[] = $str;
                    continue;
                }
                if ($c === "\0") {
                    $j = strpos($s, "\0", $i + 1);
                    $list[] = $lits[(int)substr($s, $i + 1, $j - $i - 1)] ?? '';
                    $i = $j + 1;
                    continue;
                }
                $a = '';
                $depth = 0;
                while ($i < $n) {
                    $c = $s[$i];
                    if ($depth === 0 && ($c === ' ' || $c === '(' || $c === ')')) break;
                    if ($c === '[') $depth++;
                    elseif ($c === ']' && $depth > 0) $depth--;
                    if ($c === "\0") break;
                    $a .= $c;
                    $i++;
                }
                $list[] = strtoupper($a) === 'NIL' ? null : $a;
            }
            return $list;
        };
        return $read();
    }

    // ------------------------------------------------------------ commands

    public function capability(): void
    {
        foreach ($this->run('CAPABILITY') as $t) if (strtoupper(self::str($t[1] ?? null)) === 'CAPABILITY') $this->caps = array_map(fn($x) => strtoupper((string)$x), array_slice($t, 2));
    }

    public function login(string $user, string $pass): void
    {
        try {
            if ($this->has('AUTH=PLAIN') && ($this->has('LOGINDISABLED') || !preg_match('/^[\x20-\x7e]*$/', $user . $pass))) {
                $ir = base64_encode("\0" . $user . "\0" . $pass);
                if ($this->has('SASL-IR')) $this->run('AUTHENTICATE PLAIN ' . $ir);
                else { $this->reply = $ir; $this->run('AUTHENTICATE PLAIN'); }
            } else {
                $this->run('LOGIN ', self::q($user), ' ', self::q($pass));
            }
        } catch (MlMailError $e) {
            if ($e->kind === 'refused' || $e->kind === 'proto') throw new MlMailError('auth', $e->server);
            throw $e;
        }
        $this->capability();
    }

    public function xoauth2(string $user, string $token): void
    {
        try {
            $this->run('AUTHENTICATE XOAUTH2 ' . base64_encode("user=$user\x01auth=Bearer $token\x01\x01"));
        } catch (MlMailError $e) {
            if ($e->kind === 'refused' || $e->kind === 'proto') throw new MlMailError('auth', $e->server);
            throw $e;
        }
        $this->capability();
    }

    /** Every mailbox: [raw name, name to show, delimiter, attributes (lower case, without the backslash)]. */
    public function folders(): array
    {
        $out = [];
        foreach ($this->run('LIST "" "*"') as $t) {
            if (strtoupper(self::str($t[1] ?? null)) !== 'LIST' || !is_array($t[2] ?? null)) continue;
            $raw = (string)($t[4] ?? '');
            if ($raw === '') continue;
            $out[] = ['raw' => $raw, 'name' => ml_mbox_name($raw), 'delim' => (string)($t[3] ?? '/'), 'attrs' => array_map(fn($a) => strtolower(ltrim((string)$a, '\\')), $t[2])];
        }
        return $out;
    }

    /** Unread and total messages of several mailboxes, asked all at once (one round trip). */
    public function statuses(array $raws): array
    {
        $out = [];
        if (!$raws) return $out;
        $tags = [];
        $buf = '';
        foreach ($raws as $raw) {
            $tag = 'S' . (++$this->n);
            $tags[$tag] = $raw;
            $q = self::q($raw);
            if (isset($q['lit'])) continue;
            $buf .= $tag . ' STATUS ' . $q['raw'] . " (MESSAGES UNSEEN)\r\n";
        }
        $this->write($buf);
        $left = count(array_filter($raws, fn($r) => !isset(self::q($r)['lit'])));
        while ($left > 0) {
            [$l, $lits] = $this->readResponse();
            if (preg_match('/^S\d+ /', $l)) { $left--; continue; }
            $t = self::parse($l, $lits);
            if (strtoupper(self::str($t[1] ?? null)) !== 'STATUS' || !is_array($t[3] ?? null)) continue;
            $v = [];
            for ($i = 0; $i + 1 < count($t[3]); $i += 2) $v[strtoupper((string)$t[3][$i])] = (int)$t[3][$i + 1];
            $out[(string)$t[2]] = ['total' => $v['MESSAGES'] ?? 0, 'unread' => $v['UNSEEN'] ?? 0];
        }
        return $out;
    }

    public function select(string $raw): array
    {
        if ($this->selected === $raw) return $this->box;
        $box = ['exists' => 0, 'uidvalidity' => 0, 'uidnext' => 0];
        foreach ($this->run('SELECT ', self::q($raw)) as $t) {
            if (isset($t[2]) && strtoupper(self::str($t[2])) === 'EXISTS') $box['exists'] = (int)$t[1];
            $all = implode(' ', array_map(fn($x) => is_string($x) ? $x : '', $t));
            if (preg_match('/\[UIDVALIDITY (\d+)\]/i', $all, $m)) $box['uidvalidity'] = (int)$m[1];
            if (preg_match('/\[UIDNEXT (\d+)\]/i', $all, $m)) $box['uidnext'] = (int)$m[1];
        }
        $this->selected = $raw;
        return $this->box = $box;
    }

    /** FETCH (by sequence numbers, or by UID): one map per message, keys in capitals (UID, FLAGS, BODY[…]…). */
    public function fetch(string $set, string $items, bool $uid = true): array
    {
        $out = [];
        foreach ($this->run(($uid ? 'UID ' : '') . "FETCH $set ($items)") as $t) {
            if (strtoupper(self::str($t[2] ?? null)) !== 'FETCH' || !is_array($t[3] ?? null)) continue;
            $m = ['SEQ' => (int)$t[1]];
            for ($i = 0; $i + 1 < count($t[3]); $i += 2) {
                $k = strtoupper((string)$t[3][$i]);
                $m[preg_replace('/^BODY\.PEEK/', 'BODY', $k)] = $t[3][$i + 1];
            }
            if (isset($m['UID'])) $out[] = $m;
        }
        return $out;
    }

    /** UID SEARCH: the pieces of the query (see run). */
    public function search(...$criteria): array
    {
        $u = [];
        foreach ($this->run('UID SEARCH ', ...$criteria) as $t) if (strtoupper(self::str($t[1] ?? null)) === 'SEARCH') foreach (array_slice($t, 2) as $x) if (ctype_digit((string)$x)) $u[] = (int)$x;
        return $u;
    }

    public function store(string $uids, string $op, string $flags): void
    {
        $this->run("UID STORE $uids $op ($flags)");
    }

    public function move(string $uids, string $to): void
    {
        if ($this->has('MOVE')) { $this->run("UID MOVE $uids ", self::q($to)); return; }
        $this->run("UID COPY $uids ", self::q($to));
        $this->expunge($uids);
    }

    public function copy(string $uids, string $to): void
    {
        $this->run("UID COPY $uids ", self::q($to));
    }

    /** Deletes for good the messages $uids of the mailbox that is open. */
    public function expunge(string $uids): void
    {
        $this->store($uids, '+FLAGS.SILENT', '\\Deleted');
        $this->run($this->has('UIDPLUS') ? "UID EXPUNGE $uids" : 'EXPUNGE');
    }

    /** Adds a message to a mailbox; its UID when the server tells it (UIDPLUS). */
    public function append(string $raw, string $message, string $flags = '\\Seen'): ?int
    {
        $this->run('APPEND ', self::q($raw), " ($flags) ", ['lit' => $message]);
        return preg_match('/\[APPENDUID \d+ (\d+)\]/i', $this->last, $m) ? (int)$m[1] : null;
    }

    public function create(string $raw): void
    {
        $this->run('CREATE ', self::q($raw));
    }

    public function logout(): void
    {
        if (!$this->fp) return;
        try { @fwrite($this->fp, 'S' . (++$this->n) . " LOGOUT\r\n"); } catch (Throwable $e) { /* gone already */ }
        @fclose($this->fp);
        $this->fp = null;
    }

    public function __destruct()
    {
        $this->logout();
    }
}

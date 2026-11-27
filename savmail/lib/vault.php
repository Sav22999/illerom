<?php
/**
 * SavMail — the vault: how the mailboxes of an account are kept so that the database, the backups and even the files of
 * the server together are not enough to read them.
 *
 *   - Every account has a key of its own (VK, 32 random bytes) that is never written anywhere in clear.
 *   - The mailboxes (servers, user names, passwords or Microsoft tokens, signatures) are one JSON block, encrypted with VK
 *     (XChaCha20-Poly1305, libsodium) in ml_vaults. The associated data ties each block to its account: a block copied to
 *     another row does not open.
 *   - VK is locked once for every way of opening it (ml_keys):
 *       device    a browser where SavMail was opened: 32 random bytes that live only in an HttpOnly cookie of that browser
 *                 (savmail_device, path /savmail/). The server sees them only while that browser makes a request.
 *       password  the password of one of the mailboxes, through Argon2id: on a new device, the password of any mailbox
 *                 opens SavMail again (the mail server checks it too when the mailbox is used).
 *       recovery  a recovery code the person writes down (optional), through Argon2id: for mailboxes without a password
 *                 (Outlook, signed in with Microsoft) or a password changed on the mail server.
 *   - Messages are never kept: they are read from the mail server on every request and only pass through.
 *
 * What a thief gets with the whole database and the files: encrypted blocks, and wraps that need either a cookie that is
 * not on the server or an Argon2id guess of a mailbox password per try. What nobody can prevent: whoever controls the
 * running server while someone uses SavMail sees what that person's requests carry (true of every web mail client).
 */

declare(strict_types=1);

const ML_DEVICE_COOKIE = 'savmail_device';
const ML_MAX_ACCOUNTS = 10;
const ML_PW_OPS = 3;                    // Argon2id: 3 passes over 128 MiB (about half a second on a server)
const ML_PW_MEM = 134217728;
const ML_DEVICE_DAYS = 400;             // the longest a browser keeps a cookie

if (!function_exists('sodium_crypto_aead_xchacha20poly1305_ietf_encrypt')) throw new RuntimeException('SavMail needs the sodium extension of PHP');

function b64u(string $s): string
{
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}

function b64u_dec(string $s): ?string
{
    if (!preg_match('/^[A-Za-z0-9_-]*$/', $s)) return null;
    $r = base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4), true);
    return $r === false ? null : $r;
}

/** Encrypts with a 32-byte key: nonce + ciphertext, base64url. $aad: what the block belongs to (checked, not hidden). */
function ml_seal(string $plain, string $key, string $aad): string
{
    $nonce = random_bytes(SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES);
    return b64u($nonce . sodium_crypto_aead_xchacha20poly1305_ietf_encrypt($plain, $aad, $nonce, $key));
}

function ml_open(string $blob, string $key, string $aad): ?string
{
    $raw = b64u_dec($blob);
    $n = SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_NPUBBYTES;
    if ($raw === null || strlen($raw) <= $n + SODIUM_CRYPTO_AEAD_XCHACHA20POLY1305_IETF_ABYTES) return null;
    $out = sodium_crypto_aead_xchacha20poly1305_ietf_decrypt(substr($raw, $n), $aad, substr($raw, 0, $n), $key);
    return $out === false ? null : $out;
}

function ml_aad_key(int $uid, string $kind, string $kid): string
{
    return "savmail|key|$uid|$kind|$kid";
}

function ml_aad_vault(int $uid): string
{
    return "savmail|vault|$uid";
}

// ---------------------------------------------------------------- the cookie of the device

/** [kid, secret] from the cookie of this browser, or null. */
function ml_device_secret(): ?array
{
    $c = $_COOKIE[ML_DEVICE_COOKIE] ?? '';
    if (!is_string($c) || !preg_match('/^([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/', $c, $m)) return null;
    $dk = b64u_dec($m[2]);
    return $dk !== null && strlen($dk) === 32 ? [$m[1], $dk] : null;
}

function ml_set_device_cookie(string $value, bool $remember): void
{
    setcookie(ML_DEVICE_COOKIE, $value, ['expires' => $value === '' ? time() - 3600 : ($remember ? time() + ML_DEVICE_DAYS * 86400 : 0),
        'path' => app_base_path(), 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
    if ($value === '') unset($_COOKIE[ML_DEVICE_COOKIE]);
    else $_COOKIE[ML_DEVICE_COOKIE] = $value;
}

/** The key that unlocks VK for a device: derived from its secret, never stored. */
function ml_device_kek(string $dk): string
{
    return sodium_crypto_kdf_derive_from_key(32, 1, 'mldevice', $dk);
}

function ml_pw_kek(string $secret, string $salt): string
{
    return sodium_crypto_pwhash(32, $secret, $salt, ML_PW_OPS, ML_PW_MEM, SODIUM_CRYPTO_PWHASH_ALG_ARGON2ID13);
}

// ---------------------------------------------------------------- opening the vault

function ml_vault_row(int $uid): ?array
{
    $r = q('SELECT * FROM ' . t('ml_vaults') . ' WHERE user_id = ?', [$uid])->fetch();
    return $r ?: null;
}

/** VK of the account, opened with the cookie of this browser; null when this browser cannot open it. */
function ml_vault_key(array $u): ?string
{
    static $memo = [];
    if (array_key_exists($u['id'], $memo)) return $memo[$u['id']];
    $d = ml_device_secret();
    if (!$d) return $memo[$u['id']] = null;
    [$kid, $dk] = $d;
    $row = q('SELECT * FROM ' . t('ml_keys') . " WHERE user_id = ? AND kind = 'device' AND kid = ?", [$u['id'], $kid])->fetch();
    if (!$row) return $memo[$u['id']] = null;
    $kek = ml_device_kek($dk);
    $vk = ml_open((string)$row['wrap'], $kek, ml_aad_key($u['id'], 'device', $kid));
    sodium_memzero($kek);
    if ($vk === null || strlen($vk) !== 32) return $memo[$u['id']] = null;
    if (!$row['used_at'] || strtotime($row['used_at'] . ' UTC') < time() - 86400) q('UPDATE ' . t('ml_keys') . ' SET used_at = ? WHERE id = ?', [now_utc(), $row['id']]);
    return $memo[$u['id']] = $vk;
}

/** 'empty' (no mailbox yet), 'locked' (this browser cannot open it) or 'open'. */
function ml_state(array $u): string
{
    if (!ml_vault_row($u['id'])) return 'empty';
    return ml_vault_key($u) === null ? 'locked' : 'open';
}

function ml_vault_load(array $u, string $vk, ?int &$version = null): array
{
    $row = ml_vault_row($u['id']);
    if (!$row) fail('vault_empty', 409);
    $plain = ml_open((string)$row['data'], $vk, ml_aad_vault($u['id']));
    if ($plain === null) fail('vault_locked', 423);
    $version = (int)$row['version'];
    $d = json_decode($plain, true);
    return is_array($d) ? $d + ['v' => 1, 'accounts' => []] : ['v' => 1, 'accounts' => []];
}

/** Changes the vault: $fn gets the data and returns it changed. Saved only over the version it read (two tabs never lose a change). */
function ml_vault_mutate(array $u, string $vk, callable $fn): array
{
    for ($try = 0; $try < 4; $try++) {
        $ver = 0;
        $data = $fn(ml_vault_load($u, $vk, $ver));
        $st = q('UPDATE ' . t('ml_vaults') . ' SET data = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?',
            [ml_seal(json_out($data), $vk, ml_aad_vault($u['id'])), now_utc(), $u['id'], $ver]);
        if ($st->rowCount() === 1) return $data;
    }
    fail('server', 500);
    return [];
}

/** A new vault for the account (its first mailbox), opened on this browser. Returns VK. */
function ml_vault_create(array $u, array $data, bool $remember): string
{
    $vk = random_bytes(32);
    q('DELETE FROM ' . t('ml_keys') . ' WHERE user_id = ?', [$u['id']]);
    q('INSERT INTO ' . t('ml_vaults') . ' (user_id, data, version, created_at, updated_at) VALUES (?,?,1,?,?) ON DUPLICATE KEY UPDATE data = VALUES(data), version = version + 1, updated_at = VALUES(updated_at)',
        [$u['id'], ml_seal(json_out($data), $vk, ml_aad_vault($u['id'])), now_utc(), now_utc()]);
    ml_add_device($u, $vk, $remember);
    return $vk;
}

/** This browser becomes a device that opens the vault (a new random secret, in its cookie only). */
function ml_add_device(array $u, string $vk, bool $remember): void
{
    $old = ml_device_secret();
    if ($old) q('DELETE FROM ' . t('ml_keys') . " WHERE user_id = ? AND kind = 'device' AND kid = ?", [$u['id'], $old[0]]);
    $kid = b64u(random_bytes(12));
    $dk = random_bytes(32);
    $kek = ml_device_kek($dk);
    q('INSERT INTO ' . t('ml_keys') . " (user_id, kind, kid, wrap, label, created_at, used_at) VALUES (?, 'device', ?, ?, ?, ?, ?)",
        [$u['id'], $kid, ml_seal($vk, $kek, ml_aad_key($u['id'], 'device', $kid)), mb_substr(device_label(), 0, 80), now_utc(), now_utc()]);
    ml_set_device_cookie($kid . '.' . b64u($dk), $remember);
    sodium_memzero($kek);
    sodium_memzero($dk);
}

/** VK locked with a secret the person knows ($kind password: a mailbox, kid = its id; recovery: kid = 'code'). */
function ml_secret_wrap(array $u, string $vk, string $kind, string $kid, string $secret): void
{
    $salt = random_bytes(SODIUM_CRYPTO_PWHASH_SALTBYTES);
    $kek = ml_pw_kek($secret, $salt);
    q('INSERT INTO ' . t('ml_keys') . ' (user_id, kind, kid, wrap, salt, label, created_at) VALUES (?,?,?,?,?,\'\',?)
        ON DUPLICATE KEY UPDATE wrap = VALUES(wrap), salt = VALUES(salt), created_at = VALUES(created_at)',
        [$u['id'], $kind, $kid, ml_seal($vk, $kek, ml_aad_key($u['id'], $kind, $kid)), b64u($salt), now_utc()]);
    sodium_memzero($kek);
}

function ml_drop_wrap(array $u, string $kind, string $kid): void
{
    q('DELETE FROM ' . t('ml_keys') . ' WHERE user_id = ? AND kind = ? AND kid = ?', [$u['id'], $kind, $kid]);
}

/** Tries the secret against every password and the recovery code: VK, or null. */
function ml_unlock_with_secret(array $u, string $secret): ?string
{
    $rows = q('SELECT * FROM ' . t('ml_keys') . " WHERE user_id = ? AND kind IN ('password', 'recovery') ORDER BY kind = 'recovery', id LIMIT " . (ML_MAX_ACCOUNTS + 1), [$u['id']])->fetchAll();
    foreach ($rows as $row) {
        $salt = b64u_dec((string)$row['salt']);
        if ($salt === null || strlen($salt) !== SODIUM_CRYPTO_PWHASH_SALTBYTES) continue;
        $try = $row['kind'] === 'recovery' ? ml_recovery_norm($secret) : $secret;
        if ($try === '') continue;
        $kek = ml_pw_kek($try, $salt);
        $vk = ml_open((string)$row['wrap'], $kek, ml_aad_key($u['id'], (string)$row['kind'], (string)$row['kid']));
        sodium_memzero($kek);
        if ($vk !== null && strlen($vk) === 32) {
            q('UPDATE ' . t('ml_keys') . ' SET used_at = ? WHERE id = ?', [now_utc(), $row['id']]);
            return $vk;
        }
    }
    return null;
}

/** Ways to open the vault on a new device (no names: the addresses are inside the vault). */
function ml_unlock_ways(array $u): array
{
    $k = q('SELECT kind, COUNT(*) n FROM ' . t('ml_keys') . " WHERE user_id = ? AND kind IN ('password', 'recovery') GROUP BY kind", [$u['id']])->fetchAll(PDO::FETCH_KEY_PAIR);
    return ['passwords' => (int)($k['password'] ?? 0), 'recovery' => !empty($k['recovery'])];
}

// ---------------------------------------------------------------- recovery code

const ML_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford's: no I, L, O, U

/** 20 characters (100 bits), shown in groups of four. */
function ml_recovery_new(): string
{
    $c = '';
    for ($i = 0; $i < 20; $i++) $c .= ML_CODE_ALPHABET[random_int(0, 31)];
    return implode('-', str_split($c, 4));
}

/** What was typed, as the code: capitals, without spaces or dashes, the letters people mix up read as Crockford does. */
function ml_recovery_norm(string $s): string
{
    $s = strtoupper(preg_replace('/[\s-]+/', '', $s) ?? '');
    $s = strtr($s, ['O' => '0', 'I' => '1', 'L' => '1']);
    return preg_match('/^[0-9A-HJKMNP-TV-Z]{20}$/', $s) ? $s : '';
}

// ---------------------------------------------------------------- devices

function ml_devices(array $u): array
{
    $cur = ml_device_secret()[0] ?? '';
    return array_map(fn($r) => ['id' => $r['kid'], 'label' => $r['label'], 'created' => iso($r['created_at']), 'used' => iso($r['used_at']), 'current' => $r['kid'] === $cur],
        q('SELECT kid, label, created_at, used_at FROM ' . t('ml_keys') . " WHERE user_id = ? AND kind = 'device' ORDER BY used_at DESC", [$u['id']])->fetchAll());
}

function ml_forget_device(array $u, ?string $kid = null): void
{
    $cur = ml_device_secret()[0] ?? '';
    $kid = $kid ?? $cur;
    if ($kid !== '') q('DELETE FROM ' . t('ml_keys') . " WHERE user_id = ? AND kind = 'device' AND kid = ?", [$u['id'], $kid]);
    if ($kid === $cur) ml_set_device_cookie('', false);
}

/** Everything SavMail keeps of the account, gone (the mailboxes themselves stay on their servers). */
function ml_reset(array $u): void
{
    q('DELETE FROM ' . t('ml_keys') . ' WHERE user_id = ?', [$u['id']]);
    q('DELETE FROM ' . t('ml_vaults') . ' WHERE user_id = ?', [$u['id']]);
    ml_set_device_cookie('', false);
}

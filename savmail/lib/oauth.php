<?php
/**
 * SavMail — signing in with Microsoft for Outlook, Hotmail, Live and Microsoft 365 mailboxes: Microsoft no longer
 * accepts their password over IMAP and SMTP. OAuth 2.0 authorization code with PKCE, then IMAP and SMTP with XOAUTH2.
 *
 * Needs an app registered on entra.microsoft.com (free): "Accounts in any organizational directory and personal Microsoft
 * accounts", redirect address (Web) https://<site>/savmail/api/?r=ml.oauth.callback, delegated permissions of
 * Microsoft Graph: IMAP.AccessAsUser.All, SMTP.Send, offline_access, email, openid; a client secret (its Value).
 * $microsoft_client_id and $microsoft_client_secret go in savmail/credentials.php. Without them Outlook is shown as not
 * available yet. The tokens are kept only inside the vault (lib/vault.php), like passwords.
 */

declare(strict_types=1);

const ML_MS_AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const ML_MS_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const ML_MS_SCOPE = 'offline_access openid email https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send';

function ml_oauth_ready(): bool
{
    return (string)config_value('microsoft_client_id', '') !== '';
}

function ml_oauth_redirect(): string
{
    return app_url() . 'api/?r=ml.oauth.callback';
}

/** Where to send the browser to sign in with Microsoft. $account: the mailbox signed in again (its id), or '' for a new one. */
function ml_oauth_start(array $u, string $account, string $hint): string
{
    if (!ml_oauth_ready()) fail('oauth_off', 501);
    q('DELETE FROM ' . t('ml_oauth') . ' WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 900)]);
    $state = b64u(random_bytes(32));
    $verifier = bin2hex(random_bytes(32));
    q('INSERT INTO ' . t('ml_oauth') . ' (state, user_id, verifier, account, created_at) VALUES (?,?,?,?,?)', [$state, $u['id'], $verifier, $account, now_utc()]);
    return ML_MS_AUTH . '?' . http_build_query(['client_id' => config_value('microsoft_client_id'), 'response_type' => 'code', 'redirect_uri' => ml_oauth_redirect(),
        'response_mode' => 'query', 'scope' => ML_MS_SCOPE, 'state' => $state, 'code_challenge' => b64u(hash('sha256', $verifier, true)), 'code_challenge_method' => 'S256',
        'prompt' => 'select_account'] + ($hint !== '' ? ['login_hint' => $hint] : []));
}

/** The sign-in in progress for this state (once: it is deleted). */
function ml_oauth_take(array $u, string $state): ?array
{
    if (!preg_match('/^[A-Za-z0-9_-]{43}$/', $state)) return null;
    $row = q('SELECT * FROM ' . t('ml_oauth') . ' WHERE state = ? AND user_id = ? AND created_at > ?', [$state, $u['id'], gmdate('Y-m-d H:i:s', time() - 900)])->fetch();
    q('DELETE FROM ' . t('ml_oauth') . ' WHERE state = ?', [$state]);
    return $row ?: null;
}

function ml_oauth_post(array $fields): array
{
    $fields += ['client_id' => config_value('microsoft_client_id'), 'scope' => ML_MS_SCOPE];
    if ((string)config_value('microsoft_client_secret', '') !== '') $fields['client_secret'] = config_value('microsoft_client_secret');
    $h = curl_init(ML_MS_TOKEN);
    curl_setopt_array($h, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($fields), CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 6, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Accept: application/json']]);
    $res = json_decode((string)curl_exec($h), true);
    if (!is_array($res) || empty($res['access_token'])) {
        error_log('SavMail Microsoft token: ' . (is_array($res) ? ($res['error'] ?? 'no token') : 'no answer'));
        throw new MlMailError('auth', is_array($res) ? (string)($res['error_description'] ?? $res['error'] ?? '') : '');
    }
    $out = ['access' => (string)$res['access_token'], 'exp' => time() + (int)($res['expires_in'] ?? 3600) - 120];
    if (!empty($res['refresh_token'])) $out['refresh'] = (string)$res['refresh_token'];
    if (!empty($res['id_token'])) {
        $claims = json_decode((string)b64u_dec(explode('.', (string)$res['id_token'])[1] ?? ''), true) ?: [];
        $out['email'] = mb_strtolower((string)($claims['email'] ?? $claims['preferred_username'] ?? ''));
        $out['name'] = (string)($claims['name'] ?? '');
    }
    return $out;
}

function ml_oauth_exchange(string $code, string $verifier): array
{
    return ml_oauth_post(['grant_type' => 'authorization_code', 'code' => $code, 'redirect_uri' => ml_oauth_redirect(), 'code_verifier' => $verifier]);
}

function ml_oauth_refresh(string $refresh): array
{
    return ml_oauth_post(['grant_type' => 'refresh_token', 'refresh_token' => $refresh]);
}

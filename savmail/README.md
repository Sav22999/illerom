# SavMail

Free, open web mail, part of **SavOffice**: the email addresses of any provider (Gmail, Outlook, Yahoo, iCloud, Aruba,
Libero, or any IMAP mailbox) in one place. Every address with its own folders, and the folders of all of them together
(inbox, drafts, sent, archive, spam, trash). Read, reply, reply to all, forward with attachments, drafts kept in the
mailbox itself, a name and a signature for each address. The same account as **SavSchedules** and the other apps of
SavOffice. <https://www.illerom.eu/savmail/>

**Not listed yet** (for testing): it is not among the apps of SavOffice, and it tells search engines to keep away
(`X-Robots-Tag` in `index.php`, `api/` and `.htaccess`, `<meta name="robots">`). See *Publishing* below.

## How a person uses it

1. Signs in, with SavAccount or email and password (the account of SavOffice).
2. Lands in the app; with no address yet, its page asks for the first one, in three steps (`accountForm` in
   `assets/vault.js`): **provider** (Gmail, Outlook, Yahoo, iCloud, Aruba, Libero, or another one whose servers the
   person writes) → **access** (address and password, or "Continue with Microsoft"; "Check and continue" signs in to IMAP
   and SMTP with `ml.account.test` and saves nothing) → **in SavMail** (name, colour, signature, copy in Sent; "Add to
   SavMail" checks again and keeps it in the vault with `ml.account.add`).
3. Adds more from **Email addresses** (up to 10), reads and writes; on another device the password of any of the
   addresses (or a recovery code) opens SavMail there.

## Stack

- PHP 7.4+ (8.x recommended) with **sodium**, curl, mbstring, openssl, DOM; MySQL 5.7+ / MariaDB 10.3+ (PDO). No PHP
  IMAP extension: `lib/imap.php` is its own client (XOAUTH2, LITERAL+, MOVE, UIDPLUS, SPECIAL-USE).
- **No credentials of its own**: it reads `../savschedules/credentials.php` (same database, same accounts, tables
  `sch_users`…). Its tables are next to them, `sch_ml_*`, created by the API at its first answer. An optional
  `credentials.php` (see `credentials-sample.php`) adds the Microsoft sign-in or an own SavAccount service.
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents from `../assets/sav/`.
- SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`. The session is shared
  with the apps of `SHARED_APPS` (each `lib/bootstrap.php` lists `savmail`, and `savschedules` its `SHARED_WITH`).

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/vault.php` | **How the addresses are kept: read its top before touching it** |
| `lib/imap.php`, `lib/smtp.php` | IMAP and SMTP clients; `ml_net_check()`: only mail ports, TLS, no local network |
| `lib/mime.php` | Reading messages (charsets, parts, attachments), **making their HTML safe**, writing new ones |
| `lib/mailbox.php` | The addresses in the vault and what the app does with them (folders and roles, lists, messages) |
| `lib/providers.php`, `lib/oauth.php` | Known providers and finding settings; signing in with Microsoft (Outlook) |
| `assets/shell.js` | The frame of every page (bar, side menu with the folders of all addresses and of each one) |
| `assets/mail.js` | The mail: lists (one folder, or a role of every address merged by date), the message, actions |
| `assets/compose.js` | Writing: new, reply, reply all, forward, drafts, attachments |
| `assets/addresses.js`, `vault.js` | The addresses page; the form that connects one; the first page with no address; unlocking |
| `assets/options.js`, `account.js` | Settings (account, security and devices, look, data); signing in and the first page |
| `assets/version.js` | The version in the footer and `#/changelog`: add an entry at every release |
| `sw.js` | Shell for installing the app: bump `CACHE` when the list of files changes |

## Security

- **Nothing readable at rest.** The settings of the addresses (servers, user names, passwords, Microsoft tokens,
  signatures) are one block encrypted with a key of the account (XChaCha20-Poly1305). That key is never stored in clear:
  it is locked for each device with 32 random bytes that live only in an HttpOnly cookie of that browser
  (`savmail_device`), and with the password of each address and the optional recovery code through Argon2id. A copy of
  the database, of the backups or of the whole server is not enough. Messages are never stored.
- What nobody can prevent: while someone uses SavMail the server must use the password, so whoever controlled the
  running server at that moment could see it (true of every web mail client). The privacy notice says so.
- **Messages are shown in an iframe sandboxed without scripts**, after `ml_sanitize()` (allow-list of tags and
  attributes; no scripts, frames, forms, SVG, event handlers, `javascript:` links). Pictures from the internet are held
  back until the person asks (or chose "always" for a sender). Attachments are always downloaded, never shown from this
  address (`Content-Type: application/octet-stream`, CSP sandbox).
- **No SSRF**: mail servers only on the known mail ports, always with TLS (SSL or STARTTLS, certificate checked), never
  on private or reserved addresses. `$savmail_private_hosts = true` lifts this only for tests on a computer.
- Rate limits: unlocking (per IP and per account), adding addresses, finding settings, sending (300 an hour).

## Install

Nothing to fill in when SavSchedules is installed. Then:

- **SavAccount**: add `https://www.illerom.eu/savmail/api/?r=auth.sav.callback` to the redirect addresses of the service
  of SavSchedules on savaccount.eu (or give SavMail its own service in `credentials.php`).
- **Outlook / Hotmail / Microsoft 365** (optional; without it Outlook is shown as not available yet): register an app on
  entra.microsoft.com — "Accounts in any organizational directory and personal Microsoft accounts", redirect (Web)
  `https://www.illerom.eu/savmail/api/?r=ml.oauth.callback`, API permissions → *Microsoft Graph*, delegated:
  `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`, `openid`, `email`; a client secret. Put
  `$microsoft_client_id` and `$microsoft_client_secret` in `savmail/credentials.php`.
- Gmail, Yahoo and iCloud work with a password for apps (the app explains how): no setup on the server.

## Publishing (when the tests are done)

1. Remove the `noindex`: `X-Robots-Tag` and `<meta name="robots">` in `index.php`, the block at the end of `.htaccess`.
2. List it: `assets/savoffice/savoffice.js` (both `APPS` lists), `savoffice/index.php` (its card, category and links),
   `data/projects.php`, `data/services.php` (the status page), the sitemap, and its entry in SavAwards' catalogue.
3. Version 1.0.0 in `assets/version.js`, and the screenshots of the store pages like the other apps.

## Local tests

A throwaway database and a test mail server (GreenMail: `java -Dgreenmail.setup.test.smtp -Dgreenmail.setup.test.imap
-jar greenmail-standalone.jar`, IMAP 3143 and SMTP 3025 without TLS) with `SAVMAIL_CREDENTIALS` pointing to a file with
`$savmail_private_hosts = true;`. Never on the real site.

## Not yet

Notifications while the app is closed (the server cannot open the vault without the person's device: by design),
sorting by sender or size, rules and filters, a contacts book.

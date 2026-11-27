# SavNewsletters

Newsletters written, approved and sent by a team. People create **groups**; each group has its own members (with
roles), its own subscribers (in one or more languages), its own outgoing address (SMTP) and its own subscription page
and widget. Moderators write with a drag-and-drop editor and propose a date and time; publishers approve; the cron
script sends at the chosen 30-minute slot.

Part of **SavOffice** with SavDocuments, SavPresentations, SavSchedules and SavCalendar: same look (SavComponents,
the frame of the first page, the bar and the footer), the SavOffice switcher in the bar (`../assets/savoffice/`, loaded
by `index.php` only when it is there), and what is scheduled shows up in SavCalendar (`lib/calendar.php`, below).
Called **OpenNewsletter** until 2026-11-26: the folder `../opennewsletter/` now only redirects here (308, query string
kept) because the emails already sent and the widgets on other sites point there; `widget.js` still reads
`data-opennewsletter`, the cron scripts with the old names still work, the database keeps the prefix `on_`.
Listed on the portal (`data/projects.php`, key `savnewsletters`) and on the status page (`data/services.php`).

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO), tables prefixed `on_`. Account code from MyCurriculum/Forkville.
- No build step: ES modules in `assets/` (`app.js` the app, `editor.js` the editor, `ui.js` helpers, `i18n.js` EN/IT,
  `hero.js` the fan of the first page and `icons.js` the SavComponents icons of the frame, both as in SavSchedules).
- **Every control is a SavComponent** (`../assets/sav/sav.css`, `sav.js`), as in the other apps of SavOffice: the pages
  once signed in have the arrangement of SavSchedules (bar, side menu with the groups, page), groups have `sav-tabs`,
  lists are `sav-card` rows with a `sav-dropdown` menu, tables are `sav-table`, numbers `sav-stat`, dialogs
  `sav-dialog`, colours `sav-color-picker`, dates `sav-date-picker`, sliders `sav-range`, the CSV import a
  `sav-dropzone`. `ui.js` builds them (`btn`, `primary`, `iconBtn`, `input`, `select`, `textarea`, `check`, `field`,
  `modal`, `drop`, `badge`, `alert`, `empty`, `toast`); its own drawings (blocks of the editor, text formatting) are
  registered as SavComponents icons `sn-…` (`registerAppIcons`), the rest are Lucide names (`ico()` maps them).
- Choices with a drawing (look and typeface of the subscription page, the template to start from) are
  `sav-radio-group appearance="cards"`, added to SavComponents in 1.1.1 for this app (`cardChoice`, `tplChoice`):
  the app draws only what is inside the cards (`tplThumb`, the looks, the "Aa" of each typeface). Needs SavComponents
  1.1.1 or newer in `../assets/sav/`.
- Drawn by the app, because SavComponents has nothing like them: the page of the editor (blocks dragged, written in
  place, their small bar) and the preview of an email at computer or phone width. `app.css` keeps only those and the
  layout.
- Primary colour: pink `#c2307a` (dark `#f27bb5`), plus the yellow `#ffd166` of the suite.
- Fonts in `fonts/` (Inter for the app; the others only for newsletters and subscription pages; Stack Sans Notch only
  for the "Saverio Morelli" credit).
- No libraries: the SMTP client is in `lib/mail.php` (same as the other apps, plus extra headers).

## Install

1. Upload the folder, open `install-db.php`: database, master admin emails. It writes
   `credentials.php` (git-ignored, blocked by `.htaccess`) with a new random `$secret_key`. Delete `install-db.php`
   afterwards. Alternatively import `install/savnewsletters.sql` and copy `credentials-sample.php` to `credentials.php`.
2. **Never change `$secret_key`** once groups exist: it encrypts their SMTP passwords (AES-256-GCM, `seal()`/
   `unseal()`).
3. Platform email (account confirmation, invitations, approval requests): `$mail_config`, or the site's
   `/.mail-config.php`.
4. Schedule the cron scripts every 30 minutes (see `cron/README.md`):
   `savnewsletters-schedule.php` (sending, expiry) and `savnewsletters-reminders.php` (reminders to publishers).
   `cron/cleanup.php` also cleans this app daily (sessions, attempts, unconfirmed subscriptions after 7 days).

## Accounts and roles

- **Accounts: the ones of the whole suite** (`../identity/suite.php`): an account made in any app of SavOffice (email and
  password, or SavAccount) is the account of every app, and one session (cookie `savoffice_auth`, on the path of every app)
  signs in and out everywhere. The tables of this app keep only what is its own, tied to the account (`users.id`).
  The accounts live in the database of SavSchedules: if SavNewsletters has another database (`$database_name`), the same
  MySQL user must reach both (the tables are named `` `db`.`sch_users` ``); simpler to give it the same database.

- Email + password (the address must be confirmed via `?verify=`) or SavAccount (no Google sign-in: SavOffice is an independent European alternative). The email is unique and never
  changes.
- Roles in a group, each including the ones before: `user` (sees newsletters and numbers), `moderator` (writes
  newsletters
  and templates, proposes a slot, sends tests to itself), `publisher` (approves/rejects/reschedules/cancels, sees
  subscribers, may schedule directly without approval), `admin` (outgoing address, subscription page, terms, languages,
  members up to publisher, erases/exports subscribers), `owner` (who created it: names admins, hands the group over,
  deletes it).
- Members are added by email: an existing confirmed account joins at once, anyone else gets an invitation applied when
  they confirm an account with that address (`on_invites`, `accept_invites()`).
- **Master admins** (`$master_emails` in `credentials.php`) see every group (members, newsletters, subscribers, reasons
  for leaving) and can suspend it. They never see the SMTP settings: only the sender address, read-only.

## Newsletters

- Document = JSON `{theme, blocks}`; block types: heading, text (rich: b/i/u/s/a/ul/ol), image, button, card, quote,
  divider, spacer, social. `lib/render.php` cleans it field by field (`clean_doc`) and renders the table-based email
  HTML + plain text (`render_email`). The editor's "Preview" and "Send me a test" use the server renderer.
- Every email ends with the footer: why you receive it, unsubscribe link, "Newsletter created with [logo]
  SavNewsletters"
  (in the subscriber's language), plus `List-Unsubscribe` / `List-Unsubscribe-Post` headers (one click in Gmail etc.).
- Workflow: `draft → pending (proposed slot) → scheduled → sending → sent`; `pending → rejected` (note to the author);
  `pending → expired` when the slot passes unapproved; `pending/scheduled → draft` (withdraw) or `cancelled`.
  Content is editable only in draft/rejected/expired. Saves carry the revision (`rev`): a stale editor gets
  `nl_conflict`.
- Slots are every 30 minutes in the group's timezone, stored in UTC (`parse_slot`), at most ~13 months ahead.
- Audience: all subscribers, or only those of one language. Recipients are fixed when sending starts (`on_deliveries`).
- Sending is throttled so providers do not block the account: each group has an hourly limit (`groups.rate_per_hour`,
  schema v2), each cron run sends at most 400 messages / 4 minutes, 0.15 s apart. 4xx replies and connection errors
  leave the message queued (retried later, at the end of the queue); 5xx replies fail that address only.
- Actions: drafts (and rejected, expired, cancelled) can be deleted, from the list or the editor; scheduled ones can be
  rescheduled, put back to draft or cancelled; proposals can change time; sent ones have no actions.
- Built-in templates in `lib/templates.php`; groups save their own (`on_templates`, "Save as template" in the editor).
- Images are resized in the browser and stored in `on_images`, served publicly by `api/?r=img&id=…` (they appear in
  emails).

## Subscribers

- `subscribe.php?g=SLUG[&lang=xx]`: email, language (if the group has several), SavNewsletters terms + group terms (own
  checkbox, revision stored per subscriber), honeypot. Records the browser's language and the browser's **name**
  only (`browser_name()`), never the whole User-Agent. Double opt-in: the link (`&confirm=`) asks for a button press,
  so mail scanners do nothing; it works 7 days.
- `unsubscribe.php?t=TOKEN` from any newsletter (optional reason + note), or `unsubscribe.php?g=SLUG` typing the email
  (a confirmation link is mailed: nobody can unsubscribe someone else). One-click POST supported.
- Subscriber-facing texts in six languages: `lib/public-i18n.php` (others fall back to English).
- Page customisation by admins (title, intro, button, success message, accent, logo, theme, button shape, language
  picker, subscriber count). The same page in compact form is the widget: `widget.js` puts it in an iframe
  (`subscribe.php?embed=1`, the only page allowed in frames) and sizes it via `postMessage`.

## Pitfall: ad blockers

Ad blockers (AdGuard, uBlock with "social widgets" lists) hide elements whose CSS class contains `social`. The social
links block therefore uses `net-*` classes in the editor (`net-list`, `net-row`…) and `blk-netlinks` / `tb-netlinks` for
the block itself: never name a class `social…` in the app.

## Security notes

- Sessions: HttpOnly cookie, SHA-256 of the token in DB, CSRF header on every POST. Rate limits in `on_attempts`.
- Group SMTP hosts must resolve to public addresses (`smtp_host_allowed`, no internal network scans); in `$debug`
  127.0.0.1 is allowed for local tests with a fake SMTP.
- Previews are shown in sandboxed iframes without scripts.

## .savnew files

A whole newsletter as a file (`assets/files.js`), like `.savsch` of SavSchedules: a ZIP with `mimetype`
(`application/vnd.savnewsletters.newsletter+zip`), `newsletter.json` (`format: "savnew"`, subject, preheader, language,
document) and `images/` with the pictures of the group that the document shows. "Download (.savnew)" is in the editor
and on the page of every newsletter; "Open .savnew" (newsletters tab, moderators and up) makes a new draft of the
group: the pictures are uploaded to that group first (`img.upload`), then `nl.create` receives the document (`doc`,
cleaned by `clean_doc` like every save). Nothing about the group, its subscribers or the sending travels in the file.
`manifest.webmanifest` declares the file handler: with the app installed, a .savnew opened from the device asks in
which group to open it (`launchQueue`).

## SavCalendar

`lib/calendar.php` is what SavCalendar includes (no HTTP call): `savnewsletters_calendar_items($email, $from, $to,
$appUrl)` gives the newsletters with a time (proposed, scheduled, sending, sent) of every group the account with that
email is a member of, as read-only items shaped like the ones SavCalendar makes for SavSchedules, each linking to
`#/g/GID/n/NID`. The accounts are matched by email, so both must be confirmed: SavCalendar checks its own, this file
checks that the SavNewsletters account is active and confirmed (email link or Google) and that the group is not
suspended. The file is self-contained (its own connection, only `savnewsletters_*` names) so it loads next to another
app's bootstrap; any failure gives an empty list.

## Local test

Use a throwaway database only: set `SAVNEWSLETTERS_CREDENTIALS` (the old `OPENNEWSLETTER_CREDENTIALS` works too) to a
credentials file outside the project with a local MariaDB, `$mail_config = false` and `$debug = true` (the links that
would be emailed go to the PHP log).

## Tools

- `sh tools/make_icons.sh` — PNG icons from `icons/favicon.svg` with headless Chrome, as in the other apps of SavOffice
  (the S of two pieces: an envelope and a paper plane). `icon-64.png` is the logo in the footer of every email.
- `php tools/build-sql.php` — regenerates `install/savnewsletters.sql` from `lib/schema.php`.

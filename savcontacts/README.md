# SavContacts

The address book of SavOffice: contacts with their emails, phones, addresses and websites (each with a label: home,
work, mobile… or any word), company, role, birthday, notes and photo; groups, favourites, quick search, sorting by
first or last name, duplicates found and merged; vCard (3.0 and 4.0, many contacts in a file), CSV of Google and
Outlook, and its own `.savcon`. Bilingual (Italian and English), installable, part of SavOffice.

It shares the account, the session and the database with SavSchedules, SavCalendar, SavTasks, SavMail and the other
apps of SavOffice (tables `sch_con_*`, made by the API the first time it answers). What it keeps counts in the one space
of SavOffice (the space of SavDrive).

## Files

| | |
|---|---|
| `index.php` | the page: the app is all in `assets/app.js` |
| `api/index.php` | the JSON API, `api/?r=<action>` |
| `lib/bootstrap.php` | database, session (the cookie of SavSchedules, set on the paths of every app that shares it), helpers |
| `lib/schema.php` | the tables: `con_profiles`, `con_groups`, `con_contacts` |
| `lib/contacts.php` | checking, keeping, searching, duplicates and merge, files in and out, what the other apps read |
| `lib/vcard.php` | vCard 2.1/3.0/4.0 and CSV (Google, Outlook — also in Italian), without the database |
| `lib/mail.php` | the emails of the account (confirming the address, a new password) |
| `assets/` | `app.js` (addresses), `contacts.js` (the address book), `editor.js`, `files.js`, `people.js`, `options.js` (settings), `account.js`, `store.js`, `i18n.js`, `ui.js`, `icons.js`, `office.js`, `app.css` |
| `icons/` | `favicon.svg` and the PNGs made from it by `tools/make_icons.sh` |

## Installing

Nothing to do beyond SavSchedules: SavContacts reads `../savschedules/credentials.php` (same database and accounts).
`credentials.php` here is optional (see `credentials-sample.php`): its own SavAccount service, SMTP, debug.
For SavAccount, add `https://www.illerom.eu/savcontacts/api/?r=auth.sav.callback` to the redirect addresses.

## Formats

- **vCard**: read 2.1 (quoted-printable, charsets), 3.0 and 4.0, folded lines, Apple labels (`item1.X-ABLabel`), photos
  inline (`ENCODING=b` or `data:` URIs), birthdays without the year (`--MMDD`, Apple's `X-APPLE-OMIT-YEAR=1604`). Written
  as 3.0 or 4.0. A field the app does not show (anniversaries, social profiles, related people…) is kept as it came and
  written back. Importing a card with the UID of a contact already there updates that contact instead of making a copy.
- **CSV**: Google Contacts (the old and the new columns, `:::` values, `* starred` as a favourite) and Outlook (English
  and Italian columns, comma or semicolon, UTF-8, UTF-16 or Windows-1252). Written for Google or for Outlook.
- **.savcon**: JSON `{format: "savcon", version: 1, groups: [{id, name, color}], contacts: [...]}`, with photos (base64)
  and the extra vCard fields. Registered in SavDrive like the other `.savxxx`: opened from there, its contacts are
  imported. `application/vnd.savcontacts.contacts+json`.

## For the other apps of SavOffice

The apps share the session, so a page of another app can ask `../savcontacts/api/` with `fetch` (same site, the cookie
goes with it; GET needs no CSRF token). A session opened before SavContacts existed has no cookie on `/savcontacts/`
yet: asking `../savschedules/api/?r=auth.me` once hands it over (as the apps do at start), then ask again.

- `GET api/?r=con.search&q=<words>[&limit=10][&group=<id>][&need=email|phone]` →
  `{contacts: [{id, name, first, last, company, title, emails: [{label, value}], phones, groups, favorite, birthday, photo, url}], groups: [{id, name, color}]}`.
  Words match name, company, role, email, phone (digits only too) and city, without accents; best first (the name
  starting with the words, then the favourites). An empty `q` lists the contacts (with `group`: the people of a group).
  `photo` and `url` are addresses relative to any app of the suite (`../savcontacts/…`).
- `GET api/?r=con.birthdays&from=YYYY-MM-DD&to=YYYY-MM-DD` (at most 400 days) →
  `{birthdays: [{id, name, day, year, age, photo, url}]}`; `age` is null when the year of birth is not known; a 29
  February falls on the 28th in other years.
- `GET api/?r=con.photo&id=<id>&v=<rev>` → the picture (JPEG), to the account that keeps it.

Used today by **SavMail** (recipients suggested as you type, `savmail/assets/compose.js`) and **SavCalendar**
(birthdays as a calendar of their own, `savcalendar/assets/birthdays.js`). Ready for: invitees in SavSchedules, members
in SavSplits (`need=…`, `group=…`), lists of subscribers in SavNewsletters (`group=<id>&need=email&limit=50`).

## CardDAV (syncing with phones) — not yet

Evaluated, left for a next step on purpose rather than half done. What a minimal endpoint needs:

1. **Authentication without the session cookie**: phones speak HTTP Basic. Accounts made with SavAccount have no
   password, so SavContacts would need *app passwords* (made in the settings, kept as hashes, one per device, revocable).
2. **WebDAV methods**: `OPTIONS`, `PROPFIND` (principal, address-book home, the address book with `getctag` /
   `sync-token`), `REPORT` (`addressbook-multiget`, `addressbook-query`, `sync-collection`), `GET`/`PUT`/`DELETE` of
   `<uid>.vcf` with `ETag` and `If-Match` — plus `/.well-known/carddav` at the root of the site. The shared hosting must
   let these methods and the `Authorization` header through to PHP (on Aruba this has to be checked first: some plans
   drop `Authorization` or refuse `PROPFIND`/`REPORT`).
3. **Sync state**: the `rev` column already grows at every change (it is the ETag); deletions need a tombstone table
   (or the trash kept longer) so that `sync-collection` can tell the phone what went away.

The data side is ready (`lib/vcard.php` reads and writes the cards with no database, every contact has a UID and a
`rev`); the protocol, the app passwords and a test on the real hosting with iOS, DAVx⁵ and Thunderbird are the work
left. Until then: export a `.vcf` and open it on the phone, or import the phone's `.vcf` here.

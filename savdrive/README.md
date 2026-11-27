# SavDrive

A drive for files and folders, part of SavOffice: 500 MB for each account (the master admins choose the space of everyone and
activate or deactivate accounts), uploads of any size in pieces, previews, share links, and new files of the apps of
SavOffice opened in their app. <https://www.illerom.eu/savdrive/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO), tables prefixed `dr_`, created by the API at its first answer.
- Files on disk, outside the database: `<storage>/<user id>/<bkey>` (32 random hex digits, no extension).
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents from `../assets/sav/`.
- SavAccount sign-in: `../identity/`.

| Path                         | What                                                                                  |
|------------------------------|---------------------------------------------------------------------------------------|
| `api/index.php`              | JSON API (the actions are listed at its top)                                          |
| `lib/bootstrap.php`          | Configuration, sessions, space (`user_quota`, `user_used`) and activation             |
| `lib/access.php`             | Who can do what: levels by folder, inherited below, with exceptions                    |
| `lib/space.php`              | One space for the whole of SavOffice: required by the API of every app                |
| `lib/files.php`              | Storage on disk, the tree of folders, names, trash, sending files with ranges        |
| `lib/photos.php`             | The API of SavPhotos (`api/?r=photos.*`, pages in `../savphotos/`): what is read from photos, albums, who can use it |
| `lib/archive.php`            | What is inside ZIP, TAR, TAR.GZ and RAR archives, read from their index (plain PHP)   |
| `lib/temp.php`               | Temporary links ("File temporaneo"): expiry, password, downloads, cleanup             |
| `assets/drive.js`            | The drive: side menu (a bottom bar on phones), folders, cards and rows, selection, uploads, moving, previews |
| `assets/temp.js`             | Temporary files: the dialog that makes a link, the place Temporary, the page `#/t/<token>` |
| `assets/admin.js`            | The panel of the master admins                                                        |
| `assets/preview.js`          | What a file contains, drawn small (cards) or large (preview): text, JSON, SavOffice files, archives |
| `assets/office.js`           | Empty files of SavOffice (.savdoc, .savspr, .savpre, .savboo, .savwhi, .savnot)       |
| `assets/store.js`            | API and uploads in pieces                                                             |
| `assets/app.js`, `account.js`, `options.js` | Routes, accounts, settings                                             |

## Install

1. Nothing to configure: without its own `credentials.php` SavDrive uses `../savdocuments/credentials.php` (the same
   database, SavAccount service, master admins and email), always with its own tables `dr_`, as SavBooks does. To give it
   its own, copy `credentials-sample.php` to `credentials.php`.
2. SavAccount: add `https://www.illerom.eu/savdrive/api/?r=auth.sav.callback` to the redirect addresses of the service.
3. Files go to `savdrive/storage/` (its `.htaccess` refuses every request). Better: set `$storage_dir` in a
   `credentials.php` of SavDrive to a folder outside the web root. The web server must be able to write there.
4. PHP must accept pieces of 4 MB (`post_max_size` ≥ 8M, set to 16M by `.htaccess` under mod_php).
5. `cron/cleanup.php` already cleans this project every day (trash after 30 days, from the disk too; uploads left half-way;
   temporary links that are over, with the files uploaded for them). Hourly is better for the temporary links, though
   SavDrive also ends them by itself whenever they, or the list or space of their owner, are reached.

## How it works

- **One space for the whole of SavOffice**: a person (the same email) has one space, the one of SavDrive: the default one
  (meta `default_quota`, 500 MB at the start) or one of their own (`quotas`, by email, also for people without an account
  here; `PHP_INT_MAX` = unlimited, chosen with a switch in the admin panel). It counts the files of SavDrive (the trash and the uploads under way too) and what the person keeps in every other
  app, even if their account of SavDrive is not activated or does not exist. `lib/space.php` is required by the API of
  every app: its `writer()` refuses (`quota`, 413) a write that would go beyond the space (deleting, trash, sign-in and admin
  always pass) and then reports what the app keeps for that person into `usage`; its `reader()` keeps that count fresh. The
  apps show this space instead of their old limits; SavDrive shows it app by app (sidebar, settings, admin panel).
  If SavDrive cannot be reached nothing is refused.
- **The apps of SavOffice in My drive**: the documents a person creates in the apps that make documents (documents,
  sheets, presentations, books, boards, notebooks, forms: `OFFICE_FOLDERS`) are listed in My drive, in a folder
  for each app that keeps something (an app with nothing shows no folder), with the folders of the app inside. Each app
  has `office_catalog($u)` in its API (its folders and items, with the address that opens them there) and sends it with
  `savspace_gate`/`savspace_touch` (`lib/space.php`) into the table `office`: at once after an action that changes what it
  keeps (new, renamed, moved, deleted…), otherwise at most once a minute, and when the app is opened. SavDrive reads it
  (`office.get`, `drive.list` → `office`; a search finds those items too): they open in their app, in a new tab, and are
  not moved, shared or deleted from SavDrive. An app opened for the first time after this change sends its list then.
- **People and levels** (`lib/access.php`): the owner gives people (by email, also without an account yet) a level on a
  file or folder: view (sees it exists, cannot open it), read, comment, write, move, delete; or none, an exception. A level
  on a folder holds for everything inside it until a nearer level for the same person changes it (`shares`). What people
  create in a folder of somebody else belongs to its owner and counts in the owner's space (`nodes.created_by` says who made
  it); what they delete goes to the owner's trash. Only the owner manages people, links, stars and the trash.
  "Shared with me" lists the highest things a person can reach. Comments (`comments`) from the level "comment" up.
- **Activation**: `users.activated`. New accounts are activated at once or wait, as the admins choose (meta
  `default_active`). Waiting accounts can sign in, see that they wait and delete themselves; an activated account gets an
  email. Deactivating signs the account out everywhere. Masters (`$master_emails`) are always activated.
- **Admin panel** (`#/admin`): overview, accounts (search, filter, activate/deactivate one or all, space of its own,
  delete with its files), settings (default space, new accounts activated or not). Admins never see file names.
- **Uploads**: `upload.start` → `upload.chunk&id=&offset=` (the body is the piece, `application/octet-stream`) until the
  last piece makes the file. A wrong offset answers with what the server has, and the browser goes on from there.
- **Trash**: a folder goes there with everything inside (`trash_root` marks what was chosen); 30 days.
- **Share links**: `share_token` on a file; `#/s/<token>` and `api/?r=pub.get` work without an account.
- **Temporary files** (`lib/temp.php`, `assets/temp.js`), as with WeTransfer: a link (`temp_links`) that expires (1 hour,
  1 day, 7 days, 30 days or a date, at most a year), with an optional password (hash; the page sends it once to
  `tmp.unlock` and gets a key, an HMAC of the token with the hash, carried by the download addresses), limit of
  downloads, email to the owner at each download (at most one a minute) and message. Two ways: files uploaded only for
  the link (New → Temporary file: `temp.create` mode `upload`, then `upload.start` with `temp`, in pieces as every upload,
  then `temp.finish`; they are `temp_items` with a `bkey`, never nodes, and count in the space while the link lasts), or
  files and folders already in the drive (their menu, or many chosen: mode `drive`, `temp_items.node_id`; in the trash
  they are left out). Who receives it opens `#/t/<token>` without an account (`tmp.info`, `tmp.get` one item, a folder as
  a ZIP, `tmp.zip` everything). Each download counts (not the next pieces of a resumed one); the last one allowed ends the
  link once it is sent. A link that is over (expired, out of downloads, revoked, files never finished in 24 hours, nothing
  of the drive left) is ended by `temp_delete`: the uploaded files are deleted from the disk, the files of the drive stay.
  This happens when the link is reached, when the list (`temp.list`) or space of its owner is read, at random with the
  other clean-ups of the API, and in `cron/cleanup.php`. The place Temporary (`#/temp`) lists the links that work: time
  left, downloads, copy, extend (`temp.extend`), revoke (`temp.revoke`).
- **SavOffice files**: made empty in the browser (the same ZIP each app writes) and uploaded. "Open in …" opens
  `../<app>/?savdrive=<id>`: `../assets/savoffice/savoffice.js` (`SavOffice.fromDrive`) reads the file from
  `api/?r=file.get` (same site, the cookie of SavDrive) and gives it to the app as a file opened from the device. The app
  keeps it in its own account.
- **Saving back**: each editor (SavDocuments, SavSpreadsheets, SavPresentations, SavBooks, SavWhiteboard, SavNotes) tells
  `SavOffice.exporter({key, make})` which document is open and how to make its file. A cloud button next to the grid of the
  apps (and in ⌘J) saves it into SavDrive: over the file it was opened from (`upload.start` with `replace`: same id, name,
  folder, star and link; the space counts only the difference), or as a new file in My drive, which is then remembered
  (localStorage `savoffice-drive-links`, per browser). Documents whose owner forbade downloads cannot be saved there.
- **Previews and details**: `file.thumb` makes a small JPEG of an image with GD the first time (kept as `<bkey>.t.jpg`,
  deleted with the file); HEIC and other formats GD cannot read keep the icon. `node.info` gives the details of the side
  panel (EXIF date, camera and GPS of photos; size and last change inside folders). `upload.start` answers `name_taken`
  when a file with that name is already there (the app asks: replace, keep both with `conflict: rename`, or skip).
- **Archives**: `node.archive` lists what is inside a ZIP (ZIP64 too), TAR, TAR.GZ/TGZ, GZ or RAR (4 and 5) without
  extracting anything: only the index is read (the central directory of a ZIP, the headers of TAR and RAR; a TAR.GZ is
  decompressed in memory, at most 4 seconds). At most 5000 entries are listed (totals count up to 100 000); archives
  with a password show the names when they can; 7z is not readable (its index is compressed). The list is kept as
  `<bkey>.a.json`, deleted with the file. Who can read the file can read the list; in the trash only its owner.
- **Never too many requests**: the hosting answers "429" to an address that asks a lot in a short time (as to an attack).
  Every request of the app goes through a pacer (`assets/store.js` `request`: at most 2 at once, 0.35 s apart, 100 a
  minute), the API and the uploads before the previews. The previews of the cards are asked only when they come near
  the screen (`lazyImg`), and together: 40 small pictures in one request (`file.thumbs`, then kept in the browser's
  Cache Storage until sign-out), 20 texts, SavOffice files and archive indexes in one request (`file.heads`). Documents,
  books, spreadsheets and presentations are drawn by the code of their own apps (`../<app>/assets/thumbs.js`,
  `render.js`, the formula engine of SavSpreadsheets), inside a shadow root with that app's stylesheets. Which kinds
  of files show a preview is chosen in Settings → Drive (`prefs.previews`). A 429 that still comes is waited out and the
  request sent again.
- **Files sent**: only safe types are shown inline (pictures, PDF, video, audio, plain text); everything else is a
  download, always with `nosniff` and a CSP sandbox.

- **SavPhotos** (`../savphotos/`, being tried): the photos and videos of the drive by day, backups, albums. Its routes are
  `photos.*` in `lib/photos.php`, its tables `photo_users`, `photo_meta`, `albums`, `album_items` (made there). It signs in
  here: `sessionStorage` `savdrive-next = ../savphotos/…` sends the person back after the sign-in (`assets/app.js`,
  `assets/account.js`). See `../savphotos/README.md`.

## Versions

`assets/version.js` (`VERSION`, `CHANGES`); bump `CACHE` in `sw.js` when the list of files changes.

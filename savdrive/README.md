# SavDrive

A drive for files and folders, part of SavOffice: 2 GB for each account (the master admins choose the space of everyone and
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
| `assets/drive.js`            | The drive: side menu, folders, cards and rows, selection, uploads, moving, previews   |
| `assets/admin.js`            | The panel of the master admins                                                        |
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
5. `cron/cleanup.php` already cleans this project every day (trash after 30 days, from the disk too; uploads left half-way).

## How it works

- **One space for the whole of SavOffice**: a person (the same email) has one space, the one of SavDrive: the default one
  (meta `default_quota`, 2 GB at the start) or one of their own (`quotas`, by email, also for people without an account
  here; `PHP_INT_MAX` = unlimited, chosen with a switch in the admin panel). It counts the files of SavDrive (the trash and the uploads under way too) and what the person keeps in every other
  app, even if their account of SavDrive is not activated or does not exist. `lib/space.php` is required by the API of
  every app: its `writer()` refuses (`quota`, 413) a write that would go beyond the space (deleting, trash, sign-in and admin
  always pass) and then reports what the app keeps for that person into `usage`; its `reader()` keeps that count fresh. The
  apps show this space instead of their old limits; SavDrive shows it app by app (sidebar, settings, admin panel).
  If SavDrive cannot be reached nothing is refused.
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
- **SavOffice files**: made empty in the browser (the same ZIP each app writes) and uploaded. "Open in …" opens
  `../<app>/?savdrive=<id>`: `../assets/savoffice/savoffice.js` (`SavOffice.fromDrive`) reads the file from
  `api/?r=file.get` (same site, the cookie of SavDrive) and gives it to the app as a file opened from the device. The app
  keeps it in its own account.
- **Saving back**: each editor (SavDocuments, SavSpreadsheets, SavPresentations, SavBooks, SavWhiteboard, SavNotes) tells
  `SavOffice.exporter({key, make})` which document is open and how to make its file. A cloud button next to the grid of the
  apps (and in ⌘J) saves it into SavDrive: over the file it was opened from (`upload.start` with `replace`: same id, name,
  folder, star and link; the space counts only the difference), or as a new file in My drive, which is then remembered
  (localStorage `savoffice-drive-links`, per browser). Documents whose owner forbade downloads cannot be saved there.
- **Files sent**: only safe types are shown inline (pictures, PDF, video, audio, plain text); everything else is a
  download, always with `nosniff` and a CSP sandbox.

## Versions

`assets/version.js` (`VERSION`, `CHANGES`); bump `CACHE` in `sw.js` when the list of files changes.

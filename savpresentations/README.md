# SavPresentations

A free, open source presentation editor: an alternative to Google Slides and PowerPoint Online.
Themes that already look good, live editing together, precise sharing, PDF, PPTX, ODP and its own `.savpre` files.

## Stack

- PHP 8 and MySQL 5.7+ / MariaDB 10.3+ (PDO, GD, cURL), tables prefixed `sp_`, created and updated at the first request.
- No build step and no libraries: ES modules in `assets/`. The interface is made of SavComponents (`../assets/sav/`,
  Soft style).
- Sign-in with Google and SavAccount: shared library in `../identity/` (never edited from here).
- Typefaces in `fonts/` (OFL, Latin), icons in `assets/icons.js` (interface) and `assets/icons-lib.js` (for the slides),
  both Lucide.

## Install

1. Upload the folder, with `storage/` writable. Better: a folder outside the site, set as `$storage_dir`.
2. Copy `credentials-sample.php` to `credentials.php` (git-ignored) and fill it in.
3. Google: add the address of the site to the authorised origins of the OAuth client.
   SavAccount: a confidential service with redirect address `…/savpresentations/api/?r=auth.sav.callback`. Empty =
   button hidden.
4. `../cron/cleanup.php` (daily) also cleans this app, as the privacy notice promises.

## Where things are

| Path                                                                      | What                                                                    |
|---------------------------------------------------------------------------|-------------------------------------------------------------------------|
| `api/index.php`                                                           | JSON API, every action listed at the top                                |
| `lib/decks.php`                                                           | Roles, changes ("ops"), presence, versions                              |
| `lib/clean.php`                                                           | Cleaning of everything the browsers send, field by field                |
| `lib/media.php`                                                           | Pictures, search of free portals, outgoing requests                     |
| `assets/model.js`                                                         | The presentation in memory: ops, undo, synchronisation                  |
| `assets/render.js`, `shapes.js`, `themes.js`, `richtext.js`, `parts.js`   | Drawing: the same for editor, thumbnails, show and files                |
| `assets/editor.js`, `stage.js`, `textedit.js`, `panels.js`, `features.js` | The editor                                                              |
| `assets/layouts.js`, `templates.js`                                       | Layouts of the slides, ready presentations                              |
| `assets/export-*.js`, `import-pptx.js`, `files.js`, `zip.js`, `ttf.js`    | Files                                                                   |
| `android/`                                                                | Android app (WebView): files, Google sign-in and full screen are native |

## How it works

- **Live editing.** Every change is a small op; the server numbers them and all the browsers apply them in that order,
  then
  again their own not yet confirmed. Different fields of the same element never clash; on the same field the last one
  wins.
  Shared hosting has no WebSockets: the browser asks every 1.1 s with other people, 4 s alone, 20 s in the background.
  Changes not sent yet stay in `localStorage`.
- **Versions.** One before a change at most every half hour, or saved by hand. Restoring one jumps the numbering of the
  ops,
  so everybody reads the presentation again.
- **Roles.** viewer < commenter < editor < owner. Access: private, by link (with a role; anonymous visitors only look),
  or
  people by email. Single-use links: only their hash is stored, used up by a press, never by opening them.
- **Single pages.** `page_rules`: what someone can do on a page when it differs from the presentation; `*` = whoever has
  no rule of
  their own; `none` = for that person the page does not exist. Read in `page_access()`/`page_role()` and applied
  everywhere:
  reading, changes (with the presentation locked), comments, presence, lists, copies, versions (only for who edits every
  page).
  Hidden pages are sent only to who can edit them. A change of rules is an op (`page.rules`) that makes the others read
  again.
- **Simple mode** (`grid.js`): entering it, `readGrid()` finds the blocks of every page and makes them cells without moving anything
  (grid with `m: 0`; inside a cell `cr` = place of an element in fractions of it). a page has a grid of cells, elements have a `cell`; their real position is kept too, so
  the
  advanced mode, the show and the files need to know nothing. It is a choice of each person, not of the presentation.
- **Pictures and videos**: pictures 15 MB each at most, shrunk to 2400 px; videos (MP4, WebM, MOV) 150 MB, sent in pieces of 4 MB,
  kept as they are and served with ranges; 500 MB in all per person (`$quota_mb`). `credit`/`creditUrl` are the source, `cite` says if it
  is written on the page (`citeOf()`, a part like the others, so the files have it too).
- **Show** (`present.js`): the speaker view (`speaker.js`, `?speaker=`) is a second window that gets what to draw through a
  `BroadcastChannel`; the window of the audience never shows notes.
- **Personal notes** are only ever sent to their author; **speaker notes** only to editors.
- **Themes.** Elements hold colour tokens (`@accent`…) and roles (title, body…), so changing theme restyles everything.
  Decorations, charts, tables and icons are ordinary shapes and texts, so PDF, PPTX and ODP show exactly what is on
  screen.
- **Rich text** is rebuilt node by node from a white list, in the browser (`richtext.js`) and on the server
  (`clean_rich`).
- **Admin** (`$master_emails`): people (block with a reason, unblock, sign out, delete), presentations, reports, log.
  The
  content of private presentations cannot be opened, only public or reported ones, and every look is logged.

Keep in step: `ELEMENT_FIELDS`, `SHAPES`, `FONT_IDS`, layouts and roles in `lib/clean.php` with the same lists in
`assets/`.

## `.savpre`

A ZIP: `mimetype`, `deck.json` (`{app, version, title, meta, slides, media}`) and `media/`. Opening one creates a new
presentation; everything in it is cleaned by the server like any other change.

## Local test

Only on a throwaway database: `SAVPRESENTATIONS_CREDENTIALS=/path/to/credentials.php php -S localhost:8101 -t ..`
with `$debug = true` and `$mail_config = false` (links are written to the PHP log).

## Tools

`tools/build_fonts.py`, `build_icons.py`, `build_icon_library.py`, `make_icons.sh`: see the first lines of each.

## Licence

MIT © 2026 Saverio Morelli. SavComponents: MIT. Lucide: ISC. Typefaces: SIL OFL 1.1.

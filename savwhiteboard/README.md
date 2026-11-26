# SavWhiteboard

A free, open whiteboard without edges, part of **SavOffice**: the board grows in every direction as you work. Pen
(pressure of the stylus), pencil, highlighter, eraser and laser pointer; typed text, sticky notes, shapes, arrows and
pictures; a watermark of dots, squares, lines or isometric dots on any background, black as a blackboard too.
The same account as **SavSchedules** and **SavCalendar**. <https://www.illerom.eu/savwhiteboard/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO). **No credentials of its own**: it reads `../savschedules/credentials.php`
  (same database, same accounts, tables `sch_users`…). Its tables are next to them, `sch_wb_*`, created by the API at its
  first answer. An optional `credentials.php` overrides some values (see `credentials-sample.php`).
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents from `../assets/sav/`.
- Google and SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`.
- Typefaces in `fonts/` (Inter, Caveat, IBM Plex Serif and Mono): they are put inside PNG and PDF files.

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/boards.php`, `assets/model.js` | **What a board may contain: the same list in two languages, keep them in step** |
| `assets/board.js` | The board: view (move, zoom, pinch), tools, selection, typing, history, saving |
| `assets/ink.js` | Geometry: the outline of a stroke (its width follows the pressure), texts in lines, boxes, what a point touches, the eraser |
| `assets/render.js` | Each item as SVG, the same on screen and in the files; the watermark; the whole board as one SVG |
| `assets/files.js`, `zip.js` | `.savwhi`, PNG, SVG and PDF (the pictures go inside them) |
| `lib/media.php`, `assets/pictures.js` | Pictures as in SavPresentations: upload (15 MB), own pictures, search of free portals through the server |
| `assets/home.js` | Home: papers to start from, the boards (grid or list, search, sort), the trash |
| `assets/version.js`, `changelog.js` | The version in the footer and the page `#/changelog`: add an entry at every release |
| `assets/account.js`, `hero.js`, `options.js`, `ui.js`, `i18n.js`, `icons.js` | First page and accounts, settings, helpers |
| `sw.js` | Shell for installing the app: bump `CACHE` when the list of files changes |

## How it works

- **A board** is `{title, settings, items}`. `settings`: `bg`, `pat` (none, dots, grid, lines, iso), `gap`, `pc` (colour
  of the watermark, empty = automatic), `view` (where it was looked at, kept around the centre of the window).
- **Items**, in the order they are drawn: `stroke` (`tool` pen | pencil | marker, `p` = x, y, pressure…), `shape`
  (rect, ellipse, diamond, triangle, line, arrow), `text`, `note`, `image` (`m:<id>`, a picture of the account).
- **No edges**: coordinates are numbers of the board, unlimited; 1 unit = 1 pixel at 100%. Sizes of the tools are chosen
  in pixels of the screen, so writing while zoomed in is finer on the board. Far away, the watermark shows one line in
  two (then four…) so it never turns into fog.
- **Saving** sends changes (`put`, `del`, `order`, title, settings) about a second after the last one, and a small picture
  for the home at most every 15 seconds. When another window saved in between, the board is read again.
- **History**: every change can be undone and done again (300 steps), the eraser and moves as one step each.
- **Stylus**: the first time one touches the board, fingers only move and zoom it (palm rejection; a switch in the settings).
- **Trash**: 30 days, then `cron/cleanup.php` (with the clean-up of SavSchedules) deletes the board.
- **Pictures**, as in SavPresentations (`lib/media.php` is its copy without videos: keep them in step): 15 MB each at most,
  re-encoded with GD and shrunk to 2400 px (the place of a photo and other metadata are lost on purpose), kept as files in
  `storage/` (or `$storage_dir`), never reachable from the browser, served by their random id; 500 MB per account
  (`$quota_mb`). The search (Openverse and Wikimedia Commons; Pexels and Pixabay with `$pexels_key`/`$pixabay_key`) goes
  through the server, which keeps results 12 hours (`sch_wb_cache`); an import only takes what a search found. Pictures that
  ask for a credit get their source written under them. PHP needs GD and `post_max_size`/`upload_max_filesize` of 16 MB.
  These settings go in `savwhiteboard/credentials.php` (they are not taken from SavSchedules).
- A board is at most 8 MB as JSON: MySQL's `max_allowed_packet` must be bigger (MariaDB's default of 16 MB is).

## .savwhi

A ZIP: `mimetype` (`application/vnd.savwhiteboard.board+zip`), `board.json`
(`{format: "savwhi", version: 1, title, settings, items}`) and the pictures in `media/<id>.<ext>`. Opening one creates a
new board; dropping one on a board adds its items there.

## Install

Nothing to fill in when SavSchedules is installed. SavAccount: add
`https://www.illerom.eu/savwhiteboard/api/?r=auth.sav.callback` to the redirect addresses of the service of SavSchedules,
or give SavWhiteboard its own in `credentials.php`.

## Android

`android/`: the web app in a WebView, as in the other apps of SavOffice (`com.saverio.savwhiteboard`): Google sign-in and
saving and opening `.savwhi` files are native (`window.SavWhiteboardAndroid`, user agent `SavWhiteboardApp/Android`).

## Not yet

Boards shared with other people (a link to look, or drawing together).

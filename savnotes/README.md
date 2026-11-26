# SavNotes

Free, open digital notebooks, part of **SavOffice**. Each notebook (with its cover) is made of **sheets of a fixed size**
(A4, A5, Letter, square or wide): squares, lines, ruled with a margin, Cornell notes, dots, isometric or blank, on any
colour, each sheet its own. Two ways of writing on the same sheet: **by hand** (pen with the pressure of the stylus,
pencil, highlighter, eraser, shapes, pictures) and **as a document** (the keyboard: titles, bold, colours, lists,
checklists, the lines of text on the lines of the paper; a full sheet goes on to the next one).
The same account as **SavSchedules** and **SavCalendar**. <https://www.illerom.eu/savnotes/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO). **No credentials of its own**: it reads `../savschedules/credentials.php`
  (same database, same accounts, tables `sch_users`…). Its tables are next to them, `sch_nb_*`, created by the API at its
  first answer. An optional `credentials.php` overrides some values (see `credentials-sample.php`).
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents from `../assets/sav/`.
- Google and SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`.
- Typefaces in `fonts/` (Inter, Caveat, IBM Plex Serif and Mono): the typed text, also inside PNG files.

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/notebooks.php`, `assets/model.js` | **What a notebook may contain, and the clean-up of the typed HTML: the same lists in two languages, keep them in step** |
| `assets/notebook.js` | An open notebook: the column of sheets, the sheets on the side, zoom, the two ways of writing, history, saving |
| `assets/ink.js` | Geometry of the ink: the outline of a stroke (its width follows the pressure), boxes, what a point touches, the eraser |
| `assets/render.js` | Each item as SVG; the paper of a sheet; `docCSS`, the styles of the typed text (screen, pictures, print); a whole sheet as SVG |
| `assets/files.js`, `zip.js` | `.savnot`, print / PDF, PNG of a sheet; pictures from the device made smaller |
| `assets/home.js` | Home: papers to start from, a new notebook, the notebooks as covers (grid or list, search, sort), the trash |
| `assets/version.js`, `changelog.js` | The version in the footer and the page `#/changelog`: add an entry at every release |
| `assets/account.js`, `hero.js`, `options.js`, `ui.js`, `i18n.js`, `icons.js` | First page and accounts, settings, helpers |
| `sw.js` | Shell for installing the app: bump `CACHE` when the list of files changes |

## How it works

- **A notebook** is `{title, settings, sheets}`. `settings`: `cover`, `size` (a4, a5, letter, square, wide), `orient`
  (p, l), `font` and `tsize` of the typed text, `paper` (the paper of new sheets), `view` (zoom and the sheet in front).
- **A sheet** is `{id, bg, pat, gap, pc, doc, items}`: its paper (`pat` none, dots, grid, lines, ruled, cornell, iso),
  `doc` the typed text (a small set of HTML: p, h1–h3, lists and checklists, quotes, bold, italic, underline, strike,
  colours, links; everything else is removed both in the browser and on the server) and `items`, drawn by hand, in order:
  `stroke` (`tool` pen | pencil | marker, `p` = x, y, pressure…), `shape` (rect, ellipse, diamond, triangle, line, arrow),
  `image` (a data: URL, at most 1600 px a side).
- **Coordinates** are units of the page, 1 unit = 1 CSS pixel at 100% (96 per inch): an A4 sheet is 794 × 1123. Sizes of
  the tools are chosen in pixels of the screen, so writing while zoomed in is finer on the sheet.
- **Layers**: under, the paper (SVG); in the middle, the typed text (an editable HTML layer, scaled with the zoom); over,
  the ink (SVG). By hand the ink takes the pointer; as a document the text takes it, and the ink stays visible above it.
- **Lines of text on the lines of the paper**: on lined papers the height of a line of text is the spacing of the paper
  and the margins follow it (the red line of ruled paper, the column of Cornell notes): see `textBox` in `model.js`.
- **A full sheet**: the paragraphs that do not fit go to the top of the next sheet (a new one when it is the last), with
  the caret. Backspace at the very start of a sheet brings its first paragraph back to the sheet before.
- **Saving** sends changes about a second after the last one: `sheets` (paper and typed text of the sheets that changed),
  `drop`, `order`, `put` / `del` (items, as `[sheet, item]`), `iorder`. When another window saved in between, the
  notebook is read again.
- **History**: by hand every change can be undone (300 steps, the eraser and moves as one step each); as a document the
  history of the browser.
- **Stylus**: the first time one touches a sheet, fingers only scroll (palm rejection; a switch in the settings).
  Otherwise one finger writes and two fingers scroll and zoom.
- **Print / PDF**: the printing of the browser, one page per sheet at its size; the typed text stays real text.
- **Trash**: 30 days, then `cron/cleanup.php` (with the clean-up of SavSchedules) deletes the notebook.
- A notebook is at most 12 MB as JSON: MySQL's `max_allowed_packet` must be bigger (MariaDB's default of 16 MB is).

## .savnot

A ZIP: `mimetype` (`application/vnd.savnotes.notebook+zip`), `notebook.json`
(`{format: "savnot", version: 1, title, settings, sheets}`) and the pictures in `media/<sheet>-<id>.<ext>`. Opening one
creates a new notebook.

## Install

Nothing to fill in when SavSchedules is installed. SavAccount: add
`https://www.illerom.eu/savnotes/api/?r=auth.sav.callback` to the redirect addresses of the service of SavSchedules,
or give SavNotes its own in `credentials.php`.

## Not yet

An Android app (as the other apps of SavOffice), notebooks shared with other people, and searching inside handwriting.

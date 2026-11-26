# SavDocuments

A word processor where the page comes first: real pages, tables, images, Word files, people writing together. With an
account
the documents are kept on the server; without one they stay in the browser. <https://www.illerom.eu/savdocuments/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO), tables prefixed `sd_`, created by the API at its first answer.
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents (Soft style) from `../assets/sav/`.
- Google and SavAccount sign-in: `../identity/`.

| Path                                   | What                                                                               |
|----------------------------------------|------------------------------------------------------------------------------------|
| `api/index.php`                        | JSON API (the actions are listed at its top)                                       |
| `lib/docs.php`                         | Who can open a document, how changes are applied, versions, free images            |
| `lib/clean.php`, `assets/clean.js`     | **What a document may contain: the same list in two languages, keep them in step** |
| `assets/editor.js`                     | The editor: blocks, commands, tables, clipboard, undo                              |
| `assets/page.js`                       | Pages on screen and for printing                                                   |
| `assets/sync.js`                       | Saving, merging, offline changes                                                   |
| `assets/objects.js`, `qr.js`, `math.js`  | Charts, diagrams, shapes, icons, QR codes, signature lines (SVG); formulas (LaTeX → MathML / Word) |
| `assets/ruler.js`                      | Rulers: margins and indents dragged on the rulers or on the page                   |
| `assets/write.js`                      | The writing screen (top bar and insert bar as in SavPresentations, panels, palette) |
| `assets/panels.js`, `inserts.js`       | Side panels (Elements, Format, Page, Style, Images) and insert dialogs              |
| `assets/home.js`, `templates.js`, `thumbs.js` | Home (as in SavPresentations), the 43 templates in 6 groups, small pictures of pages |
| `assets/options.js`                    | The settings page                                                                  |
| `assets/fonts.js`, `assets/fonts.css`, `hero.js` | Typefaces (included, Bunny Fonts, from file); the fan of pages of the first page |
| `assets/app.js`, `account.js`, `share.js`, `admin.js`, `ui.js` | Routes, accounts, sharing, administration, SavComponents helpers |
| `assets/docx.js`, `files.js`, `zip.js` | Word, .savdoc, HTML, EPUB, Markdown and text files                                 |
| `assets/pdf.js`                        | PDF without the print window: each page drawn as it prints, the text invisible over it (selectable), links, bookmarks |
| `sw.js`                                | Offline shell: bump `CACHE` when the list of files changes                         |

## Install

1. Copy `credentials-sample.php` to `credentials.php` (git-ignored) and fill it in.
2. Google: add `https://www.illerom.eu` to the origins of the OAuth client. SavAccount: see the sample.
3. `cron/cleanup.php` already cleans this project every day.

## How it works

- **Document** = `{settings, blocks: [{id, h, v}]}`. A block is one top-level element (paragraph, list, table, figure…);
  `h` is
  its clean HTML, `v` its version. Browsers send operations on whole blocks (`set`, `ins`, `del`, `mov`, `settings`,
  `title`).
  A `set` that starts from an old version is refused: the browser merges the two texts and tries again (`merge3`).
- **Writing together** is polling: every 2 seconds while someone else is there, 7 alone. `sd_ops` keeps the last 600
  changes.
- **Pages**: one column of text preceded by a chain of floats that leave room for the margins between pages, so
  paragraphs and
  tables break without touching their content. What stays together needs a fixed width. For printing each page is cut
  exactly
  as on screen (`Pager.printable`). Narrow screens show continuous text.
- **Roles**: viewer, commenter, editor, owner. Comments with `private = 1` are personal notes. Links can be single-use
  (7 days).
- **Objects** are `<figure data-o="{json}">` drawn as SVG on screen, as PNG in Word, inline SVG in HTML/EPUB. Formulas are
  `<span class="math" data-m="latex">` (a block formula is `<p class="eq">`), Office Math in Word. Both are checked by
  `clean.js` and `lib/clean.php`.
- **Previews** in the home: `documents.preview` keeps the first blocks (schema 2), read in groups with `doc.previews`.
- **Insert bar**: each person chooses and orders its buttons (`prefs.tools`), as in SavPresentations.
- **Trash**: 30 days, or `doc.empty_trash` ("Empty now").
- **Accounts only**, as SavPresentations: without one only the landing page (and documents shared by link, read only).
- **Offline**: the last person signed in is remembered (localStorage); the home list and the 30 most recent documents are
  copied into IndexedDB (`offline` in `store.js`, read with `doc.get&quiet=1` so "recent" does not change); changes wait
  in localStorage (`sync.js`) and leave when the connection is back; documents created offline wait as `local-…` and go to
  the account of the same person. Pictures are kept by `sw.js`. Everything is cleared at sign out.
- **Sharing** as SavPresentations: people, general access, what readers can do (`noComments`, `noDownload`, `noCopy`
  settings, checked by the API for comments and copies), many single-use links with an optional name and a duration;
  used links stay listed (schema 3: `invites.label`, `used_by`, `used_at`).
- **Settings** are a page (`#/settings`, `options.js`); `auth.export` downloads all the data of the account.
- **Typefaces** (`fonts.js`): 39 included (`assets/fonts.css`, `fonts/`); the whole catalog of Bunny Fonts searched in the
  app and loaded from fonts.bunny.net; typefaces from file (TTF, OTF, WOFF, WOFF2, 5 MB, 30 per account, schema 4
  `sd_fonts`, read by id with `api/?r=font&id=`). `settings.fonts` lists the typefaces of a document that are not included.
- **First page** as in SavPresentations: a fan of real template pages (`hero.js`, the same spring, pages slide out to the
  left); signing in has its own page (`#/signin`, `#/signup`).
- **Master admins** see owners and sizes, never texts; a document can be read only while a report on it is open.

## .savdoc

A ZIP: `mimetype` (`application/vnd.savdocuments.document+zip`), `document.json`
(`{format: "savdoc", version: 1, title, settings, blocks}`) and the pictures in `media/<id>.<ext>`.

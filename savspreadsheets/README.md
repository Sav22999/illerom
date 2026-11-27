# SavSpreadsheets

A free, open spreadsheet, part of **SavOffice**: workbooks with many sheets, more than 250 functions, number and date
formats, conditional formatting, validation, charts, people working together, and the files of Excel (.xlsx, .xls) and
LibreOffice (.ods). Same arrangement as SavDocuments and SavPresentations. <https://www.illerom.eu/savspreadsheets/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO), tables prefixed `ss_`, created by the API at its first answer. The
  tables are the ones of SavDocuments (`documents` holds the workbooks), so `cron/cleanup.php` treats both alike.
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents (Soft style) from `../assets/sav/`.
- SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`.
- **Accounts: the ones of the whole suite** (`../identity/suite.php`): an account made in any app of SavOffice (email and
  password, or SavAccount) is the account of every app, and one session (cookie `savoffice_auth`, on the path of every app)
  signs in and out everywhere. The tables of this app keep only what is its own, tied to the account (`users.id`).

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/clean.php`, `assets/model.js` | **What a workbook may contain and how changes are applied: the same lists in two languages, keep them in step** |
| `lib/docs.php` | Who can open a workbook, saving, versions; what each person receives (rules of sheets and cells) |
| `assets/formula.js` | Formulas: reading, the functions, the engine that keeps results up to date (dependencies, spills, circular references) |
| `assets/format.js` | Number formats (the codes of every spreadsheet), dates, reading what is typed |
| `assets/grid.js` | The grid on screen: only the visible cells, frozen panes as sticky panes, selection, fill handle, resizing |
| `assets/sheet.js` | The screen of a workbook: bars, formula bar, editing, keyboard, clipboard, commands, tabs, panels, saving |
| `assets/tools.js`, `dialogs.js`, `chart.js`, `print.js` | Series fill, sorting, clipboard; the windows (format, rules, validation, charts, sorting, functions); charts as SVG; printing |
| `assets/files.js`, `xlsx.js`, `ods.js`, `xls.js`, `cfb.js`, `zip.js` | .savspr, CSV, TSV, HTML; Excel; OpenDocument; Excel 97–2003 (BIFF8 in a compound file) |
| `assets/sync.js`, `store.js` | Saving and working together; the account and the copies kept for working offline |
| `assets/home.js`, `templates.js`, `thumbs.js` | Home (as in SavDocuments), the 17 templates in 5 groups, small pictures of sheets |
| `assets/sigs.js` | The arguments and descriptions of the functions (hints while typing, window of the functions) |
| `assets/app.js`, `account.js`, `share.js`, `admin.js`, `options.js`, `ui.js`, `i18n.js`, `icons.js` | Routes, accounts, sharing, administration, settings, helpers, texts, icons |
| `sw.js` | Offline shell: bump `CACHE` when the list of files changes |

## How it works

- **Workbook** = `{settings, sheets}`. A sheet has `cells` (`{"A1": {v, f, s}}`: value, formula, style), `cols` and
  `rows` (widths, heights, hidden, styles of whole columns and rows), `freeze`, `merges`, `cf` (conditional formats),
  `dv` (validation), `charts`, `filter`. Dates are numbers of days since 30 December 1899.
- **Formulas and what is typed are always standard English** (en-GB): `=SUM(A1:A9)`, `1234.5`, `31/12/2026`, `TRUE`.
  Only what the cells *show* follows the language of the workbook (`settings.lang`: `1.234,50 €` in Italian).
- **Changes** are small ops (`cells`, `shift`, `sheet`, `addsheet`, `delsheet`, `movsheet`, `settings`, `title`), applied
  the same way by the browser (`model.js applyOp`) and the server (`lib/clean.php apply_ops`). Adding or removing rows
  sends the `shift` and, right after it, the formulas of the whole workbook rewritten.
- **Working together** is polling (every 2 s with others, 7 s alone): the server numbers each group of ops and the last
  one that reaches it wins. A change of someone else is applied unless an own change to the same cell came after it.
- **Engine**: each formula remembers the cells and ranges it read; a change makes dirty only what depends on it. Tables
  spill (`#SPILL!` when blocked); a formula that reads itself gives `#REF!`.
- **Grid**: only the visible cells exist in the page; the headers and frozen rows and columns are CSS sticky panes.
  The cells are white paper in both themes.
- **Undo**: 200 steps; for cells their old content, for everything else a picture of the sheets touched.
- **Files** are read and written in the browser. Excel and OpenDocument keep values, formulas, styles, widths, merges,
  frozen panes; .xlsx keeps conditional formats and list validation too. Charts stay only in .savspr. Excel 97 (.xls)
  holds 65,536 rows and 256 columns; a formula with a function Excel 97 does not know is written as its result.
- **Rules of sheets and cells** (as the page rules of SavPresentations): `perm` on a sheet says, for a person (by email)
  or for everybody else (`*`), what they can do on it when it differs from the workbook: editor, commenter, viewer, or
  `none` (for them the sheet does not exist). `protect` lists ranges that only the owner and the chosen people may change.
  Only the owner sets them. The server applies them to every change (`apply_ops`), sends each person only the sheets
  they may see, with `my` (their role there) and protected ranges with `mine` and no emails (`doc_for`), drops the
  changes and comments of hidden sheets (`ops_for`, `out_comments`), and a change of rules makes the others read the
  workbook again. Versions are only for the owner when there are rules. A formula that reads a sheet hidden for someone
  shows them its last saved result.
- **Sheet tabs**: a `sav-tabs` of SavComponents (one `sav-tab` per sheet; the colour and the lock are its icon).
- **Offline**, **sharing**, **comments** (on a cell: `block` = `"<sheet>!A1"`), **versions**, **trash** (30 days),
  **reports** and **admin**: as in SavDocuments.

## .savspr

A ZIP: `mimetype` (`application/vnd.savspreadsheets.workbook+zip`, stored first) and `workbook.json`
(`{format: "savspr", version: 1, title, settings, sheets}`). Opening one creates a new workbook.

## Install

1. Copy `credentials-sample.php` to `credentials.php` (git-ignored) and fill it in.
2. SavAccount: a confidential service with redirect address `…/savspreadsheets/api/?r=auth.sav.callback` (empty =
   button hidden).
3. `cron/cleanup.php` already cleans this app every day (trash, unconfirmed accounts, expired links, presence).

## Local test

Only on a throwaway database: `SAVSPREADSHEETS_CREDENTIALS=/path/to/credentials.php php -S localhost:8101 -t ..`
with `$debug = true` and `$mail_config = false` (links are written to the PHP log).

## Versions

The number in the footer and the page of the changes (`#/changelog`) come from `assets/version.js`: at every release
raise `VERSION`, add an entry at the top of `CHANGES` (English and Italian) and bump `CACHE` in `sw.js`.

## Android

`android/` is the Android app (the web app in a WebView, as in SavDocuments): files to open and save
(`window.SavSpreadsheetsAndroid` / `window.SavSpreadsheetsNative`). `applicationId` `com.saverio.savspreadsheets`.
Build with Android Studio or `gradle assembleDebug`; release keys in `keystore.properties` (git-ignored). Store texts in
`store/` (screenshots and graphics still to be made).

## Tools

`tools/make_icons.sh` (PNG icons from `icons/favicon.svg`), `tools/build_icons.py` (the icons of the interface).

# SavSplits

Free, open shared expenses, part of **SavOffice**: trips, flatmates, couples, events, clubs and condominiums. Who paid,
for whom, the balances of everyone and the fewest payments to settle up. The others open a group with its link, without
an account (to look, or to add expenses too). Beside them, a light **personal budget**: "My spending" (your share of every
group, with a personal group for private expenses), monthly caps per category and the import of a bank statement (CSV).
The same account as **SavSchedules**, **SavCalendar**, **SavTasks**…
<https://www.illerom.eu/savsplits/>

> **Public**: listed in SavOffice, in the portal and in the sitemap (the steps are below, in [Making it public](#making-it-public)).

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO). **No credentials of its own**: it reads `../savschedules/credentials.php`
  (same database, same accounts, tables `sch_users`…). Its tables are next to them, `sch_split_*`, created by the API at
  its first answer. An optional `credentials.php` overrides some values (see `credentials-sample.php`).
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents from `../assets/sav/`.
- Google and SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`. The space of
  SavOffice (the groups an account owns count in it): `../savdrive/lib/space.php`.

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/splits.php` | Money, splits, balances, who pays whom, repetitions, access (account or link), the rates of the ECB |
| `lib/schema.php` | The tables `sch_split_profiles`, `_groups`, `_members`, `_expenses`, `_log`, `_photos`, `_budget`, `_rates` |
| `lib/budget.php` | My spending (the share of the account in all its groups), monthly caps, keywords, the rows of a bank statement |
| `lib/photos.php` | The photos of the expenses: re-encoded, kept in the storage folder, served to whoever can open the group |
| `lib/mail.php` | Emails of the account |
| `assets/home.js` | The groups of the account, a new group from a template, a link to open |
| `assets/group.js` | A group: expenses, balances and settling up, charts, people and tables, history, link, guests |
| `assets/expense.js` | An expense being written: kind, amount (also a sum: "12,50 + 8"), currency and rate, payers, split |
| `assets/money.js` | Amounts in minor units, formats, the split preview (the same rounding as the server), categories |
| `assets/files.js` | `.savspl` and `.csv` |
| `assets/budget.js` | My spending (`#/spending`, inside the home): filters, charts, caps, keywords, its CSV, the note when a cap is passed |
| `assets/bankcsv.js` | A bank statement (CSV), read in the browser: columns, separators, date format, preview, duplicates, categories |
| `assets/account.js`, `hero.js`, `options.js`, `changelog.js`, `version.js`, `ui.js`, `time.js`, `i18n.js` | First page and accounts, settings, what's new, helpers |
| `sw.js` | Shell for installing the app: bump `CACHE` when the list of files changes |

## Money

- Every amount is an **integer of minor units** (cents) of its currency, never a float. A division gives out the units
  that are left one by one (largest remainder, then the order of the people): the parts always add up to the whole, and
  the same expense always gives the same parts (`apportion()` in `lib/splits.php`, the same in `assets/money.js`).
- An expense keeps what each person **paid** and **owes** in the currency of the group, worked out when it is saved:
  a balance is Σ paid − Σ owed, and all the balances together are always 0.
  - **expense**: payers (one or more, amounts that make the total) and a split: **equal** (among the people chosen),
    **shares** (2 pays twice 1; each person has a default share), **percent** (makes 100), **exact** amounts (make the
    total) or **table** (the thousandths of a table of the group);
  - **payback** (transfer): one person gives money to another;
  - **money in** (income): the group received money (a deposit back…): whoever got it holds it for the others.
- **Settling up**: the one who owes most pays the one who should receive most, again and again: at most n − 1 payments.
  "Mark as paid" records the payback.
- **Currencies**: 46, with their minor units (JPY 0, TND 3…). An expense in another currency keeps its rate; the app
  proposes the one of the **European Central Bank** (asked by the server at most every 6 hours, `sch_split_rates`; no
  personal data leaves). The currency of a group can change only while it has no expenses.
- **Repetitions** (week, month, quarter, year): the copies are made when the group is opened, up to the day of whoever
  opens it (60 at most at a time), inside a lock, so they are made once.

## Groups, people, links

- A group belongs to the account that made it (the **owner**: settings, link, delete). Its **people** are names; an
  account can be **joined** to one of them (from the link, or "Are you one of them?"), as editor or viewer (the owner
  chooses). An account sees the groups it owns and those where it is one of the people; it can archive a group for
  itself or leave it.
- The **link** (`#/j/<16 characters>`) opens the group for anybody, without an account: to look, or also to add and
  change expenses and people (the owner chooses, can switch it off or make a new one). A guest says who they are (kept
  in their browser). Wrong codes are limited by address.
- **Templates**: trip, flatmates, couple, event or gift, club or team, condominium, other. A **condominium** starts
  with tables of thousandths (property, stairs, lift, heating: the shares of each flat are written in People, in a
  grid with the total of each table); an expense "by table" follows them.
- **History**: every change, who made it and when (the last 3000 per group). A deleted expense can come back for 30 days.
- People who paid or owe something are never deleted: they stay as "no longer in the group".

## My spending (a light personal budget)

Only to look at what was spent: **no bank accounts, no assets, no investments, no advice**.

- **My spending** (`#/spending`, `splits.mine`) adds up the **share** of the account in the expenses of every group where
  it is one of the people (what it owes, `alloc`, not what it paid: that is settled by the balances), by month and by
  category, for a period (this month, last month, 3 or 12 months, this year, all) and a group (all, personal, shared,
  one). Only expenses count, never paybacks or money in. Groups in other currencies are converted at today's rates of the
  ECB into the currency of the view (chosen with the caps). The view goes out as CSV (one row per expense, the share in
  the currency of the group and of the view).
- **Personal group** (kind `personal`, the template "Personal"): one person, its owner. It has **no link** and nobody can
  be added or join (`personal_group`), so it never has balances; its page shows no balances, no people, no sharing, and
  an expense needs no payer or split. It cannot become shared, and a shared group cannot become personal.
- **Monthly caps** for some of the categories of SavSplits (no new ones were needed): a bar for each, green, yellow from
  80 %, red once passed; a red alert in the view, a red mark on "My spending" in the side menu (`capsOver` of
  `splits.groups`) and a note when an expense pushes a category over its cap. Only in the app: SavSplits sends no
  notifications by email (its emails are only those of the account).
- **Bank statement** (`assets/bankcsv.js`): a CSV is **read in the browser** and never sent. The columns (date,
  description, one amount with its sign or two columns money out / money in), separator, decimal mark, date order and the
  rows to skip are guessed from the file and can be changed; the way of reading is remembered for the next statement with
  the same header. The preview marks the rows already in the group (same day, same amount: left out unless chosen), leaves
  out money in and unreadable rows, and gives each row the category of the longest **keyword** its description contains.
  Changing a category by hand remembers its keyword (two words of the description, without codes, numbers and the words
  every bank adds). Only the rows chosen are sent (`splits.expense.import`, at most 1000 at a time): expenses paid by the
  account, in the chosen group, for itself alone or equally among everyone (a shared group).
- `sch_split_budget` keeps, per account: the currency of the view, the caps, the keywords (500 at most) and how the last
  CSV was read. It is in the export of the account and goes away with it.

## Photos

- Up to **6 photos per expense, 5 MB each** as they are sent (a receipt, a bill, a ticket): chosen, taken with the camera
  of a phone, dropped on the dialog or pasted. They are uploaded at once (`splits.photo.upload`, the body is the image)
  and taken by the expense when it is saved (`photos: [ids]` in `splits.expense.save`).
- Re-encoded with GD as JPEG, at most 2000 px, turned as the EXIF says and then **without metadata** (no place, no
  device). Kept as files in `storage/` (or `$split_storage_dir` in `credentials.php`, best outside the web root), named
  by a random id; `savsplits/.htaccess` and `storage/.htaccess` refuse every request. Served by `splits.photo` only to
  whoever can open the group (an account, or the link), with the same checks as the group.
- They count in the space of SavOffice of the owner of the group. A photo taken off an expense is deleted at once; one
  never saved, after a day; the ones of an expense deleted for good, of a group or of an account, with them.
- GD is needed (`php-gd`); without it the server answers `photo_off`.

## Files

- `.savspl`, the format of SavSplits: JSON (`application/vnd.savsplits.group+json`):
  `{format: "savspl", version: 1, group: {name, kind, icon, color, currency, notes, tables}, members: [{id, name, weight,
  quotas, pay, active}], expenses: [{kind, title, category, day, amount, currency, rate, payers, split, notes, repeat,
  repeatNext, by}]}` (payers and split use the ids of members). Opening one makes a new group with the same people and
  expenses (each expense checked again).
- `.csv`: one row per expense, with what it meant for each person, and the balances.
- The photos stay in the group: they are not inside `.savspl` and `.csv` (the export of the account lists their ids).
- **SavDrive** knows `.savspl` (`../savdrive/lib/files.php`, `../savdrive/assets/office.js`): a `.savspl` kept in the drive
  shows "Open in SavSplits", which opens the app with `?savdrive=<id>` and makes a new group from it. SavDrive offers no
  empty `.savspl` in its "New" menu (a group lives in the database, not in a file): SavSplits is seen there only next to
  such a file.

## Install

Nothing to fill in when SavSchedules is installed. SavAccount: add
`https://www.illerom.eu/savsplits/api/?r=auth.sav.callback` to the redirect addresses of the service of SavSchedules
(same service, same pairwise id), or give SavSplits its own in `credentials.php`.

The session is shared with the other apps because `savsplits` is in `SHARED_APPS` of their `lib/bootstrap.php` (and in
`SHARED_WITH` of SavSchedules): already done.

## Making it public

Today SavSplits works at `/savsplits/` for whoever knows the address, and is listed nowhere. To publish it:

1. **Search engines**: remove `header('X-Robots-Tag: noindex, nofollow');` and `<meta name="robots" …>` from
   `index.php`, and the `<meta name="robots" …>` of `privacy.html` and `terms.html`.
2. **The button of the apps** (`../assets/savoffice/savoffice.js`): add to both `APPS` lists, in alphabetical order
   (after SavSpreadsheets… check the order there), and to the comment at the top:
   `['savsplits', 'SavSplits', 'Spese condivise', 'Shared expenses'],`
3. **The page of SavOffice** (`../savoffice/index.php`): in `$apps`
   `'savsplits' => ['#1a7f37', 'd1.jpg', '1.jpg', 'Chi ha il link entra senza account; i saldi si pareggiano con il minor numero di pagamenti, anche per i millesimi di un condominio. E in «Le mie spese» la tua quota di ogni gruppo, con le spese personali e l’estratto conto della banca.', 'Whoever has the link joins without an account; balances are settled with the fewest payments, even by the thousandths of a condominium. And in “My spending”, your share of every group, with your personal expenses and your bank statement.'],`
   in `$short` `'savsplits' => ['Spese condivise', 'Shared expenses'],`, in `$files`
   `'savsplits' => ['.savspl', 'CSV'],` and, if wanted, pairs with SavCalendar/SavTasks in `$pairs`.
4. **The portal** (`../data/projects.php`), after SavTasks:
   ```php
   'savsplits' => [
       'name' => 'SavSplits', 'suite' => 'savoffice', 'cat' => 'work', 'level' => 2, 'account' => 'optional', 'offline' => false, 'play' => '',
       'url' => '/savsplits/', 'source' => 'savsplits', 'privacy' => 'privacy.html', 'langs' => $two, 'shots' => 3, 'tablet' => 3, 'desk' => 3,
       'it' => ['Spese condivise, senza far conti.',
           'Viaggi, coinquilini, coppie, associazioni e condomini: scrivi chi ha pagato e per chi, SavSplits calcola i saldi e il minor numero di pagamenti per pareggiare. Gli altri entrano con un link, senza account. Ha lo stesso account delle altre app di SavOffice.',
           ['In parti uguali, per quote, per percentuali, per importi o per millesimi', 'Saldi e pagamenti per pareggiare, segnati come fatti con un tocco', 'Un link per guardare o per aggiungere spese, senza account', 'Ogni valuta con i cambi BCE, spese che si ripetono, file .savspl e CSV']],
       'en' => ['Shared expenses, settled without fuss.',
           'Trips, flatmates, couples, clubs and condominiums: write who paid and for whom, SavSplits works out the balances and the fewest payments to settle up. The others join with a link, no account needed. It shares the account with the other apps of SavOffice.',
           ['Equally, by shares, by percentages, by amounts or by thousandths', 'Balances and payments to settle up, marked as done with one press', 'A link to look or to add expenses, no account needed', 'Any currency with ECB rates, repeated expenses, .savspl and CSV files']],
   ],
   ```
   with the screenshots in `../assets/projects/savsplits/` (1.jpg…, t1.jpg…, d1.jpg…). The home, the sitemap and
   `llms.txt` follow `projects.php` by themselves.
5. **The status page** (`../data/services.php`):
   `'savsplits' => ['app' => ['sch_', 'Gruppi e spese', 'Groups and expenses', ['savschedules', 'split_schema_version', 'SPLIT_SCHEMA_VERSION']]],`
6. **SavAccount**: the redirect address above.

# SavForms

Free, open forms, surveys and quizzes, part of **SavOffice** — an alternative to Google Forms, Microsoft Forms and
LimeSurvey. A link to share (no account needed to answer, unless the form asks for one), a chart for every question, the
answers one by one, CSV for spreadsheets. When a form has a deadline it shows in **SavCalendar** and the form closes by
itself. The same account as **SavSchedules**, **SavCalendar** and **SavTasks**.
<https://www.illerom.eu/savforms/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO). **No credentials of its own**: it reads `../savschedules/credentials.php`
  (same database, same accounts, tables `sch_users`…). Its tables are next to them, `sch_form_*`, created by the API at
  its first answer. An optional `credentials.php` overrides some values (see `credentials-sample.php`).
- No build step and no libraries: ES modules in `assets/`. Controls and charts: SavComponents (Soft style, as the other
  apps of SavOffice) from `../assets/sav/` (`sav-chart-bar`, `sav-rating`, `sav-sortable`, `sav-date-picker`…).
- Google and SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`.

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/forms.php` | Questions (what each kind keeps), settings, look, checking the answers, quizzes, the summary of the charts, CSV |
| `lib/schema.php` | The tables `sch_form_profiles`, `sch_form_forms`, `sch_form_responses` |
| `lib/mail.php` | Emails of the account and "a new answer arrived" |
| `assets/home.js` | The forms of the account and the models to start from (`models.js`) |
| `assets/editor.js` | The editor: questions (the form as it will look, the chosen one open for changes), look, settings, sending |
| `assets/inputs.js` | The control of each kind of question (answering, preview in the editor), and what is wrong with an answer |
| `assets/fill.js` | Answering (`#/f/<form>`): pages, drafts kept in the browser, sending, score, the link to change the answers |
| `assets/results.js` | The answers: numbers, a chart for every question, the answers one by one, the public charts (`#/s/<form>`) |
| `assets/files.js`, `zip.js` | `.savfor` (with or without the answers) |
| `assets/account.js`, `hero.js`, `options.js`, `changelog.js`, `version.js`, `ui.js`, `time.js`, `i18n.js` | First page and accounts, settings, what's new, helpers |
| `sw.js` | Shell for installing the app: bump `CACHE` when the list of files changes |

## One account with SavSchedules, SavCalendar and SavTasks

The apps use the users and sessions of SavSchedules. The session cookie (`savoffice_auth`, HttpOnly: the session of the whole suite, `../identity/suite.php`) is set **on the
paths of all of them** by each of them (`SUITE_APPS` of `../identity/suite.php`, every app of SavOffice):
signing in or out in one does it in the others. Deleting the account deletes its forms and their answers everywhere.

SavAccount: add `https://www.illerom.eu/savforms/api/?r=auth.sav.callback` to the redirect addresses of the service of
SavOffice (same service, same pairwise id), or give SavForms its own in `credentials.php`.

## Forms

- **Questions**: short answer, paragraph, email, number (limits, whole numbers), one choice, checkboxes (how many),
  dropdown, ranking, linear scale (0/1 to 2…10, labels), rating (stars, hearts, thumbs, smiles), choice grid, checkbox
  grid, date, time; and between them a title with text, a picture, a new page. Choices can be shuffled and have "Other".
  Every question and option keeps its id: renaming or moving them keeps the answers.
- **When**: takes answers or not (by hand), opens at, **deadline** (it closes by itself; shown in SavCalendar unless
  switched off for that form), most answers. Moments are kept in UTC and chosen on the clock of the zone of the form.
- **Who**: anonymous, the email asked, or the address of the account; only signed-in people; one answer per person (it
  needs signing in); answers that can be changed later (a secret link, only its SHA-256 is kept).
- **After sending**: a message, the charts of all the answers (never the texts written), "send another answer".
- **Quiz**: right answers and points for choices and short answers; the score and the right answers right after sending.
- **Look**: colour, font, background, a picture on top (pictures are made smaller in the browser, checked on the server).
- An email to the owner at every answer (50 a day per form at most), switched on per form.
- Protection: a hidden field for machines, 30 answers every 10 minutes from one address, answers checked against the
  questions, CSV cells that start like a formula are made text.

## With SavCalendar

`savcalendar/lib/cal.php` (`form_items()`) reads `sch_form_forms` and shows the deadlines of one's forms (30 minutes from
the moment it closes, in the colour of the form), as a layer of its own ("SavForms") that can be switched off. Read-only
there, with a link to the answers.

## Files

- `.savfor`, the format of SavForms: a ZIP with `mimetype` (`application/vnd.savforms.form+zip`) and `form.json`
  (`{format: "savfor", version: 1, title, descr, tz, theme, settings, items: [...], answers?: [...]}`). Opening one
  creates a new form, closed until it is opened, with its answers when chosen.
- `.csv` of the answers (UTF-8 with BOM, one row per answer, a column per question, one per row of a grid).

## Install

Nothing to fill in when SavSchedules is installed. No cron jobs: deadlines are checked at every answer.

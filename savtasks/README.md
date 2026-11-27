# SavTasks

Free, open tasks, part of **SavOffice**: to-dos, lists, boards (kanban), Gantt charts, tables and habits in one app, with due days and times,
reminders, repetitions, priorities, labels and subtasks, and time tracking (a timer on every task, reports by project or client). The same account as **SavSchedules** and **SavCalendar**: tasks
with a due day show in the calendar, a task can become an event or a date poll, and what SavSchedules asks of the
account (polls to decide, places booked) comes here as read-only to-dos.
<https://www.illerom.eu/savtasks/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO). **No credentials of its own**: it reads `../savschedules/credentials.php`
  (same database, same accounts, tables `sch_users`…). Its tables are next to them, `sch_task_*`, created by the API at
  its first answer. An optional `credentials.php` overrides some values (see `credentials-sample.php`).
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents (Soft style, as the other apps of
  SavOffice) from `../assets/sav/`.
- Google and SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`.
- What a schedule is comes from `../savschedules/lib/sched.php` itself (the apps never disagree).

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/tasks.php` | Lists, tasks, repetitions, and what goes to and comes from SavCalendar and SavSchedules |
| `lib/track.php` | The time tracked: the timer (one per account), spans written by hand, rates |
| `lib/schema.php` | The tables `sch_task_profiles`, `sch_task_lists`, `sch_task_items`, `sch_task_time` |
| `lib/mail.php` | Emails of the account and of the reminders |
| `../cron/savtasks-reminders.php` | The reminders by email (every 30 minutes, or more often) |
| `assets/tasks.js` | The screen: side (smart views and lists), quick add, the views, reminders in the browser |
| `assets/board.js` | A list as a board: columns, cards dragged with mouse or finger, the column of done tasks |
| `assets/create.js` | "New": the dialog in the middle (a task, or a list as list, kanban board, Gantt or Eisenhower matrix) and the templates |
| `assets/table.js` | A list as a table: columns to sort, status, due day and priority changed in the cell, columns to show or hide |
| `assets/habits.js` | Habits: the week, each day ticked, the streak; the habits of the day in Today |
| `assets/gantt.js` | A list as a Gantt chart: bars from start to due day (milestones with a due day only), dragged and stretched, days or weeks |
| `assets/task.js` | One task on the side (saved as it changes), "Add to SavCalendar", "Find a date with others", the dialog of a list |
| `assets/track.js` | Time tracked: the timer in the bar, the time of a task, spans by hand, the view Time (reports, CSV, “Open in SavSpreadsheets”) |
| `assets/parse.js` | Quick add: "Call Anna tomorrow 15:00 !high #work @Home every monday", in Italian and English |
| `assets/files.js`, `zip.js` | `.savtas`, `.csv`, `.md`, lines of text |
| `assets/account.js`, `hero.js`, `options.js`, `changelog.js`, `version.js`, `ui.js`, `time.js`, `i18n.js` | First page and accounts, settings, what's new, helpers |
| `sw.js` | Shell for installing the app (and the press on a notification): bump `CACHE` when the list of files changes |

## One account with SavSchedules and SavCalendar

The three apps use the users and sessions of SavSchedules. The session cookie (`savoffice_auth`, HttpOnly: the session of the whole suite, `../identity/suite.php`) is set **on
the paths of all three apps** by each of them (`set_auth_cookie()` in every `lib/bootstrap.php`): signing in or out in
one does it in the others. A session opened in SavSchedules before this is handed over by its `auth.me`
(`share_session()`). Deleting the account deletes it everywhere (the tables reference `sch_users` with `ON DELETE CASCADE`).

SavAccount: add `https://www.illerom.eu/savtasks/api/?r=auth.sav.callback` to the redirect addresses of the service of
SavSchedules (same service, same pairwise id), or give SavTasks its own in `credentials.php`.

## Lists, boards, tasks

- Every account has an **inbox** (made the first time, it cannot be deleted) and up to 100 lists. A list is shown as a
  **list** (drag the handle to reorder; sort by due day, priority, title or newest), as a **Gantt chart** (each task a
  bar from its start day to its due day, dragged to move it and stretched by its edges; a task with only a due day is a
  milestone, one without dates is planned by pressing a day on its row; days or weeks), as an **Eisenhower matrix** (a board whose four columns are the quadrants urgent/important, drawn two by two) or as a
  **board**: its columns are
  kept with the list (up to 12), and one of them may be the **column of done tasks**: a card dropped there is ticked,
  a ticked task goes there.
- A task: title, notes, subtasks, labels, priority (none, low, medium, high), star, due day with an optional time in a
  time zone, an optional **start day** (the beginning of its bar in the Gantt), a **repetition** (every n days, weeks — some weekdays —, months, years: ticking it plans the next one) and a
  **reminder** (at the time, some minutes before, the day before, that morning, or any moment).
- **Habits**: a list of its own (made from "New"): each habit asks for some days (every day, the weekdays, the days
  chosen); each day is ticked on its own (kept in `log`, the last 400 days, never a day to come: `tasks.habit.mark`),
  with the streak, the best streak and the last 30 days. The habits of the day are in Today too.
- The **type** of a list (list, table, kanban board, Gantt, Eisenhower matrix, habits) is chosen when it is made and never
  changes; a **table** is a type too (rows and columns to sort; status, due day and priority change in the cell).
- Smart views: **Today** (late and due today), **Upcoming** (by day, two weeks ahead), **Starred**, **Done** (the last
  60 days), labels, search, and **From SavSchedules**.

## Time tracked

- **Timer**: ▶ on the row of a task (on hover; on phones in its detail) or in its detail. One runs at a time for the account:
  starting one stops the one before. It is kept on the server with the moment it started (`sch_task_time`, `running = 1`),
  so it goes on across reloads and devices, and it is always in the bar while it runs (what it is on, the clock, stop).
- **Entries by hand**: a day and from–to (an end before the start is the next day) or a length (1 minute to 24 hours),
  a note, billable or not; editable and deletable. The running timer can change its task, note and start time.
- **Projects and clients are the lists**: no new hierarchy. A list may have an **hourly rate** (its dialog, or “Rates
  and currency” in the view Time; the currency is a setting of the account, one of those SavSpreadsheets knows). A new
  entry is billable when its list has a rate. An entry belongs to a task (and so to the list the task is in now) or only
  to a list; a deleted task leaves its entries with its title.
- **The view Time** (`#/time`): week, month or the days chosen; filters by project and billable; totals of hours,
  billable hours and amount; tables by project or client and by task; the entries by day.
- **Export**: CSV (one row per entry, then the totals), and **Open in SavSpreadsheets**: a `.savspr` (a sheet *Entries*
  with hours, rate and amount as formulas, and a sheet *Summary* with SUMIF/SUMIFS totals by project and by task) is put
  into **SavDrive** (My drive, with the SavDrive session of the browser: `upload.start`/`upload.chunk`) and opened as
  SavDrive opens its files, `../savspreadsheets/?savdrive=<id>`. Without a SavDrive session the file is downloaded.
- API: `tasks.time.list|start|stop|save|delete`; `tasks.all` also gives `timer` and `timeTotals`; `tasks.list.save` takes
  `rate`. The account export (`auth.export`) includes the entries.

## With the other apps

- **SavCalendar** shows the tasks with a due day (a layer that can be switched off in its side and settings; a task is
  ticked from the calendar too: `cal.task.done`). From a task, "Add to SavCalendar" creates an event in one of one's own
  calendars, with a link back (`tasks.cal.create`).
- **SavSchedules**: from a task, "Find a date with others" creates a date poll with the days chosen and opens it in the
  editor of SavSchedules (`tasks.sch.create`); once its owner chooses the date, the task shows it and can take it as its
  due day. Own polls with answers and no date chosen, places booked and dates chosen for the polls answered are listed in
  "From SavSchedules" (`schedule_todos()`): read-only, they open SavSchedules.

## Reminders

- **Email**: `cron/savtasks-reminders.php`, every 30 minutes (or more often): every task not done whose reminder time has
  come gets one email at the first run after it (at most half an hour late) (several of one account in one run go together). Older than 2 days: only marked as gone. Off for an account
  that switched them off (Settings → Reminders), not confirmed or blocked. Uses the SMTP of SavSchedules.
- **Browser**: while the app is open (or installed), a notification at the reminder time if allowed (Settings →
  Reminders), otherwise a message on screen.

## Files

- `.savtas`, the format of SavTasks: a ZIP with `mimetype` (`application/vnd.savtasks.list+zip`) and `list.json`
  (`{format: "savtas", version: 1, name, color, icon, view, columns, tasks: [...]}`, tasks as `tasks.list.export` gives
  them, done ones too). Opening one creates a new list.
- `.csv` (download, for spreadsheets), `.md` (download as a Markdown checklist), and lines of text pasted into a list or
  opened as a file (`- [ ]`, `*`, `1.`, indented lines become subtasks).

## Install

Nothing to fill in when SavSchedules is installed. The reminders run with the other checks of SavOffice, every 30 minutes
(`cron/savoffice-checks.php`, see `../cron/README.md`):

```
0,30 * * * * php /path/to/site/cron/savoffice-checks.php
```

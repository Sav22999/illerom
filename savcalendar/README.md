# SavCalendar

A free, open calendar, part of **SavOffice**: day, week, month and agenda; several calendars; repetitions and time zones;
the polls and slots of **SavSchedules** (same account, same session), the planned newsletters of **SavNewsletters** and
the tasks of **SavTasks**.
Show it in Google Calendar, Outlook or Apple Calendar with a private link, and bring their calendars here.
<https://www.illerom.eu/savcalendar/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO). **No credentials of its own**: it reads `../savschedules/credentials.php`
  (same database, same accounts, tables `sch_users`…). Its tables are next to them, `sch_cal_*`, created by the API at its
  first answer. An optional `credentials.php` overrides some values (see `credentials-sample.php`).
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents (Soft style) from `../assets/sav/`.
- Google and SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`.
- What a schedule is comes from `../savschedules/lib/sched.php` itself (the two apps never disagree).

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/cal.php` | Calendars, events, subscriptions, the items of SavSchedules and SavNewsletters |
| `lib/ics.php` | iCalendar without libraries: reading (Google, Outlook, Apple…, Windows zone names, VTIMEZONE) and writing (with VTIMEZONE) |
| `lib/fetch.php` | Reading a subscription safely: only public addresses, pinned DNS, redirects checked, size and time limits |
| `feed/index.php` | The private `.ics` feed other calendars subscribe to (`feed/<token>.ics`, rewritten by `.htaccess`) |
| `assets/calendar.js` | The views (day, week, month, agenda), drawing and dragging events, choosing dates for SavSchedules |
| `assets/event.js` | An event: reading (and why it is read-only), editor, repetitions, "only this / following / all" |
| `assets/sources.js` | The side: calendars, subscriptions, layers, sync dialogs (feed, subscribe, import) |
| `assets/rrule.js` | Repetitions (RRULE) without libraries, keeping the wall clock across summer time |
| `assets/week.js` | The week of the person: first day and days shown by the week and month views (one panel, in the bar and in the settings) |
| `assets/files.js`, `zip.js` | `.savcal`, `.ics`, `.csv` (in the Android app the file goes to the system through the bridge) |
| `assets/version.js`, `changelog.js` | The version in the footer and the page `#/changelog`: add an entry at every release |
| `assets/account.js`, `hero.js`, `options.js`, `ui.js`, `time.js`, `i18n.js` | First page and accounts, settings, helpers |
| `sw.js` | Shell for installing the app: bump `CACHE` when the list of files changes |

## One account with SavSchedules

Both apps use the users and sessions of SavSchedules. The session cookie (`savschedules_auth`, HttpOnly) is set **on the
paths of both apps** by both (`set_auth_cookie()` in each `lib/bootstrap.php`): signing in or out in one does it in the
other. A session opened in SavSchedules before this is handed over by its `auth.me` (`share_session()`). Deleting the
account deletes it in both (the calendar tables reference `sch_users` with `ON DELETE CASCADE`).

SavAccount: add `https://www.illerom.eu/savcalendar/api/?r=auth.sav.callback` to the redirect addresses of the service of
SavSchedules (same service, same pairwise id), or give SavCalendar its own in `credentials.php`.

## What can be changed here

Only the events of one's own calendars. Read-only, and the app says why and where to change them:
- **subscriptions** (a calendar elsewhere, read again every 3 hours when the account opens the calendar, or on request);
- **SavSchedules**: dates chosen, dates proposed by open polls, the slots of one's sheets, places booked, polls answered;
- **SavNewsletters**: newsletters planned in the groups of the account (only for a confirmed address).
- **SavTasks**: the tasks with a due day (whole day, or 30 minutes from their time), in the colour of their list, done
  ones too unless switched off; they can be ticked from here (through the API of SavTasks itself, same session).

## Sync with other calendars

- **Out** (`cal.feed`): a private link per calendar, or one with everything (own calendars + dates chosen and places taken
  in SavSchedules). Google, Outlook, Apple subscribe to it and read it again by themselves (Apple about hourly, Outlook
  every few hours, Google up to daily). A new link stops the old one at once.
- **In**: a subscription to any `.ics` link (Google "secret address in iCal format", Outlook "publish calendar", iCloud
  public calendar, `webcal://`), or a one-time import of a file. Two-way sync (OAuth APIs of Google/Microsoft) is not done.

## Files

- `.savcal`, the format of SavCalendar: a ZIP with `mimetype` (`application/vnd.savcalendar.calendar+zip`) and
  `calendar.json` (`{format: "savcal", version: 1, name, color, descr, tz, events: [...]}`, events as `cal.events` gives
  them). Opening one creates a new calendar (or updates one, by UID).
- `.ics` (download and import), `.csv` (download, the columns Google reads).

## Android

`android/`: the web app in a WebView, as in SavSchedules (`com.saverio.savcalendar`): Google sign-in, saving and opening
`.savcal`/`.ics` files are native (`window.SavCalendarAndroid`, user agent `SavCalendarApp/Android`). The pages of
SavSchedules stay inside the app (same session). Build with Android Studio; signing in `keystore.properties`
(git-ignored, see the sample); `assetlinks.sample.json` goes into `/.well-known/assetlinks.json` with the others.

## Install

Nothing to fill in when SavSchedules is installed. `cron/` needs nothing: subscriptions are refreshed when they are looked at.

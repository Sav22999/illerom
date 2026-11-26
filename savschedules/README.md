# SavSchedules

Date polls and slot booking: find the date of a meeting, or let people book a time nobody else can take. Whoever answers
needs no account (unless the organiser asks for one). Part of the same family as SavDocuments and SavPresentations.
<https://www.illerom.eu/savschedules/>

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO), tables prefixed `sch_`, created by the API at its first answer.
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents (Soft style) from `../assets/sav/`.
- Google and SavAccount sign-in: `../identity/`.

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/sched.php` | What a schedule is, its settings, options and answers; who sees what |
| `assets/editor.js` | The editor: week (click adds a slot, drag draws one or cuts a range into slots), month (whole days), series, details, rules |
| `assets/answer.js` | The page for the people who answer: slots to take or dates to vote, the answer to change or withdraw |
| `assets/results.js` | The answers for the owner: ranking and choice of the date, who took which slot, CSV / .ics / .savsch, print |
| `assets/home.js`, `plan.js` | Home (as in SavDocuments), kinds, colours, ready-made starts, the slot generator |
| `assets/time.js` | Time zones without libraries: options in UTC, planned in the zone of the schedule, shown in the zone of the viewer |
| `assets/files.js`, `zip.js`, `qr.js`, `share.js` | .savsch, CSV, .ics; sharing with link and QR code |
| `assets/account.js`, `hero.js`, `options.js`, `admin.js`, `ui.js` | First page and accounts, settings, administration, SavComponents helpers |
| `sw.js` | Shell for installing the app: bump `CACHE` when the list of files changes |

## Install

1. Copy `credentials-sample.php` to `credentials.php` (git-ignored) and fill it in.
2. Google: add `https://www.illerom.eu` to the origins of the OAuth client. SavAccount: see the sample.
3. `cron/cleanup.php` already cleans this project every day (trash after 30 days, unconfirmed accounts after 7).

## How it works

- **Kinds**: a *poll* (each person says yes, if need be or no for each option; the owner chooses the final date, which
  closes the answers and can be emailed) or *slots* (each option has `capacity` places; `maxPer` places per person).
- **Unique slots**: `pub.answer` locks the row of the schedule (`SELECT … FOR UPDATE`) and counts the places inside the
  transaction, so two people pressing at once are served in turn; the second one gets `slot_taken` and the fresh state.
- **Answers without an account**: each answer has a private key (48 hex characters, only its SHA-256 on the server),
  kept by the browser (`localStorage`) and sent in the email of the answer as `#/s/<id>/<key>`. With `access = account`
  only signed-in people answer, one answer each.
- **Hidden answers**: the others see no names; a poll shows no numbers either, a sheet still shows which slots are full.
- **Options** are `{start, end}` in UTC or `{day}` for a whole day. The editor works in `settings.tz`; the page of the
  schedule shows the times in the zone of the viewer.
- **Master admins** see titles, owners and numbers, never the answers; they can suspend schedules and block accounts.

## .savsch

A ZIP: `mimetype` (`application/vnd.savschedules.schedule+zip`) and `schedule.json`
(`{format: "savsch", version: 1, kind, title, descr, place, settings, options, answers?}`). Opening one creates a new
schedule without its answers.

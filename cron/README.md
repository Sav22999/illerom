# Daily Cleanup for Online Games and Apps

`cleanup.php` performs two tasks:

- **Games:** Deletes rooms for Connect Four, Chess, FaceGuess, Sea Battle and Prism Mine that have had no changes and no
  connected players for 24 hours, along with players, chat messages, and cards. Run once a day, data remains for at
  most ~48 hours since last activity: this matches the retention stated in privacy policies and store listings.
- **FoodTrack, Giftwise, Fucina, ThinkHop, Forkville, MyCurriculum, SavNewsletters and SavDocuments:** Cleans up expired
  sessions and login attempts older than 2 hours (IP addresses are only used for rate limiting over the past 60 minutes)
  and strips IP/browser data left on sessions from earlier versions. It never alters lists, items, wishes, stats,
  progress, or other user data.
- **SavNewsletters only:** also deletes subscriptions never confirmed within 7 days (as its terms promise) and expired
  account-confirmation links.
- **SavDocuments only:** also deletes documents left in the trash for 30 days, accounts never confirmed within 7 days
  and expired links.

The same scripts on saveriomorelli.com (`projects/cron/`) forward here what concerns these projects, so jobs scheduled
on the old
addresses keep working. Schedule each job on one address only.

## ThinkHop Reminders

`thinkhop-reminders.php` sends non-live reminders (daily challenge or streak at risk) to players who have not played
today, respecting the custom reminder hour chosen by each player (default 18:00 in server timezone `Europe/Rome`).
It can be scheduled **hourly** (e.g. `0 * * * *`) or once a day at 18:00. At most one reminder per player per day.
It also deletes unread notifications older than 3 days. Passing `?force=1` (or `--force` via CLI) immediately sends
reminders to all pending players.

- **URL:** `https://www.illerom.eu/cron/thinkhop-reminders.php?key=YOUR_KEY` (same key)
- **Command line:** `php /path/to/site/cron/thinkhop-reminders.php` (no key required)

## Installation

1. Upload the entire `cron/` directory to the server, including `credentials.php` (excluded from git). If missing, copy
   `credentials-sample.php` to `credentials.php` and set a long random key.
2. Schedule the cleanup job every day at 00:00 using either:
    - **URL:** `https://www.illerom.eu/cron/cleanup.php?key=YOUR_KEY`
    - **Command line:** `php /path/to/site/cron/cleanup.php` (no key required)
3. Schedule the checks of SavOffice every 30 minutes (`0,30 * * * *`), see [SavOffice Checks](#savoffice-checks):
    - **URL:** `https://www.illerom.eu/cron/savoffice-checks.php?key=YOUR_KEY`
    - **Command line:** `php /path/to/site/cron/savoffice-checks.php` (no key required)

## Responses

- `200` with cleanup summary, for example:
  `{"ok": true, "deleted_rooms": {"connect-four": 3, "chess": 0, "faceguess": 1, "sea-battle": 0, "prism-mine": 0}, "deleted_expired": {"foodtrack": {"sessions_anonymised": 0, "sessions": 2, "attempts": 14}, "giftwise": {"sessions_anonymised": 0, "sessions": 0, "attempts": 5}, "fucina": {"sessions_anonymised": 0, "sessions": 1, "attempts": 2}, "thinkhop": {"sessions_anonymised": 0, "sessions": 0, "attempts": 1}}}`
- `403` Invalid or missing key
- `503` Missing `credentials.php` or key is too short
- `500` Cleanup of at least one game or app failed (code in response, details in PHP error log) or database did not
  respond. `SQLSTATE 42S02` indicates missing tables: run that game's `api/setup.php`.

## Fucina Reminders

`fucina-reminders.php` sends non-live reminders (streak at risk first, otherwise daily challenge) to learners who have
not practiced today, respecting the custom reminder hour chosen by each learner (default 18:00 in server timezone
`Europe/Rome`).
It can be scheduled **hourly** (e.g. `0 * * * *`) or once a day at 18:00. At most one reminder per learner per day.
Passing `?force=1` (or `--force` via CLI) immediately sends reminders regardless of the hour.

- **URL:** `https://www.illerom.eu/cron/fucina-reminders.php?key=YOUR_KEY` (same key)
- **Command line:** `php /path/to/site/cron/fucina-reminders.php` (no key required)

## SavOffice Checks

`savoffice-checks.php` runs, every 30 minutes, everything the apps of SavOffice need to check: schedule only this one
instead of each script below. It runs them one after the other, each in a process (command line) or a request (URL, with
the same key) of its own, because every app loads its own libraries and every script ends on its own; a script that
fails or is missing does not stop the others. A run still going makes the next one skip its turn (lock file).

| Script | What |
|--------|------|
| `savnewsletters-schedule.php` | SavNewsletters: newsletters whose slot has come, the sending queue |
| `savnewsletters-reminders.php` | SavNewsletters: proposals waiting for approval near their slot |
| `savtasks-reminders.php` | SavTasks: the reminders of the tasks by email |

A new app with something to check every 30 minutes: one more line in `JOBS` at the top of the script. Each script still
works alone (same URL and key, or command line). Do not schedule them on their own as well as `savoffice-checks.php`.

- **URL:** `https://www.illerom.eu/cron/savoffice-checks.php?key=YOUR_KEY` (same key; each script may take up to 5
  minutes, the sending of newsletters about 4)
- **Command line:** `php /path/to/site/cron/savoffice-checks.php` (no key required)
- **Response:** `200` when every script answered well, `500` when at least one failed (the PHP error log names it), with
  the answer of each one:
  `{"ok": true, "utc": "2026-11-26 18:30", "jobs": {"savnewsletters-schedule": {"ok": true, "seconds": 2.1, "result": {…}}, "savnewsletters-reminders": {…}, "savtasks-reminders": {…}}}`

## SavNewsletters

(Called OpenNewsletter until 2026-11-26: `opennewsletter-schedule.php` and `opennewsletter-reminders.php` still exist and
run the same scripts with the same lock, so the jobs already set keep working; new jobs should use the new names.)

Both scripts read `savnewsletters/credentials.php`. They run **every 30 minutes** through `savoffice-checks.php` (or each
on its own, e.g. `0,30 * * * *`):
newsletters leave on 30-minute slots chosen in each group's timezone.

### savnewsletters-schedule.php

1. Proposals whose slot has passed without a publisher's approval become `expired` and go back to their author (email).
2. Approved newsletters whose slot has come start sending: recipients are fixed at that moment (active subscribers, of
   the newsletter's language if it has one).
3. The queue is sent from each group's own SMTP, at most 400 messages / 4 minutes per run and never more than the
   group's **emails per hour** (Settings → Outgoing address, default 200): larger lists continue at the next runs.
   Messages leave 0.15 s apart. A temporary refusal (4xx, e.g. "too many messages", or a connection problem) stops that
   newsletter for this run and the address is retried later, at the end of the queue; only permanent refusals (5xx)
   count as failed. After 3 days whatever is still queued is given up. When a newsletter is finished its author gets an
   email with the numbers. A lock file prevents two runs at once.

- **URL:** `https://www.illerom.eu/cron/savnewsletters-schedule.php?key=YOUR_KEY` (same key)
- **Command line:** `php /path/to/site/cron/savnewsletters-schedule.php` (no key required)
- **Response:**
  `{"ok": true, "expired": 0, "started": 1, "messages": {"sent": 120, "failed": 0, "deferred": 0, "finished": 1}, "utc": "2026-11-16 18:30"}`

### savnewsletters-reminders.php

When a newsletter waiting for approval is less than 24 hours from its proposed slot, its group's publishers, admins
and owner get one reminder email (at most one per proposal).

- **URL:** `https://www.illerom.eu/cron/savnewsletters-reminders.php?key=YOUR_KEY` (same key)
- **Command line:** `php /path/to/site/cron/savnewsletters-reminders.php` (no key required)
- **Response:** `{"ok": true, "reminded": 1}`

## SavTasks Reminders

`savtasks-reminders.php` sends the reminders of the tasks of SavTasks by email. It reads `savschedules/credentials.php`
(SavTasks uses the database, the accounts and the SMTP of SavSchedules). It runs **every 30 minutes** through
`savoffice-checks.php` (on its own, more often is fine too: every 5 or 15 minutes makes reminders arrive closer to
their time).

Every task not done whose reminder time has come gets one email at the first run after that time (with a run every 30
minutes, at most half an hour late); the reminders of one account that fall in the same run go together in one email.
A reminder more than 2 days old is not sent (the job did not run): it is only marked as gone. Nothing goes to accounts
that switched the emails off (SavTasks → Settings → Reminders), not confirmed or blocked. While SavTasks is open the
browser shows the reminder at its exact time anyway.

- **URL:** `https://www.illerom.eu/cron/savtasks-reminders.php?key=YOUR_KEY` (same key)
- **Command line:** `php /path/to/site/cron/savtasks-reminders.php` (no key required)
- **Response:** `{"ok": true, "accounts": 2, "sent": 2, "skipped": 0}`

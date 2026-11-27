# SavPodcasts

Free, open podcast player, part of **SavOffice**. Podcasts come from their own **public RSS feeds**, found in **open
catalogues** (fyyd.de, or Podcast Index with its free keys) or added by the address of the feed; never from the
directories of the big platforms. Follow podcasts, the new episodes in one list, a queue in your order, starred episodes
and history; the position follows you on every device. The same account as **SavSchedules**, **SavCalendar** and
**SavNotes**. <https://www.illerom.eu/savpodcasts/>

> **Not public yet.** It works at `/savpodcasts/` but it is listed nowhere and search engines are asked to stay away:
> see [Going public](#going-public).

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO), curl, DOM, SimpleXML; GD to make the artwork smaller (optional).
  **No credentials of its own**: it reads `../savschedules/credentials.php` (same database, same accounts, tables
  `sch_users`…). Its tables are next to them, `sch_pod_*`, created by the API at its first answer. An optional
  `credentials.php` adds the keys of Podcast Index and overrides some values (see `credentials-sample.php`).
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents from `../assets/sav/`; the player is
  its `<sav-audio>`.
- SavAccount sign-in: `../identity/`. The SavOffice button: `../assets/savoffice/savoffice.js`.

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top), and `img`, the artwork through the server |
| `lib/net.php` | Reading addresses of the Internet safely: only public addresses (checked at every redirect, curl pinned to them), size limits, many at once |
| `lib/feeds.php` | Reading a feed (RSS with itunes: and podcast:, Atom), keeping it, bringing it up to date; the clean-up of the notes (HTML); what the app receives |
| `lib/catalog.php` | Searching fyyd or Podcast Index, the popular podcasts, the cache of their answers |
| `assets/player.js` | The player: one `<sav-audio>` in the dock, moved into the big player; positions, queue, speed, sleep timer, lock screen |
| `assets/eps.js`, `shell.js` | An episode as a row, a podcast as a cover, their actions; the frame of the pages |
| `assets/home.js`, `discover.js`, `podcast.js`, `episode.js`, `library.js`, `queue.js` | The pages |
| `assets/account.js`, `hero.js`, `options.js`, `ui.js`, `i18n.js`, `icons.js` | First page and accounts, settings, helpers |
| `tools/refresh.php` | From cron: the followed feeds read again, then the clean-up |
| `sw.js` | Shell for installing the app (and the artwork): bump `CACHE` when the list of files changes |

## How it works

- **A feed is read once for everybody** (`pod_feeds`, `pod_episodes`): it is public. It is asked again when someone needs
  it and it is older than `refresh_minutes` (30), with `If-None-Match` / `If-Modified-Since`; a feed that keeps failing is
  asked less and less often. Permanent redirects and `itunes:new-feed-url` move the feed to its new address. Episodes that
  leave a feed are kept, so histories stay whole.
- **The audio is never copied**: it plays from the address of the publisher (CSP `media-src https: http:`). Publishers
  keep their download counts; the listener's device talks to their host, as with any podcast app (said in the privacy notice).
- **The artwork passes through the server** (`api/?r=img&w=…&u=…&s=…`): addresses signed with `pod_img_key` (meta), so only
  pictures the app named can be fetched; made at most 96/200/400/800 px wide as JPEG and kept in `cache/img/` (or the
  temporary folder). The pages load pictures only from the site (CSP `img-src 'self'`).
- **Notes of episodes** are cleaned on the server (`clean_html`: paragraphs, lists, bold, links; no pictures, no
  attributes but `href`) and once more in the browser. The times in them (12:34) play from there.
- **Positions**: sent every 15 seconds while playing, at every pause and when the page goes away (`pod.progress`); an
  episode played to the end is `done` and leaves the queue. "New" episodes of a podcast are the ones after the last time
  it was opened (`pod_subs.seen_at`).
- **Speed and skips**: the speed of the settings, or of a podcast (its menu → settings), changed also with the speed
  button of the player; a podcast may skip its first seconds and count as ended before the end.
- **OPML** in (`pod.import`: the feeds are followed at once and read by `pod.refresh` in the background) and out
  (`pod.export_opml`).
- **Limits**: 1000 podcasts followed, 500 in the queue; 90 searches and 60 new feeds every 10 minutes from one address.

## Install

1. Nothing to fill in when SavSchedules is installed. For Podcast Index: copy `credentials-sample.php` to
   `credentials.php` and add its keys (fyyd works without).
2. SavAccount: add `https://www.illerom.eu/savpodcasts/api/?r=auth.sav.callback` to the redirect addresses of the service
   of SavSchedules, or give SavPodcasts its own in `credentials.php`.
3. Cron, every 15 minutes: `php /path/to/savpodcasts/tools/refresh.php` (feeds stay fresh also without it, when people
   open them).
4. `cache/` must be writable by PHP (otherwise the temporary folder is used).

The session is shared through the lists `SHARED_APPS` / `SHARED_WITH` in the `lib/bootstrap.php` of SavSchedules,
SavCalendar, SavTasks, SavForms, SavWhiteboard and SavNotes, which include `savpodcasts`.

## Going public

Today SavPodcasts is complete but unlisted. To publish it:

1. `../assets/savoffice/savoffice.js`: add `['savpodcasts', 'SavPodcasts', 'Podcast', 'Podcasts']` to `APPS` (both lists).
2. `../savoffice/index.php`: add it to `$apps` (colour `#3b4b63`, screenshots), `$short`, the formats and what it works with.
3. `../data/projects.php` (its page on Illerom, screenshots in `../assets/projects/savpodcasts/`) and
   `../data/services.php` (`'savpodcasts' => ['app' => ['sch_', 'Podcast seguiti', 'Podcasts followed', ['savschedules', 'pod_schema_version', 'POD_SCHEMA_VERSION']]]`).
4. Remove the `noindex` from `index.php` (header and meta), `.htaccess`, `privacy.html` and `terms.html`.
5. Add `savpodcasts` to the `SHARED_APPS` of any app of the shared account made after it (e.g. SavSplits, SavMail).

## Not yet

Episodes kept on the device to listen offline, chapters and transcripts (`podcast:chapters`, `podcast:transcript`), an
Android app as the other apps of SavOffice.

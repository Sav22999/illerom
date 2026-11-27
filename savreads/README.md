# SavReads

Free, open **read-later app and feed reader**, part of **SavOffice**: an alternative to Pocket (closed in 2025) and
Instapaper. Save any article from its address, a bookmarklet or the share menu of the phone; the server reads the page
and keeps only the article (title, author, date, picture, clean text: no scripts, ads or trackers). Read it in a reader
of your own (font, size, line spacing, width, a light, sepia or dark page), with highlights and notes, tags,
favourites, archive and search in the whole text; where you stopped follows you on every device, offline too. Next to it,
the feeds of sites (RSS, Atom, JSON Feed) in folders, with unread counts and OPML. The same account as **SavSchedules**,
**SavCalendar**, **SavNotes**, **SavPodcasts** and the other apps of the shared account. <https://www.illerom.eu/savreads/>

## Stack

- PHP 8 (the shared `../identity/` needs it) and MySQL 5.7+ / MariaDB 10.3+ (PDO), curl, DOM, SimpleXML, mbstring; GD to
  make the pictures smaller (optional). **No credentials of its own**: it reads `../savschedules/credentials.php` (same
  database, same accounts, tables `sch_users`…). Its tables are next to them, `sch_rd_*` (`lib/schema.php`), created by the
  API at its first answer. An optional `credentials.php` overrides some values (see `credentials-sample.php`).
- **Reuses SavPodcasts** for the network and the small helpers of feeds: `../savpodcasts/lib/net.php` (only public
  addresses, checked at every redirect, curl pinned to them, size limits, many at once) and `../savpodcasts/lib/feeds.php`
  (`plain`, `safe_url`, `parse_date`, `url_hash`, `x_attr`…). Its parser of feeds keeps only items with sound, so the
  articles of feeds are parsed here (`rd_parse_feed`). SavReads names itself (`NET_AGENT`, defined before net.php).
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents (Tilt) from `../assets/sav/`.
- SavAccount sign-in: `../identity/`. The SavOffice button and offline answers: `../assets/savoffice/`.

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top), and `img`, the pictures through the server |
| `lib/extract.php` | The readable part of a page, in the manner of Readability: metadata (JSON-LD, Open Graph, meta), pruning, scoring of the candidates, the clean HTML (`rd_clean`) |
| `lib/feeds.php` | RSS 2.0, RSS 1.0/RDF, Atom and JSON Feed; finding the feed of a site; keeping feeds up to date; reading pages (many at once); signed picture addresses |
| `lib/schema.php` | The tables (`rd_profiles`, `rd_articles`, `rd_highlights`, `rd_feeds`, `rd_items`, `rd_subs`, `rd_states`) |
| `assets/list.js` | The lists of articles (to read, favourites, archive, tags, search), selection, the highlights page |
| `assets/reader.js` | The reader: look, progress, highlights and notes, the articles of feeds |
| `assets/feeds.js` | The articles of the feeds, of a folder or of one feed; managing the feeds |
| `assets/actions.js` | Saving (dialog, bookmarklet, share target), adding feeds, imports, the texts still to read, SavTasks and SavNotes |
| `assets/offline.js` | The newest articles to read kept on the device (with their pictures) |
| `assets/shell.js`, `account.js`, `options.js`, `hero.js`, `ui.js`, `i18n.js`, `icons.js` | The frame (as in SavDrive), first page and accounts, settings, helpers |
| `tools/refresh.php` | From cron: the feeds followed read again, the articles waiting for their text, the clean-up |
| `tools/make_icons.sh` | The PNG icons from `icons/favicon.svg` (headless Chrome) |
| `sw.js` | Shell for installing the app, offline answers of the API, the pictures of articles: bump `CACHE` when the list of files changes |

## How it works

- **Saving** (`rd.save`): the address is cleaned (no `utm_…`, `fbclid`…), and one page is one article (`article_hash`:
  http/https, `www.`, the final slash and the tracking words do not count). The server reads the page (`rd_fetch_page`)
  and `rd_extract` keeps the article; a page that cannot be read (a subscription, a site that refuses the server, a page
  built by scripts) is saved anyway and opens on its site. The server names itself honestly (`SavReads/1.0 …`): some
  sites refuse it.
- **Bookmarklet**: `javascript:` that opens `./?save=<address>&title=<title>` in a new tab (Settings › Saving). Any link
  of that form works, so other tools can save into SavReads too.
- **Share menu of the phone** (Web Share Target): `manifest.webmanifest` declares `share_target` (GET `./` with `title`,
  `text`, `url`); the app takes the address from `url`, or from inside `text` (Android often puts it there), saves it and
  opens it. An address that arrives before the sign-in waits for it (`sessionStorage savreads-save`).
- **Extraction** (`lib/extract.php`): JSON-LD (Article, NewsArticle, BlogPosting…), Open Graph and `<meta>` give title,
  author, date, picture, site and language; scripts, styles, frames, forms, navigation, footers, asides, hidden elements
  and blocks whose class or id say comments, sharing, related, newsletter, cookie, advertising… go; paragraphs score for
  their parents (length, commas; class and id add or take away; links lower the score), and the best candidate wins with
  the siblings that score well. A page that marks its text (`itemprop=articleBody`, one long `<article>`) is believed first.
  What is kept is written again from scratch (`rd_clean`): a small list of tags, no attribute but `href`, `src`, `alt` and
  a few of tables; pixels that count visits and SVG are dropped; lazy pictures (`data-src`, `srcset`) are resolved.
- **Pictures pass through the server** (`api/?r=img&w=…&u=…&s=…`), signed with `rd_img_key` (meta), made at most
  64/200/400/800/1400 px wide and kept in `cache/img/` (or the temporary folder); the pages load pictures only from the
  site (CSP `img-src 'self'`). The text of an article keeps the original addresses (for the `.savrea` export); they are
  signed when the article is served (`rd_proxy_html`).
- **The reader**: the look is kept in the account (`rd.prefs`) and applied as CSS variables; progress (0…1 of the text)
  is sent 1.5 s after scrolling stops and when the page is left (`rd.progress`), and restored on every device; "archive at
  the end" is a setting.
- **Highlights**: the words, 40 characters before and after them and where they start in the `textContent` of the
  article. They are found again at their place, or, if the page was read again and moved, where the same words have the
  most similar text around them (`locate` in `reader.js`); one that is gone stays in the panel, marked.
- **Search**: `LIKE` on title, author, site, address, tags, note, the whole text and the highlights (per account, so the
  numbers stay small; a FULLTEXT index can come later if libraries grow).
- **Offline**: `../assets/savoffice/offline-sw.js` keeps every answer of the API to a GET; `assets/offline.js` asks once,
  quietly, for the newest 30 articles to read (Settings › Offline) and their pictures, so they open without a connection.
  `rd.get` writes nothing, so the kept answer and the live one have the same address. Everything goes at sign-out.
- **Feeds**: read once for everybody (`rd_feeds`, `rd_items`, the newest 400 of each), again when older than
  `refresh_minutes` (30) with `If-None-Match` / `If-Modified-Since` (`rd.feeds.refresh`, every 15 minutes while the app
  is open, and `tools/refresh.php` from cron). The feed of a site is found from `<link rel="alternate">`, then the usual
  places (`/feed`, `/rss.xml`, `/atom.xml`…). Unread: an article after the `read_before` of the subscription (two weeks
  back when following), unless marked otherwise (`rd_states`); "mark all as read" moves `read_before` forward.
- **Imports** (`rd.import`): Pocket (its CSV of 2024–2025: `title,url,time_added,tags,status`; or the old HTML export with
  "Unread" and "Read Archive"), Instapaper (CSV: `URL,Title,Selection,Folder,Timestamp`; folders become tags, the
  selection a note), `.savrea`. The articles come in at once with what the file knows; their text is read afterwards, six
  at a time, while the app is open (`rd.fetch_pending`) and from cron.
- **`.savrea`** (`application/vnd.savreads.library+json`): `{format: "savrea", version: 1, app, exported, articles: [{url,
  title, author, site, lang, image, excerpt, content, words, published, added, read, archived, starred, progress, tags,
  note, highlights: [{quote, prefix, suffix, start, color, note, created}]}], feeds: [{url, title, folder}]}`. The text of
  an imported file is cleaned again (`rd_clean`). SavDrive knows the extension (`savdrive/lib/files.php`,
  `savdrive/assets/office.js`): "Open in SavReads" imports it.
- **Sister apps**: from the menu of an article, "Read it as a task in SavTasks" (`tasks.task.save` in its inbox, with the
  address and the time it takes) and "Notes in SavNotes" (`nb.create`: a notebook with the title, the address, the note and
  the highlights as typed text). Both call the API of that app from the browser (same site, same session, its own CSRF
  token from its `auth.me`).
- **Limits**: 20,000 articles, 2,000 highlights per article, 1,000 feeds per account; 150 pages and 60 new feeds every
  10 minutes from one address.

## Install

1. Nothing to fill in when SavSchedules is installed (the tables are created at the first answer).
2. SavAccount: add `https://www.illerom.eu/savreads/api/?r=auth.sav.callback` to the redirect addresses of the service
   of SavSchedules, or give SavReads its own service in `credentials.php`.
3. Cron, e.g. every 15 minutes: `php /path/to/savreads/tools/refresh.php`.
4. `cache/` must be writable by PHP (pictures), or the temporary folder is used.

## Next steps

- **Newsletters by email**: an address of one's own (e.g. `<random>@reads.illerom.eu`, a token kept in `rd_profiles`)
  whose incoming mail becomes articles. The mail server pipes each message to a script (`tools/inbox.php`, from the
  command line), which finds the account by the address, takes the HTML part of the message, cleans it with `rd_clean`
  (tracking pixels and links that count clicks dropped, the remote pictures through `img` as for articles) and inserts it
  as an article (`source = 'email'`, the sender as site). To be decided: the domain and its MX, a size limit, a way to
  renew the address when it leaks, and a folder ("Newsletters") or a tag for them.
- Text to speech of an article (the Web Speech API, no server needed).
- Highlights out as Markdown, and a public read-only link to a list.

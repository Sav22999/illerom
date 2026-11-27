# SavAwards

Independent reviews and yearly awards for European, free and open-source software and services.
Every product is tried by hand on **stated devices** and scored **from 0 to 10** on public criteria, with a note for each
score and a total (the mean of the applicable criteria). Every year, awards by category, a People's choice vote and
**certificates with a unique code** that anyone can verify at a public address.
<https://www.illerom.eu/savawards/> — **in English only** (the `*_it` columns of the database are kept but no longer used).

Two kinds of "best": by **technical vote** (the SavAwards score, hands-on, criterion by criterion) and by **community
vote** (members' reviews, and the community-vote award categories). Their certificates and badges share the drawing and
differ in colour: blue for the technical vote "by SavAwards", emerald for the community vote.

## Stack

- PHP 7.4+ and MySQL 5.7+ / MariaDB 10.3+ (PDO). Its own database tables (prefix `aw_`) and its own accounts, created
  by the API at its first request.
- No build step and no libraries: ES modules in `assets/`. Controls: SavComponents in the **Tilt** style, from
  `../assets/sav/`. Icons (Lucide) are registered locally (`assets/icons.js`): nothing is loaded from other sites,
  except the SavAccount button and page.
- SavAccount sign-in: `../identity/`. **No Google sign-in, by choice.**

| Path | What |
|------|------|
| `api/index.php` | JSON API (the actions are listed at its top) |
| `lib/bootstrap.php` | Configuration, sessions, roles, moderator scopes, audit log, rate limits |
| `lib/schema.php` | The tables, and the first criteria and categories |
| `lib/catalog.php` | Products, scores, alternatives, awards editions, certificates (what the API sends out) |
| `lib/certsvg.php` | The certificate (A4 landscape) and the badge, drawn as SVG in the Tilt style |
| `tools/certificate-proposals/` | The designs that were proposed for the certificate (`php make.php` redraws them); E is the one in use |
| `lib/mail.php` | Confirming the address, new password, outcome of edit requests and suggestions |
| `certificate.php` | Public certificate page and verification form (`c/<CODE>/<product>`) |
| `badge.php` | The badge winners can put on their site (`badge/<CODE>.svg`) |
| `feed.php` | RSS 2.0 and JSON Feed of the latest analyses and editions |
| `assets/app.js` | Router and frame |
| `assets/public.js` | Home, catalogue, product, comparison, alternatives, awards, methodology, independence |
| `assets/account.js` | Signing in, account page (favourites, reviews, requests, settings), suggestions |
| `assets/staff.js` | Staff area |
| `assets/i18n.js` | Italian and English |
| `tools/make_icons.sh` | PNG icons from `icons/favicon.svg` |
| `lib/seed/catalogue.json` | Starter catalogue: 119 European alternatives, imported as drafts from Staff → Products (“Import starter catalogue”), without scores, to be checked before publishing |

## Roles

| Role | `role` | Can |
|------|-------:|-----|
| Member | 1 | comment, save favourites, write their own review (0–10, one per product), mark reviews helpful, report reviews and comments, ask to change a product page, suggest new products, vote for People's choice |
| Moderator | 3 | + edit products and their scores, handle edit requests and reports, hide comments and reviews — for **all** products or only **the ones assigned** (`users.mod_all`, `aw_mod_scopes`) |
| Administrator | 5 | + add, publish and delete products; criteria and categories; members and moderators; awards editions, categories, nominees and winners; audit log |
| Master administrator | 10 | + administrators; **issue and revoke certificates** |

The addresses in `$master_emails` (credentials.php) become master administrators once confirmed. Publishing a product
(draft → published) is for administrators: moderators maintain what exists.

## Independence and legal notes

Shown on every product page (short), in the footer and in full at `#/independence`: no payments or affiliate links;
scores hold for the devices, versions and dates stated; opinions, not statements of fact, never meant to disparage;
limitation of liability; trademarks; corrections and right of reply (anyone, makers included, can propose a change);
member content; awards and certificates have no legal value. The certificate and its page carry the same notice.

## Products and scores

- Fields: name, category, short description and review, strengths, weaknesses, website, source code, licence (from a
  list of SPDX ids; a free one switches “open source” on), price (free, free plan, donations, paid), country chosen with
  its flag (the badge shows the area: European Union, EFTA, United Kingdom, rest of Europe, or the country), self-hosting,
  badges (renewable energy, end-to-end encryption, no ads, no tracking), platforms, "alternative to" (chosen in a
  dialog among the names already known, which makes the `#/alternatives/<name>` pages), logo (made small in the browser, checked on the server), **test devices** (one per line), version tested and
  test date.
- Criteria are edited by administrators; the first twelve: privacy, security, openness, European sovereignty, ease of
  use, features, performance, interoperability, accessibility, support, value, sustainability. A switched-off criterion
  no longer counts (scores are kept).
- Every score change goes into `aw_score_history`, shown on the product page; every staff action into `aw_audit`.
- Member ratings are shown apart and never change the SavAwards score.

## Awards and certificates

An edition per year: `draft` (staff only) → `nominees` (nominees shown on the edition page and on the home page as this year's contenders, no voting) → `voting` (nominees shown, members vote in People's choice categories until
`vote_until`) → `published` (winners shown). Each category is a jury award or People's choice, with nominees and places
1–3 and a motivation. The master administrator issues the certificates of the places of published editions:
code `SA-<year>-XXXX-XXXX` (8 random Crockford characters), a copy of what it says (product, award, score), a public
page that says whether it is valid or **revoked** (with date and reason), SVG download, print to PDF, and an embed
snippet for the badge. A certified place cannot be changed until its certificate is revoked.

## Install

1. Upload `savawards/` and copy `credentials-sample.php` as `credentials.php`: database, `$master_emails`, optional
   SavAccount service (redirect `https://www.illerom.eu/savawards/api/?r=auth.sav.callback`) and SMTP.
2. Open the app: the tables are created at the first request. Sign up with a master address and confirm it.
3. Apache needs `mod_rewrite` for the public addresses of certificates and badges (`.htaccess`); without it,
   `certificate.php?c=<CODE>` and `badge.php?c=<CODE>` work the same.

No cron jobs. Local tests read another credentials file through the `SAVAWARDS_CREDENTIALS` environment variable.

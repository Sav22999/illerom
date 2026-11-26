# illerom.eu

The portal of the open projects by Saverio Morelli: experiments, games and free alternatives to the usual services.
The bigger and more stable projects stay on [saveriomorelli.com](https://www.saveriomorelli.com/).

The portal is PHP 8 without database, sessions or cookies; no build step; nothing is loaded from other sites. The
projects live
in their own folders next to it, each with its README.

## Run it

    php -S localhost:8100 index.php

On the server Apache needs `mod_rewrite` (see `.htaccess`).

## Where things are

| Path                                | What                                                                                                                    |
|-------------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| `data/projects.php`                 | **The projects**: one entry each, with the Italian and English texts                                                    |
| `data/strings.php`                  | Every other text, in both languages                                                                                     |
| `data/site.php`                     | Addresses: repository, sources, contacts, the bigger projects                                                           |
| `index.php`                         | The only entry point: `/it/`, `/en/`, `/<lang>/projects/<slug>/`, `/<lang>/about/`, `/<lang>/typeface/`, `/<lang>/privacy/`, `/sitemap.xml` |
| `include/`, `pages/`                | Layout, project card and pages                                                                                          |
| `assets/style.css`, `assets/app.js` | Palette and layout; theme, search and filters                                                                           |
| `<slug>/`                           | The projects (Chess, FoodTrack…): independent of the portal                                                             |
| `api/status/`, `data/services.php`  | The public status API and what it checks; `/<lang>/status/` shows it                                                    |
| `identity/`                         | Google and SavAccount sign-in, and joining them to an account that already exists: shared by the projects with accounts |
| `cron/`                             | Daily clean-up and reminders of the projects                                                                            |
| `move/`, `assets/move.js`           | Arrival of who comes from saveriomorelli.com: copies once what a project had saved in the browser                       |
| `assets/sav/`                       | SavComponents 1.0.0 (Tilt style), a local copy                                                                          |
| `assets/projects/`                  | `<slug>.png` (icon) and `<slug>/1.jpg`… (screenshots)                                                                   |
| `tools/brand.sh`                    | Redraws the icons and the Open Graph banner                                                                             |
| `data/typeface.json`, `tools/typeface.py` | Illerom Bars: the letters as bars, and the script that builds `assets/fonts/illerom-bars.ttf` and `.woff`; `/<lang>/typeface/` shows it |

## Add a project

1. Add its entry in `data/projects.php` (the fields are explained at the top of the file).
2. Put its icon in `assets/projects/<slug>.png` (192 px) and its screenshots in `assets/projects/<slug>/`.

## Secrets (git-ignored)

`<slug>/credentials.php`, `<slug>/api/db.php` (samples next to them), `cron/credentials.php`, `.mail-config.php` (SMTP)
and
`.fcm-service-account.json` (push to the Android apps). Never commit them.

## From saveriomorelli.com

The projects were at `www.saveriomorelli.com/projects/<slug>/`, which sends here every page (see `projects/illerom.php`
there).
Use the address with www: `https://www.illerom.eu`.

## Levels

The three bars of the mark say how far along a project is: 1 in preparation, 2 in testing, 3 stable.

## Illerom Bars

The typeface of the mark: a graphic one, for the mark, lettering and decorations, not for text to be read (the site uses
Inter for that). Each letter is made either only of upright stems (at most 3, each
whole, only its top half or only its bottom half) or only of horizontal lines (at most 3: top, middle, bottom, all of
one length), drawn on an upright grid and then leaned. Some letters are the same on purpose, like i and l; the digits are drawn like letters (0 like o, 8 like x…). One
axis, `LEAN`: 0 upright, 100 leaned (the default). Capitals and small letters are the same. Punctuation and accents
have shapes of their own: the rules are for the letters only. Two families: Illerom Bars, proportional (narrow
letters close up, as in the mark), and Illerom Bars Mono, where every letter sits in a cell three columns wide.
`tools/typeface-proposals/` holds comparison images of possible changes to some letters (`make.py` redraws them).

To change a letter, edit `data/typeface.json` and run `python3 tools/typeface.py` (needs `pip install fonttools`): the
script refuses letters that break the rules.

## Licence

MIT © 2026 Saverio Morelli, Illerom Bars included. SavComponents is MIT; Stack Sans Notch and Inter are under the SIL Open Font License
(`assets/fonts/`).

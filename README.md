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
| `index.php`                         | The only entry point: `/it/`, `/en/`, `/<lang>/projects/<slug>/`, `/<lang>/about/`, `/<lang>/privacy/`, `/sitemap.xml`  |
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

## Licence

MIT © 2026 Saverio Morelli. SavComponents is MIT; Stack Sans Notch and Inter are under the SIL Open Font License
(`assets/fonts/`).

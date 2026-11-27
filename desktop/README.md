# SavOffice for Mac

One app, **SavOffice**, from which the apps of SavOffice are installed one by one (like JetBrains Toolbox). Each installed
app is an app of its own (SavDocuments.app… in `~/Applications/SavOffice`: its own icon in the Dock, in ⌘Tab and in
Launchpad), works without a connection and syncs when the network is back; one sign-in for all; the Toolbox keeps them up
to date.

## Make the DMG

    cd desktop
    npm install
    npm run dist        # → dist/SavOffice-arm64.dmg (Apple silicon) and dist/SavOffice-x64.dmg (Intel)

**Publish** a version: raise `version` in `package.json`, `npm run dist`, then a release on GitHub with both files, with
these exact names (the page `/savoffice/` links `releases/latest/download/SavOffice-<arch>.dmg`, `data/site.php`):

    gh release create desktop-v1.0.0 dist/SavOffice-arm64.dmg dist/SavOffice-x64.dmg --title "SavOffice for Mac 1.0.0" --notes "…"

The page shows the download only on a Mac (`savoffice/page.js`), Apple silicon or Intel from the graphics chip.

`npm start` opens it without packaging (it copies SavComponents and the icons first, `tools/prepare.js`).
`npm run dist` also writes `src/catalog.json` again from the data of the site (`tools/catalog.php`, needs `php`) and
redraws the pictures (`tools/brand.js`). The app is put together in the temporary folder of the system and only the DMG
comes back into `dist/`: in a folder kept by iCloud (Documents) the files get Finder attributes that `codesign` refuses.

### Signing: why macOS warns, and how it stops

`npm run dist` (`tools/dist.js`) looks in the keychain for a **Developer ID Application** certificate:

- **none**: the app is signed *ad hoc* (`tools/adhoc-sign.js`). macOS trusts it only where it was built and not
  downloaded: a DMG that comes from the web, or from iCloud Drive (Documents), carries `com.apple.quarantine` and macOS
  warns ("cannot verify", "insecure"); System Settings → Privacy & Security → **Open Anyway** once per installed copy.
- **found**: signed with it, with the hardened runtime (`tools/entitlements.mac.plist`: the JIT of Electron, camera,
  microphone) and, when the variables below are set, **notarized** by Apple: no warning on any Mac.

To get there: join the [Apple Developer Program](https://developer.apple.com/programs/) (99 USD a year); in Xcode →
Settings → Accounts → Manage Certificates → **+ Developer ID Application** (it lands in the keychain); then one of

    APPLE_ID=you@example.com APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=ABCDE12345 npm run dist
    APPLE_API_KEY=~/AuthKey_XXXX.p8 APPLE_API_KEY_ID=XXXX APPLE_API_ISSUER=<issuer uuid> npm run dist

(the app-specific password from appleid.apple.com; the Team ID from developer.apple.com → Membership). The apps of their
own that the Toolbox makes on each Mac (`bundles.js`) are signed again ad hoc there: made on that Mac, never downloaded,
macOS does not question them.

## How it works

| Path                     | What                                                                                                        |
|--------------------------|-------------------------------------------------------------------------------------------------------------|
| `src/main.js`, `env.js`  | The same code is the Toolbox or one app: `env.js` reads the key `SavOfficeApp` of the Info.plist; `HOME` is shared, each process has its own browser profile |
| `src/toolbox.js`         | The Toolbox: its window, menus, the Dock, `savoffice://`, updates, the account                              |
| `src/appmode.js`         | One app as an app of its own: its windows and menu; reads what the Toolbox installed; quits with its last window |
| `src/bundles.js`         | The apps of their own: a clone of SavOffice.app (APFS: no space used) renamed (Info.plist, helpers), its icon, signed ad hoc; opening them; whether one runs (`Profiles/<slug>/running.json`) |
| `src/session-sync.js`    | One sign-in for every process: the cookie `savoffice_auth` copied through `HOME/session.json` (0600)         |
| `src/store.js`           | The installed apps: install, version, look for updates, download aside, switch when the app is closed       |
| `src/serve.js`           | Every request of the windows: the files of an installed app from the disk, the rest from the network       |
| `src/common.js`          | Windows of the apps and where their links go (no footer of the site in them: `APP_CSS`), right-click menu, words of the menus |
| `src/shortcuts.js`       | With "separate" off (or while developing): little apps that open an app as a window of SavOffice            |
| `src/settings.js`        | Automatic updates, how often to check, separate apps, the language, the style (`HOME/settings.json`)       |
| `src/launcher/`          | The window of the Toolbox (SavComponents, Soft style unless another is chosen), through `src/preload.js`    |
| `src/app-preload.js`     | `window.SavOfficeDesktop` in the windows of the apps: the SavOffice button lists only the installed apps; the style of SavComponents chosen in the Toolbox (Soft, Tilt, Glass) as `sav-style-*` on `<html>`, changed at once (only on the Mac: the site stays as it is) |
| `src/catalog.json`       | The 19 apps: names, colours, words, what each does offline (written by `tools/catalog.php`)                 |
| `tools/`                 | `prepare.js`, `catalog.php`, `brand.js` (icons and DMG background), `adhoc-sign.js`, `dist.js`              |

- **Installing an app** downloads into `HOME/apps/<slug>/v-…/` (`~/Library/Application Support/SavOffice`) the files its `sw.js` lists in `SHELL`, `sw.js`
  itself, the scripts they import, what the page and the stylesheets point to (typefaces, pictures). The windows load the
  real addresses of illerom.eu; `serve.js` (`protocol.handle`) answers with the installed files, so the app is always the
  version installed, with or without a connection. Files that were not there are fetched once and kept.
- **Data and sync** are the apps' own, as in the browser: their service workers keep running (their requests pass through
  `serve.js` too), with the answers of the API kept for offline, the changes waiting for the network and everything deleted
  at sign-out. Every app has its own browser profile (Chromium allows one process per profile); the session of the suite
  (one account for all the apps, `../identity/suite.php`) is the same in all of them through `session-sync.js`: signed in
  or out anywhere — the Toolbox, an app — means everywhere.
- **Account in the Toolbox**: *Sign in with SavAccount* opens the **browser** (passkeys and Touch ID work only in the
  browsers Apple allows, never inside an Electron app): `…/savschedules/api/?r=auth.handoff&n=<nonce>` signs in there
  (SavAccount if needed) and opens `savoffice://signed-in?code=…&n=…`; the Toolbox checks the nonce it made and exchanges the
  code (one use, 3 minutes) at `auth.handoff.redeem` for a session of its own (`../identity/suite.php`). *Sign in with
  email* opens the sign-in page of an app in a small window; SavAccount clicked there opens in a window of its own, in a
  session where `serve.js` does not answer (SavAccount checks `Sec-Fetch-Site`). Sign out ends the session in every
  process and deletes what the apps kept for working offline, as on the web.
- **Version** of an app = a fingerprint of its `sw.js`, `assets/version.js` and its page (which stamps its styles and the
  shared scripts with `?v=<date>`). So: bump `CACHE` in `sw.js` when the files change and `VERSION` at a release, as the
  READMEs of the apps already say; a change to SavComponents or `assets/savoffice/` is seen through the page.
- **Updates**: found at the start, every `checkHours` and when the connection comes back. With automatic updates on, the
  new version is downloaded aside at once; a closed app switches immediately, an open one when it quits (never under the
  hands of whoever is working). Only the Toolbox switches versions; an open app reads the switch by itself (`appmode.js`). Off: the card shows **Update**; with the app open the Toolbox asks to update now
  (the window reloads) or when it is closed.
- **Other apps of the suite**: a link to an installed app opens that app (`open -b eu.illerom.savoffice.app.<slug>`; with an
  address, `--savoffice-url=`, given to an app already open through its single-instance lock); in the SavOffice button
  (`../assets/savoffice/savoffice.js`) the grid lists only the installed apps, and "All the apps" opens the Toolbox.
- **Tests**: `SAVOFFICE_USERDATA=<folder>` uses a separate `HOME` (a file `offline-test` in it cuts the network);
  `SAVOFFICE_ORIGIN=http://localhost:8100` uses the site run locally (`php -S localhost:8100 index.php` in the root); the
  apps made meanwhile keep both in their Info.plist. While developing, `electron . --savoffice-app=<slug>` runs one app.
  A packaged SavOffice must sit where macOS registers apps (`/Applications`, `~/Applications`) for `open -b` to find the
  apps it makes.

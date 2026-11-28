# SavOffice for Mac, Windows and Linux

One app, **SavOffice**, from which the apps of SavOffice are installed one by one (like JetBrains Toolbox). Each installed
app is an app of its own, with its own name and icon:
- **macOS**: SavDocuments.app… in `~/Applications/SavOffice`, in the Dock, ⌘Tab and Launchpad;
- **Windows**: a shortcut in Start › SavOffice, apart in the taskbar;
- **Linux**: an entry among the applications.

It works without a connection and syncs when the network is back; one sign-in for all; the Toolbox keeps them up to date.

| System | File | Installed with |
|---|---|---|
| macOS 12+, Apple silicon / Intel | `SavOffice-arm64.dmg` / `SavOffice-x64.dmg` (+ `.zip` for the updates) | drag to Applications |
| Windows 10/11, 64-bit | `SavOffice-Setup-x64.exe` | one click, for the user (no admin) |
| Debian, Ubuntu, Mint… | `SavOffice-x64.deb` | the package installer, or `sudo apt install ./SavOffice-x64.deb` |
| Fedora, openSUSE… | `SavOffice-x64.rpm` | the package installer, or `sudo dnf install ./SavOffice-x64.rpm` |

## Publish a version (GitHub Actions)

`.github/workflows/savoffice-desktop.yml` runs at every push that touches `desktop/` (and by hand: Actions › Run workflow):

1. **Build**: on macOS (`tools/dist.js`: DMGs and ZIPs, both Macs), Windows (NSIS `.exe`) and Linux (`.deb`, `.rpm`), with
   `electron-builder.config.js` (it adds Windows and Linux to the `build` of `package.json`: icons, the files each app
   opens from `src/filetypes.json`, the packages Electron needs).
2. **Install and test** on macOS, Windows, Debian 12, Ubuntu 24.04 and Fedora: each installs its file as a person would
   and runs `tools/smoke.js` (below). The results are on the page of the run, the pictures in its `smoke-<system>` artifacts.
3. **Release**: only on `main`, only when all is green, only when the version of `package.json` is **not published yet**
   (a version already published: tests only). It writes `latest-mac.json` (`tools/release.js --no-build --all`) and makes
   the GitHub release `<version>` with the 8 files. The notes are the commit message (or what is typed when run by hand).

So, to publish: raise `version` in `package.json` and push to `main`. The list is **signed** with the private key, which
GitHub keeps in the secret `SAVOFFICE_RELEASE_KEY` (the text of `~/.savoffice/release-key.pem`). Without the secret there
is no release, only the tests; with a key that is not the one of `src/update-key.pem`, `release.js` stops.
**Keep a copy of the private key somewhere safe**: without it no installed SavOffice accepts an update any more (they
would need to be installed again).

The page `/savoffice/` (`savoffice/page.js`, `data/site.php`) offers the file of the visitor's system from
`releases/latest/download/`:
- **Mac**: Apple silicon or Intel, from the graphics chip;
- **Windows**: the `.exe`;
- **Linux**: `.deb`, or `.rpm` when the browser names Fedora, openSUSE…;
- **phones and tablets**: nothing.

The installed apps read `releases/latest/download/latest-mac.json`.

### By hand (a Mac only)

    cd desktop
    npm install
    npm run dist        # → dist/SavOffice-arm64.dmg (Apple silicon) and dist/SavOffice-x64.dmg (Intel), and the ZIPs
    npm run release -- --notes "Cosa cambia" --notes-en "What changes"   # builds, then dist/latest-mac.json (Mac only)

The first `npm run release` on a computer without `~/.savoffice/release-key.pem` makes a new pair of keys. Do this only
for the very first release: every installed SavOffice trusts only the existing key.

`npm start` opens it without packaging (it copies SavComponents and the icons first, `tools/prepare.js`).
`npm run dist` also writes `src/catalog.json` again from the data of the site (`tools/catalog.php`, needs `php`) and
redraws the pictures (`tools/brand.js`: `.icns` on macOS, `.ico` and PNGs everywhere). The app is put together in the
temporary folder of the system and only the DMG comes back into `dist/`: in a folder kept by iCloud (Documents) the files
get Finder attributes that `codesign` refuses.

### Windows and Linux

Nothing is copied:
- **every app is SavOffice itself**, started with `--savoffice-app=<slug>` (`src/bundles-other.js`), in its own process
  and browser profile;
- **Windows**: the shortcut in Start › SavOffice has the AppUserModelID `eu.illerom.savoffice.app.<slug>`, which the app
  sets on itself too (`appmode.js`), so the taskbar shows it apart, with its icon. The installer registers the files of
  every app (`.savdoc`… with their icons, `.docx`, `.xlsx`, `.csv`…) for SavOffice, which hands each file to the right
  app (`toolbox.js`);
- **Linux**: `~/.local/share/applications/savoffice-<slug>.desktop` has the name, the icon, `StartupWMClass` (the name of
  its windows) and `MimeType` ("Open With"). Its own format gets a MIME type of its own (`~/.local/share/mime`), of which
  it is the default app.

Updating SavOffice itself:
- **Windows**: the installer is downloaded, checked and run silently when SavOffice quits;
- **Linux**: the package is offered, and the package manager installs it (it asks for the password).

The installer of Windows and the packages are not signed: Windows SmartScreen may warn the first time ("More info" ›
"Run anyway").

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
| `src/updater.js`         | SavOffice updates itself: signed list, download, checks, swap when it quits (see below)                    |
| `src/bundles.js`         | The apps of their own, by system: `bundles-mac.js` (a clone of SavOffice.app, APFS: no space used, renamed in Info.plist and helpers, its icon, signed ad hoc) or `bundles-other.js` (Windows shortcut, Linux `.desktop`); opening them; whether one runs (`Profiles/<slug>/running.json`) |
| `src/session-sync.js`    | One sign-in for every process: the cookie `savoffice_auth` copied through `HOME/session.json` (0600)         |
| `src/store.js`           | The installed apps: install, version, look for updates, download aside, switch when the app is closed       |
| `src/serve.js`           | Every request of the windows: the files of an installed app from the disk, the rest from the network       |
| `src/common.js`          | Windows of the apps and where their links go (no footer of the site in them: `APP_CSS`), right-click menu, words of the menus |
| `src/shortcuts.js`       | With "separate" off (or while developing): little apps that open an app as a window of SavOffice            |
| `src/settings.js`        | Automatic updates, how often to check, separate apps, the language, the style (`HOME/settings.json`)       |
| `src/launcher/`          | The window of the Toolbox (SavComponents, Soft style unless another is chosen), through `src/preload.js`    |
| `src/app-preload.js`     | `window.SavOfficeDesktop` in the windows of the apps: the SavOffice button lists only the installed apps; the style of SavComponents chosen in the Toolbox (Soft, Tilt, Glass) as `sav-style-*` on `<html>`, changed at once (only on the Mac: the site stays as it is) |
| `src/catalog.json`       | The 19 apps: names, colours, words, what each does offline (written by `tools/catalog.php`)                 |
| `tools/`                 | `prepare.js` (also `src/filetypes.json`), `catalog.php`, `brand.js` (icons and DMG background), `adhoc-sign.js`, `dist.js`, `release.js`, `smoke.js` |
| `electron-builder.config.js` | The build for every system: `package.json` (macOS) plus Windows (NSIS) and Linux (deb, rpm), with the file associations |

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
- **Files of the Mac** ("Open With"): each app of its own declares in its Info.plist the files of the `file_handlers` of its
  manifest (`bundles.js`, read from the installed manifest by `toolbox.js`, made again when they change). Its own format
  (`.sav` + three letters: `.savdoc`, `.savspr`…) it **owns**: exported type `eu.illerom.savoffice.<ext>`, a double click
  opens it there, the file shows its icon. The common ones (`.docx`, `.xlsx`, `.csv`, `.ics`, `.vcf`…) it only **offers**
  (`LSHandlerRank` Alternate): the double click stays with the app chosen on the Mac. macOS gives the file to the app
  (`open-file`, `appmode.js`, also before the start), which hands it to the page through `window.launchQueue`
  (`app-preload.js` replaces the one of Chromium, which never gets these files): the apps already open files that way.
  The file is opened (imported); saving goes through the app (Download, SavDrive), not back into the same file.
- **SavOffice itself** (`updater.js`): Squirrel.Mac would want a Developer ID, so the update is done here. At the start and
  every `checkHours` it reads `latest-mac.json`, refuses it unless its Ed25519 signature matches `src/update-key.pem`,
  downloads the ZIP of this Mac into `HOME/updates`, checks size and SHA-256, unpacks it with `ditto` and checks it is
  `eu.illerom.savoffice` of that version. Installed with *Update and restart*, or by itself when SavOffice quits (automatic
  updates on): the apps of their own quit, a small script waits for SavOffice to quit, swaps the bundle (putting the old one
  back if anything fails) and, after *Update and restart*, opens it again. The new SavOffice makes the apps of their own
  again, once (`bundles.js`: the stamp is the version and the date of `app.asar`). `bundles.js` and `updater.js` use
  `original-fs`: the `fs` of Electron takes every `app.asar` for a folder, gives it a made-up date and cannot delete it.
- **Tests**: `SAVOFFICE_USERDATA=<folder>` uses a separate `HOME` (a file `offline-test` in it cuts the network; the apps it makes go to `~/Applications/SavOffice-test` with identifiers of their own);
  `SAVOFFICE_ORIGIN=http://localhost:8100` uses the site run locally (`php -S localhost:8100 index.php` in the root); the
  apps made meanwhile keep both in their Info.plist. While developing, `electron . --savoffice-app=<slug>` runs one app.
  A packaged SavOffice must sit where macOS registers apps (`/Applications`, `~/Applications`) for `open -b` to find the
  apps it makes.
- **Automatic test** (`tools/smoke.js`, run by GitHub Actions on every system):

      node tools/smoke.js --exe <installed SavOffice> [--out smoke-out]
      node tools/smoke.js --exe node_modules/electron/dist/Electron.app/Contents/MacOS/Electron --app .   # while developing

  It runs SavOffice in a test `HOME`, drives it through the DevTools protocol and goes through 8 steps:
  1. the Toolbox opens;
  2. it installs SavDocuments;
  3. its entry exists;
  4. it opens as an app of its own, from the installed files, without the footer of the site;
  5. the Toolbox sees it open;
  6. it works offline;
  7. the style changes;
  8. it closes and the Toolbox sees it.

  It writes `summary.md`, `results.json` and a picture of every step.
  `SAVOFFICE_CI=1` (with a test `HOME`) also gives each app a DevTools port (9400 + its place in the catalog) and the
  switches that containers need.

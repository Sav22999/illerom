# SavPhotos

The photos and videos of SavDrive, day by day: the backup of a phone or a computer, a viewer on the whole screen, albums
and links to share them. Part of SavOffice, inside SavDrive. <https://www.illerom.eu/savphotos/>

**Being tried:** SavPhotos is complete but not public yet. It is not in the list of the apps of SavOffice, search engines
are told to leave it out (`noindex`), and only the master admins and the accounts turned on in its admin panel can use
it. See [Opening it to everybody](#opening-it-to-everybody).

## How it is made

SavPhotos has no accounts, files, space or database of its own: they are the ones of SavDrive.

- **Pages**: this folder (`index.php`, `assets/`). No build step and no libraries: ES modules. Controls: SavComponents from
  `../assets/sav/`. The grid of the apps and ⌘J: `../assets/savoffice/savoffice.js`.
- **API**: the one of SavDrive, `../savdrive/api/?r=photos.*`, written in `../savdrive/lib/photos.php` (the list of the
  routes is at the top of `photos_route`). Uploads, stars, trash, downloads and file details are the routes of SavDrive
  (`upload.*`, `node.star`, `node.trash`, `file.get`). The session is the cookie of SavDrive (same site, path
  `/savdrive/`): every request goes to `../savdrive/api/`, so it travels with it.
- **Signing in** happens in SavDrive: SavPhotos sends the person to `../savdrive/#/signin` with `sessionStorage`
  `savdrive-next = ../savphotos/…`, and SavDrive sends them back after the sign-in (also with SavAccount). Nothing to add to
  SavAccount.
- **Tables** (prefix of SavDrive, created by `photos_schema()` the first time: meta `photos_schema`): `photo_users` (who can
  use it, settings, last visit), `photo_meta` (what was read from each file: date taken, size, length, place, camera, the
  SHA-256 sent by the browser), `albums`, `album_items`. All of them go with the account (foreign keys), and a file
  deleted for ever takes its rows with it.

| Path                  | What                                                                                          |
|-----------------------|-----------------------------------------------------------------------------------------------|
| `assets/app.js`       | Start and addresses (`#/`, `#/favorites`, `#/videos`, `#/search/<q>`, `#/albums`, `#/album/<id>`, `#/pick/<id>`, `#/a/<token>`, `#/settings`, `#/admin`) |
| `assets/account.js`   | The account of SavDrive, settings, the frame (the one of SavDrive: header with the search, side menu with New and the space), the pages of who cannot use it yet |
| `assets/library.js`   | The photos by day, a page at a time: jump to a month, sizes, choosing many, actions, drop to upload |
| `assets/grid.js`      | The grid of a day and the choosing (circle, Ctrl/⌘, Shift, long press, a whole day)             |
| `assets/band.js`      | The rectangle that chooses many (photos and albums), as in SavDrive                           |
| `assets/viewer.js`    | The viewer (the preview of SavDrive, a dialog): arrows, keys, swipes, zoom, details, actions; Back closes it |
| `assets/albums.js`    | Albums, adding to one, the link, the page of an album shared with a link                      |
| `assets/upload.js`    | The backup: what is already there, date taken, small pictures made in the browser, the panel  |
| `assets/admin.js`     | The panel of the master admins                                                                |
| `assets/options.js`   | Settings                                                                                      |

## How it works

- **Look**: the one of SavDrive, on purpose: the same header with the search (by name), the side menu with **New**
  (upload photos and videos, a folder, a new album) and the space, the header of a folder (what is chosen takes its place),
  the cards (albums), the preview (the viewer), the panel of the uploads and the settings; on phones the same rows of
  SavDrive. Only the primary colour (amber) and the grid of the photos by day are its own.

- **Which photos**: the files of SavDrive of the account whose type is `image/*` (not SVG) or `video/*`, not in the trash;
  or, as a setting, only those inside My drive › SavPhotos. Shared folders of other people are not shown.
- **Date taken**: the first time a photo is listed, the server reads it (`photos_scan`, a few seconds at a time; the app
  shows "Reading the date taken…" and asks again): EXIF of pictures (date with seconds, size turned as EXIF says, camera,
  GPS), the `mvhd`/`tkhd` boxes of MP4/MOV (date of the recording, length, size). When it uploads, the browser also reads
  EXIF of JPEG and the boxes of MP4/MOV, otherwise the date of the file on the device. Order: EXIF › read by the browser ›
  recording of the video › date of the file › when it arrived in SavDrive. A file whose content changes is read again.
- **Backup**: files go into My drive › SavPhotos › `<year taken>` (made when missing), two at a time, in pieces (the
  uploads of SavDrive). Before sending, `photos.check` says which are already there: the same SHA-256 (files up to 64 MB:
  the browser reads them whole) or a photo or video with the same name and size anywhere in the drive. So choosing the whole
  camera roll again sends only what is new.
- **A folder becomes an album**: New › A folder (computers) or a folder dropped on the page: its photos and videos (also
  those in its subfolders and those already in the drive, which `photos.check` names) go into an album with the name of
  the folder (`photos.album.create` with `reuse`: uploading the folder again fills the same album). Every other file is
  skipped; the panel and the message at the end say how many, and which. Files dropped on an album go into that album. The screen stays on (Wake Lock) and leaving the page asks first. A web page
  cannot back up by itself in the background: the person opens SavPhotos and chooses the photos.
- **Small pictures**: `<bkey>.t.jpg` next to the file, as the cards of SavDrive. The browser makes one for each upload
  (480 px, also for HEIC in Safari and for videos) and sends it to `photos.thumbset` (a JPEG, checked and drawn again by GD);
  otherwise GD makes it the first time it is asked (`thumb_path` of SavDrive). A video without one gets it the first time it
  is opened in the viewer.
- **Choosing many**, as in SavDrive: press and drag with the mouse (also starting on a photo) draws a rectangle that
  chooses what it touches (Ctrl/⌘ or Shift adds; the page scrolls near the edges); also the circle of a photo, Ctrl/⌘,
  Shift, a whole day, a long press or Select on phones.
- **Managing albums**: ⋮ and the right click on a card, and ⋮ on the page of an album: add photos, the link, rename,
  delete (the photos stay). Albums are chosen many at a time like the photos (the box of a card, Ctrl/⌘, Shift, the
  rectangle, Ctrl/⌘+A): the bar then renames or shares one, or deletes all those chosen.
- **Never too many requests** (the hosting answers "429" to an address that asks a lot in a short time, as to an attack):
  every request goes through a pacer (`assets/store.js`: at most 2 at once, 0.35 s apart, 100 a minute; `MAX`, `GAP`,
  `PER_MINUTE`), the API and the uploads before the small pictures. A photo up to `oneShot` bytes (`photos.me`: what PHP
  takes, at most 15 MB) travels in **one** request (`photos.upload`: file, data and small picture); bigger ones in pieces.
  The small pictures of the grid come 40 at a time (`photos.thumbs`) and stay in the browser (Cache Storage
  `savphotos-thumbs`, emptied at sign-out). A 429 that still comes stops everything for a while and goes on by itself
  (the panel of the backup counts the seconds).
- **Favourites** are the stars of SavDrive; **the trash** is the one of SavDrive (30 days, then for ever).
- **Albums**: a photo can be in many; deleting an album leaves its photos where they are. **The link of an album**
  (`#/a/<token>`, `photos.pub.*`) shows its photos to anyone, without an account, while the owner can use SavDrive and
  SavPhotos; turning SavPhotos off for the owner turns the link off too.
- **Who can use it**: the master admins always; the others as the admins choose in `#/admin/users` (on, off, or as the
  default), and the default (`#/admin/settings`, meta `photos_default`, **off** at the start). The account must also be
  activated in SavDrive. An account that gets SavPhotos is told by email (when the email of SavDrive is set up).
- **Space**: photos are files of SavDrive and count in the one space of SavOffice.

## Opening it to everybody

1. In `#/admin/settings` choose **On for everybody** (or turn on the accounts one by one in `#/admin/users`).
2. Add `['savphotos', 'SavPhotos', 'Foto e video', 'Photos and videos']` to both lists `APPS` of
   `../assets/savoffice/savoffice.js` (the grid of the apps and ⌘J), in alphabetical order (after SavNotes).
3. Add SavPhotos to the page of SavOffice (`../savoffice/index.php`: the lists of the apps, the short names, the files, the
   hub) and to the portfolio (`../data/projects.php`, with `assets/projects/savphotos.png` and the screenshots).
4. Remove `noindex`: the header and the `<meta name="robots">` of `index.php`, the `X-Robots-Tag` of `.htaccess`, the
   `<meta name="robots">` of `privacy.html` and `terms.html`.
5. In SavDrive, "Open in SavPhotos" for pictures can then be added to the menu of a file (not there while it is tried).

## Versions

`assets/version.js` (`VERSION`, `CHANGES`); bump `CACHE` in `sw.js` when the list of files changes. Icons: `icons/favicon.svg`,
then `tools/make_icons.sh` (Chrome) draws the PNG.

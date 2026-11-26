# Store graphics of the Sav apps

What Google Play (and any other store) needs for SavDocuments, SavPresentations and SavSchedules, in the layout of fastlane:
`<app>/store/<en-US|it-IT>/` holds `title.txt`, `short_description.txt` and `full_description.txt`; the pictures are in
English only, in `<app>/store/en-US/images/`: `phoneScreenshots/1…n.png` (1080 × 1920, the last one says who made the app),
`featureGraphic.png` (1024 × 500) and `icon.png` (512 × 512).

1. **Phone screenshots** of the real apps: `capture.mjs` drives Chrome headless (DevTools protocol, no dependencies) on a
   phone of 412 × 915 at 2.625×. It signs in, so run it on a **local copy with sample data**, never on the real site:
   `node tools/store/capture.mjs http://localhost:8790 <raw dir> <shots.json>` (each shot: app, lang, name, path, login,
   setup — JavaScript run in the page before the picture, e.g. to open a dialog).
2. **Store pictures**: `node tools/store/compose.mjs http://localhost:8790 <raw dir>` draws `frame.html` (a generic phone
   without notch, brush stroke, icon, title) with the texts and colours of `store.json`.

`saverio.png` is the photo of the last picture. Fonts: Bebas Neue (`savpresentations/fonts`), Inter, Stack Sans Notch and
the Illerom wordmark (`assets/fonts`). Chrome: `/Applications/Google Chrome.app`, or the path in `$CHROME`.

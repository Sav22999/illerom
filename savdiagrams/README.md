# SavDiagrams

Free, open diagrams on a page without edges: flowcharts, org charts, mind maps and simple schemes. Part of
[SavOffice](../savoffice/), at `/savdiagrams/`. Italian and English.

- **Shapes** — rectangle, rounded rectangle, diamond, ellipse, parallelogram, cylinder, document, note, person, cloud,
  and free text. Text inside every shape (font, size, bold, italic, colour, horizontal and vertical alignment), fill,
  border colour, width and dash. From the library: press a shape and click (or drag a size) on the page, or drag it
  straight out of the library.
- **Connectors** — straight, elbow or curved, attached to a node (one of its four sides, or "the nearest") or to a free
  point; they follow the shapes when they move. Heads at both ends (none, arrow, open arrow, diamond, dot, bar), labels,
  colour, width, dash, swap direction. Drawn with the connector tool, or from the four dots around a shape: dropped on
  another shape they connect, dropped on empty space they make a copy of the shape there, already connected.
- **Arranging** — grid and snap (Alt to place freely), alignment guides with the other shapes, align and distribute,
  groups, order (front, forward, backward, back), locking.
- **Trees** — automatic layout downwards (org chart), to the right, or both sides (mind map). Tab adds a child,
  ⌘/Ctrl+Enter a sibling.
- **Moving around** — zoom, pan (space, middle button, hand, wheel), minimap, show everything, full screen.
  Touch and stylus: one finger on empty space moves the page, two fingers pinch to zoom, double tap edits the text,
  long press opens the menu. On phones and tablets the home and the settings have a bottom bar (Diagrams,
  Templates, Trash, Settings) as in SavTasks; the editor has none, its tools float as in SavWhiteboard.
- **Editing** — undo/redo (300 steps), copy/cut/paste (also between tabs; plain text pasted becomes one shape per line,
  connected), duplicate, keyboard shortcuts (listed in the ⋮ menu), typing on a selected shape starts writing in it.
- **Templates** — blank, flowchart, org chart, mind map, process, network.
- **Files** — `.savdia` (the format of SavDiagrams), PNG, SVG (fonts embedded), PDF; diagrams.net / draw.io files
  (`.drawio`, `.xml`, compressed or not) open as new diagrams or are inserted into one.

## With the other apps

- **SavDrive** — `.savdia` files are created in the drive ("New → Diagram") and open here (`?savdrive=<id>`, read by
  `../assets/savoffice/savoffice.js`); the cloud next to the apps button saves the open diagram back into the drive.
  The diagrams are listed in My drive (folder of the app) with their small picture, and count in the one space of
  SavOffice.
- **SavWhiteboard → SavDiagrams** ("from the sketch to the diagram", `assets/sketch.js`) — the ⋮ menu of a board has
  "Turn into a diagram", which opens `#/from-board/<id>` here; the home and the ⋮ menu of the editor also pick a board,
  and a `.savwhi` file opens too. Shapes become nodes, texts inside a shape its text, notes become notes, arrows and
  lines become connectors attached to the shapes they touch; hand-drawn strokes are recognised (closed: rectangle,
  ellipse or diamond; open between two shapes: a connector).
- **SavDocuments and SavPresentations** — "Insert → Diagram (SavDiagrams)" in SavDocuments (Elements panel and the
  insert menu) and a "SavDiagrams" tab in the picture picker of SavPresentations. Both import `assets/embed.js`, which
  lists the diagrams of the account and returns a PNG drawn by the same renderer; the picture is then kept by that app.

## How it is made

Same structure as SavWhiteboard, whose account, session, saving and offline model it follows.

| | |
|---|---|
| `index.php` | the page (CSP, SavComponents, the SavOffice button, SavAccount) |
| `api/index.php` | JSON API: the accounts of SavSchedules (`auth.*`) and `dg.init`, `dg.prefs`, `dg.get`, `dg.create`, `dg.save`, `dg.duplicate`, `dg.trash`, `dg.restore`, `dg.delete`, `dg.empty_trash` |
| `lib/bootstrap.php` | database, session (cookie shared with SavSchedules, SavCalendar, SavWhiteboard…), helpers |
| `lib/diagrams.php` | what a diagram may contain (the same list as `assets/model.js`), saving by changes |
| `lib/schema.php` | tables `sch_dg_profiles`, `sch_dg_diagrams`, created by the API the first time |
| `assets/editor.js` | the editor |
| `assets/shapes.js` | geometry and SVG of shapes and connectors (routes, heads, labels, hit tests) |
| `assets/layout.js` | automatic layout of trees |
| `assets/model.js` | items, styles, templates |
| `assets/files.js` | `.savdia`, PNG, SVG, PDF, thumbnails |
| `assets/drawio.js`, `assets/sketch.js` | import of diagrams.net files and of SavWhiteboard boards |
| `assets/embed.js` | the picker used by SavDocuments and SavPresentations |

A diagram is `{title, settings: {bg, grid, gs, snap, view}, items}`; items are `node` (`k`, `x y w h`, text and style)
and `edge` (`a`, `b`: `{n, p}` or `{x, y}`, `r` route, heads, label and style), both with optional `g` (group) and
`lk` (locked). Saving sends only what changed (`put`, `del`, `order`); two tabs can save the same diagram.

No database of its own: it uses the one of SavSchedules (`../savschedules/credentials.php`, or the path in
`SAVSCHEDULES_CREDENTIALS`). An optional `credentials.php` (see `credentials-sample.php`) can give it its own
SavAccount service. The trash is emptied after 30 days by `../cron/cleanup.php`. The icons come from
`icons/favicon.svg` (`tools/make_icons.sh`).

## Next steps

- An Android app, as SavWhiteboard has (`android/`): not made yet.
- Export to `.drawio` (only import exists), and from draw.io: images, tables, waypoints of connectors and custom stencils
  become plain rectangles or straight routes.
- Waypoints set by hand on connectors, rotation of shapes, more shape libraries (UML, BPMN, network icons).
- Collaboration in real time (several people on the same diagram at once): today, as in SavWhiteboard, two windows can
  save the same diagram and each item keeps the last version that arrived; sharing with other accounts is not there yet.
- A diagram inserted into SavDocuments or SavPresentations is a picture: a link back to update it in place would be the
  next step.

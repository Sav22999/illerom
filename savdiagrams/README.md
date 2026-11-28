# SavDiagrams

Free, open diagrams on a page without edges: flowcharts, org charts, mind maps and simple schemes. Part of
[SavOffice](../savoffice/), at `/savdiagrams/`. Italian and English.

- **Shapes** — rectangle, rounded rectangle, diamond, ellipse, parallelogram, cylinder, document, note, person, cloud,
  and free text, plus the libraries of the kinds of diagram below. Text inside every shape (font, size, bold, italic, colour, horizontal and vertical alignment), fill,
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
- **Libraries** — the library (Shapes in the dock) has a search (by name, in Italian and English) and a section for every
  kind of diagram, folded but for the basic shapes and the ones the diagram already uses. A shape is pressed (then placed
  with a click or a drag) or dragged onto the page; a connector style (a UML relation, an ER cardinality, a BPMN flow) is
  pressed and the next connectors are drawn with it. "Kind of connector" in the panel of a connector gives it one of them.
  - *Network*: Internet, router, switch, server, firewall, computer, laptop, phone, printer, Wi-Fi access point,
    database, network zone; cable and wireless link.
  - *UML classes*: class, interface, enumeration (name, attributes and methods in parts divided by a line `--`; the shape
    grows with its text), package, comment; association, directed association, inheritance, realisation, dependency,
    aggregation, composition (hollow triangle and diamond, filled diamond).
  - *UML use cases, sequence, activity, states, components*: actor, use case, system boundary, include / extend;
    lifeline (messages are attached at any height of it and keep it), activation, fragment (loop, alt, opt), message,
    asynchronous message, reply; start, end, action, decision, fork / join, vertical lane; state, choice, transition;
    component, node, artifact, provided interface.
  - *Org chart*: person card (name in bold, role under it, the initials or a photo, kept small inside the diagram),
    department, team area, reporting line. The automatic layout downwards places them as an org chart.
  - *Timeline*: lane with its name, time axis (one label per line of its text), milestone, interval, dependency: lanes
    stacked on a common axis make a parallel timeline.
  - *Database (ER)*: table (name on its band, then the columns, `PK` / `FK` in front), Chen entity, relationship and
    attribute; one to one, one to many, one to zero or many, one to zero or one (crow's feet).
  - *BPMN and swimlanes*: task, sub-process, start / intermediate / end event, exclusive / parallel / inclusive gateway,
    data object, data store, pool and lane; sequence flow, message flow, association; horizontal and vertical lanes.
  - *Business canvases*: block with a title (first line in bold, the others under it), sticky note, title.
  - *Customer journey and user story map*: stage (arrow), row of the journey, step with a title, touchpoint, happy /
    neutral / sad face, line of the feelings; activity, step, user story, release line.
  - *Wireframes*: browser window and phone screen (containers), navigation bar, heading, text lines, picture, button,
    text field, drop-down list, checkbox, switch, avatar, card.
  - *Data flows (DFD)*: process, external entity, data store (its code, `D1`, in the narrow part), data flow.
  - *C4 model*: person, software system, external system, container, database container, component, boundary,
    relationship.
  - *Cloud architecture* (generic icons, no brand): CDN, load balancer, API gateway, virtual machine, function, message
    queue, file storage (bucket), database, private network and region.
  - *Electric and electronic*: resistor, capacitor, inductor, battery, switch, lamp, diode, LED, ground, junction, wire
    (the leads are at the middle of the left and right sides, where the wires attach).
  - *Floor plan*: room (a container), wall, door (it opens the wall under it), window, bed, sofa, table with chairs,
    table, stairs.

  Containers (lanes, pools, zones, system boundaries, frames, packages, nodes, lifelines) take along what lies inside
  them when they move, and a new one goes behind what it covers. The name of an icon is under it, and a connector that
  leaves from below starts under the name.
- **Templates** — blank, flowchart, org chart, mind map, network diagram, UML class diagram, UML sequence, UML use cases,
  UML activity, UML states, UML components, cloud architecture, C4 system context, data flow (DFD), database (ER), BPMN
  process, swimlanes, customer journey, user story map, Business Model Canvas, Lean Canvas, wireframe, parallel timeline,
  electric circuit, floor plan, process, timeline, SWOT analysis, decision tree. (Gantt charts and kanban boards are in
  SavTasks, not here.)
- **Files** — `.savdia` (the format of SavDiagrams), PNG, SVG (fonts embedded), PDF; diagrams.net / draw.io files
  (`.drawio`, `.xml`, compressed or not) open as new diagrams or are inserted into one; their UML classes, lifelines and
  messages, BPMN events and gateways, swimlanes, network, cloud (AWS / Azure / GCP icons by what they are), C4,
  electrical, floor plan and mock-up stencils, and UML / ER heads become the shapes of the libraries.

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
| `assets/model.js` | items, styles, the libraries of shapes (`LIBRARIES`, `PRESETS`), templates |
| `assets/files.js` | `.savdia`, PNG, SVG, PDF, thumbnails |
| `assets/drawio.js`, `assets/sketch.js` | import of diagrams.net files and of SavWhiteboard boards |
| `assets/embed.js` | the picker used by SavDocuments and SavPresentations |

A diagram is `{title, settings: {bg, grid, gs, snap, view}, items}`; items are `node` (`k`, `x y w h`, text and style,
`img` the photo of a card) and `edge` (`a`, `b`: `{n, p, o}` or `{x, y}`, where `o` is the place along the side, 0…1;
`r` route, heads, label and style), both with optional `g` (group) and
`lk` (locked). Saving sends only what changed (`put`, `del`, `order`); two tabs can save the same diagram.

No database of its own: it uses the one of SavSchedules (`../savschedules/credentials.php`, or the path in
`SAVSCHEDULES_CREDENTIALS`). An optional `credentials.php` (see `credentials-sample.php`) can give it its own
SavAccount service. The trash is emptied after 30 days by `../cron/cleanup.php`. The icons come from
`icons/favicon.svg` (`tools/make_icons.sh`).

## Next steps

- An Android app, as SavWhiteboard has (`android/`): not made yet.
- Export to `.drawio` (only import exists), and from draw.io: images, tables, waypoints of connectors and custom stencils
  become plain rectangles or straight routes.
- Waypoints set by hand on connectors, rotation of shapes; tables of draw.io (`shape=table`) still come in as rectangles.
- Collaboration in real time (several people on the same diagram at once): today, as in SavWhiteboard, two windows can
  save the same diagram and each item keeps the last version that arrived; sharing with other accounts is not there yet.
- A diagram inserted into SavDocuments or SavPresentations is a picture: a link back to update it in place would be the
  next step.

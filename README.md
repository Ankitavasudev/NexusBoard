<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:05070D,50:241C4D,100:8B7DFF&height=170&section=header&text=NexusBoard&fontSize=48&fontColor=E9F0F7&fontAlignY=40&desc=Sketch%20it.%20Shape%20it.%20Ship%20it.&descAlignY=60&descSize=16" width="100%" alt="NexusBoard" />

**A whiteboard that opens in a tab — pen, shapes, text, eraser, undo, PNG export.**

<br />

<a href="https://ankitavasudev.github.io/NexusBoard/"><img src="https://img.shields.io/badge/%E2%96%B6%20LIVE%20DEMO-8B7DFF?style=for-the-badge&logoColor=white" alt="Live demo" /></a>
&nbsp;
<img src="https://img.shields.io/badge/tests-29%20passing-3FB950?style=for-the-badge" alt="Tests" />
&nbsp;
<img src="https://img.shields.io/badge/dependencies-0-0D1117?style=for-the-badge" alt="Zero dependencies" />

<br /><br />

<img src="https://img.shields.io/badge/JavaScript-F7DF1E?flat-square&logo=javascript&logoColor=black" />
<img src="https://img.shields.io/badge/Canvas%202D-1A73E8?flat-square&logo=html5&logoColor=white" />
<img src="https://img.shields.io/badge/Pointer%20Events-8B7DFF?flat-square" />
<img src="https://img.shields.io/badge/GitHub%20Pages-222222?flat-square&logo=githubpages&logoColor=white" />

</div>

---

## What it does

Open the page and draw. No sign-up, no canvas service, no round-trip to a server — the drawing lives in `localStorage` and never leaves the device.

| Feature | How it works |
| :-- | :-- |
| **Seven tools** | Freehand pen, line, arrow, rectangle, ellipse, text, eraser |
| **Smooth freehand** | Quadratic curves through midpoints, so strokes don't look like stair-steps |
| **Text anywhere** | Click, type, `Enter` to commit — rendered as a real shape, not a DOM overlay |
| **Precise eraser** | Hit-tests the actual geometry: a click in the middle of a rectangle doesn't delete it, touching its edge does |
| **Undo / redo** | Snapshot history, 80 steps, `Ctrl+Z` / `Ctrl+Shift+Z` |
| **Hover feedback** | Whatever is under the cursor glows; the cursor changes per tool |
| **Click ripple** | Every click leaves a short pulse at the pointer |
| **Export** | PNG at 2× resolution with the grid baked in, or the raw board as JSON |
| **Import** | Load a previously saved JSON board — malformed entries are dropped, never thrown |
| **Autosave** | Debounced write to `localStorage`, restored on reload |
| **Keyboard first** | `P` `L` `A` `R` `O` `T` `E` switch tools |

## Why the geometry is in its own file

Hit-testing is the part that quietly breaks: a rectangle is not a filled box, so clicking the centre must not erase it; an ellipse needs a normalised implicit-distance test, not a bounding box; a freehand stroke is a polyline, not its bounding rectangle.

All of that lives in `board-core.js` with **29 unit tests**, and the DOM layer in `app.js` just wires events to it.

```js
// ellipse distance: normalise into a unit circle, then convert back to pixels
const nx = (point.x - cx) / rx;
const ny = (point.y - cy) / ry;
return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
```

## Keyboard

| Keys | Action |
| :-- | :-- |
| `P` `L` `A` `R` `O` `T` `E` | Pen · Line · Arrow · Rect · Ellipse · Text · Eraser |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `Shift` + `Z`, `Ctrl` + `Y` | Redo |
| `Enter` / `Shift+Enter` | Commit text / newline |
| `Esc` | Cancel the text you're typing |

## Run it

```bash
python -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

## Tests

```bash
npm test        # node --test, 29 tests
```

Covers distance-to-segment (including zero-length and past-the-end cases), box normalisation for every drag direction, per-shape hit-testing, history branching and limits, snapshot isolation, and a serialiser that survives broken JSON, unknown shape types and non-numeric coordinates.

```
NexusBoard/
├── index.html      # toolbar, tool rail, inspector
├── style.css       # dark UI, grid, ripples, responsive layout
├── app.js          # pointer handling, rendering, export, storage
├── board-core.js   # geometry, hit-testing, history, serialisation
├── tests/          # node:test suite
└── .github/workflows/ci.yml
```

## Deliberately not included

No accounts, no realtime multiplayer, no cloud sync. A whiteboard that needs a backend to draw a line is a worse whiteboard — this one is a single static folder you can open offline.

## Stack

Vanilla JavaScript (ES modules) · Canvas 2D · Pointer Events · `localStorage` · `node:test` · GitHub Actions · GitHub Pages

---

<div align="center">

**Ankita Salaria** · [@Ankitavasudev](https://github.com/Ankitavasudev)

</div>

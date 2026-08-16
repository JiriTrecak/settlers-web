# Overview

Web remake of *The Settlers III*. TypeScript + PixiJS v8.

This folder is the build plan. One file per area. Implement against these docs.

## Areas

| File | Owns |
|---|---|
| [conventions.md](conventions.md) | Naming, TS style |
| [app.md](app.md) | Boot: Pixi, ticker, wires Session |
| [session](../src/session/index.md) | Running match: map load, input, widget subscriptions |
| [render.md](render.md) | Pixi stage, camera, landscape mesh, sprites |
| [assets.md](assets.md) | Dumped graphics, catalog, conversion (`original_conv`) |
| [sim.md](sim.md) | Headless engine: clock, grid, movables, economy |
| [ui.md](ui.md) | HTML chrome: menus, selection panel, build menu |
| [testing.md](testing.md) | Vitest, architecture tests, replay-as-oracle later |

## Architecture

```
ui  ──actions──►  session ──► sim  ──ViewSnapshot──►  render
                   ▲                         ▲
                   │                         │
                 app (boot, ticker)       dumped graphics
```

- `sim` never imports `pixi.js`. Enforced by test. See [testing.md](testing.md).
- `render` never mutates sim state. It reads a `ViewSnapshot` (or queries a read-only view) each frame.
- `session` is the running match: map load, input routing, widget subscriptions.
- `app` boots Pixi and pumps `session.tick`. No feature code.
- The engine loads dumped PNG/JSON. Original `.dat` / `.map` stay in `original_conv`.
- `ui` is HTML/CSS widgets with closed boundaries. Pixi draws the map only.
- `src` never imports `original_conv`.

## Phases

### Phase 0 — scaffold (now)

Working Vite app. Real folders. Pixi canvas boots. Vitest is green (smoke + `sim` must not import Pixi). No game.

Bar: `npm run dev` shows a canvas. `npm test` passes.

### Phase 1 — camera + synthetic landscape

Iso camera (`tileWidth = 16`, `tileHeight = 9`, height as Y offset). Landscape as a **mesh** (2 triangles per tile), not sprites. Synthetic grass/height so we don't need original files yet. Pan/zoom. Click maps to grid.

### Phase 2 — dumped graphics

Landscape atlas + decoration sheets from `original_conv` dumps. Dual provider can wait; shipping uses our atlas keys.

### Phase 3 — original maps

Load a dumped map JSON. Draw it with the landscape mesh + atlas. Height, landscape types, FOW all-visible. Trees/stones from the dump; waves from water lattice.

### Phase 4 — one bearer walking

25ms deterministic clock. One bearer walks tile-to-tile. `moveProgress` interpolates. Original walk sprites, 6 directions, iso z-sort.

**This is the kill-or-continue demo.** If it isn't fun, stop.

### Phase 5 — world objects + pathfinding

Trees, stones, stacks. A*. Behavior-tree package. Click-to-move a settler around obstacles.

### Phase 6 — buildings

Place, construct, occupy. Construction marks. Building variants per civilization. Still no full economy.

### Phase 7 — partitions + materials

This is the actual S3 game: land ownership, bearers hauling goods, building requests, priorities, distribution. Do not invent a new economy.

### Phase 8 — fog of war

Per-player visibility. Mesh vertex colors. Hidden objects.

### Phase 9 — combat

Soldiers, towers, attacking, health. Specialists (pioneer, thief, geologist).

### Phase 10 — AI

Sits on top of a working economy. Construction-finder / army modules as TS.

### Phase 11 — UI

Original-style control panel in HTML. Build menu, goods, settlers, messages.

### Phase 12 — multiplayer

Lockstep. Only after single-player is deterministic. Seeded RNG, action log, replay.

## Done means

A phase is done when its area docs' "Phase N" sections are implemented and the tests listed in [testing.md](testing.md) for that phase are green.

Never commit `GFX/`, `SND/`, or `MAP/` from the original game.

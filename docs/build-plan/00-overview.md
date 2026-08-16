# Overview

Web remake of *The Settlers III*. TypeScript + PixiJS v8. The Java project at `../SettlersJava` is the **spec** — algorithms, file formats, economy rules — not a dialect to copy.

This folder is the build plan. One file per area. Implement against these docs, not against a Java class dump.

## Areas

| File | Owns |
|---|---|
| [conventions.md](conventions.md) | Naming, TS style, Java garbage we refuse |
| [app.md](app.md) | Composition root, game loop, folder-drop, wiring |
| [render.md](render.md) | Pixi stage, camera, landscape mesh, sprites |
| [assets.md](assets.md) | DAT parser, atlas, `ImageRef`, sequence lookup |
| [sim.md](sim.md) | Headless engine: clock, grid, movables, economy |
| [ui.md](ui.md) | HTML chrome: menus, selection panel, build menu |
| [testing.md](testing.md) | Vitest, architecture tests, replay-as-oracle later |

## Architecture

```
ui  ──actions──►  sim  ──ViewSnapshot──►  render
                   ▲                         ▲
                   │                         │
                 app (loop, wiring)       assets
```

- `sim` never imports `pixi.js`. Enforced by test. See [testing.md](testing.md).
- `render` never mutates sim state. It reads a `ViewSnapshot` (or queries a read-only view) each frame.
- `assets` is a provider: DAT **or** our atlas, same `ImageRef` keys.
- `ui` is HTML/CSS. Pixi draws the map only.
- `app` is the only layer that knows about all of the above.

## Phases

### Phase 0 — scaffold (now)

Working Vite app. Real folders. Pixi canvas boots. Vitest is green (smoke + `sim` must not import Pixi). No game.

Bar: `npm run dev` shows a canvas. `npm test` passes.

### Phase 1 — camera + synthetic landscape

Iso camera (`DISTANCE_X = 16`, `DISTANCE_Y = 9`, height as Y offset). Landscape as a **mesh** (2 triangles per tile), not sprites. Synthetic grass/height so we don't need S3 files yet. Pan/zoom. Click maps to grid.

### Phase 2 — DAT + folder-drop

User drops `GFX/`. Parser reads S3 `.dat`. Decode landscape tiles + one settler walk cycle into Pixi textures. Dual provider interface exists; atlas backend can still be a stub.

### Phase 3 — original maps

Load a real `.map` from dropped `MAP/`. Draw it with the landscape mesh + DAT textures. Height, landscape types, FOW all-visible.

### Phase 4 — one bearer walking

25ms deterministic clock. One bearer walks tile-to-tile. `moveProgress` interpolates. Original walk sprites, 6 directions, iso z-sort.

**This is the kill-or-continue demo.** If it isn't fun, stop.

### Phase 5 — world objects + pathfinding

Trees, stones, stacks. A*. Behavior-tree package (rewritten clean, same semantics). Click-to-move a settler around obstacles.

### Phase 6 — buildings

Place, construct, occupy. Construction marks. Building variants per civilization. Still no full economy.

### Phase 7 — partitions + materials

This is the actual S3 game: land ownership, bearers hauling goods, building requests, priorities, distribution. Do not invent a new economy.

### Phase 8 — fog of war

Per-player visibility. Mesh vertex colors. Hidden objects.

### Phase 9 — combat

Soldiers, towers, attacking, health. Specialists (pioneer, thief, geologist).

### Phase 10 — AI

Sits on top of a working economy. Port the "what to do" / construction-finder / army modules as TS, cleaned up.

### Phase 11 — UI

Original-style control panel in HTML. Build menu, goods, settlers, messages. Replace `options.prp` flags with real controls.

### Phase 12 — multiplayer

Lockstep. Only after single-player is deterministic. Seeded RNG, action log, replay.

## Done means

A phase is done when its area docs' "Phase N" sections are implemented and the tests listed in [testing.md](testing.md) for that phase are green. Not when the code "looks like Java."

## Spec root

Java lives at:

`/Users/jiritrecak/Documents/Supernova/Development/SettlersJava`

We read it. We do not edit it. We never commit `GFX/`, `SND/`, or `MAP/` from the original game.

# Overview

**Under the Canopy.** TypeScript + Three.js. Lockstep RTS skeleton.

This folder is **constraints + the next work**. How the match *behaves today* lives in [`docs/game/`](../game/README.md). How it should *look*: [`docs/game/art.md`](../game/art.md).

## Areas

| File | Owns |
|---|---|
| [editor.md](editor.md) | **World editor.** Next content + look track. |
| [conventions.md](conventions.md) | Naming, TS style, numbers |
| [app.md](app.md) | Canvas boot, ScreenHost, ticker |
| [sim.md](sim.md) | Headless engine: no Three.js, no DOM |
| [render.md](render.md) | Three.js drawing, no rules |
| [ui.md](ui.md) | HTML chrome |
| [assets.md](assets.md) | glTF later. No dump pipeline. |
| [testing.md](testing.md) | Vitest, architecture tests |
| [net.md](net.md) | MatchHost lockstep. Read before sockets. |

## Architecture

```
ui  ──actions──►  session ──► sim  ──ViewSnapshot──►  render
                   ▲  │
                   │  └──► net (Lockstep) ──► MatchHost (Node)
                 app (boot, Channel, ticker)
```

- `sim` never imports `three`, `pixi.js`, or `net`. Enforced by test.
- `render` never mutates sim. It reads `ViewSnapshot`.
- `session` is one match, inside `PlayScreen`.
- `app` owns the canvas + rAF and pumps `session.tick`.
- `ui` is HTML/CSS. Three.js draws the map. World editor is an in-game screen (`editor/`).

## Where we are

Lit 256² iso grid. Player entities from `MatchConfig.slots`. One cube per player. SP is one slot. Lockstep + MatchHost still work.

Next: [world editor](editor.md).

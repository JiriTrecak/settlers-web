# Overview

Web remake of *The Settlers III*. TypeScript + PixiJS v8.

This folder is **constraints + the next work**. How the match *behaves today* lives in [`docs/game/`](../game/README.md). How a folder is wired lives in `src/**/*.md`.

## Areas

| File | Owns |
|---|---|
| [P2.md](P2.md) | **Next systems.** Read this before adding a feature. |
| [conventions.md](conventions.md) | Naming, TS style, numbers |
| [app.md](app.md) | Pixi boot, ScreenHost, ticker |
| [sim.md](sim.md) | Headless engine: no Pixi, no DOM |
| [render.md](render.md) | Pixi drawing, no rules |
| [ui.md](ui.md) | HTML chrome |
| [assets.md](assets.md) | Dumped graphics, `original_conv` |
| [testing.md](testing.md) | Vitest, architecture tests, replay |

Session is documented under [`src/session/`](../../src/session/index.md), not here.

## Architecture

```
ui  ──actions──►  session ──► sim  ──ViewSnapshot──►  render
                   ▲                         ▲
                   │                         │
                 app (boot, ticker)       dumped graphics
```

- `sim` never imports `pixi.js`. Enforced by test.
- `render` never mutates sim. It reads `ViewSnapshot`.
- `session` is one match, inside `PlayScreen`. Lobby is a different screen.
- `app` boots Pixi and pumps `session.tick`. No feature code.
- Original `.dat` / `.map` stay in `original_conv`. `src` never imports it.
- `ui` is HTML/CSS. Pixi draws the map only.

## Where we are

Playable: dumped maps, iso camera, Roman wood/stone colony, construction, flatten (lumberjack), land occupy, fog of war (snapshots), action queue + checksum, per-player matcher, pioneer select + claim.

Not a game yet: no combat, no second player. Other huts still ignore height.

Forward plan: **[P2.md](P2.md)**. Not more huts, not water, not sound.

Never commit `GFX/`, `SND/`, or `MAP/` from the original game.

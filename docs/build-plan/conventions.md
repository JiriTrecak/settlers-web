# Conventions

TypeScript is what we write. Types should be the ones this codebase actually wants.

## Style

- ESM. `strict`. No `any`. No `as unknown as`.
- Classes for lifecycle / retained state / input (`Session`, `World`, `Renderer`, `Hud`, …). Pure math and one-shot transforms stay functions.
- Properties, not getters: `movable.action`, not `getAction()`.
- `readonly` on view types the renderer sees.
- Discriminated unions for actions.
- Const objects + union types instead of numeric enums. Original file ids live in `original_conv`, not in the domain API.
- Typed arrays for grids (`Uint8Array`, `Int8Array`). Not `number[][]`.
- No Hungarian (`I`, `E`, `m_`).
- File names: `camelCase.ts` for modules. One concept per file. Every `.ts` file states what it is for.

Comments: non-obvious math, why a call into another class exists, races, a block that does a whole job. Not `x += 1`.

## Names

Domain words: `Movable`, `Bearer`, `Pioneer`, `Landscape`, fog, land. Keep them.

| Type | Notes |
|---|---|
| `World` | Match sim facade |
| `Session` | One running match (input + widgets + tick) |
| `MapView` | Read-only grid the renderer uses |
| `ViewSnapshot` | Tick + movables + objects + buildings + land + fog |
| `Action` | Discriminated union in `shared` |
| `Clock` | 25 ms slots |
| `GridPos` | `{ readonly x: number; readonly y: number }` |
| `LandscapeType` | String union |
| `Direction` | 6 hex dirs. Deltas in `shared`. |
| `MatchConfig` | Injected (`mapId`, `seed`, `delay`, `slots`). No process-wide statics. See [net.md](net.md). |
| `Bundle` | `{ tick, player, actions }` for one slot on one beat. Empty `actions` is a confirm. |

## Constants

- Tick: `25` ms (`Clock.tickMs`)
- Command delay: `8` ticks (`200` ms). Same in SP once Lockstep exists. Tests may use `1`.
- Iso: `tileWidth = 16`, `tileHeight = 9`; height displacement `2` px per step
- Landscape atlas: `1024`, grid `32`
- FOW: visible `100`, explored `50`, dim `30` / s
- Occupy disk: radius `40`
- Hex: 6 directions

Integer grid coords stay integers. Do not introduce float grid positions in sim.

## File format ids

Original `.map` bytes and DAT indices are ordered tables. **Never** use TS enum numeric auto-increment as a file format. Domain talks `LandscapeType`; conversion talks original ids.

## Imports

```
sim      → shared
net      → shared
render   → shared, sim (views/types), pixi.js
ui       → shared, sim (views/types)
session  → sim, render, ui, shared, net, pixi.js
app      → session, ui, net, pixi.js
original_conv → may import src types; src never imports original_conv
```

`shared` is types and pure functions. No Pixi. No DOM.

## Things we never do

- Homegrown list/set/map — `Set`, `Map`, arrays.
- Static singletons. Inject.
- Hidden global RNG. `seedRng` into `World`.
- Flattening a widget into exported functions plus a WeakMap.

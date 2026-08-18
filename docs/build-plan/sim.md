# Sim

Headless game. No Pixi. No DOM. Deterministic.

`src/sim` is the rules. Renderer reads `ViewSnapshot`. Tests run this in Node. How a tick *behaves* is [`docs/game/gameloop.md`](../game/gameloop.md). Folder map: [`src/sim/index.md`](../../src/sim/index.md).

## Shape

`World` is the match: clock, grid, objects, buildings, land, fog, marks, movables, seeded RNG.

- `tick()` — one 25 ms beat, fixed order (see gameloop).
- `dispatch(action)` — outside mutation. **P2.1** turns this into a per-tick queue; session must not call `placeBuilding` / `placeColony` / `snapFog` as methods.
- `view(player)` — snapshot for render (fog is that player's).

`Action` is a discriminated union in `shared`. Grow it; don't add parallel back doors.

## Clock + RNG

- Quantum is 25 ms. Never changes. Speed is how many quanta session drains per frame.
- No singleton clock. World owns it.
- Every random goes through `seedRng`. No `Math.random`, no `Date.now`, no `performance.now` in `src/sim`.

Integer grid coords stay integers. `moveProgress ∈ [0, 1]` is stored on the movable for render lerp; sim only sees tiles.

## Hex

6 directions. Deltas in `shared`. Don't "simplify" to 4 or to cube coords in the domain.

## Maps

Engine loads dumped JSON (`DumpedMap`): landscape names, heights, trees, stones, `starts`. Original `.map` parsing is `original_conv` only. Waves are generated from water neighbors.

## Economy / land / fog

Already in: global matcher, construction, occupy disks, per-player fog (snapshots). Matcher must become **per-player** before a second colony is real — [P2.md](P2.md) step 2. Do not invent a new hauling model.

## Refusals

- Pixi, DOM, `window` inside `src/sim`.
- Making the bearer-job system "simpler." Same rules, clean implementation.
- Behavior-tree packages. Professions are functions that assign jobs; `tickJob` runs the verb.
- A* until BFS is the bottleneck (it isn't).

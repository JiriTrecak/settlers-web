# Sim

Headless game. No Pixi. No DOM. Deterministic.

`src/sim` is the rules. Renderer reads `ViewSnapshot`. Tests run this in Node. How a tick *behaves* is [`docs/game/gameloop.md`](../game/gameloop.md). Folder map: [`src/sim/index.md`](../../src/sim/index.md).

## Shape

`World` is the match: clock, grid, objects, buildings, land, fog, marks, movables, seeded RNG.

- `tick()` — increment clock, apply due actions, then one 25 ms beat (see gameloop).
- `enqueue(action, tick?)` — play-loop mutation. Default tick is `tickIndex + 1`. Due-or-past applies immediately.
- `dispatch(action)` — test helper: enqueue for *now*. Session uses this only for `placeColony` at start.
- `checksum()` / `log()` / `replay(log)` — lockstep shape. Fog is not in the mix.
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

Already in: per-player matcher, construction, occupy disks, per-player fog (snapshots). Do not invent a new hauling model. Partitions-as-islands are later.

## Refusals

- Pixi, DOM, `window` inside `src/sim`.
- Making the bearer-job system "simpler." Same rules, clean implementation.
- Behavior-tree packages. Professions are functions that assign jobs; `tickJob` runs the verb.
- A* until BFS is the bottleneck (it isn't).

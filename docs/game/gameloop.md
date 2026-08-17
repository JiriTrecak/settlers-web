# Game loop

One match is a `Session` inside `PlayScreen`. The lobby is a different screen; **Exit** (with confirm) tears the session down.

## Clock

Sim is a **25 ms quantum**. Wall-clock speed (1× / 2× / 4× / 8×) only changes how many quanta run per frame. The quantum never changes.

Session accumulator: `acc += dtMs * speed`. Drain 25 ms steps. Cap is `8 * speed` ticks per frame so an 8× hitch cannot spiral. Overflow dumps the leftover acc.

Render interpolation uses the leftover fraction (`acc / 25`) so walkers lerp between tiles. Work / idle snaps to the last sim state.

## What runs in one tick

Order matters — later systems see this tick’s assignments.

1. Clock `tickIndex++`
2. Trees grow
3. Units finish the current walk step
4. Houses maybe spawn a bearer
5. Professions assign jobs (lumberjack / stonecutter / sawmiller / forester / bricklayer revert)
6. Construction: plan → scaffold, recruit bricklayers, occupy finished worker huts
7. Matcher assigns `deliver` to idle bearers
8. Idle flock (skipped if a job was just assigned)
9. `tickJob` walks / swings / plants / occupies (bricklayers may finish a hut here)
10. Newly finished occupying buildings stamp a tower-radius disk
11. Occupancy grid rebuild (units with `inside` do not occupy a tile)

`dispatch` is the only mutation from outside the tick (place a plan, tests that click-chop, etc.).

## Determinism

World RNG is seeded (`seedRng(1)` unless a test passes another). No `Math.random` in sim. Same map + same actions → same ticks.

## Frame vs sim

App ticker calls `session.tick(dtMs, nowMs)`.

- Sim: as many 25 ms beats as the accumulator allows
- Draw: `ViewSnapshot` (movables, objects, buildings) + leftover alpha
- Decorations / flags wave on `nowMs` (visual only)
- WASD / pan / zoom are camera, not sim

At 60 fps 1× that’s ~0.67 sim ticks per frame, so most frames interpolate. At 8× the cap is 64 ticks/frame.

## Player input (play loop)

| Control | Effect |
|---|---|
| Drag / WASD / wheel | Camera pan / zoom (zoom-at-cursor) |
| Space | Fit whole map |
| Minimap drag | Look-at that cell |
| Build strip | Select lumberjack / forester / stonecutter / sawmill / house / tower |
| Click empty valid owned land with a tool | Place a **plan** (scaffold), drop the tool |
| Click an existing hut | Select it (highlight origin) |
| Speed buttons | 1 / 2 / 4 / 8 × |
| F3 | Debug overlay (paths / ownership / claim) |
| Escape | Deselect: build ghost, then claim tool, then hut |
| Exit | Confirm, then leave to map select |

No click-to-move, no click-to-chop in the play loop. Those actions exist on `World.dispatch` for tests. F3 **claim** is the occupy click (tower-radius disk).

Match start looks at player-slot 0’s HQ at zoom 1, not a fit of the whole map.

## Screens

`ScreenHost` shows exactly one `GameScreen`. `play(mapId)` constructs a `PlayScreen`, which owns Hud + Session. App does not keep a parallel session pointer.

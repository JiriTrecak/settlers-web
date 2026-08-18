# Game loop

One match is a `Session` inside `PlayScreen`. The lobby is a different screen; **Exit** (with confirm) tears the session down.

## Clock

Sim is a **25 ms quantum**. Wall-clock speed (1× / 2× / 4× / 8×) only changes how many quanta run per frame. The quantum never changes.

Session accumulator: `acc += dtMs * speed`. Drain 25 ms steps. Cap is `8 * speed` ticks per frame so an 8× hitch cannot spiral. Overflow dumps the leftover acc.

Render interpolation uses the leftover fraction (`acc / 25`) so walkers lerp between tiles. Work / idle snaps to the last sim state.

## What runs in one tick

Order matters — later systems see this tick’s assignments.

1. Clock `tickIndex++`
2. Apply every action scheduled for this beat (player, then enqueue seq)
3. Trees grow
4. Units finish the current walk step
5. Houses maybe spawn a bearer
6. Professions assign jobs (lumberjack / stonecutter / sawmiller / forester / bricklayer revert / digger / pioneer search)
7. Construction: plan → flatten (if the def asks) → scaffold, recruit bricklayers, occupy finished worker huts
8. Matcher assigns `deliver` to idle bearers of that hut's player
9. Idle flock (skipped if a job was just assigned)
10. `tickJob` walks / swings / plants / occupies (bricklayers may finish a hut here)
11. Newly finished occupying buildings stamp a tower-radius disk
12. Fog: resize hut/unit view circles, then dim sight toward the ref target (30/s)
13. Occupancy grid rebuild (units with `inside` do not occupy a tile)

Play-loop input `enqueue`s for the *next* beat. `dispatch` applies immediately (tests, match-start `placeColony`). Tick 0 is never applied by `tick()` — only by `dispatch` / late enqueue / `replay`.

## Determinism

World RNG is seeded (`seedRng(1)` unless a test passes another). No `Math.random` in sim. Same map + same action log → same checksum at tick N.

## Frame vs sim

App ticker calls `session.tick(dtMs, nowMs)`.

- Sim: as many 25 ms beats as the accumulator allows
- Draw: `ViewSnapshot` (movables, objects, buildings, fog) + leftover alpha
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
| Click empty valid owned land with a tool | Place a **plan** (fence), drop the tool |
| Click an existing hut | Select it (highlight origin) |
| Click own pioneer / bearer | Select the unit (highlight follows) |
| C with a bearer / pioneer selected | Convert bearer → pioneer, or pioneer → bearer (own land, empty hands) |
| RMB / LMB empty with a unit selected | Pioneer: claim toward that tile. Bearer: `moveTo` |
| Delete / Backspace | Destroy the selected hut (fog + occupy unstamp) |
| Speed buttons | 1 / 2 / 4 / 8 × |
| F3 | Debug overlay (fog / paths / ownership / claim) |
| Escape | Deselect: build ghost, then claim tool, then unit, then hut |
| Exit | Confirm, then leave to map select |

F3 **claim** enqueues `occupy` (tower-radius disk cheat). Pioneers flip one unenforced tile at a time.

Match start looks at player-slot 0’s HQ at zoom 1, not a fit of the whole map.

## Screens

`ScreenHost` shows exactly one `GameScreen`. `play(mapId)` constructs a `PlayScreen`, which owns Hud + Session. App does not keep a parallel session pointer.

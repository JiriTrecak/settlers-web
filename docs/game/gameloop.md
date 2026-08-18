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
6. Professions assign jobs (lumberjack / stonecutter / sawmiller / forester / bricklayer revert / digger / pioneer search / swordsman aggro or garrison)
7. Construction: plan → flatten (if the def asks) → scaffold, recruit bricklayers, occupy finished worker huts
8. Matcher assigns `deliver` to idle bearers of that hut's player
9. Idle flock (skipped if a job was just assigned)
10. `tickJob` walks / swings / plants / occupies (bricklayers may finish a hut here)
11. Dead units drop out and unstamp fog
12. Garrisoned occupying buildings stamp a tower-radius disk (empty ones release)
13. Fog: resize hut/unit view circles, then dim sight toward the ref target (30/s)
14. Occupancy grid rebuild (units with `inside` do not occupy a tile)

Play-loop input `enqueue`s for the *next* beat. `dispatch` applies immediately (tests, match-start `placeColony` per slot). Tick 0 is never applied by `tick()` — only by `dispatch` / late enqueue / `replay`. After each sim step the session `Opponent` may enqueue for the next beat (convert, pioneer, tower plan, enlist).

## Determinism

World RNG is seeded (`seedRng(1)` unless a test passes another). Play loop will take seed from `MatchConfig`. No `Math.random` in sim. Same map + same action log → same checksum at tick N. Victory/Defeat shelves that log as a replay; watch mode `replay(log, duration)` and does not re-run the opponent script.

Lockstep (not wired): Session only calls `world.tick()` when every slot confirmed that beat. Play-loop input will go through a mailbox at `tickIndex + D`, not `world.enqueue` from the click. See [`docs/build-plan/net.md`](../build-plan/net.md).

## Frame vs sim

App ticker calls `session.tick(dtMs, nowMs)`.

- Sim: as many 25 ms beats as the accumulator allows
- Draw: `ViewSnapshot` (movables, objects, buildings, fog) + leftover alpha
- Decorations / flags wave on `nowMs` (visual only)
- WASD / pan / zoom are camera, not sim

At 60 fps 1× that’s ~0.67 sim ticks per frame, so most frames interpolate. At 8× the cap is 64 ticks/frame. F3 shows where that time went (`sim` vs `draw`, then flock/fog/…).

## Player input (play loop)

| Control | Effect |
|---|---|
| Drag / WASD / wheel | Camera pan / zoom (zoom-at-cursor) |
| Space | Fit whole map |
| Minimap drag | Look-at that cell |
| Build strip | Select lumberjack / forester / stonecutter / sawmill / house / tower |
| Click empty valid owned land with a tool | Place a **plan** (fence), drop the tool |
| Click an existing hut | Select it (highlight origin) |
| Click own pioneer / swordsman | Select that unit (click the sprite, not the tile). Shift-click toggles. Bearers / workers ignore clicks |
| Shift-drag | Marquee: all own controllable units in the rect |
| C with a pioneer selected | Convert pioneer → bearer (own land, empty hands) |
| X with empty bearers selected | Enlist as L1 swordsman (no selected bearers until barracks) |
| RMB with units selected | Pioneer: claim toward that tile. Swordsman: `moveTo` (spread). Shift = forced walk |
| Click empty land | Clear unit / hut selection |
| Delete / Backspace | Destroy the selected hut (fog + occupy unstamp) |
| Speed buttons | 1 / 2 / 4 / 8 × |
| F3 | Debug overlay (frame cost + sim phases, fog / paths / ownership / claim) |
| Escape | Deselect: build ghost, then claim tool, then unit, then hut |
| Exit | Confirm, then leave to map select |

F3 **claim** enqueues `occupy` (tower-radius disk cheat). Pioneers flip one unenforced tile at a time.

Match start looks at the local slot's HQ at zoom 1, not a fit of the whole map.

## Screens

`ScreenHost` shows exactly one `GameScreen`. `play(mapId)` constructs a `PlayScreen`, which owns Hud + Session. App does not keep a parallel session pointer.

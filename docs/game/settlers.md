# Settlers

One unit, one tile. Profession is `type`. Clothing is `player` (torso × the eight S3 tints).

## Professions in play

| Type | Step | Notes |
|---|---:|---|
| Bearer | 450 ms | Hauls. Matcher food. Can become bricklayer / digger / worker / pioneer / swordsman. Not selectable. Not a combat target. |
| Digger | 450 ms | Temporary. 1s kneel, ±1 height toward the plan's frozen mean. Reverts. |
| Pioneer | 450 ms | Controllable. `needsPlayersGround: false`. Kneel 1.2 s, take one unenforced tile. Convert from a bearer (C). Attackable, strength 0. Distinct walk/kneel clips. |
| Swordsman | 338 ms | L1. Controllable. Walks off own land. Auto-aggro hex 30, melee 1 / 1s / 10 dmg / 100 hp. Occupies T1 (1 slot). Enlist a bearer (X). Kit has 6. |
| Lumberjack | 450 ms | Workplace. See [economy.md](economy.md). |
| Forester | 450 ms | Workplace. |
| Stonecutter | 450 ms | Workplace. |
| Sawmiller | 450 ms | Workplace. |
| Bricklayer | 450 ms | Temporary. Reverts to bearer when the hut finishes. |

`become` swaps type, workplace, step time, and clears the current job / carried goods. Professions with `restMs` enter the hut on become.

## Occupancy

At most one standing unit per tile. `inside` units are in their hut: no sprite, no occupancy, no flock. They still exist in the sim (F3 counts them).

A step **occupies the destination immediately**; `moveProgress` is visual lerp only. Pathing treats other units as blockers (self ignored).

`chop` / `cut` / `plant` also **mark** a tile (`MarkGrid`) until the job ends, so a second worker will not pick the same tree, stand, or plant cell. Not occupancy — they still walk.

## Walking

BFS, 6 hex directions. Settlers with `needsPlayersGround` (default: every civilian) only walk tiles they own once any occupy disk exists. Pioneer / thief / soldier set the flag `false`. `goTo` drops the job, keeps carried material. `pathTo` is used by jobs and does not drop the job.

Click the **sprite** of a pioneer or swordsman to select (opaque body/torso pixels, not the tile). Bearers and workers are click-through. Shift-click toggles; shift-drag marquees sprite AABBs. RMB commands the group: pioneer `pioneerWork`, swordsman `moveTo` (spread onto nearby tiles). Shift-RMB is a forced walk (soldiers ignore aggro until they stop). Empty LMB clears the group. **C** converts a selected pioneer → bearer (own land, empty-handed). **X** enlists selected empty bearers as L1 swordsmen (needs a selected bearer — barracks later). Esc peels unit selection after the build ghost and claim tool.

## Jobs

A unit *has* a job; it does not implement the verb. Profession / matcher / construction **assign**; `tickJob` **executes**.

| Job | Who | What |
|---|---|---|
| `deliver` | Bearer | Pickup at offer, drop at request |
| `pickup` / `drop` | Anyone | One goods unit. Bend clip **200 ms** (8 ticks) |
| `chop` | Lumberjack / tests | See wood chain. Bearer click-chop leaves a trunk pile; lumberjack carries it |
| `cut` | Stonecutter | Stand NE of the rock, face sw, pick 4.5 s, carry stone |
| `plant` | Forester | Stand, face nw, kneel 3 s, sapling on `y+1` |
| `saw` | Sawmiller | Work-spot, 4.5 s, trunk → plank |
| `build` | Bricklayer | Spot + facing from the def, 1 s swings |
| `occupy` | Bearer / swordsman | Walk to the door; become the worker, or enter a tower |
| `pioneer` | Pioneer | Walk to the click, then kneel 1.2 s per unenforced tile toward that target |
| `flatten` | Digger | Walk onto the cell, kneel 1 s, ±1 toward the hut mean |
| `attack` | Swordsman | Face, 1 s swing, subtract strength. Chase to an adjacent stand |

Pickup / drop / deliver all share the bend clip.

## Idle flock

Jobless, not walking, not inside, and `needsPlayersGround` (civilians). Pioneers stand.

Repulsion from occupied tiles and the map edge in hex rings 1–2, then **one** step. Crowded → walk every step (delay down to 500 ms). Spread → wait 500–1000 ms. Default delay 700 ms.

Skipped if matcher / profession just handed them a job (flock runs after those). Seeded RNG jitters the heading.

## Rendering

Walk / idle / work clips by profession, 6 directions, carry variants (trunk, plank, stone, sapling, …). Missing clip → that profession’s idle, then bearer. Missing catalog → yellow dot.

`inside` is not drawn. Interpolation uses `from → pos` with `moveProgress` plus the frame leftover.

Attackable units (swordsman, pioneer) always show the original health pip above the head. Frame 0 is full HP, last is almost dead. Bearers and workers have none. Selected units show the original mark under the pip.

# Game

How the match *behaves* as implemented. Not the build plan (`docs/build-plan/` — next work is [`P2.md`](../build-plan/P2.md)) and not the per-folder code notes (`src/**/*.md`).

Read these when you need the rules, timings, and “what does the player actually get.”

| Doc | Chunk |
|---|---|
| [gameloop.md](gameloop.md) | Clock, tick order, speed, session, what input does |
| [terrain.md](terrain.md) | Grid, landscape, height, iso, walkability, maps, waves, ownership |
| [building.md](building.md) | Footprints, place → construct → occupy, flags, houses |
| [settlers.md](settlers.md) | Units, pathing, occupancy, idle flock, jobs |
| [economy.md](economy.md) | Colony kit, stacks, bearer hauling, wood + stone |

## In play now

Roman lumberjack / forester / stonecutter / sawmill / small house / tower. Bearers haul. Trees grow. HQ occupies a radius-40 disk; extra T1 towers extend it. You build only on owned land. Border posts on the rim. Fog of war (sight 0–100, snapshots at 50). No flatten, no combat.

## Not yet

Flatten / diggers, goods priorities, other professions, soldiers, click-to-command settlers (the sim verbs exist; the play loop does not wire them). F3 **claim** stamps extra occupy disks.

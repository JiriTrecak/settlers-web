# Game

How the match *behaves* as implemented. Not the build plan (`docs/build-plan/`) and not the per-folder code notes (`src/**/*.md`).

Read these when you need the rules, timings, and “what does the player actually get.”

| Doc | Chunk |
|---|---|
| [gameloop.md](gameloop.md) | Clock, tick order, speed, session, what input does |
| [terrain.md](terrain.md) | Grid, landscape, height, iso, walkability, maps, waves, ownership |
| [building.md](building.md) | Footprints, place → construct → occupy, flags, houses |
| [settlers.md](settlers.md) | Units, pathing, occupancy, idle flock, jobs |
| [economy.md](economy.md) | Colony kit, stacks, bearer hauling, wood + stone |

## In play now

Roman lumberjack / forester / stonecutter / sawmill / small house / tower. Bearers haul. Trees grow. HQ occupies a radius-40 disk; you build only on that land. Border posts on the rim. No flatten, no fog, no combat.

## Not yet

Flatten / diggers, building destroy, goods priorities, other professions, soldiers, fog of war, click-to-command settlers (the sim verbs exist; the play loop does not wire them). F3 **claim** stamps extra occupy disks.

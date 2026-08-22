# Game

How the match *behaves* as implemented. Not the build plan (`docs/build-plan/` — next work is [`P2.md`](../build-plan/P2.md)) and not the per-folder code notes (`src/**/*.md`).

Read these when you need the rules, timings, and “what does the player actually get.”

| Doc | Chunk |
|---|---|
| [gameloop.md](gameloop.md) | Clock, tick order, speed, session, what input does |
| [terrain.md](terrain.md) | Grid, landscape, height, iso, walkability, maps, waves, ownership |
| [building.md](building.md) | Footprints, place → construct → occupy, flags, houses |
| [settlers.md](settlers.md) | Units, pathing, occupancy, idle flock, jobs |
| [economy.md](economy.md) | Colony kit, stacks, bearer hauling, wood + stone + mines |

## In play now

Roman lumberjack / forester / stonecutter / sawmill / small house / tower / coal mine / iron mine / gold mine / farm / mill / baker / fisher / pig farm / slaughterhouse / waterworks. Bearers haul. Pioneers claim unenforced tiles. Geologists probe mountain and plant resource signs. Miners pull coal / ironore / goldore from the mine footprint (pick first; no flatten). Farmers plant and harvest crop. Miller / baker / pig farm / slaughterhouse convert the food chain. Fisherman / waterworker pull from water. Plots flatten before bricklayers (mines skip). Trees and crops grow. Outdoor huts have a movable work circle (**Area**). HQ occupies a radius-40 disk once garrisoned (kit seats one L1 inside; extra infantry is the Units strip). Extra T1 towers extend it when a spare swordsman walks in. Infantry assault enemy tower doors; empty broken doors flip owner. Colony HQ gone is the match. Two colonies on 2-start maps (script opponent: pioneer, lumberjack / sawmill / stonecutter, then extra towers toward you). You build only on owned land. Border posts on the rim. Fog of war (sight 0–100, snapshots at 50). L1 swordsmen auto-aggro and melee.

## Not yet

Goods priorities, other professions, barracks / bow / pike. F3 **claim** still stamps extra occupy disks.

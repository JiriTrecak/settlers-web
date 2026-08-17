# Buildings

A building is an origin cell plus a footprint from its def. All currently playable huts are Roman.

Placeable from the strip: lumberjack, forester, sawmill, small house. Tower is match-start HQ only (same placement rules if you stamp one in tests).

## Footprint

Two masks, both relative to origin:

- **blocked** — unwalkable walls. Settlers path around these.
- **protected** — blocked plus a skirt. No second hut may overlap. Units *can* stand on skirt tiles.

Ground must be in the def’s `ground` list (grass / earth / flattened). Water, existing objects, and other protected tiles refuse the plot.

Flatten / diggers are skipped: if the land is legal types, it places, heights unchanged.

## Placement

Build-strip click on empty valid land dispatches a **plan** (scaffold). Hover shows a ghost: scaffold sprite ~0.55 alpha, blocked-tile fill, `buildMarks` strokes. Red if illegal. Hidden while hovering an existing hut.

`placeBuilding` (colony, tests) stamps **finished** and staffs the worker immediately. The play loop never uses that for the strip.

## Lifecycle

```
plan  →  building  →  built
```

| State | What you see | What happens |
|---|---|---|
| `plan` | Scaffold | Bearers haul `constructionStacks` up to each slot’s `required` |
| `building` | Scaffold + finished sprite growing from the bottom | Bricklayers hammer. Matcher ignores this hut. |
| `built` | Finished sprite | Worker occupy (if any). House starts spawning. Matcher uses `requestStacks`. |

Grow mask is a 10-tooth saw edge, 5% of sprite height — progress is discrete hammer bumps, not a lerp.

## Construction math

Each hut lists plank/stone piles and how many items each pile needs:

| Hut | Plank | Stone | Items | 1 mason | 2 masons |
|---|---:|---:|---:|---:|---:|
| Lumberjack | 2 | 2 | 4 | 48 s | 24 s |
| Forester | 3 | 1 | 4 | 48 s | 24 s |
| Small house | 2 | 3 | 5 | 60 s | 30 s |
| Tower | 2 | 3 | 5 | 60 s | 30 s |
| Sawmill | 3 | 4 | 7 | 84 s | 42 s |

Rule: **12 hammer swings per item**, 1 s per swing. Progress bump is `1 / (12 × items)` each swing. A pile loses one item every 12 swings. Two bricklayers → twice the bumps.

Cap **2** bricklayers even if the def lists more spots. Idle bearers walk onto `bricklayers[]` tiles, face the listed direction, `become` bricklayer, hammer until the hut leaves `building`, then revert to bearer. Leftover construction piles vanish on finish.

No work while waiting for the next plank/stone — a swing that cannot take material idles the mason.

## Occupy

Worker huts (`def.worker` set): after `built`, a jobless empty-handed bearer walks to the door and `become`s the worker (`workplaceId` = hut id). They enter and rest.

Bricklayers on the scaffold do **not** count as occupying.

Colony `placeBuilding` spawns the worker at the door already assigned (and inside if that profession has `restMs`).

## Flags

Waving cloth, torso × player color.

| Flag | Who | When |
|---|---|---|
| **Door** | Workerless (house, tower) | From placement, including scaffold |
| **Roof** | Worker huts | Only while a unit of `def.worker` has that `workplaceId` |
| none | Worker hut, empty | Plan, construction, or worker not yet occupied |

Door flags sit at `def.flag` (usually south of the origin, in front of the hut). Roof flags use the same offset but draw on top of the hut sprite.

## Small house

No worker. **10 beds**, **2 s** between spawns. Each spawn is a jobless bearer at the door; they take one hex step off the door so the next one isn’t stuck. `produced` caps at `beds`. Colony stamps the house finished and starts the first wait immediately.

Idle bearers then flock (see [settlers.md](settlers.md)) — the house does not scatter them.

## Worker huts

The hut is a workplace + stack slots + a work radius. The **cycle** lives on the profession, not the building — [economy.md](economy.md).

| Hut | Worker | Radius | Offers | Requests |
|---|---|---:|---|---|
| Lumberjack | lumberjack | 30 | trunk | — |
| Forester | forester | 18 | — | — |
| Sawmill | sawmiller | 0 | plank | trunk |

Door, flag, bricklayer spots, construction piles, work spot (sawmill) are all relative points on the def.

## Not yet

Destroy / deconstruct, other civilizations in a match, flatten before build, military occupy (tower is just an HQ sprite + door flag), stock, temples, farms.

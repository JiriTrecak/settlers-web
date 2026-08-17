# Buildings

A building is an origin cell plus a footprint from its def. All currently playable huts are Roman.

Placeable from the strip: lumberjack, forester, stonecutter, sawmill, small house, tower (T1 occupy). Lookout / big tower are not in play.

`viewDistance` on the def is the fog look radius once finished (tower 38, work huts 0). Empty worker huts still get 5; plans get 0. Units add their own disk (default 8).

## Footprint

Two masks, both relative to origin:

- **blocked** — unwalkable walls. Settlers path around these.
- **protected** — blocked plus a skirt. No second hut may overlap. Units *can* stand on skirt tiles.

Ground must be in the def’s `ground` list (grass / earth / flattened). Water, existing objects, and other protected tiles refuse the plot. Once any occupy disk exists, every protected tile must also be owned by the placing player.

Flatten / diggers are skipped: if the land is legal types, it places, heights unchanged.

## Placement

Build-strip click on empty valid **owned** land dispatches a **plan** (scaffold) and drops the tool. Hover shows a ghost: scaffold sprite ~0.55 alpha, blocked-tile fill, `buildMarks` strokes. Red if illegal (including off-land). Hidden while hovering an existing hut.

`placeBuilding` (colony, tests) stamps **finished** and staffs the worker immediately. A finished tower (`occupies`) stamps the radius-40 disk — HQ at match start, and each T1 you construct from the strip. The play loop never uses `placeBuilding` for the strip.

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
| Stonecutter | 2 | 3 | 5 | 60 s | 30 s |
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
| Stonecutter | stonecutter | 20 | stone | — |
| Sawmill | sawmiller | 0 | plank | trunk |

Door, flag, bricklayer spots, construction piles, work spot (sawmill) are all relative points on the def.

## Destroy

Click a hut, then **Delete** / **Backspace**. Instant: footprint gone, worker dumped as a bearer, occupy disk released (overlap with another tower stays). Fog circle resizes to 0 — that area fades to grey (50), not black. Units still light their own disk of 8.

## Not yet

Deconstruct-with-goods, other civilizations in a match, flatten before build, lookout / big tower, stock, temples, farms.

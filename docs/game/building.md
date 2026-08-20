# Buildings

A building is an origin cell plus a footprint from its def. All currently playable huts are Roman.

Placeable from the strip: lumberjack, forester, stonecutter, sawmill, small house, tower (T1 occupy). **Industry** (I) → iron mine, gold mine. **Food** (O) → farm, mill, baker, fisher, pig farm, slaughterhouse, waterworks. Lookout / big tower are not in play.

`viewDistance` on the def is the fog look radius once finished (tower 38, work huts 0). Empty worker huts still get 5; plans get 0. Units add their own disk (default 8).

## Footprint

Two masks, both relative to origin:

- **blocked** — unwalkable walls. Settlers path around these.
- **protected** — blocked plus a skirt. No second hut may overlap. Units *can* stand on skirt tiles.

Ground must be in the def’s `ground` list (grass / earth / flattened; mines also take mountain). Water, existing objects, and other protected tiles refuse the plot. Once any occupy disk exists, every protected tile must also be owned by the placing player — except that player's **first** occupying hut, which may stamp a fully unowned plot (second HQ). Extra towers still need owned land.

Every hut flattens unless `flatten: false` (mines, later). Target height is the integer mean of `protected`, frozen on the plan. Diggers (pool, blade, 25% civilian cap; a hut wants `ceil(n/15)`, oldest plan first then the next; 1s kneel, ±1) must finish before bricklayers. Already-level grass skips — constructs as before. Ghost is red on a slope; click still drops the plan. Mark > 127 refuses place. Dirt-as-a-good is later.

## Placement

Build-strip click on empty valid **owned** land `enqueue`s a **plan** (fence posts, no hut sprite) and drops the tool. While a hut is selected, every owned placeable origin gets the original construction pip (green = level, red = steep). Hover still shows a ghost: posts + blocked-tile fill. Red if illegal (including off-land) or the plot is uneven — click still places if `canPlace`. Hidden while hovering an existing hut.

`placeBuilding` (colony, tests) stamps **finished** and staffs the worker immediately. A finished tower needs a soldier inside before it stamps the radius-40 disk — HQ at match start already garrisons one infantry. Extra T1s from the strip wait until a spare swordsman walks in. The play loop never uses `placeBuilding` for the strip.

## Lifecycle

```
plan  →  building  →  built
```

| State | What you see | What happens |
|---|---|---|
| `plan` | Fence posts + sign | Bearers haul `constructionStacks`. Flatten defs also wait for diggers. |
| `building` | Scaffold grows 0–½, then the hut ½–1 | Bricklayers hammer. Matcher ignores this hut. |
| `built` | Finished sprite | Worker occupy (if any). House starts spawning. Matcher uses `requestStacks`. |

Grow mask is a 10-tooth saw edge, 5% of sprite height — scaffold first half, hut second. Discrete hammer bumps, not a lerp.

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
| Iron mine | 4 | 1 | 5 | 60 s | 30 s |
| Farm | 6 | 6 | 12 | 144 s | 72 s |
| Mill | 3 | 3 | 6 | 72 s | 36 s |
| Baker | 4 | 5 | 9 | 108 s | 54 s |
| Fisher | 3 | 2 | 5 | 60 s | 30 s |
| Pig farm | 6 | 6 | 12 | 144 s | 72 s |
| Slaughterhouse | 4 | 4 | 8 | 96 s | 48 s |
| Waterworks | 3 | 4 | 7 | 84 s | 42 s |

Rule: **12 hammer swings per item**, 1 s per swing. Progress bump is `1 / (12 × items)` each swing. A pile loses one item every 12 swings. Two bricklayers → twice the bumps.

Cap **2** bricklayers even if the def lists more spots. They come from the player's **pool** (bearer → hammer, default 25% of civilians; Tools ±1). Idle masons walk onto `bricklayers[]` tiles, face the listed direction, hammer until the hut leaves `building`, then stay bricklayers. No hammers → the scaffold waits. Leftover construction piles vanish on finish.

No work while waiting for the next plank/stone — a swing that cannot take material idles the mason.

## Occupy

Worker huts (`def.worker` set): after `built`, a jobless empty-handed bearer walks to the door and `become`s the worker (`workplaceId` = hut id). They enter and rest. Miner (and later tool professions) walk to a **pick** pile first (`equip`); no pick → the hut stays empty. Farmer ← scythe. Fisherman ← fishing rod. Slaughterer ← axe.

Military huts (`garrison`): idle swordsmen walk to the door and enter. Land stamps while at least one is inside; emptying the garrison releases the disk (not while the hut is under assault). T1 has **1** infantry slot.

Enemy infantry break the **door** (50 HP, same 1 s / 10 dmg swing). At 0 the soldier inside is kicked out to fight. If the garrison is gone, the hut changes owner, land transfers if it was held, and the attacker walks in. Door regenerates 1 HP/s while nobody is assaulting, cap 50.

The colony start tower is `hq`. Capture or destroy it and that player is out. The match ends when one HQ remains (or none). Extra T1s are just towers.

Bricklayers on the scaffold do **not** count as occupying.

Colony `placeBuilding` spawns the worker at the door already assigned (and inside if that profession has `restMs`). Towers spawn one swordsman already inside.

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

The hut is a workplace + stack slots + a work radius. The **cycle** lives on the profession, not the building — [economy.md](economy.md). Outdoor search is an axial circle around `hut.work` (click **Area** on the hut, then the map). Radius is `def.workRadius` (lumberjack 30, stonecutter 20, forester 18). Indoor huts (sawmill, house, tower) have radius 0 — no Area button. Fisherman / grain / weed will aim the same circle at water or fields.

| Hut | Worker | Radius | Offers | Requests |
|---|---|---:|---|---|
| Lumberjack | lumberjack | 30 | trunk | — |
| Forester | forester | 18 | — | — |
| Stonecutter | stonecutter | 20 | stone | — |
| Sawmill | sawmiller | 0 | plank | trunk |

Door, flag, bricklayer spots, construction piles, work spot (sawmill) are all relative points on the def.

## Destroy

Click a hut **you own**, then **Delete** / **Backspace**. Instant: footprint gone, worker dumped as a bearer, occupy disk released (overlap with another tower stays). Fog circle resizes to 0 — that area fades to grey (50), not black. Units still light their own disk of 8. Destroying the colony HQ ends that player.

## Not yet

Deconstruct-with-goods, other civilizations in a match, lookout / big tower, stock, temples, farms.

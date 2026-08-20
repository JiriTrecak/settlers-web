# Economy

No partitions, no priorities. Matcher is per-player. Goods live on ground stacks (max **8**) or in a settler’s hands.

Materials on stacks: `trunk`, `plank`, `stone`, `axe`, `hammer`, `blade`, `pick`, `saw`, `ironore`, `goldore`, `crop`, `flour`, `bread`, `fish`, `meat`, `pig`, `water`, `scythe`, `fishingrod`. A sapling in hand is `tree` — not a stack good.

## Colony kit

On match start (`placeColony` action), at each player slot's `starts[i]`:

- Tower (finished, objects on the footprint cleared). One L1 already inside, so the occupy disk exists on frame 1.
- Small house nearby (finished)
- Low-goods piles in a spiral around HQ, skipping protected tiles, **≥ 2 tiles apart** (bearers fill the gaps)
- **16** jobless bearers in that same spiral
- One L1 already inside the HQ (occupy disk). Extra infantry is the Units strip (`spawnUnit`), not the kit.

Pioneers are not in the kit. Select a bearer, **C** → pioneer (own sprite, kneel-claim). **C** again on own land → bearer. **X** enlists a bearer as L1.

| Good | Piles |
|---|---|
| Plank | 6 + 6 |
| Stone | 6 + 6 |
| Blade | 5 (digger tool) |
| Hammer | 6 |
| Axe | 3 |
| Pick | 2 |
| Saw | 1 |
| Scythe | 2 |
| Fishing rod | 2 |

House then drips more bearers (10 beds, 2 s). See [building.md](building.md).

## Matcher

Each tick, closest idle empty-handed bearer of player P → closest offer P may take.

- **Plan** huts request `constructionStacks` (stop at `required`)
- **Built** huts request `requestStacks` (fill to stack cap 8)
- **Building** (scaffold hammering) requests nothing
- Construction piles on a plan or scaffold are **never offers**. Bearers cannot pull boards off a hut in progress. Delete the hut to get remaining plank + stone back as free piles at the origin.
- A pile is P's if it sits on P's hut offer tile; otherwise `land.owns` (no-occupy test maps treat every tile as owned). Request tiles are never offers.
- Only P's bearers haul for P's huts. Bricklayers / occupy same rule.

Inbound `deliver` jobs count against room so two bearers don’t overfill. `building` construction piles are already on the plot; leftover piles are deleted when the hut finishes.

Plans wait for flatten: the hut wants `ceil(protected/15)` diggers from a **pool**. Oldest unfinished plan takes the whole pool; later queues wait. Diggers and bricklayers each fill on their own: bearers walk to blades / hammers up to **25%** of civilians (4 of 16 kit bearers). **Tools** Fewer/More is ±1 per profession. Idle extras stay that profession; lowering the cap drops the tool. Level grass skips. `flatten: false` (mines) skips digging. Scaffold takes idle bricklayers from the pool (2 per hut). Kit has 5 blades + 6 hammers.

Pickup / drop is 200 ms each end of a deliver.

## Wood chain

The playable loop: trees → trunks → planks, plus foresters replacing trees.

```
forester plants sapling
        │  7 min growth
        ▼
lumberjack fells adult tree ──trunk──► lumberjack offer
                                         │
                                    bearer deliver
                                         ▼
                                   sawmill request
                                         │
                                    sawmiller
                                         ▼
                                    sawmill offer (plank)
                                         │
                                    bearer deliver
                                         ▼
                              construction / (later: more consumers)
```

### Lumberjack

Rest **3 s** inside. If the offer stack is full (8), stay inside.

Else nearest adult tree in the hut's **work circle** (radius **30**, origin `hut.work`, default the hut) on the player's land whose **SE** tile is walkable and not marked. Stands on that SE tile, faces **nw** (axe clip is aimed at the trunk). **6 s** of swings; the tree falls over the last **1.5 s**. Carries the trunk (no ground pile at the stump). Drops on the hut offer. Home, enter, rest.

Another lumberjack already chopping that tree (tile marked) → skip. Saplings / still-growing → skip.

Bearer click-chop (tests only): any neighbor, face the tree, **1.8 s**, leaves a 1-trunk pile on the stump.

## Stone chain

```
stonecutter picks rock ──stone──► stonecutter offer
                                     │
                                bearer deliver
                                     ▼
                              construction
```

### Stonecutter

Rest **3 s** inside. If the offer stack is full (8), stay inside.

Else nearest stone with `capacity > 0` in the **work circle** (radius **20**) whose **stand** (`cutStand` = stone + (1, −1), i.e. NE of the rock) is owned, unclaimed, and walkable. The rock itself does **not** need to be owned — a border pile is cuttable if you can stand on your land.

Stands on that tile, faces **sw**. **4.5 s** of picks (6 × 750 ms). Decrements `capacity`; at 0 the pile is removed (no leftover rubble). Carries the stone (no ground pile at the rock). Drops on the hut offer. Home, enter, rest.

Another stonecutter already cutting that stand (tile marked) → skip. `capacity <= 0` → skip.

### Forester

Rest **4 s** inside. Walks out holding a sapling. Plants in the work circle (radius **18** around `hut.work`): 100 polar samples from the work origin, radius biased `u^3.9` toward the center (more plants near the aim point). Stand tile is walkable; plant is **south** of the stand (`y+1`) and on the worker's land.

Plant tile: grass, owned, not protected, no blocked neighbor, no protected neighbor. Face nw, kneel **3 s**. Home.

Growth **7 minutes** at 1× (`TREE_GROW_MS`). Render: static (no wind), scale 0.35 / 0.6 / 0.85 around the tile origin until adult.

### Sawmiller

Rest **1 s** inside. Needs a trunk on the request and room on the plank offer. Pickup trunk, walk to `workSpot`, face the spot’s direction (**nw**), saw **4.5 s**, trunk → plank, drop on offer. Full offer or empty request → stay inside.

## Mine chain

```
blocked-tile deposit ──ironore / goldore──► mine offer
```

Mines do **not** flatten. Ground may be mountain (and grass/earth on the skirt). The miner is indoor: rest **3 s** inside, then take **1** of the hut's `mine` resource from a **random blocked** tile. Hit → walk to the offer, drop, home. Miss → rest again. Full offer (8) → stay inside. Original spent food (meat/bread/fish) for work packages; bakeries aren't in yet so mines run without food.

Occupy consumes a **pick**. Kit has 2. No pick → empty mine. Placing the hut strips geologist signs on the protected tiles.

Iron mine: 4 plank + 1 stone. Gold mine: 5 plank + 1 stone.

## Food chain

```
farm crop ──► mill flour ──► bakery (+ water) ──► bread
         └──► pig farm (+ water) ──► slaughterhouse ──► meat
waterworks water ──► bakery, pig farm
fisher fish (from water deposits)
```

Farm work origin is `workCenter` (not the hut). Farmer plants crop in radius 6, harvests when grown (10 min), dumps crop. Plant uses the plant clip; scythe is harvest only. Occupy consumes a **scythe**.

Miller: crop → flour (7 s). Baker: flour + water → bread (9 s). Pig farm: crop + water → pig (2 s). Slaughterer: pig → meat (5.7 s); occupy consumes an **axe**. Fisherman: stand next to a fish deposit, 1.5 s, take 1 fish; occupy consumes a **fishing rod**. Waterworker: stand next to water, 1 s, infinite water.

Crops do not block walking. Mines still run without food packages.

## Timings cheat sheet

All at 1×. Clock is 25 ms.

| Thing | Time |
|---|---|
| Sim tick | 25 ms |
| Walk one tile | 450 ms |
| Pickup / drop bend | 200 ms |
| House spawn gap | 2 s |
| Lumberjack rest | 3 s |
| Lumberjack axe | 6 s (fall last 1.5 s) |
| Stonecutter rest | 3 s |
| Stonecutter pick | 4.5 s |
| Forester rest | 4 s |
| Forester kneel | 3 s |
| Tree growth | 7 min |
| Sawmiller rest | 1 s |
| Miner rest | 3 s |
| Saw | 4.5 s |
| Bricklayer swing | 1 s |
| Construction | 12 s of swinging per plank/stone item |

## Not yet

Distribution priorities, storehouse, mines, farms, tool production, soldier goods, trading. Raising the digger cap still needs extra blades on the ground — nothing produces them yet.

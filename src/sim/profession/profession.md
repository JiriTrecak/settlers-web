# profession

A unit *has* a workplace; the profession file assigns jobs. `tickJob` still walks / chops / drops.

Shared: `readyAtHut` / `beginRest` (door → enter → rest). `goDoor` uses `ensurePath`. Outdoor gatherers (`lumberjack`, `stonecutter`) go through `acceptWork`: work circle (`hut.work` + `def.workRadius`, axial) + owned + unclaimed lock tile + walkable stand. Lumberjack locks the **tree**; stonecutter locks the **stand**. Pathing is `needsPlayersGround` on the settler def (default true), not a check in each brain.

Lumberjack: rest **inside** the hut (`restMs`), fell the nearest adult tree that `acceptWork` allows. Stands **SE of the tree, faces nw**, carry the trunk, dump on the offer stack (capacity 8), walk home, enter, rest, repeat. Full stack or no trees → stay inside.

Stonecutter: rest **inside** 3s, nearest stone with remaining capacity that `acceptWork(..., "stand")` allows. Stands **NE of the rock** (`cutStand` = stone + (1, −1)), faces **sw**, pick **4.5 s**, decrement capacity (remove at 0), carry the stone, dump on the offer. Owns/marks the stand — a rock just off the border is still cuttable.

Sawmiller: rest inside, take a trunk from the request, saw at `workSpot`, dump a plank on the offer.

Forester: rest inside 4s, walk out holding a sapling, kneel-plant on the tile south of a random stand in the work circle (100 polar samples, radius biased `u^3.9` toward `hut.work` — not hex `acceptWork`). Plant tile must be grass, owned, not protected, no blocked neighbor, no protected neighbor. Go home. Trees grow 7 minutes (`TREE_GROW_MS`) then become adult.

Bricklayer: pool. Fills to the player's cap on its own (bearer → hammer, default **25%** of civilians). A scaffold takes idle bricklayers from that pool (cap 2 per hut). Walk onto a `bricklayers[]` tile, hammer 1s loops. Each swing calls `tryTakeMaterial`. Plot done / hut destroyed → idle, keep the profession. Tools ±1; lowering drops hammers from idle extras. No hammers → no new bricklayers.

Digger: pool. Fills to the player's cap on its own (bearer → blade, default 25% of civilians). Construction assigns flatten jobs to the oldest unfinished plan until it is flat, then the next; this file only drops `workplaceId` when the plot is done. Walk onto the cell (hut footprint is walkable for them, stacks included), kneel 1s, ±1 height. `ceil(protected/15)` at once from that pool. Plot level or hut leaves `plan` → idle, keep the profession. Tools ±1; lowering drops blades from idle extras.

Pioneer: no workplace. Job `pioneer` is the click. Walk there, then claim unenforced foreign tiles (hex 1–6 toward the target, else 30). Kneel 1.2s, `land.claim`. Tower-covered tiles stay put. Keep the queued path; `findPath` miss → idle (do not BFS the map every beat).

Swordsman: no workplace until they garrison. Closest attackable enemy in hex 30 gets an `attack` job (peels a DEFAULT walk). Else the closest enemy military hut in that disk is `assault`. Else an idle soldier walks into an empty own tower (`occupy`). A live RMB path is not occupy-food — only idle. Forced walk (shift-RMB) skips all three until the path ends (`hasPath` / `headingToward`, not `walking`). Bearers / workers are not attackable. Inside a tower they stay put until the door breaks.

# profession

A unit *has* a workplace; the profession file assigns jobs. `tickJob` still walks / chops / drops.

Shared: `readyAtHut` / `beginRest` (door → enter → rest). `goDoor` uses `ensurePath`. Outdoor gatherers (`lumberjack`, `stonecutter`) go through `acceptWork`: `workRadius` + owned + unclaimed lock tile + walkable stand. Lumberjack locks the **tree**; stonecutter locks the **stand**. Pathing is `needsPlayersGround` on the settler def (default true), not a check in each brain.

Lumberjack: rest **inside** the hut (`restMs`), fell the nearest adult tree that `acceptWork` allows. Stands **SE of the tree, faces nw**, carry the trunk, dump on the offer stack (capacity 8), walk home, enter, rest, repeat. Full stack or no trees → stay inside.

Stonecutter: rest **inside** 3s, nearest stone with remaining capacity that `acceptWork(..., "stand")` allows. Stands **NE of the rock** (`cutStand` = stone + (1, −1)), faces **sw**, pick **4.5 s**, decrement capacity (remove at 0), carry the stone, dump on the offer. Owns/marks the stand — a rock just off the border is still cuttable.

Sawmiller: rest inside, take a trunk from the request, saw at `workSpot`, dump a plank on the offer.

Forester: rest inside 4s, walk out holding a sapling, kneel-plant on the tile south of a random stand in the work circle (100 polar samples, radius biased `u^3.9` toward the hut origin — not hex `acceptWork`). Plant tile must be grass, owned, not protected, no blocked neighbor, no protected neighbor. Go home. Trees grow 7 minutes (`TREE_GROW_MS`) then become adult.

Bricklayer: temporary. Construction assigns a `build` job; on arrival they `become("bricklayer")` and hammer 1s loops. Each swing calls `tryTakeMaterial` (progress bump, pile pop every 12). When the hut leaves `building` they revert to bearer. Cap 2 even if the def lists more spots.

Digger: temporary. Construction assigns `flatten` on a plan whose protected heights are off the frozen mean. Walk onto the cell (hut footprint is walkable for them, stacks included), kneel 1s, ±1 height. `ceil(protected/15)` at once. Revert when the plot is level or the hut leaves `plan`.

Pioneer: no workplace. Job `pioneer` is the click. Walk there, then claim unenforced foreign tiles (hex 1–6 toward the target, else 30). Kneel 1.2s, `land.claim`. Tower-covered tiles stay put. Keep the queued path; `findPath` miss → idle (do not BFS the map every beat).

Swordsman: no workplace until they garrison. Closest attackable enemy in hex 30 gets an `attack` job (peels a DEFAULT walk). Else the closest enemy military hut in that disk is `assault`. Else an empty own tower with a free infantry slot gets `occupy` (enter, land stamps). Forced walk (shift-RMB) skips all three until they stop. Bearers / workers are not attackable. Inside a tower they stay put until the door breaks.

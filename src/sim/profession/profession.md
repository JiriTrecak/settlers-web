# profession

A unit *has* a workplace; the profession file assigns jobs. `tickJob` still walks / chops / drops.

Lumberjack: rest **inside** the hut (`restMs`), fell the nearest unclaimed tree in `workRadius` (skip trees another lumberjack already has a `chop` on, skip saplings, skip trees off the player's land, skip if the SE stand tile is blocked). Stands **SE of the tree, faces nw**, carry the trunk, dump on the offer stack (capacity 8), walk home, enter, rest, repeat. Full stack or no trees → stay inside.

Sawmiller: rest inside, take a trunk from the request, saw at `workSpot`, dump a plank on the offer.

Forester: rest inside 4s, walk out holding a sapling, kneel-plant on the tile south of a random stand in the work circle (100 samples, radius biased `u^3.9` toward the hut origin). Plant tile must be grass, owned, not protected, no blocked neighbor, no protected neighbor. Go home. Trees grow 7 minutes (`TREE_GROW_MS`) then become adult.

Bricklayer: temporary. Construction assigns a `build` job; on arrival they `become("bricklayer")` and hammer 1s loops. Each swing calls `tryTakeMaterial` (progress bump, pile pop every 12). When the hut leaves `building` they revert to bearer. Cap 2 even if the def lists more spots.

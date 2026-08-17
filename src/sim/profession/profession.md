# profession

A unit *has* a workplace; the profession file assigns jobs. `tickJob` still walks / chops / drops.

Lumberjack: rest **inside** the hut (`restMs`), fell the nearest unclaimed tree in `workRadius` (skip trees another lumberjack already has a `chop` on), carry the trunk (no ground pile), dump on the offer stack (capacity 8), walk home, enter, rest, repeat. Full stack or no trees → stay inside.

Sawmiller: rest inside, take a trunk from the request, saw at `workSpot`, dump a plank on the offer.

Bricklayer: temporary. Construction assigns a `build` job; on arrival they `become("bricklayer")` and hammer 1s loops. Each swing calls `tryTakeMaterial` (progress bump, pile pop every 12). When the hut leaves `building` they revert to bearer. Cap 2 even if the def lists more spots.

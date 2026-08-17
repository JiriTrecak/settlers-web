# profession

A unit *has* a workplace; the profession file assigns jobs. `tickJob` still walks / chops / drops.

Lumberjack: rest **inside** the hut (`restMs`), fell the nearest unclaimed tree in `workRadius` (skip trees another lumberjack already has a `chop` on), carry the trunk (no ground pile), dump on the offer stack (capacity 8), walk home, enter, rest, repeat. Full stack or no trees → stay inside.

Sawmiller: rest inside, take a trunk from the request, saw at `workSpot`, dump a plank on the offer.

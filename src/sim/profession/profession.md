# profession

A unit *has* a workplace; the profession file assigns jobs. `tickJob` still walks / chops / drops.

Lumberjack: rest at the hut door, fell the nearest tree in `workRadius`, carry the trunk (no ground pile), dump on the offer stack (capacity 8), walk home, rest, repeat. Full stack or no trees → idle at the door.

Sawmiller: rest at the door, take a trunk from the request, saw at `workSpot`, dump a plank on the offer.

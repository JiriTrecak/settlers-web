# mark

One bit per tile. `chop` marks the tree, `cut` marks the stonecutter stand, `plant` marks the sapling cell (`stand.y+1`), `flatten` marks the cell the digger is walking/kneeling on. `assignJob` sets it; `idle` / `goTo` / `become` clear it. Outdoor search (`acceptWork`, plant samples) skips claimed tiles.

Not occupancy and not land. Construction hammer-spot "claimed" stays in construction — that's a hut slot, not a map resource.

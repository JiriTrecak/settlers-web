# building

`BuildingGrid`: huts with a multi-tile footprint from the def. `blocks()` is walkability (blocked tiles). `protects()` is "no second hut here" (blocked + skirt). `revision` bumps on place/remove. `plan` is fence posts while goods (and flatten) arrive; `building` grows scaffold then hut (`buildProgress` jumps each 1s swing); `built` is finished. Every hut flattens unless `flatten: false` — see `flatten.md`. After the first occupy disk, the plot must be on that player's land.

Finished occupying buildings stamp a radius-40 disk **while garrisoned** — HQ at match start (one infantry already inside) and each T1 a spare swordsman occupies. Destroy unstamps that disk (overlap with another tower stays). Emptying the garrison also unstamps, except while the hut is under assault or someone is walking in.

Enemy infantry `assault` the door (50 HP). At 0 the garrison is kicked out to fight; if nobody is left the hut changes `player`, land transfers if it was held, and the attacker occupies. Colony `hq` is set by `placeColony`. Capture or destroy of that hut defeats that player.

`fogDistance` is the last view-circle radius stamped into fog. `def.viewDistance` is the look radius once built (tower 38, work huts 0); empty worker huts use 5, plans 0.

`flag` on the view: `door` from placement on workerless huts (house, tower). `roof` on worker huts only while a unit of `def.worker` has that `workplaceId`. Bricklayers do not count.

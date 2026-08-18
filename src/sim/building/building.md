# building

`BuildingGrid`: huts with a multi-tile footprint from the def. `blocks()` is walkability (blocked tiles). `protects()` is "no second hut here" (blocked + skirt). `plan` is fence posts while goods (and flatten) arrive; `building` grows scaffold then hut (`buildProgress` jumps each 1s swing); `built` is finished. Lumberjack has `flatten: true` — see `flatten.md`. After the first occupy disk, the plot must be on that player's land.

Finished occupying buildings stamp a radius-40 disk **while garrisoned** — HQ at match start (one infantry already inside) and each T1 a spare swordsman occupies. Destroy unstamps that disk (overlap with another tower stays). Emptying the garrison also unstamps.

`fogDistance` is the last view-circle radius stamped into fog. `def.viewDistance` is the look radius once built (tower 38, work huts 0); empty worker huts use 5, plans 0.

`flag` on the view: `door` from placement on workerless huts (house, tower). `roof` on worker huts only while a unit of `def.worker` has that `workplaceId`. Bricklayers do not count.

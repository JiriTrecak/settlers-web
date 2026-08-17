# building

`BuildingGrid`: huts with a multi-tile footprint from the def. `blocks()` is walkability (blocked tiles). `protects()` is "no second hut here" (blocked + skirt). `plan` waits for hauled `constructionStacks`; `building` is bricklayers on the scaffold (`buildProgress` jumps each 1s swing); `built` is finished. Flatten / diggers still skipped.

`flag` on the view: `door` from placement on workerless huts (house, tower). `roof` on worker huts only while a unit of `def.worker` has that `workplaceId`. Bricklayers do not count.

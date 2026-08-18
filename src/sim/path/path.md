# path

BFS on pathable tiles (`!water && !object && !hut`). Rivers are fords. Other units are not walls — occupied hexes are allowed, just deprioritized when a free neighbor is the same length. Adjacent dest is `[to]` (no scan). Longer paths reuse one `Int32Array` scratch across ticks. Stepping still refuses a taken tile (`isWalkable`). `standBeside` picks a free neighbor of a blocked target. World pathing also refuses unowned tiles for civilians once land exists.

# path

BFS on walkable tiles (`!water && !object`). Rivers are fords — walkable. Returns the step list excluding the start tile. `standBeside` picks a neighbor of a blocked target. World pathing also refuses unowned tiles for civilians once land exists.

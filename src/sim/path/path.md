# path

BFS on walkable tiles (`!water && !river && !object`). Returns the step list excluding the start tile. `standBeside` picks a neighbor of a blocked target. World pathing also refuses unowned tiles for civilians once land exists.

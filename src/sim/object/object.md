# object

`ObjectGrid`: at most one tree, stone, or stack per tile. `blocks()` is walkability. Stacks hold up to `STACK_SIZE` (8). `addToStack` increments; pickup decrements and removes at 0. Bearer chop still leaves a 1-stack; lumberjacks carry the trunk instead. Foresters plant saplings (`growing`); `tickTrees` climbs `stateProgress` 0→1 over 7 minutes, then the tree is adult. Plantable = grass, not protected, no blocked neighbor; search also forbids a protected neighbor. Lumberjack chop stand is the tile SE of the tree.

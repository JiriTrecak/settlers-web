# object

`ObjectGrid`: at most one tree, stone, or stack per tile. `blocks()` is walkability. Stacks hold up to `STACK_SIZE` (8). `addToStack` increments; pickup decrements and removes at 0. Bearer chop still leaves a 1-stack; lumberjacks carry the trunk instead.

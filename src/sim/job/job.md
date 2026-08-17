# job

A unit *has* a `Job`; it does not implement the verb. `tickJob` walks adjacent / works / completes. Next jobs are more union members, not fields on `Movable`.

`chop` removes the tree. Bearers leave a trunk stack; lumberjacks take the trunk. `pickup` / `drop` move one goods unit (any material). `deliver` is pickup-then-drop for the matcher. `saw` is the mill work clip. Pickup and drop share the bend clip (`BEND_TICKS`).

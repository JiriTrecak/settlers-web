# job

A unit *has* a `Job`; it does not implement the verb. `tickJob` walks adjacent / works / completes. Next jobs are more union members, not fields on `Movable`.

`chop` removes the tree and places a trunk stack. `pickup` removes the stack and sets `movable.material`. `drop` places the stack and clears `material`. Pickup and drop share the bend clip (`BEND_TICKS`).

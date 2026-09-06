# types

`GridPos` is integer map coords. `Action` is `noop` | `ping`. Lockstep drops `noop`. Sim ignores both this pass. Play-loop commands go through Lockstep; sim applies them from `commit` via `enqueue` with an envelope.

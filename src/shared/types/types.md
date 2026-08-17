# types

`GridPos` is integer map coords. `Action` is a discriminated union (`noop`, `moveTo`, `chop`, `pickup`, `drop`, `placeBuilding`, `occupy`). Session dispatches `placeBuilding` as a plan and `occupy` from the debug claim tool; sim is the only writer.

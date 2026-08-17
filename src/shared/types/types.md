# types

`GridPos` is integer map coords. `Action` is a discriminated union (`noop`, `moveTo`, `chop`, `pickup`, `drop`, `placeBuilding`). Session dispatches `placeBuilding` as a plan; sim is the only writer.

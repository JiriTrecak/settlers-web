# types

`GridPos` is integer map coords. `Action` is a discriminated union (`noop`, `moveTo`, `chop`, `pickup`, `drop`, `placeBuilding`, `occupy`, `destroyBuilding`). Session dispatches `placeBuilding` as a plan, `occupy` from the debug claim tool, and `destroyBuilding` from Delete; sim is the only writer.

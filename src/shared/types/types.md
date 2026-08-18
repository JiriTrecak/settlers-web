# types

`GridPos` is integer map coords. `Action` is a discriminated union (`noop`, `placeColony`, `moveTo`, `chop`, `pickup`, `drop`, `placeBuilding`, `occupy`, `destroyBuilding`, `pioneerWork`, `convert`). Session `dispatch`es `placeColony` at match start (tick 0, first frame lit) and `enqueue`s plans / occupy / destroy / unit commands for the next beat. Sim is the only writer.

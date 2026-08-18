# types

`GridPos` is integer map coords. `Action` is a discriminated union (`noop`, `placeColony`, `moveTo`, `chop`, `pickup`, `drop`, `placeBuilding`, `occupy`, `destroyBuilding`). Session `dispatch`es `placeColony` at match start (tick 0, first frame lit) and `enqueue`s plans / occupy / destroy for the next beat. Sim is the only writer.

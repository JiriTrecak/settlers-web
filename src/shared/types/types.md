# types

`GridPos` is integer map coords. `Action` is a discriminated union (`noop`, `placeColony`, `moveTo`, `chop`, `pickup`, `drop`, `placeBuilding`, `occupy`, `destroyBuilding`, `pioneerWork`, `convert`). Session `dispatch`es `placeColony` per slot at match start (tick 0, first frame lit) and `enqueue`s plans / occupy / destroy / unit commands for the next beat. The other slot's script also `enqueue`s. Sim is the only writer.

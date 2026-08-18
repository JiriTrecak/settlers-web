# types

`GridPos` is integer map coords. `Action` is a discriminated union (`noop`, `placeColony`, `moveTo` with optional `forced`, `chop`, `pickup`, `drop`, `placeBuilding`, `occupy`, `destroyBuilding`, `pioneerWork`, `convert` to pioneer / bearer / swordsman, debug `spawnUnit`). Session `dispatch`es `placeColony` per `MatchConfig` slot at match start (tick 0, first frame lit). Play-loop commands go through Lockstep; sim applies them from `commit` via `enqueue` with an envelope. Sim is the only writer.

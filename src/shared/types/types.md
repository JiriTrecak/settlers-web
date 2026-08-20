# types

`GridPos` is integer map coords. `Action` is a discriminated union (`noop`, `placeColony`, `moveTo` with optional `forced`, `chop`, `pickup`, `drop`, `placeBuilding`, `occupy`, `destroyBuilding`, `setWorkArea`, `pioneerWork`, `convert` to pioneer / bearer / swordsman, `setDiggerRatio` / `setBricklayerRatio`). Session `dispatch`es `placeColony` per `MatchConfig` slot at match start (tick 0, first frame lit). Play-loop commands go through Lockstep; sim applies them from `commit` via `enqueue` with an envelope. Sim is the only writer.

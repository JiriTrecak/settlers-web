# opponent

Session-level stub for the other slot. After the kit, it `enqueue`s the same `Action`s a human would click (convert a bearer, send the pioneer, plan a tower toward the opponent, enlist an L1 and walk them in). It does not live in `World.tick()`, does not peek at fog it shouldn't have, and is not a construction-finder.

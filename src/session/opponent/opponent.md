# opponent

Session-level stub for every other slot. After the kit, each `enqueue`s the same `Action`s a human would click (convert a bearer, send the pioneer, plan a tower toward the local HQ, enlist an L1 and walk them in). It does not live in `World.tick()`, does not peek at fog it shouldn't have, and is not a construction-finder. Dead slots (HQ gone) are not ticked.

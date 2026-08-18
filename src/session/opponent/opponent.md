# opponent

Session-level stub for every other slot. Every ~5s it looks at its own huts and `send`s the same `Action`s a human would click (Lockstep, not `world.enqueue`): convert a pioneer toward the local HQ, then plan lumberjack → sawmill → stonecutter (wait until each is `built`), then keep planning extra towers from the closest-to-you T1. It does not live in `World.tick()`, does not peek at fog it shouldn't have, and is not a construction-finder. Dead slots (HQ gone) are not ticked.

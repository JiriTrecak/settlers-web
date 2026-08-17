# movable

One unit. `type` is the profession (`bearer`, `lumberjack`, `bricklayer`). `workplaceId` links a worker to a hut (`null` after a bricklayer reverts). `inside` hides them in that hut (no occupancy, no sprite) until `leave`. `become` converts a bearer into a profession (or back). `goTo` sets a BFS path (drops `job`, keeps `material`). `assignJob` is the assignment; `tickJob` walks/works. Each step occupies the next tile immediately; `moveProgress` lerps the sprite.

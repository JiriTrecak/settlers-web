# movable

One unit. `type` is the profession (`bearer`, `lumberjack`). `workplaceId` links a worker to a hut. `inside` hides them in that hut (no occupancy, no sprite) until `leave`. `goTo` sets a BFS path (drops `job`, keeps `material`). `assignJob` is the assignment; `tickJob` walks/works. Each step occupies the next tile immediately; `moveProgress` lerps the sprite.

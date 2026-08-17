# movable

One unit. `type` is the profession (`bearer`, `lumberjack`). `workplaceId` links a worker to a hut. `goTo` sets a BFS path (drops `job`, keeps `material`). `assignJob` is the assignment; `tickJob` walks/works. Each step occupies the next tile immediately; `moveProgress` lerps the sprite.

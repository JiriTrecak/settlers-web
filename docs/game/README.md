# Game

How the match *behaves* as implemented. Visual target: [`art.md`](art.md). Build plan: [`docs/build-plan/`](../build-plan/00-overview.md).

## In play now

A 256×256 lit iso grid. Each `MatchConfig` slot is a `Player` entity. Render draws one cube per player. First single-player match is one slot — one cube. Multiplayer seats spawn more players the same way.

Pan / zoom the camera. Lockstep still ticks. No economy, no combat, no S3 dumps.

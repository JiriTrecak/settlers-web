# App

Boot. Creates Pixi, shows one `GameScreen`, pumps the ticker. No feature code.

`PlayScreen` owns Hud + Session. `play(mapId)` replaces the lobby. Folder map: [`src/app/index.md`](../../src/app/index.md).

## Loop

rAF → `session.tick(dtMs, nowMs)`:

1. `acc += dtMs * speed`; drain 25 ms sim ticks (cap `8 * speed`). Lockstep: do not drain a beat until MatchHost `commit` for it; do not burn `acc` while waiting. MP is 1× ([net.md](net.md)).
2. `snapshot = world.view(player)`
3. `renderer.draw(snapshot, leftover)`

Sim is not frame-rate dependent. Pause = stop draining ticks, keep rendering. Replay timeline does this; live speed is still 1/2/4/8×.

## Refusals

- Mixing rAF and sim into one `update(dt)` that makes the economy depend on fps.
- App decoding DAT or drawing triangles.
- App importing `original_conv`.
- App keeping a parallel session pointer next to `ScreenHost`.

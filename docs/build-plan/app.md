# App

Boot. Creates Pixi, shows one `GameScreen`, pumps the ticker. No feature code.

`PlayScreen` owns Hud + Session. `play(mapId)` replaces the lobby. Folder map: [`src/app/index.md`](../../src/app/index.md).

## Loop

rAF → `session.tick(dtMs, nowMs)`:

1. `acc += dtMs * speed`; drain 25 ms sim ticks (cap `8 * speed`)
2. `snapshot = world.view(player)`
3. `renderer.draw(snapshot, leftover)`

Sim is not frame-rate dependent. Pause = stop draining ticks, keep rendering (not wired as a button yet).

## Refusals

- Mixing rAF and sim into one `update(dt)` that makes the economy depend on fps.
- App decoding DAT or drawing triangles.
- App importing `original_conv`.
- App keeping a parallel session pointer next to `ScreenHost`.

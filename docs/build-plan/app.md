# App

Boot. Owns the canvas + rAF, shows one `GameScreen`, pumps the ticker. No feature code.

`PlayScreen` owns Hud + Session. `EditorScreen` owns Tailwind chrome + `WorldEditor`. Single player starts a one-slot match. Folder map: [`src/app/index.md`](../../src/app/index.md).

## Loop

rAF → `session.tick(dtMs, nowMs)`:

1. `acc += dtMs`; drain 25 ms sim ticks.
2. Lockstep: do not drain a beat until `commit`.
3. `snapshot = world.view()`
4. `renderer.draw(snapshot)`

## Refusals

- Mixing rAF and sim into one `update(dt)` that makes rules depend on fps.
- App drawing triangles.

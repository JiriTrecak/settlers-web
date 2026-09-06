# Sim

Headless game. No Three.js. No DOM. Deterministic.

`World` is the match: clock, rng, map size, `Player[]`.

- `tick()` — increment clock, apply due actions.
- `enqueue(action, tick, envelope)` — from a Room `commit`.
- `dispatch(action)` — test helper: enqueue for *now*.
- `checksum()` — tick, rng, size, each player's id + cell.
- `view()` — snapshot for render.

Players are spawned from `MatchConfig.slots`. One entity per seat. `startCell(i, n, size)` places them.

`Action` is `noop` | `ping`. Sim ignores both this pass. Lockstep drops `noop`.

## Clock + RNG

- Quantum is 25 ms. Speed is how many quanta session drains per frame.
- Every random goes through `seedRng`. No `Math.random` in `src/sim`.

## Refusals

- Three.js, Pixi, DOM, `window` inside `src/sim`.
- Inventing a second player who is not a slot.

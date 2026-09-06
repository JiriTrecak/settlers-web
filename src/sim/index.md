# sim

Deterministic world. No Three.js, no `pixi.js`.

| Folder | Owns |
|---|---|
| `clock/` | 25ms ticks |
| `rng/` | Seeded RNG, never `Math.random` |
| `player/` | Player entity + start cell |
| `world/` | Match: clock + players + enqueue / checksum / snapshot |

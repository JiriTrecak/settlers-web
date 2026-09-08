# Simulation

`world/` owns the fixed clock, participant slots, RNG, future command queue and save envelope. A World requires a loaded map; each slot must have an authored start. There are no player-shaped world entities or fallback spawn positions.

`game/` owns all gameplay entities, jobs, claims, economy, navigation, combat, objectives and observation. `clock/` and `rng/` provide deterministic infrastructure. No renderer, DOM or network dependencies enter simulation decisions.

See [native system contracts](../../docs/declarations/systems.md) and [behavior reference](../../docs/declarations/behaviors.md).

# Formation destinations

Move orders assign native per-unit destinations. Assignment is deterministic and independent of selection order; input preferences and rendering never choose these positions.

For an already compact group, `formationDestinations` first tries translating its current rounded footprint around the clicked point. It preserves each member's relative slot when positions remain unique and in bounds, every destination is walkable, and every member has a terrain-clear straight route. Compactness requires the occupied bounding rectangle to contain at most twice as many cells as members, with each dimension at most twice the rounded-up square root of the count. These are native movement heuristics, not balance data.

If this cannot be done, the existing compact slot search and bounded pair exchanges apply. This includes dispersed armies, rounded collisions, map edges and terrain-obstructed translations. Single units retain their exact destination. The game supplies swept terrain clearance; actual movement still checks unit bodies, turns at the declared turn rate and uses the normal path/collision systems.

Preservation applies to both Move and Attack-move. It does not synchronize unit speeds, rotate the whole formation, reorder melee/ranged roles or move any actor outside its own movement system. Queued orders retain the existing issuance-time destination assignment.

Tests cover unique walkable slots, input-order independence, footprint preservation, obstruction fallback, rounding collisions, movement in four directions, immediate finite-turn reversals, swept clearance and save/replay. The ordinary-army benchmark is `scripts/bench/army-movement.ts`.

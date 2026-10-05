# Persistent traffic recovery

Long terrain routing and short traffic recovery are separate. Move/attack orders
use the terrain corridor; a blocked movement step does not run a map-wide search
with all live units as obstacles. It tries a bounded local detour that rejoins
the corridor, then waits/yields if no checked escape exists. The destination is
adjusted for occupancy only within seven cells (the four-cell recovery radius
plus the existing three-cell endpoint search). A physically blocked terrain
step still discards the stale route and lets the order planner reconnect it.

The local search is a quarter-cell grid bounded to four cells around the mover
and 256 visited nodes. Moving units and enemies retain cell reservations;
stationary allies retain physical collision. Terrain and body clearance are
checked again on every movement step. Recovery keeps the existing six-tick retry
cadence. This is not a flow field; shared group routing can be added independently
of the local collision and yielding contract.

Profiling splits discovery into candidates, body indexing, dependencies, cycles,
priority propagation and escape feasibility. Dependency discovery stops at the
first non-coincident route waypoint: the distant tail cannot affect the next
attempted step and must not be materialized. These scopes appear under Traffic
request discovery in the simulation profiler, including debug/MCP captures.

`trafficRequests.ts` derives friendly movement dependencies when a mover has made no positional progress for 200 ticks (five seconds). A predicted movement dependency is included only if that actor can finish facing its next waypoint within the current tick's turn allowance, matching movement's one-degree tolerance. Units still turning do not close a false waiting cycle. It combines occupied-cell and swept-body blockers, identifies directed cycles, and propagates a stable root priority through their incoming dependencies. The graph is temporary; it is not saved or sent over the network.

`GameContext.beginTrafficYield` tries up to six nearby escape pockets using the bounded local path search. A successful maneuver records its original goal, reserved waypoint, path points, waiting leader and deadline in native unit state. Both ordinary movement and free-cell searches respect the reservation. The reservation does not create an invisible physical body.

At a terrain constriction, the usual yielder may be the wrong actor: it can be inside the gate while its lower-ID counterpart is outside with room to step aside. If neither immediate lateral direction is terrain-clear for a preferred yielder, and none of the preferred yielders has a checked escape path, negotiation tries another stalled member of the same cycle. The shared read-only `trafficEscape` planner verifies feasibility; movement checks it again when executing the request. This reversal is deliberately limited to terrain constrictions. Applying it to all crowded open space regressed a wider-passage benchmark.

At the pocket, the unit waits until the leader clears the vicinity, becomes unavailable, stops, or the 120-tick deadline expires. The deadline starts when the maneuver begins. The unit then reconnects to its original destination. Replacement orders cancel recovery immediately through the normal order interruption path. Terrain, finite turning, actual body clearance, ownership and collision exemptions remain authoritative.

Save validation rejects self-leaders and deadlines beyond the maximum waiting interval. Missing or dead leaders are valid and release the wait. Tests cover all four rotations, collision clearance, reservation release, stop/death/timeout, interruption, and save/replay equivalence.

This is a fallback heuristic, not a deadlock-free pathfinding guarantee or an implementation of PIBT. See `docs/declarations/combat-feel.md` for current movement contracts and validation guidance.

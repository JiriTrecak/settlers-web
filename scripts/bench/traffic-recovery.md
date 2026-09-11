# Traffic recovery trace

`combat-traffic.ts --report=/tmp/traffic.json` includes the output of
`TrafficRecoveryTrace`. It reads native positions/orders/yielding state after each
simulation tick. It never issues commands or changes simulation state. The same
fixture with and without reporting must retain its checksum.

Each yielding episode records actor, leader, origin, pocket, timing and observed
ending reason. `ended-before-pocket` intentionally does not guess why the detour
ended. Leader displacement is net distance during the episode, not path length.
Movement totals include travel, net displacement, stationary samples while an
order is active, and the longest such stop; turns and collision waits both count
as stationary. Initial sampling before a tick does not count as a stopped tick.

Use the trace alongside the existing crossing progress and final waiting graph.
An arrival count alone can hide hundreds of cells of route churn. Reporting adds
CPU overhead and is not an in-game performance benchmark. It is intended for
fixtures that retain the same actors throughout their move orders.

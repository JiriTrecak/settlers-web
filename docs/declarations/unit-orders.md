# Unit orders and command feedback

## Player contract

An ordinary move, attack, gather, pickup or build command replaces that actor's intentions. **Shift appends** instead. Stop clears the active intention and the pending queue. Each unit has one active order and at most **16 pending orders**; group commands append independently for every eligible selected unit. Full queues reject further appends without charging for construction.

The focused friendly unit's pending orders appear as numbered icons in the selection panel. Hover shows the order and target. These are read-only; use a normal command or Stop to replace the sequence. Shift-selection remains selection, and right-click while choosing a target still cancels targeting.

## What completes an order

- **Move:** arrive at the reachable destination (formation offset included).
- **Attack-move:** handle threats encountered on the way, then arrive.
- **Attack target:** target dies, disappears, becomes invalid or leaves vision. It does not chase hidden coordinates.
- **Gather:** repeats normally when there is no pending order. With an order waiting, finish one load and deliver it to a hall, then advance. An exhausted source with no remaining work also advances.
- **Construct:** finish the chosen building. Shift placement creates and funds the site immediately, then reserves it for the chosen worker. Other automatic builders cannot take a reserved queued site. A removed/completed site is skipped. Activating the queued order never pays again.
- **Pickup:** finish pickup; skip if the item disappears or inventory eligibility changes.

Target validity and capabilities are checked again when a queued order becomes active. Invalid pending targets are skipped in the same tick. A statically unreachable move ends with a notice. Cargo is delivered before changing tasks, including after Stop. Removing a queued build order does not demolish its already-paid construction site; cancel that site separately for the normal refund. Unassigned unfinished sites retain the existing automatic construction recovery.

Initial scope is these native spatial/work orders. Spell casts, item use, recruitment and production controls keep their existing immediate behavior; they are not Shift-queued unit orders. Building recruitment has its own funded production queue.

## Architecture

- `Action.append` is an optional validated transport field for move/attack/gather/pickup/build. Lockstep packets remain commands issued at a tick; they are not the unit's future itinerary.
- `UnitOrder` and `unit.orderQueue` are authoritative, typed simulation state. The queue stores persistent entity IDs or map coordinates, never a precomputed path or UI callback.
- `UnitOrders` owns append/replace/advance; Game validates activation; Economy, Combat and Inventory own task completion. Navigation remains a native system.
- Only the owner's observation exposes `control.orderQueue`. Presentation resolves labels/art from content and observed targets. A queued worker is unavailable for automatic recruitment and idle wandering.
- Queues are saved and checksummed. Simulation build `declarative-sim-16` identifies the changed state contract; incompatible saves/peers should start a fresh match.

## Feedback

Accepted player intentions emit transient presentation receipts. The local player sees a terrain-conforming ring at the commanded location: **white once for move/pickup, red twice for attack/attack-move, green twice for tree/mine gathering**. Rejected orders, opponents' commands and automatic queue advancement do not emit local acknowledgment rings. Target positions come from observation, never hidden state.

Each pulse lasts 0.4 seconds with a 0.15-second gap. Wall-clock timing keeps feedback readable at accelerated simulation speeds. At most 24 markers exist; expiry disposes geometry and material. They do not enter collision, picking, saves or checksums.

## Picking and mining movement

Unit clicking uses a padded screen-space capsule from the rendered feet to declared health height. The minimum clickable width is 28 CSS pixels, independent of render-resolution scaling; the nearest body wins in crowds. Only visible, living, observed units participate. This changes neither gameplay collision nor box-selection rules.

A resource may declare `gatheringUnitCollision: false` (the Amber Mine does). Workers actively assigned to it, including a committed return trip, ignore unit blockers both when planning and executing motion. Other units can also pass through those gatherers. Static terrain, water, buildings and resource footprints remain blocking. Pending mine orders do not grant this behavior early. Trees retain normal unit collision.

## Command-card visibility

`actions.overrides["build:<definition-id>"].hidden: true` hides a command from every capability-generated worker card. It does not delete its definition, editor placement or simulation support. Overrides also assign category and priority. The current basic menu is Worker House, Barracks, Amber Sanctuary; Forester and Watchtower are hidden. Empty categories disappear automatically.

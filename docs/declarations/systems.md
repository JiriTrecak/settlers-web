# Native simulation contracts

## State and tick ownership

`Game` orchestrates `GameContext`, `Spatial`, `Economy`, `Combat`, and `Observation`. The authoritative state schema is in `src/sim/game/state.ts`. Entity, work, claim, queue, and fact IDs use monotonic counters. Expanded map placements instantiate in ordinal authored-ID order. Random UUIDs are permitted while authoring maps, never during simulation.

World requires a loaded map and one authored start for each participant slot. Slots are sorted metadata, not extra world entities. World applies committed commands, queues deterministic AI intentions for the following tick, then advances the game once. Each fixed 25 ms step runs:

1. Assign claims, deliveries and ready work.
2. Plan orders/pathfinding and move units with fixed-point continuous positions.
3. Resolve simultaneous combat damage and death cleanup.
4. Advance delivery, construction, recruitment, production and regrowth.
5. Update knowledge and evaluate main-hall objectives.

New/completed output becomes eligible on the following tick. Performance timestamps are diagnostics only and excluded from state/checksum. Rendering interpolates positions independently and cannot change simulation time.

## Economy and work

See [the colony economy contract](../game/economy.md) for current values and player-facing rules. A currency exists in a hall store, reserved project inventory or a worker's cargo. Ground equipment is a separate selectable hero-item entity. Currency definitions cannot be placed or dropped as ground entities. Claims reserve quantities/capacity and are not additional goods.

Construction reserves its full bill before creating a site. Funds transfer atomically from hall stores; the assigned builder walks to the site and works. Construction HP growth adds only newly supported health, preserving damage already taken. Repair costs time only. Queued producers fund the complete head bill before a bounded prefetched successor. Stable queue IDs survive removal of other entries. Refunds return to an accepting owned hall; amounts with nowhere to go are recorded as lost.

Harvesting takes finite yield from a source, reserves destination capacity and returns cargo to the hall. `work.harvests` supplies worker recipes. A mine is a neutral building with yield and `gatheringCapacity`; direct harvest assignments reserve a slot for the whole carry/return cycle. Timber can continue at a nearby matching tree; a finite-capacity mine does not silently redirect to another. Foresters use the native plant verb. A carrier first finishes a legal handoff before pending movement; if no store can accept the load it retains cargo and retries.

Recruitment claims an unassigned matching worker, contains it after physical arrival, and transforms that same ID at completion. Employed workers, gather orders, builders, cargo and pending moves exclude workers from recruitment. Completion atomically checks deployment space, consumes money and removes the queue entry. A blocked exit retains the worker and funds. Cancellation/destruction releases the worker or records a pending release until space exists. Death records cargo/inventory losses explicitly.

Population producers declare `{ capacity, intervalTicks }`. Completed owned producers contribute a shared living-worker cap. Workers count regardless of job or containment; army units do not. Births are checked sequentially against that shared count. Producers wait/reset at capacity and replenish after losses or conversion. Pausing halts progress without removing capacity. Destroying capacity does not kill excess workers. Timers, queues and interrupted deployment round-trip through snapshots.

Units occupy navigation cells. Opposing allied traffic yields deterministically, with safe sidesteps and blocked-route retries. A failed route for one worker cannot mark others unavailable. Growing resource sites remain nonblocking until mature and delay maturity while occupied.

## Ownership, combat, visibility

Owners are `player.1` through `player.8`, or `none`. Match slots are zero-based at the transport boundary only. Teams determine player hostility. Unowned buildings/items do not collectively form an economy. Neutral-defense units attack according to their explicit camp policy and return home after exceeding the leash. Camp health does not reset. Declared weighted loot pools drop hero items; equipment, progression, abilities and revival have explicit state and lifecycle systems.

Normal hostile orders validate ownership, capability and visible damageable targets. Forced attack explicitly permits friendly damage. Simultaneous deaths can produce a draw when both objective-bound forts fall in one tick. Extra forts are not defeat conditions.

Knowledge has three states: unexplored, explored, visible. Terrain and scenery render through that fog; enemy moving units disappear when no longer visible. Static building/resource memories keep only last-seen public data. Enemy production queues and inventory never enter player views. There is no territory simulation or border rendering. Building legality uses explored terrain and physical constraints, independently of owner distance.

## Persistence and determinism

Game snapshots contain authoritative entities, orders/waypoints, precise fixed-point positions, employment, jobs, claims, queues, production progress, cargo, pending release/movement, growth, accounting, objective/outcome state, and every player's memories. They require current schema, simulation-build identity, canonical content fingerprint and map fingerprint. World adds clock/RNG, slot/team identity and future AI intentions. Transport state separately preserves committed but unapplied inputs, room-held bundles and unsent local outboxes. Singleplayer's Save/Load buttons use this complete snapshot in the same map revision.

Checkpoint checksums use a streaming state digest; fog typed arrays are traversed directly rather than expanded into JSON arrays on each checkpoint. Save serialization remains ordinary JSON. Presentation views are never save files. Incompatible or invalid saves fail before committing a replacement state.

## Adding a native behavior

1. Specify the capability's bounded data and which entity kinds may carry it. Add it to `schema.ts` and graph validation.
2. Define authoritative state and defaults, including ID references, interrupted work, death, and cancellation.
3. Implement an explicit system operation at a documented tick phase. Use stable ordering. Avoid wall-clock/random/renderer-dependent decisions.
4. Expose allowed client intentions in `actionSchema`; validate them independently of UI availability.
5. Add observation fields only with a visibility/privacy policy. Add renderer-neutral command bindings and tooltips where needed.
6. Include every authoritative field in snapshot validation/checksum and test future continuation after restore.
7. Add a scenario test that demonstrates interaction with existing systems, not just the new field in isolation.

Lua is deferred. These commands, facts, queries and lifecycle rules are the intended boundary for a future trusted scenario adapter. Do not expose unrestricted spawn or ownership mutation to player packets.

## Ground navigation and continuous movement

Navigation occupancy stays on a cell grid, but unit positions do not. `unit.position` stores integer thousandths of a cell; entity x/y tracks the nearest occupancy cell. A null position means the entity is exactly at its authored/deployed cell center. Rendering and combat range use the precise position. Stops preserve mid-cell positions; deployment/release reset them. Each segment saves its origin, destination, length and traveled distance, avoiding accumulated rounding drift. Snapshots validate segment progress and that precise positions agree with occupancy cells.

The planner first tries a direct swept line to the destination. When blocked, eight-neighbor integer A* finds a corridor, then line-of-sight smoothing removes unnecessary grid waypoints. Units advance directly along those segments at any angle each tick, spending speed × 1000 / 40 distance units. Leftover distance continues across waypoint boundaries. This is actual simulation movement, not a cosmetic renderer shortcut.

A* uses an octile heuristic, costs 1000/1414, stable heap ties and reusable generation-stamped buffers. Integer supercover ray traversal checks every crossed cell, including both sides at exact corners and slope limits. A conservative 0.2-cell half-width sweep protects buildings, terrain and resources. Execution repeats the sweep for each movement segment, checks unit occupancy and 0.4-cell pair separation, and replans/yields deterministically when blocked. A newly occupied delivery goal can choose a nearby free handoff point.

The current simulation identity is `declarative-sim-13`; saves and peers with incompatible content or simulation identity are rejected. These geometry/collision algorithms are native systems, not content-configurable behavior code.

### Building placement orientation

During gameplay placement, R rotates by 90 degrees and Shift+R reverses it. The orientation persists for repeated placements until targeting is cancelled or another command is selected. The footprint and pale entrance marker update immediately at the pointer; validation and the queued build command use the same rotation. This is local targeting state until placement is submitted. The existing simulation rotates occupancy and entrance offsets, and stores rotation in entity snapshots.

Placement rendering uses a translucent clone of the declared building asset at its declared scale and selected rotation, with shadows disabled. A terrain-following white grid marks the footprint; invalid locations tint the grid and model red. Geometry is shared with the loaded asset, materials belong to the preview, and grid geometry is replaced only when its cell location or dimensions change. Cancelling hides all placement visuals.

### Idle worker movement

Worker movement declares speed 4, walkSpeed 2 and idleWander true. Normal orders and deliveries use run animations at speed 4. Only unassigned workers with no orders, cargo, job, employment or combat activity take occasional walk-animation strolls at speed 2. Soldiers hold position.

On entering idle state, a worker saves its home cell and a deterministic next-stroll tick. Every 6–12 seconds it may walk to a clear neighboring cell within the original home's 3×3 neighborhood. Arrival never moves the home anchor. Orders/work reset the idle state; a later idle period anchors at the new location. Tick/ID hashing chooses intervals/directions without wall-clock randomness. Idle state is saved and checksummed.

Slower traffic also exposed a yielding issue: a successful coarse route could still lead into another unit's physical body. Higher-ID friendly traffic now checks a safe sidestep when blocked even if a replacement route was found. Swept collision checks still govern every step.

### Selected health indicators

Selected buildings display 16 outlined segments; selected units display four pips in a shallow arc. Unit tiers are green above 75% HP, yellow above 50%, orange above 25%, red through 25%, and empty/dead at zero. Observed health decreases start a 40-tick (one-second) flash on the last filled pip. Buildings show these indicators only when selected; damaged units also show their pips without selection. Cached sprite textures are shared across entities; no animation event affects health.

Explicit attack targeting is exposed to the owner as unit.commandedTarget, separately from automatic combat target acquisition. Selected attackers highlight their visible ordered targets with an unfilled red footprint outline. Selection changes, interrupted orders, target removal or fog hide the outline. Attack-move acquisition does not create this marker.

Unit facing follows the horizontal delta between consecutive observed simulation positions, independently of visual position interpolation. Repeated render frames preserve facing; slow idle steps and normal movement use the same rule. Terrain elevation changes do not trigger a turn.

## Combat balance and recovery

`stats.ts` resolves level records, equipment and percentage buffs once for every consumer. Basic attacks use the resolved attack interval, including level changes; mana presentation and revival use the resolved maximum. The observation schema includes these resolved fields and accepts fractional raw attack bonuses. Exact XP, inventory and mana remain private.

`damage.ts` is the common simulation/AI damage path: class multiplier, positive-armor curve when the attack type allows it, strongest temporary reduction, then one nearest-integer rounding. Positive hits have a minimum of one; immunity remains zero. AI nominal strength uses the same armor curve and resolved attack speed; actual focus/spell estimates use the common matchup calculation.

`regeneration.ts` runs once per fixed tick for ready living deployed units. An entity stores `regeneration.health` and `.mana` integer remainders below 40,000; adding the rate in millipoints every tick gives exact whole-point recovery at 40 Hz. Full pools clear their remainder; fallen or contained units do not recover. Saves include these remainders. Level-up adds increases in maximum HP/mana to current pools, preserving damage and mana spent. Reviving clears remainders and fills the resolved pools.

Spells collect targets before applying a declared area budget, then feed damage into simultaneous combat resolution. Stuns affect units only and use the declared hero duration factor. Offensive status expiration is independent of the damage budget. Identical Rally effects refresh. Current Faultline/Crownfall budgets are six targets.

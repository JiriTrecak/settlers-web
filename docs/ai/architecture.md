# AI architecture rationale

Implementation status: see [implementation.md](implementation.md) for the shipped source layout and exact contracts. This document preserves the reviewed architecture and future extensions; examples explicitly marked illustrative are design examples.
Reviewed design for one AI with coordinated economy, hero and army planning. Companion: [opponent design](README.md), [adversarial review](adversarial-review.md).

## Ownership and boundaries

Create one `PlayerAI` per AI slot, owned by `World`. It consumes a read-only owner observation, immutable public content, and a frozen sanitized `MapBriefing`, maintains its own serializable memory, and proposes ordinary `Action` values. It cannot hold `Game`, `GameContext`, `Spatial`, authoritative entities, the unrestricted map document, a renderer, or an unrestricted query callback. All slots initially use one strong AI policy; no personality system is required.

Keep the existing neutral camp behavior in `Combat` separate. A territorial animal does not need a colony economy, build plan, or strategic opponent model.

The flow is:

```text
Completed simulation tick
  → initial map briefing + owner observation + owner command receipts
  → AI knowledge and assignment reconciliation
  → strategic economy / hero / army targets
  → economic work and army operation proposals
  → encounter execution and tactical proposals
  → resource + actor arbitration / reaction and attention limits
  → normal queued Action, committed on a future tick
  → normal simulation validation and execution
```

HTML command cards remain another adapter over the same capabilities and actions. Do not make the AI click the HUD, depend on localized tooltip text, or mutate production queues directly. A future Lua scenario adapter can submit these same intentions; privileged spawning/ownership changes would need a separate trusted scenario API and must never become legal player packets.

## Observation contract

`Observation.view(owner)` already hides enemy queues and inventory, filters events by owner, gives only the owner's objective, and retains static fog memories. Reuse that live-information policy rather than inventing a second visibility system. Add a narrow typed AI projection on top of it and owner-private information that the current presentation view omits. Initial map knowledge is a separate explicit input, not a reason to expose live entities through this projection.

### Initial map briefing

Compile `MapBriefing` from the immutable authored starting map once, before simulation changes. Include static terrain/elevation and route topology, public initial resource sites, and camp sites with stable POI IDs, positions, and public nominal composition/difficulty. Possible starting locations may be public; do not include their actual player assignment unless the match explicitly publishes it. Secret campaign placements, triggers, future spawns, runtime entity IDs, actual loot outcomes, live camp member lists, and changed resource quantities are excluded.

The briefing defines initial expectations, not verified current occupancy. It is safe to route toward a known camp before scouting it. It is not safe to ask the engine whether that camp still exists, which members remain, or whether another player took its loot. Public loot-pool probabilities can inform expected value; the actual seeded draw cannot.

Fingerprint the briefing with the map/AI contract. Restoring a save uses the same authored initial briefing plus saved observations/beliefs; it must never rebuild the briefing from the current simulation or silently refresh its camps from the map loader's live instances. This initial-knowledge contract should also be available to a future human map briefing or reference display; normal fog rendering still hides live changes.

### Live observation

Proposed `AIObservation` groups:

- `tick`, own owner, public team relationships, map dimensions, public match outcome.
- Own units/buildings: precise observed position, health/stats, typed current order, assignment/work state, cargo, employment reference, containment/release status, construction, production progress, remaining lifetime spawn count, rally destination, known incapacitation, own effects and spell/inventory/progression state.
- Owner resource ledger: currently spendable hall stores, committed project stock, pending/in-transit income. Prefer structured debit/deposit events or explicit counters for income; a fall in bank balance caused by construction must not be interpreted as negative harvesting productivity.
- Visible entities: only public, currently observable information. Static memories carry the last sighting tick and last seen values. The brain may retain a mobile sighting after it leaves vision, but does not receive the live entity again until visible.
- Geography: owner-visible territory, visibility coverage, and observed changes to the initial terrain/obstructions and resource sites. The frozen briefing supplies static geography; fog limits knowledge of subsequent changes. Newly scripted non-public sites enter knowledge only through permitted observation.
- Own fallen hero roster and accepted command receipts.

Do not parse `EntityView.job` strings such as “Waiting for an unassigned settler.” Define a small owner-private work-status enum and references. The existing planner reads context because this structured information is absent from the current view; the new boundary should remove that need.

Expose the player-visible relationship/targetability of an observed entity through the shared rules projection. Different owners may be allied; `none` may mean a hostile creature, a passive scenario unit, or an item. Never treat `owner !== myOwner` as sufficient reason to attack. Normal skirmish AI does not issue forced friendly-fire commands. Camp POI IDs identify expected locations, not legal attack targets: associate only actually observed units with encounters, and never resolve a POI through a hidden runtime member list.

The existing `EntityView.unit.cooldown` is emitted even for visible enemies. The AI projection must not turn this implementation detail into frame-perfect attack knowledge. Hide exact enemy cooldown values; infer approximate readiness from witnessed attacks if needed. Likewise, enemy private equipment, spell mana/cooldowns, orders, and selection state do not enter the brain. Visible public stats remain permissible.

Geography is a particular trap. Estimating travel over the public initial terrain is allowed, including routes not yet visited. Querying the engine's complete current route or path cost can expose unseen new buildings, moved units, or removed trees. Strategic route estimates use initial topology plus observed changes and uncertainty about current occupation. Normal movement remains authoritative, including collision handling shared by all players. Failed progress produces “route not making progress,” not a list of hidden blockers. Scouting reveals the cause.

Normal automatic gathering currently chooses nearby replacement resource sites internally. Both humans and bots share that behavior. The AI cannot query its live candidate list to discover remote depletion or occupation. Knowing initial deposits from the briefing is explicitly permitted; knowing how much they contain now requires observation. Audit this distinction when testing hidden-state changes.

## Brain state

Save the minimal state that can change later choices:

- Shared policy revision and map-briefing fingerprint, deterministic random state, decision schedule, reaction deadlines, attention tokens and refill remainder.
- Dated sightings and camp/resource beliefs keyed to public POIs or new observations, bounded threat beliefs, inspection/revisit deadlines, observed local changes. Camp belief distinguishes expected, seen-active, seen-empty, and confirmed-cleared; partial visibility cannot automatically confirm a clear.
- Strategic economic targets, hero milestone and progression gap, army requirements, spending/worker reservations, and the evidence that justified them.
- Current army operation, stage, target, assignment IDs, start/commit/expiry ticks, success/failure conditions, bounded failed-target history.
- Squad membership and mission, retreat/staging points, formation subgroups, progress checkpoint and retry state.
- Workforce assignments, promises of unassigned recruits/builders, expected house output, economic plan and provisional resource reservations.
- Pending command IDs/receipts and deduplication state, item replacement sequence, hero recovery state.

Derived spatial indexes and cached candidate scores can be rebuilt. If a computation is deliberately spread over ticks, save its work cursor and relevant inputs or restart it in a way proven to produce the same future commands. Excluding a cursor from the checksum because it is “only a cache” is unsafe when completion time changes a decision.

Bound memory by meaningful observations and capped histories. A 512×512 map does not justify per-unit full-map tactical arrays or storing every seen movement frame. Immutable initial topology can be shared across brains; each owner keeps visibility and observed-change overlays. Strategic/operational computation should use coarse regions; tactics use local sets.

## Strategic targets, operations, and execution

### 1. Strategy: coordinated economy, hero, and army targets

Reconcile the briefing, observations, and receipts into beliefs. Produce one coordinated `StrengthPlan`: economic income/workforce goals and candidate investments, a meaningful hero milestone, army composition/readiness requirements, and resource/worker reservations. This is a short rolling plan, not an exact build script or a schedule of every future command.

Compare the marginal benefit of the next economic investment, army reinforcement, or hero-support commitment against its cost and risk. Account for workforce conversion, estimated delivery/payback time, resource saturation, known pressure and uncertainty, and the operation that more power would enable. Use bounded integer/fixed-point heuristics with stable ties, not an exact future-match simulator or fixed economy/army percentages. Benefits must not be double-counted: the same level-up is not both a full independent reward and a duplicate increase in army value.

A hero milestone references the actual progression/ability definitions: XP needed for the next useful rank, a declared level requirement, or an equipment improvement. Death imposes downtime and risk but does not erase retained progression. At the level cap, additional XP has no value; loot, map control, or a direct attack can still matter. Economic development continues while the army works toward the milestone.

Keep worthwhile targets until circumstances or a completed milestone justify revision. Owner-visible threats can trigger emergency reassessment. A single empty camp should change the operation, not reset the whole economy and hero strategy.

### 2. Operations: what the force should do from its actual position

Within the strategic constraints, evaluate a bounded candidate set: inspect/clear a known camp, verify a resource site, defend, intercept a visible threat, raid a known exposure, assault a discovered base, or regroup. Camp availability is a belief based on the briefing and last observations. Walking to a camp cleared unseen by the player is permissible and sometimes expected; choosing to avoid it because the live camp list changed is not.

Score practical benefit and milestone progress against travel/clear/recovery time, losses, uncertainty, and leaving home exposed. Initial composition is a prior; observed remaining members update it, while unseen members stay uncertain. Choose a short next operation rather than a rigid tour of every camp. Reevaluate at arrival, a verified empty site, completion, new contact, or meaningful loss.

Keep the current feasible operation unless an alternative beats it by a margin or an actual safety interrupt applies. Start with one main force including the hero, plus useful home/scout detachments. An operation has assemble/travel/engage/regroup stages and owns its units. It does not independently decide the colony's spending plan.

### 3. Execution: economy work and encounter tactics

#### Economy executor

Given an economic target, propose affordable construction, worker reassignment, recruitment, pause/cancel, rally, and revival commands. Query actual expanded capabilities and creation recipes. Categories used to lay out the HUD have no strategic meaning.

Distinguish current workers, committed recruits, unavailable cargo carriers, workplace staff, and future workers. A plan promises a workforce count, not authority to pick an exact recruited actor: the existing `produce` command lets the economy select an eligible worker. Reconcile which worker was actually consumed. If future explicit staffing is needed, add a player-usable assignment command instead of an AI-only back door.

Gathering orders keep workers ineligible for recruitment. To reserve a recruit, issue the appropriate normal stop/release action and wait for the owned work state to confirm eligibility. Cargo may still need a handoff. Do not enqueue twelve soldiers assuming twelve workers are already free. Keep queues shallow enough to preserve strategic choice.

Price reservations are internal promises, not new simulation currency. Start from actual available hall stock, subtract pending unacknowledged spending and higher-priority accepted promises, and release those reservations on acceptance, rejection, or expiry. Accepted construction debits are already reflected in the next observation and must not be subtracted twice. Queue acceptance and actual funding are distinct: read the producer's current commitment state instead of assuming the whole tail is paid for.

Assign resource priority from the next few affordable goals and observed delivery rates. Continually seek productive growth beyond the opening: add workers when access and payback justify them, replace converted/lost workers, relieve congestion, replenish trees, and fund the next army requirement. Apply a reassignment deadband/minimum tenure. Avoid pulling a carrier into a different job simply because the preferred wood-to-amber ratio moved slightly.

Prepare expansion as a native compound project using the same planner: verify/secure a public or observed resource site, build an affordable permitted drop-off, staff it, and defend the route. Feasibility requires an actual buildable `storage.dropoff` capability, suitable accepted resources, placement access, workers, and protection. Keep the project ineligible under today's build list; do not invent a free hall or mark simulated expansion income as real. When expansion becomes legal, it competes on delivered-income improvement, payback, and defense cost with reinforcing the current base. Its military escort remains assigned by the same operations planner.

Building placement samples a bounded set of positions and 90-degree rotations in known owned terrain. Reject blocked footprints, deposit clearance, bad slopes, sealed entrances and planned hauling/deployment corridors. Validate against observed data for planning; the real `build` command remains the final authority. A failed candidate gets a cooldown keyed to observed map revision and a retry limit.

#### Military and hero executor

A squad is a set of actor IDs with one mission, staged subgroups, a staging/retreat area, and progress. It is not a persistent game entity and adds no movement behavior. Issue group moves/attack-moves for travel, then a limited number of local adjustments.

Use native, small tactical evaluators for engage/withdraw, target choice, a ranged reposition, and declared spell effect families. Read geometry and rank parameters from content and share pure effect-shape math with simulation/preview where practical; the AI must not create a subtly different Faultline radius.

Candidate spell targets come from visible enemies, a bounded sample of pair midpoints/cluster centers, and a few headings. Evaluate only legal learned spells with available mana/cooldown. Account for existing buffs and cast time. Do not exhaustively optimize every cell in casting range or read unseen actors. Projected movement is based on consecutive visible sightings, with uncertainty, never route endpoints.

An attack order cleared by fog is not automatically a completed mission. A cast clears ordinary movement/target state in the current engine; rejoin the squad's mission after the cast resolves. A stunned hero cannot pick up, cast, or retreat, even if its local executor urgently wants to. Commands waiting behind a cast or stun are revalidated later.

Item swaps are a multi-step plan with actor ownership, slot/item identity checks, acknowledgement, and abort conditions. Do not replay “drop slot 2” after the inventory has changed. Revival uses the private fallen roster and queue, not a missing-live-unit guess.

### Arbiter and scheduling

Executors submit proposals with actor set, mission ID, priority class, expected resource/worker commitments, earliest tick, expiry, and a reason. These are internal records, not a new programmable command language.

One actor gets at most one conflicting intention in an arbitration beat. Emergency evacuation may take control from a routine job; economic housekeeping cannot steal an attacking Marshal. Budget a macro lane and tactical lane so repeated combat cannot starve house construction forever, and construction cannot prevent an urgent retreat. Urgency still consumes a finite burst budget; an attack on every worker does not authorize infinite commands.

Maintain a per-actor meaningful-order interval and group matching orders. Compare destination/target/mission before resubmitting; a new order every tick can reset navigation, gathering, or attacks. Do not charge continuing engine auto-attack/gather cycles as new AI commands. Split orders above the existing 160-actor action limit using stable groups.

Initial scheduling hypotheses at 40 Hz: local tactics every 20 ticks, operations every 40 ticks or at a mission milestone, economy every 80 ticks, strategic targets every 200 ticks or on a major change. These are profiling seeds for one strong baseline, not Easy/Normal/Hard presets. Keep meaningful-order throttling and measured reaction windows, but do not impose the earlier two-orders/second proposal as a strength ceiling before testing. Repeated damage updates must not keep postponing the earliest pending reaction; after responding, new changes can schedule another one.

Deadlines follow the simulation clock and pause with it. Computational completion can delay a decision but cannot accelerate its reaction window. Stable seeded variety should be scoped per owner/decision purpose so adding a cosmetic random choice does not reroll the whole match.

Reaction limits apply to new player-level decisions, not the shared unit simulation. A soldier may automatically acquire a nearby enemy on the same engine schedule as a human-owned soldier. The planner must still wait before ordering an evacuation, retarget, spell, or recall in response to new evidence. Otherwise difficulty would quietly change basic combat behavior.

## Declarative authoring

Replace the obsolete fixed-build-order `rules.ai` shape with one bounded validated policy in that same content namespace. Do not add `aiProfiles`, personality selection, or multiple flavors for this milestone. An illustrative replacement policy, **not current loader syntax**:

```json
{
  "revision": 1,
  "composition": [
    { "definition": "unit.ants.warrior", "weight": 60 },
    { "definition": "unit.ants.archer", "weight": 40 }
  ],
  "skillPreference": [
    "spell.marshal.faultline",
    "spell.marshal.rally",
    "spell.marshal.carapace",
    "spell.marshal.crownfall"
  ],
  "risk": { "camp": "cautious", "raid": "balanced", "assault": "committed" }
}
```

This documents vocabulary, not a complete final schema. Add only knobs with an actual policy consumer and validation. The example composition is a baseline preference, not a fixed army ratio that overrides current threats and operational needs. Economic/hero/army targets are computed state, not three static preference weights. All AI slots initially use this policy; future difficulty can remain separate without building its selector now.

Unit costs, HP, armor, speed, worker input, abilities, output lists, and build permissions stay solely in their existing definitions. Native classification can distinguish melee/ranged, worker, hero, drop-off, population producer, and revival from these capabilities. The policy references persistent definition IDs for preferred composition; it must not copy unit stats or infer them from asset filenames.

Validate every policy reference, finite bound, supported enum, recruit recipe, reachable producer/build permission, and learnable ability. An unknown native effect family is unsupported content until an evaluator is added; choose a safe supported tactic, never guess its semantics. No arbitrary formulas, code strings, pathfinding selection, or embedded Lua in AI JSON.

## Command receipts and multiplayer

`Game.command()` already returns an acceptance result, but `World.applyDue()` currently discards it. Preserve a bounded owner-private receipt stream associated with the queued sequence/command ID. Use structured reason codes for control flow; retain display messages for the HUD. A queued build is a pending request until its receipt and owned state confirm it.

Plan after `Game.tick(t)` has completed its observation/outcome update, and enqueue accepted intentions for tick `t+1` or later. Thus each decision has one coherent completed-tick input; it does not see half-applied human commands before the matching simulation tick. Apply all commands through the same validation, ownership, and resource checks. This is a proposed change from the current plan-before-game-tick ordering.

Keep deterministic AI generation inside `World` on every lockstep peer, matching the current ownership model. Do not also inject host-authored AI commands into those same peers. Stable slot order, unique increasing AI sequences, fixed-point scores, independent seeded randomness, and canonical policy/briefing data must produce identical commands. Networking latency does not excuse hidden-state access or nondeterministic decisions.

Snapshots/checksums include all brains, receipts needed for reconciliation, pending reservations, command sequences, schedules, reactions, and pending actions. Include AI policy schema and initial-briefing identity in the content/map/protocol checks and advance the simulation build when cutting over. Reject incompatible old snapshots; there is no requested legacy compatibility layer.

For an eventual input-log replay, choose explicitly between re-running the deterministic brain from human inputs or replaying the complete command log with brain generation disabled. Never run both. A spectator's omniscient view and developer overlays cannot be passed into an AI slot.

## Performance and explanation

No full world scans per unit, no repeated full A* searches to rank dozens of plans, no exact combat rollout, and no renderer-frame AI work. Build shared indexes once per observation revision, use coarse regions and local neighbor queries, and refresh threat beliefs incrementally.

Hard work limits should use candidate/entity/node counts, not elapsed milliseconds, to preserve determinism. For initial profiling, cap each review to a small candidate list (for example 16 strategic goals, 24 placement candidates including orientation, and 16 spell aim samples). Keep bounded continuations and prioritize urgent work without unbounded interrupts. These caps need measurements on real maps; they are design seeds.

An initial performance acceptance target is under 1 ms p95 added CPU per simulation tick across two bots on the agreed test machine, plus no visible frame-time regression in the existing forest/crowd scenarios. It is not a measured result or a whole-game 120 FPS claim. Test the supported maximum slot count as a scaling case and inspect observation, planning, arbitration, and navigation cost separately. Profile wall-clock timings, but never use them to decide gameplay.

Developer overlay and replay trace should explain: current economy target, hero milestone, army requirement, operation/stage, evidence and its age, chosen/rejected goals with a short score breakdown, squad ownership, worker promises, spending commitments, failed commands, reaction deadline, and meaningful orders issued. Distinguish initial map expectations, current observations, beliefs, and actual truth in developer views. An observed-data overlay must not reveal enemy secrets in normal play.

Use bounded traces/ring buffers. Explanations are structured reason codes and numbers generated alongside decisions, not reconstructed fiction. This is how we answer “why did it chase that worker?” without guessing.

## Clean implementation sequence

1. **Contracts and deterministic harness:** frozen map briefing, typed live owner projection, camp beliefs, receipt correlation, single-policy validation, brain state/checksum/restore, debug trace. Prove live hidden-state independence and save continuation.
2. **Coordinated growth:** preserve startup work, continually improve productive income, budget recruits/workers, and choose a hero milestone and army requirement together. Build reachable useful sites, recruit both roles, and inspect known destinations. Test shortages, saturation, workforce loss, and changed priorities.
3. **Hero and army operations:** camp selection from initial expectations plus sightings, useful XP/skills/items, assembly, combat execution, defense, bounded pursuit, retreat/regroup, reinforcement, and hall pressure. Keep economy running concurrently. Verify that an empty camp changes the operation without resetting the strategy.
4. **Recovery and continuity:** full inventories, interrupted casts, safe revival/reintegration, rebuilding after raids, and renewed economic growth. Prepare expansion feasibility/project contracts without introducing an unavailable building into play.
5. **Strength, fun, and scaling:** human rush, economy, and hero-progression matches on Mosswater, then Amberfall Wilds. Measure actual investment, milestones, pacing, and frame cost. One strong AI is the deliverable; flavor and difficulty variants are deferred.

These are review/verification gates within one replacement, not two shipping systems. Remove `Game.planAI()` and the obsolete `rules.ai` schema/content/docs in the cutover. Do not leave a legacy planner fallback. Gameplay balancing, remote drop-offs, new factions, and a general campaign director remain separate work unless we explicitly decide otherwise.

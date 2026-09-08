# Declaration architecture: scenario review

**Date:** 8 September 2026.  
**Scope:** Review before implementation. No game code changed and no rebuilt-runtime tests have run.  
**Authoritative specifications:** [Rebuild](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/declaration-rebuild-spec.md>) and [production/work](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/production-and-work-spec.md>).

## Verdict

**The architecture fits the game. The original documents needed several operational rules before implementation.** Definitions, a small set of composed capabilities, and explicit native systems handle the scenarios below without a universal entity hierarchy, a recipe language, or a parallel legacy implementation.

The material gaps were workforce deadlocks, storage prefetch, building command authorization, focused command/queue consistency, interrupted production, and exact restore/tick behavior. Proposed corrections are now incorporated into the two specifications. This review records why they are there and what implementation must demonstrate.

“Resolved” below means the specification now states a coherent expected outcome. It does **not** mean the current engine implements it. Architectural approval can proceed on these revised contracts; shipping the rewrite still depends on executable proofs and a complete match.

## What was checked

I traced the declared model through opening economy, military recruitment, disruption, combat/fog, editor authoring, and multiplayer restoration. I also inspected the existing selection, military/economy, save envelope, and checksum code to check that the replacement covers real current workflows rather than only hypothetical examples:

- [Military and camp behavior](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/src/sim/settlement/military.md>) documents the current opening, queueing, manual cargo orders, neutral leash, and free repair.
- [Current simulation](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/src/sim/settlement/settlement.ts>) distinguishes routes/checksum state from its presentation view. The new save model must preserve that distinction.
- [Current save envelope](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/src/shared/save/save.ts>) includes committed but unapplied commands. Rewriting the simulation must not discard that network requirement.
- [Selection](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/src/shared/settlement/selection.ts>) currently filters training settlers and favors soldiers. The new capability model needs both of those behaviors without role-name checks.

The historical `declaration-proposal.md` is now explicitly marked superseded, so its staged migration, TypeScript authoring, and portrait scope cannot be mistaken for the approved direction.

## Important corrections

### 1. Available workers must not deadlock while waiting for goods

**Previously:** construction could take all free workers before deliveries; employment excluded specialists from hauling even while they waited for inputs. A one-worker economy could therefore have reachable logs and a sawmill but nobody permitted to carry the logs.

**Correction:** missing-material construction requests carrying, not idle builders. Assign its builder only when material-ready. Idle employed specialists can borrow a delivery job, retaining employment. New automatic staffing requires actionable work, and committed workers reconsider delivery needs between cycles. Recruitment does not silently take specialists; a shared Pause/Resume production action releases them after committed work settles.

This is a liveness rule in the existing work arbiter, not a new carrier class or a configurable job language.

### 2. Prefetch must not steal the first recipe's space

**Previously:** “fetch two queued cycles” plus shared capacity could fill a workplace with the next entry's materials while the first entry still lacked its own inputs.

**Correction:** protect the head's full remaining input space and net output growth before any next-entry prefetch. Inputs removed at completion pay for the output space they release. All claims have one owner and one accounting meaning.

Real stock with no available destination may still block production. That is an observable capacity problem; contradictory reservations are an engine defect.

### 3. Direct control applies to buildings too

**Previously:** removing player control was supposed to reject orders, but queued buildings could recruit using ownership alone. The barracks example omitted the capability entirely.

**Correction:** buildings explicitly receive player control, normally through a reusable set. All direct operations check it and ownership. Under-construction buildings offer cancellation and inspection, with completed capabilities inactive. Worker build lists are explicit data references, shared between discovery and authorization.

### 4. One workplace must own both the visible queue and its buttons

**Previously:** unioning commands across all selections could show a secondary building's recipe while the middle panel described another building.

**Correction:** group unit orders use eligible subsets; workplace commands, queue, stock, and status follow one focused building. Clicking another building's selection card changes focus. Build resolves one worker before the request enters the queue.

### 5. A failed transition needs an explicit owner of what remains

**Previously:** “release the worker,” “reroute,” and “complete production” left unclear results when exits were blocked, sources died, training was interrupted, or a cancellation arrived twice.

**Correction:** goods stay in one physical location; reservations never become refunds. Recruitment retains the settler ID. Blocked deployment delays conversion/consumption, while cancellation/destruction can create a saved pending-release record if no exit exists. Destroyed goods are explicit losses. Parent demands survive lost suppliers and can request replacement material.

### 6. Equal commands are not sufficient without equal tick and restore rules

**Previously:** fixed ticks/checksums were required, but death versus production completion, mutual fort kills, pending commands, and deterministic allocation were not settled.

**Correction:** commands → movement → simultaneous combat/death → surviving economy → observation/objectives. Both forts dying in the combat batch is a draw. Saves contain authoritative state and transport progress, not an observation view. Definitions/map/build identity must match, and loading order/render timing never determines entity allocation or work decisions.

## Scenario walkthroughs

### S01 — A normal opening becomes an army

**Given:** Mosswater starts each player with one bound main fort, eight settlers, two warriors, and physical starting goods. Illustrative stock is 40 planks + 30 stone.

**Play:** select a settler, place a barracks costing 8 planks + 4 stone, deliver, construct, select the completed barracks, and queue a warrior. Deliver a further plank; a free settler arrives, trains, and deploys at rally.

**Expected:** construction actions come from the settler's `work.builds`; costs come from the barracks/warrior definitions. At the end, 9 planks + 4 stone were consumed. One settler became one warrior with the same entity ID; total unit population did not increase. The initial store capacity must hold the 70 starting goods. The 16-model display cap does not cap the fort's physical storage at 16.

**Assessment:** resolved by separating setup, construction store, workplace production, and visible stacks. Starting capacity is a content choice validated against stock, not a hidden initialization exception.

### S02 — One remaining settler builds a barracks

**Given:** only one eligible settler remains, but the full building bill exists in reachable owned storage.

**Play:** place the barracks.

**Expected:** the settler takes however many carrying trips are needed, then becomes its builder. It never sits at the site waiting for itself to deliver. If its path becomes blocked, the project remains but releases an unproductive worker claim.

**Assessment:** the original allocation rule could deadlock. Material-ready builder assignment resolves it.

### S03 — A sawmill worker has to fetch its own log

**Given:** the sawmill's specialist is the only available economic worker. A log is in a nearby woodcutter's output store; the sawmill has no input.

**Expected:** production demand exists without an active crafting worker. The idle specialist borrows the delivery, deposits the log, and resumes its employment to craft. A temporary hauling job cannot run simultaneously with sawing.

**Assessment:** resolves the employment-versus-activity ambiguity while preserving the user's “all hands” intent.

### S04 — Two barracks want the same last settler

**Given:** both queue heads have delivered planks, but only one unassigned settler is available.

**Expected:** canonical claim order chooses one queue entry. Its settler walks there; the other entry reports waiting for an eligible settler. Death or a manual order before containment releases that claim without deleting either queue's inventory. Pausing a staffed workplace provides more recruits once it releases its worker.

**Assessment:** queue admission is distinct from readiness. No artificial permanent-carrier reservation is needed. Deliberately recruiting the final worker may stall the economy, which preserves early-cheese risk.

### S05 — A future recipe nearly fills the barracks

**Given:** capacity is 16; the first queued unit requires 12 planks + 4 stone; the next requires planks. These are stress-test content values, not proposed balance.

**Expected:** after the 12 planks arrive, four spaces remain protected for stone. No second-entry plank can occupy them. Cancelling the first entry releases its claims and recalculates demand without inventing refunds.

**Assessment:** head-first protection closes a deadlock hidden by today's one-plank recipe. The same mechanism handles later iron inputs without per-unit logistics logic.

### S06 — Craft in a full sawmill

**Given:** inventory contains one log and 15 planks, capacity 16.

**Expected:** reserve the log, spend work, and replace it with one plank: occupancy stays 16. The cycle needs no seventeenth slot. If inventory instead contains 16 planks and no log, waiting for output removal is correct.

**Assessment:** capacity must check the transaction's final state, not require output space before subtracting inputs.

### S07 — Cancel a partly delivered building

**Given:** an 8-plank/4-stone bill is distributed as follows: the site holds 3 planks + 1 stone; a carrier holds 2 planks + 1 stone; sources still hold 3 planks + 2 stone.

**Play:** cancel the site, then receive a repeated stale cancel request.

**Expected:** source stock becomes unreserved, site stock becomes owned loose stacks, carrier cargo reroutes. Totals remain exactly 8 planks + 4 stone. The repeated request creates nothing. If the carrier dies instead, the surviving total is 6 planks + 3 stone with its cargo recorded as lost. If combat destroys the site instead of cancellation, delivered site stock is lost and surviving totals are 5 planks + 3 stone.

**Assessment:** this is the accounting proof case. There is no instant treasury refund, and cancellation differs explicitly from destruction.

### S08 — Lose a source or seal a route

**Given:** a project reserved material at a fort; some was picked up and some was not.

**Play:** destroy the source, or obstruct a delivery route while its destination survives.

**Expected:** destroyed source stock is lost, its unpicked claims disappear, and the project requests replacement goods. Already carried goods remain cargo. An unreachable delivery reports blocked/reroutes, and deterministic retry releases claims that cannot progress. Real lack of alternate storage can block cargo, but manual movement can reposition that worker.

**Assessment:** static content validation cannot promise future reachability. Runtime recovery must distinguish missing goods, unreachable work, and a full destination.

### S09 — Give a carrier a manual move

**Given:** a settler has picked up two planks and the destination still exists.

**Expected:** store its pending move, finish the committed delivery, then move. If the destination becomes unreachable, allow repositioning while keeping cargo. A specialist interrupted while sawing instead releases reserved input and loses unfinished work; it cannot continue sawing remotely. A training-contained recruit cannot move until its queue entry is cancelled.

**Assessment:** one arbiter owns interruption. Movement, employment, cargo, and contained training cannot each independently reset the same actor.

### S10 — Training finishes behind a blocked exit

**Given:** a recruit completes work but no valid deployment position exists.

**Expected:** work can be ready, but the entry retains its original settler and plank until deployment can commit. Repeated ticks produce no extra soldier. Cancellation preserves that same settler. If release itself is impossible, a pending-release record survives save/load and retries without occupying another production slot or becoming available to a second barracks.

**Assessment:** a rare geometry failure needs a defined state rather than deletion, duplication, or arbitrary teleportation.

### S11 — A house reaches its resident limit

**Given:** automatic resident production has `totalLimit: 3` and a valid unit spawn definition.

**Expected:** three successful deployments create three IDs and increment the count three times. A blocked exit or reload midway through work does not consume another allowance. Recruitment at a barracks changes neither this historical house count nor total population.

**Assessment:** the native distinction between spawn and recruit is sufficient; no house-specific entity branch is necessary.

### S12 — Two harvesters race for a depleted tree

**Given:** a tree has three yield left and two workers each carry up to four.

**Expected:** claims cannot exceed three combined. Each actual item extracted costs its declared work. The resource amount decreases only when yield becomes owned cargo. Interrupting before extraction releases the claim; interrupting afterward cannot restore yield. Returning output to the originating hut is a job-bound internal deposit, not a general permission to deliver any logs there.

**Assessment:** resource claims and ordinary inventory use different locations but the same conservation principle.

### S13 — Plant, reload, and build over the growing site

**Expected:** planting changes one persistent exhausted site into growing state and releases the worker. Reload retains its timer/identity. If occupancy prevents maturity, yield stays unavailable until legal growth completion; no building or unit is trapped by a silently regenerated tree. A hidden resource change updates only observers who can see it.

**Assessment:** a resource is not a decorative stamp or an inventory item called “tree.” Its state survives art reload and fog.

### S14 — Select soldiers, workers, and two workplaces

**Given:** three warriors and two settlers are selected through explicit additive selection.

**Expected:** Move affects five movers; Attack shows three eligible actors and leaves workers alone. An uncommandable army entity does not suppress worker drag-selection. Two selected barracks expose the focused one's queue and commands; producing a unit changes exactly that queue. A removed/dead member between click and execution does not prevent other authorized movers receiving their order.

**Assessment:** unit command union and workplace focus are distinct aggregation policies owned by the interaction/presentation layer, not HTML branching on model names.

### S15 — Remove control and add thirteen commands

**Play:** remove `playerControl` from a unit and a barracks in authoring. Separately, add enough valid production outputs to require another command page.

**Expected:** direct buttons and permissions disappear together, while supported autonomous behavior remains. Higher priority starts top-right; ordinal binding-ID ties are stable. Disabled actions retain their positions. Overflow uses the next page; shortcuts cannot ambiguously fire two recipes, and typing in an editor field cannot issue Attack.

**Assessment:** the barracks permission gap is closed. Command layout remains data-driven without turning display priorities into job or combat priorities.

### S16 — Attack a friendly fort; both forts die this tick

**Expected:** forced attack accepts a visible friendly damageable target, rejects self/hidden/non-damageable targets, and does not change diplomacy. Eligible attacks resolve in a damage batch. If both objective-bound forts die, the result is a draw; no entity-array ordering awards a win. Free repair occurs after lethal damage and cannot resurrect either fort. No fort defensive attack appears unless its definition has combat capability.

**Assessment:** the shared body/combat path supports cheese and friendly fire. Exact tick semantics eliminate a result that otherwise depended on implementation order.

### S17 — Explore through enemy territory

**Expected:** the visible patch exposes only fragments of real territory edges. It never gets a border drawn around its own exploration circle. Leaving sight removes moving enemy targets; remembered buildings retain old public facts, not updated HP, stock, or queues. Attack-move resumes its ground destination after losing a target; direct pursuit cannot follow hidden live coordinates. Invalid placement reveals no hidden blocker identity.

**Assessment:** the observation boundary must also govern selection, tooltips, targeting, and minimap data. Lockstep is not protection against a modified client inspecting local simulation memory; this review promises correct game behavior, not that kind of anti-cheat architecture.

### S18 — Place a wolf beside an unowned object

**Expected:** neutral placement writes an explicit camp with policy/home and a member referencing its unit definition. Its local perception can aggro a player even though `none` has no player fog map. It leashes home without acquiring another target on return. The nearby unowned passive entity is not automatically a hostile target or an economic coworker. No loot, healing, or respawn is implied.

**Assessment:** owner, aggression, and control remain separate without a diplomacy framework. Live ownership transfer remains future work, not a supported arbitrary field mutation.

### S19 — Save an owned loose plank in the map editor

**Expected:** the placement references `item.plank`, quantity, owner, and position; its runtime entity is inspectable without HP, movement, or an inventory hero. Owned loose goods can supply logistics. An unowned item can be inspected but cannot silently become spendable through an undefined pickup mechanic. Sixteen rendered planks at a building remain one store representation, not sixteen map placements.

**Assessment:** generic selection needs optional fields and a physical stack representation, not a universal unit-shaped object.

### S20 — Create a map, change a spawn, and load Singleplayer

**Expected:** New supplies required player starts. Moving a start moves its declared setup consistently. Every generated setup member has a stable authored key and exactly one objective-bound main fort per player. Extra placed forts do not independently decide defeat. Player 1/2 starts, initial deployment, occupancy, references, and initial store capacities validate before a playable save is listed. Save/load/undo operate on the same JSON representation.

**Assessment:** no hidden fort constructor, invalid-map fallback, duplicate resource-from-asset inference, or old-format converter is needed. Playable-map validation is still necessary even if editor tools normally preserve these invariants.

### S21 — Resume a busy match on another peer

**Given:** a carrier has cargo and pending movement, a recruit is approaching, a tree is growing, and future commands are committed but unapplied.

**Expected:** save at the completed tick boundary, restore, and replay the same subsequent commands. Compare future checkpoints—not just the first restored screenshot. Inventory, actor IDs, routes, queue/work progress, claims, fog memories, AI decisions, outcomes, and checksums must match an uninterrupted run. A content/map/build mismatch is rejected, not patched into the save. Different display FPS/resolution must not alter this result.

**Assessment:** the save envelope plus authoritative simulation state is the contract. A HUD view with stripped routes and filtered enemy facts cannot be reused as the save world.

### S22 — Add a unit without adding branches

**Play:** copy a unit JSON into a new definition, change armor/HP/speed, use existing behaviors/art, give it a new price, and list it in a compatible producer's outputs.

**Expected:** loader, editor placement, recruitment, job demand, selection, tooltips, rendering, and command paging all work through references. A missing item acceptance or invalid method fails authoring validation with a precise field error. The new producer output cannot inherit the wrong unit's hardcoded price.

**Assessment:** this is the data-driven architecture proof. Adding an entirely new mechanic still requires native code. Future Lua can enqueue the same validated operations and consume structured results; it is not implemented in this cutover.

## Proposed gameplay rules worth noticing

These are the few review clarifications that affect player experience, beyond implementation correctness:

- Idle specialists may help carry; pausing production releases staffing after committed work. The final free worker may still be recruited.
- Workplace commands operate on the focused building, even with several buildings selected.
- Construction and repair initially use one worker per site/building; multi-worker acceleration is not silently implied by `workerSlots`.
- Pausing finishes committed work; cancelling abandons it. Manual movement discards unfinished crafting/planting work while preserving real inputs and cargo.
- Existing buildings/projects survive loss of surrounding territory; territory loss blocks new placement there.
- Lethal damage precedes repair/production, and simultaneous main-fort deaths produce a draw.

Prices, damage numbers, durations, and capacities remain tunable JSON. These rules are fixed native behavior until deliberately changed; none requires an author-facing algorithm configuration.

## Implementation proof gate

Turn the scenario IDs into behavior tests as each native system is replaced. Prioritize these cross-system checks:

1. **Conservation:** for every item type, initial + explicitly produced = stored + carried + loose + consumed + explicitly lost. Reserved quantities are subsets, never an additional location. Resource yield has its own extraction/restoration accounting.
2. **Exclusivity:** one current activity per worker, one owner per claim, one barracks per recruit, one completion per queue entry, one death transition per entity.
3. **Progress:** with an eligible worker, reachable materials, and legal capacity, construction and crafting make progress; missing inputs do not allocate idle builders or starve the only available carrier through employment bookkeeping.
4. **Authority and observation:** forged requests cannot control another owner or bypass removed capabilities; hidden entities cannot leak through active cards, inspection, pursuit, or border geometry.
5. **Continuation:** uninterrupted and restored peers match after future ticks, including queued commands and blocked/pending-release states.
6. **Whole match and performance:** play Mosswater using only the new path, from editor-authored starts through economy, recruitment, neutral combat, and fort defeat. Measure simulation/render costs with debug timings; this review makes no unmeasured 120 FPS claim.

Do not retain the legacy path as a fallback if a proof fails. Fix the new contract/implementation, then remove obsolete adapters, tables, format loaders, and fixtures before calling the cutover complete.

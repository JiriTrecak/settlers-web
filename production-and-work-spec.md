# Production and work: target costs, workplace capabilities

**Status:** Approved design, implemented by the declarative cutover. Use the [behavior reference](docs/declarations/behaviors.md) and [system contracts](docs/declarations/systems.md) for exact current API fields. This document preserves the design rationale.
**Date:** 8 September 2026.  
**Parent:** [Declaration rebuild specification](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/declaration-rebuild-spec.md>).

**Review cases:** [Scenario review](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/declaration-scenario-review.md>). Interruption and scheduling rules below include the proposed fixes found during that review.

This replaces the earlier proposal for a separate recipe catalogue. The initial game does not need one. Production requirements live on the thing being created, and workplaces reference those things.

## 1. The ownership rule for declarations

**A product says what it costs to create. A workplace says what it can create and accept. A worker supplies the labor. A system executes the process.**

Examples:

- Warrior: one plank, one eligible settler, and training work.
- Barracks: accepts planks and can produce warriors/archers.
- Plank: one log and sawing work.
- Sawmill: accepts logs and produces planks.
- Log: harvesting work against a tree resource.
- Woodcutter's hut: employs a worker and produces logs through harvesting.
- Tree: planting work and regrowth time.
- Forester's lodge: employs a worker and restores eligible tree sites.
- A building: its own construction materials and required work.

The unit itself owns its recruitment cost. The item itself owns its crafting cost. The building itself owns its construction cost. The barracks never has another copy of the warrior price.

These are economy costs, not fees automatically applied to every entity spawn. Initial map placement/setup creates the declared starting world. A future trusted scenario spawn can create an entity independently of production; an ordinary player cannot invoke that privileged operation to bypass prices.

## 2. What is actually declared

### 2.1 Target definition: `creation`

A unit, building, item, or plantable resource can have a `creation` block:

- `method`: one supported native process.
- `items`: physical input item IDs and quantities.
- `unitInput`: an existing unit definition required for recruitment, when applicable.
- `source`: resource definition used for harvesting, when applicable.
- `workTicks`: work required at the engine's baseline work rate.

Initially support a closed set of methods:

- `construct`: create a building project fulfilled by deliveries and builders.
- `recruit`: convert an existing eligible settler after arrival and training.
- `craft`: consume stored inputs and create an item output.
- `harvest`: extract item output from a resource through a worker's trip.
- `plant`: restore an eligible exhausted resource site.
- `spawn`: create a new resident through a workplace's bounded production.

Each method has a different validated shape. `unitInput` is required for recruit and illegal on craft. Harvest needs a resource source. Construct targets buildings. Invalid combinations fail loading.

These names choose implemented processes. They are not an editable sequence of instructions. There is no JSON `walk → wait → subtract → spawn` program.

One creation method per target is enough now. If we later need two ways to produce the same item, extend the **target's** declaration with named creation methods. Do not solve it by copying prices into individual producers. Similarly, a future upgrade can modify the effective target price through a shared calculation; it should not patch a button label separately from execution.

### 2.2 Workplace: `production` and `storage`

The building declares:

- Output definition IDs.
- Automatic or queued production.
- Queue capacity for queued production.
- Required workplace staffing, if any.
- A work radius for external harvesting/planting jobs.
- Storage capacity and accepted external deliveries.

Queue limits, staffing, capacity, prices, durations, and work radii are tunable gameplay values. Path searches, reservation ordering, and job-processing algorithms are code.

Automatic production supports **one output type per workplace initially**. Queued production can list several choices. This avoids inventing configurable scheduling policies before any building needs them.

A workplace has one active cycle at a time. Initially `workerSlots` is 0 or 1: harvest/craft/plant require one specialist, recruit requires its arriving unit and no additional trainer, and resident spawn requires no worker plus a finite `totalLimit`. These are supported process contracts; accepting arbitrary staffing values would imply parallel production or work-rate rules that we have not designed. All work durations are positive integer ticks. Harvest/plant/spawn are automatic; recruitment is queued; craft supports either mode. Construction is initiated through Work and is not a workplace production output.

For this content set, harvest, plant, and resident spawn have empty item-input lists; construct, recruit, and craft support physical item inputs. The validator rejects unsupported method fields rather than accepting a planting price that the planting system would forget to consume. Adding seed-fed planting later extends that native method deliberately. Automatic resident spawn is bounded even when it has no item price.

### 2.3 Workers: capability and assignment

A settler has Work. Its current employment/job can be carrying, building, harvesting, crafting, or planting. These are state, not separate unit species.

“Lumberjack” is a useful job label for a settler harvesting trees. The operative verb is **harvest**. The native harvesting system also supports a stonemason harvesting a stone deposit; the output/source definitions differ.

A worker can have configurable work/carry properties. The job algorithms remain shared. No `if building.id === woodcutter` and no `lumberjack.ts` implementation for that one building's identity.

All eligible settlers without employment or a higher-priority committed activity can carry. Buildings request staffing; construction requests builders from the free workforce. We do not reserve a permanent carrier subclass. A unit can retain its ant appearance while its tools/job label reflect the assignment.

Employment is a workplace association; the current activity is the exclusive use of the worker. An employed worker waiting for logs, output space, or an eligible tree can temporarily carry goods while retaining that association. It cannot craft and carry simultaneously. Recruitment still requires an unassigned worker: Pause Production provides an explicit way to release specialists rather than silently converting them into soldiers.

## 3. Concrete JSON examples

Values below are proposed starting values for discussion, not preserved balance requirements. Missing referenced assets/definitions would be supplied as part of the full content set.

### 3.1 The warrior owns its price

The full unit also declares its body, appearance, and behaviors. Its economy block is:

```json
{
  "id": "unit.ants.warrior",
  "creation": {
    "method": "recruit",
    "items": [{ "item": "item.plank", "amount": 1 }],
    "unitInput": "unit.ants.settler",
    "workTicks": 160
  }
}
```

An archer has its own creation block. Adding a future sword input to the warrior means editing the warrior's `creation.items`. The validator then identifies any producer whose input policy cannot supply it. No tooltip or recruitment handler contains a hardcoded one-plank price.

`unitInput` refers to a physical eligible entity. It is not a population resource deducted from a counter. Recruitment selects an idle unassigned settler with no cargo or outstanding claim, reserves it, and has it walk to the producer.

### 3.2 The barracks declares its capabilities

```json
{
  "id": "building.ants.barracks",
  "kind": "building",
  "name": "Barracks",
  "description": "Trains available settlers into soldiers after their equipment arrives.",
  "asset": "asset.ants.barracks",
  "icon": "icon.ants.barracks",
  "body": { "maxHp": 450, "armor": 4, "armorType": "structure" },
  "footprint": { "width": 7, "depth": 7 },
  "entrance": { "x": 0, "y": 4 },
  "creation": {
    "method": "construct",
    "items": [
      { "item": "item.plank", "amount": 8 },
      { "item": "item.stone", "amount": 4 }
    ],
    "workTicks": 240
  },
  "behaviors": {
    "playerControl": {},
    "storage": { "capacity": 16, "accepts": ["item.plank"] },
    "production": {
      "mode": "queued",
      "outputs": ["unit.ants.warrior", "unit.ants.archer"],
      "queueCapacity": 12,
      "workerSlots": 0
    }
  }
}
```

The building's own creation price constructs the barracks. The prices of its outputs come from warrior/archer definitions. These are different facts, not duplication.

`workerSlots: 0` means there is no separately employed trainer in this version. The recruited settler itself enters training. A sawmill or harvesting hut instead needs an employed worker. This is an explicit gameplay choice that can change later.

### 3.3 The plank owns its manufacturing cost

```json
{
  "id": "item.plank",
  "kind": "item",
  "name": "Plank",
  "description": "Sawn timber used in construction and recruitment.",
  "asset": "asset.item.plank",
  "icon": "icon.item.plank",
  "stackLimit": 16,
  "creation": {
    "method": "craft",
    "items": [{ "item": "item.log", "amount": 1 }],
    "workTicks": 120
  }
}
```

One successful item-production cycle produces one item unit initially. Storage and carrying can aggregate those units into stacks. Harvesters can repeat these cycles at the resource until a carrying trip is full; they still pay the declared work for each extracted item, rather than receiving a full load for the price of one. Bulk-output recipes are unnecessary for the current content and can be added to the target definition when needed.

The sawmill's relevant capability blocks are:

```json
{
  "storage": { "capacity": 16, "accepts": ["item.log"] },
  "production": {
    "mode": "automatic",
    "outputs": ["item.plank"],
    "workerSlots": 1
  }
}
```

`accepts` governs **external inbound delivery**. Produced planks are valid internal outputs without being listed as external inputs. Valid storage contents are the accepted inputs plus the building's producible item outputs. The UI should distinguish these two lists, so “accepts logs” does not suggest the sawmill cannot hold its own planks.

A harvester returning its own output uses an internal-output delivery bound to that workplace/job. This allows logs into the woodcutter's output store without allowing unrelated carriers to fill it with logs. Once that workplace is gone, rerouting is an ordinary external delivery and must respect the alternate store's `accepts` list. Neither an item ID nor its owner alone authorizes an internal-output deposit.

A warehouse uses Storage without Production and accepts the goods it is intended to pool. A producer advertises its output surplus. Logistics connects demands and sources through those facts rather than naming a sawmill or fort in its algorithm.

### 3.4 Logs and harvesting

```json
{
  "id": "item.log",
  "kind": "item",
  "name": "Log",
  "description": "Harvested timber. Sawmills turn it into planks.",
  "asset": "asset.item.log",
  "icon": "icon.item.log",
  "stackLimit": 16,
  "creation": {
    "method": "harvest",
    "source": "resource.forest.tree",
    "items": [],
    "workTicks": 100
  }
}
```

The woodcutter's hut declares automatic `item.log` output, one worker, and a work radius. That target's method is harvest, so the engine requests an external harvesting job. The worker finds an eligible tree, walks there, performs work, and brings logs to workplace output storage.

A stone hut lists `item.stone`; stone declares a harvest source of `resource.stone.deposit`. The same processor executes it. A gold miner using an implemented harvestable resource would be a content addition, not another job algorithm.

The resource definition supplies available yield and art/state transitions. A resource reservation prevents two workers from extracting the same remaining quantity. Resource depletion is separate from combat HP.

Eligibility checks the declared source definition, work radius, reachability, site state, and territory. Harvesting is an authorized conversion from an unowned resource's yield into owned cargo, not an ownership-blind warehouse withdrawal. Purely visual tree variants share the resource definition. Changing foliage rendering or switching its mesh does not change remaining yield.

### 3.5 Foresters and resident houses

Foresters are not factories that create an inventory item called “tree.” Their output definition is a resource with the native plant creation method:

```json
{
  "id": "resource.forest.tree",
  "kind": "resource",
  "name": "Forest tree",
  "asset": "asset.forest.tree",
  "yield": 24,
  "regrowthTicks": 1600,
  "creation": {
    "method": "plant",
    "items": [],
    "workTicks": 80
  }
}
```

The forester lists this resource as its one automatic output, with one worker and a work radius. Planting initially restores exhausted tree sites in eligible owned territory. The resource keeps its identity and owner, normally `none`. It spends the declared regrowth time growing before its yield becomes harvestable. Worker time and resource growth time are different: the worker does not stand there for the entire regrowth interval.

The site remains an authoritative resource record while exhausted/growing. Its visual tree can disappear/change; model loading does not recreate its yield. If the site is blocked or otherwise ineligible, the job waits or selects another eligible site. It does not plant through a building.

Growing sites recheck occupancy before becoming blocking mature resources. If a building or unit occupies the site, growth completion waits without restoring yield or trapping that actor. A worker is not held by this wait. Growth resumes once the site can legally mature.

A house can use automatic production of `unit.ants.settler`, whose creation method is `spawn`. Add a simple `production.totalLimit: 3` for three residents per house, tracked in runtime state. This provides the current house purpose without a special house-ID branch or an unlimited population engine. Starting settlers are instead explicit match setup.

House production creates a new entity. Barracks recruitment transforms an existing one. The native methods keep those distinct, so recruitment cannot accidentally increase population.

## 4. Storage, acceptance, and delivery

### 4.1 Acceptance is not demand

A barracks accepting planks does not mean carriers should fill it with 16 planks before anyone asks for a recruit.

- **Acceptance:** which externally delivered item types are legal here?
- **Demand:** what does the current queue/project/process need?
- **Capacity:** how much can actually fit, including reserved incoming deliveries?
- **Supply:** what quantity is available at a source after its reservations?

A queued producer requests inputs for a small bounded amount of upcoming work. An automatic producer requests inputs for its next cycle. Pick the prefetch algorithm in code, initially at most two queued cycles; do not expose a configurable logistics language.

**The queue head always gets space before prefetch.** First protect capacity for the head's entire outstanding input bill and any net growth at completion. Only capacity left after that may be claimed for the second entry. Each occupied or protected slot is counted once: assigning a carrier against protected input space converts that claim into an incoming reservation, not another copy of the claim. Other requests cannot consume protected capacity. Reservations are per queue entry and item, not a generic pool of promised planks.

For example, with capacity 16, a head requiring 12 planks + 4 stone excludes all second-entry prefetch. Twelve delivered planks must not leave its remaining four slots available to the next recipe. When cancellation changes the head, release obsolete protection, reuse compatible stored inputs, and return surplus through actual deliveries before requesting incompatible inputs. A full building with nowhere to return real surplus is legitimately storage-blocked; the UI must say so.

Accepted input stock is source supply only when surplus to local reservations and protected current demand; produced output stock is offered unless already reserved. Generic stores retain their stock until some demand requests it, and accept explicitly requested return deliveries into available capacity. Acceptance alone is never a request to shuttle goods between warehouses. Demands can select owned ground stacks as sources as well as buildings.

The loader checks that every producer can accept all required **item inputs** of its allowed targets and that a production cycle is physically possible with its capacity. Unit recruits arrive as units; they are not stored item inputs. Construction materials use a project's temporary material store, independent of what the completed building accepts for normal operations.

### 4.2 Physical quantities have one location

Storage is the authoritative inventory. The economy bar is a query over owned storage, with separate available/reserved/in-transit facts. There is no second spendable colony treasury pretending to hold the same planks.

Source and destination reservations belong to explicit jobs/projects/queue entries. A source reservation references a quantity; a destination reservation references incoming capacity. Neither creates a second inventory. A source reservation reduces availability. It does not move or consume an item.

The native transaction service commits all claims for an admission/job together or none. A construction request that cannot reserve its full bill leaves no partial source claims or footprint. After admission, loss of a source makes the surviving project request replacement goods; it does not silently forget part of its price. Job records reference their project/queue owner so cleanup can release both ends without scanning unrelated render objects.

Pickup transfers quantity from source storage to carrier cargo. Delivery transfers cargo into destination storage. Production completion consumes its reserved inputs and produces/transforms the output once. Reservations do not count as extra copies of goods.

Item ownership follows its storage/bearer during these transfers. World item stacks carry their own owner. Every transfer checks allowed ownership and location; a player cannot order a carrier to withdraw an enemy's stock.

### 4.3 One accounting transaction per completion

A production cycle verifies its reserved inputs, output space, worker/recruit, and producer before it completes. Consumption and output occur together. A failed completion leaves the cycle blocked or cancels it according to the process rule; it cannot consume inputs and silently lose the output.

Output capacity accounts for inputs removed by that same transaction. Otherwise a full sawmill could incorrectly deadlock even when converting a log into a plank would occupy the same amount of space.

While work runs, reserve only additional output occupancy beyond consumed inputs, alongside protecting those inputs themselves. For one log → one plank, this adds zero extra occupied slots. Other jobs cannot withdraw the reserved log or take any reserved net growth. At completion, check the **resulting** inventory against capacity in one transaction. Output-storage blockage prevents a new cycle; automatic producers can request their inputs even while awaiting a worker, otherwise staffing and delivery could wait on each other.

Work cannot reserve goods already claimed by another job. Two jobs cannot recruit the same settler. Future equipment inputs use the same item accounting path.

### 4.4 Visible stacks

A building's front stack renders up to 16 item models, using item assets and a shared stack arrangement. It is a visual representation of storage. It does not create 16 separate authoritative item entities.

Loose ground items are actual entities with an item ID and quantity. They can be selected and described. Recovery of owned loose materials is an ownership-checked transfer through the same logistics system. Unowned placed items remain inspectable; their voluntary pickup/use rules can be added with actual inventory gameplay later. Hero inventory and neutral death loot are not required for inspection.

Storage capacity, item stack limit, and visible model limit are separate values. They may all start at 16, but changing storage capacity later must not require rendering hundreds of planks.

## 5. Workflows the implementation must own

### 5.1 Recruitment

1. The player queues a target allowed by the owned barracks.
2. The engine reads the target unit's creation requirements and assigns a stable queue-entry ID.
3. Logistics supplies the item inputs. The queue can wait if goods do not yet exist.
4. Once inputs are present, reserve an eligible free settler and send it to the barracks.
5. On arrival, mark it as training/unavailable. It cannot haul or be recruited a second time.
6. Advance training work. At completion, consume inputs and transform the same entity ID to the target definition.
7. Clear work assignment, initialize the target's body/combat state, and apply the rally destination.

Proposed initial health policy: recruitment completes at the target's full HP. This is an intentional mechanic, not accidental object replacement. No resource, workplace claim, shipment, or old movement order survives the transformation unintentionally.

The arriving settler is not also a staffing slot. No worker entity disappears and a second soldier appears with another ID. During training the recruit is contained by the barracks and unavailable for direct targeting. Cancelling its entry releases the same settler; destroying the producer does the same after losing stored goods.

If the settler dies, receives a valid superseding order, or cannot reach the entrance before containment, release its recruitment claim. The queue entry and delivered goods remain and another eligible settler may be assigned. It cannot be reserved by a second barracks while approaching the first. A training-contained settler cannot receive a manual move; cancel training through the workplace first.

Deployment is part of completion. Choose a legal exit using a deterministic nearby-position search. If no exit exists, a completed training cycle waits without consuming inputs, transforming the settler, or removing the queue entry. A house likewise waits without creating a unit or incrementing its resident count. Cancelling/destroying a producer must still preserve its contained recruit: if no legal release location exists, retain a non-targetable pending-release record at the former entrance and retry deterministically. The record owns that same settler ID, is saved, and holds no producer/material claims. It is not a second invisible worker available for jobs.

### 5.2 Construction

A selected eligible worker may plan an allowed building. The request includes that actor; the simulation checks the capability, owner, allowed build set, placement, and materials. A visual button alone cannot confer construction permission.

A valid project reserves its full declared material bill from available owned sources. Carriers deliver to the project; builders come from eligible free workers. The planner need not personally perform every job. Construction work starts when its required inputs are delivered.

**No builder waits with an exclusive claim while materials are missing.** Until ready, the project requests deliveries and eligible settlers—including its planner—can carry them. Once the bill is present and the work point is reachable, one eligible builder is assigned initially. One builder avoids introducing undefined multi-builder speed scaling. Static footprint/entrance checks happen at admission, while changing routes and occupancy are revalidated during work; temporary traffic does not require cancelling the whole project.

The site is a real entity with partial HP, an owner, and an occupancy footprint. Progress increases its supported HP while preserving damage already taken. Completed functionality becomes active once; staffing/production cannot start early just because the final model is visible.

Use a shared starting-health fraction, initially 10%, with at least 1 HP. Supported HP rises from that amount to the definition maximum as work progresses. Each progress step adds only the increase in supported HP to current HP, preserving prior damage. At zero HP the site dies; later progress/repair cannot resurrect it. Completed territory, normal inventory, and workplace functions activate at completion. Free repair applies only afterward. Losing surrounding territory does not confiscate or cancel an already admitted project.

Building inputs are consumed when construction completes. Until then they remain reserved/project inventory, making cancellation and destruction accounting explicit.

### 5.3 Harvesting

Claim source yield and workplace output room; walk to the source; spend work; transfer the extracted yield into worker cargo; return it to the workplace. Reservation size respects remaining yield and carry capacity. Deplete the source only for the amount actually extracted.

When a worker is interrupted before extraction, release the resource claim. After extraction it carries real goods, and follows the cargo settlement rules below. An exhausted resource remains depleted even if its decorative model reloads.

### 5.4 Crafting

At a staffed workplace, reserve one cycle's item inputs and room for its output. Spend work, then atomically convert inputs to output. Inputs remain unavailable to other tasks during that cycle. Output becomes ordinary source stock for logistics.

The worker is busy crafting rather than carrying simultaneously. No building-specific player action is needed for an automatic sawmill.

### 5.5 Planting

Find a reachable eligible exhausted site in the workplace's radius and owned territory; claim it; walk there; spend planting work; set its growth timer. Release the worker and site claim. The resource system advances growth independently and restores yield once.

### 5.6 Repair

Builders can repair eligible damaged completed buildings. Repair uses the same body/HP service and no material inputs for now. The shared repair rate is a balance value. It is one engine job, not a separate recipe attached to every building.

Initially allow one repair worker per building, including during combat, at the shared rate. Lethal combat damage is resolved before repair in the tick, so it cannot revive a destroyed fort. Construction and repair do not retain workers when their work point is unreachable.

This is an example of something we **do not need to declare per target**: a common rule like free repair belongs to shared rules, while a building's maximum HP belongs to that building.

## 6. Assignment, interruption, and failure

### 6.1 One activity controls the worker

An actively harvesting/crafting/planting worker is unavailable for another activity. An idle employed specialist can take a temporary delivery and return to its workplace afterward. An unassigned worker can carry or accept construction/repair work; only a free unassigned eligible worker can be recruited. Pending player movement makes a worker unavailable for a new automatic assignment.

The engine chooses jobs in a documented stable order and resolves ties by entity/job IDs. Job search, pathfinding, and reservation decisions are not exposed as editable user algorithms. Building output lists and worker capabilities are data inputs to these rules.

Initial native allocation: retain committed work/cargo; deliver missing construction inputs; deliver queued head inputs; assign material-ready construction; perform other current-cycle deliveries; staff/start ready automatic work; perform optional prefetch; repair with remaining eligible labor. Stable job creation order then entity ID breaks ties within a class. A waiting project cannot claim builders, an unready automatic producer cannot monopolize a new staff assignment, and active specialists reconsider eligible deliveries between cycles. Employment persists during a temporary loan, but does not hold an idle body away from necessary carrying. This is engine policy, independent of command-card priorities.

The last free settler can be recruited if the player chooses. Do not secretly reserve a permanent carrier to prevent early aggression. When only employed specialists remain, recruitment reports that fact; pausing their workplace releases them after committed work/cargo settles. A colony with every worker converted into soldiers can stall economically by design. That differs from an engine deadlock despite available workers and deliverable materials.

All dynamic route failures have a blocked status and tick-based retry policy. Release unpicked source, yield, worker, and destination claims that can no longer make progress; retain actual goods and the parent queue/project demand. A carrier already holding cargo follows the cargo rules. A blocked job cannot claim every idle worker or run an unbounded route search every tick. Deterministic search/retry work uses engine limits, never a wall-clock time budget that changes results across machines.

### 6.2 Pause and release staffing

Production has an `active`/`paused` runtime setting and a shared Pause/Resume command. Pausing stops new cycles and prefetch, but finishes the already committed cycle, including an approaching recruit or harvesting return. Existing input deliveries may settle into storage. Release unpicked future-input claims; retain the queue and real inventory. Once the current cycle and cargo settle, release workplace staffing. A blocked committed cycle must be cancelled where cancellation applies, or allowed to settle; Pause is not instant material disposal. Resume restores normal demand and staffing. This is one shared production operation, not a per-building staffing editor.

### 6.3 Manual commands and cargo

Direct movement interrupts automatic labor, releasing that job's source/workplace claims, subject to the cargo and contained-training exceptions below. A specialist retains its employment and can resume work after the order. A new direct move replaces an older pending move; no hidden queue of deferred destinations accumulates.

An interrupted active craft or planting cycle loses its uncompleted work and releases its input/site claims without consuming goods or restoring yield. Completed extracted items remain cargo. When movement ends the specialist can begin a fresh eligible cycle; it does not continue an invisible second job while walking. Pending movement and retained employment are explicit saved state.

If a worker already has a committed shipment in its hands, finish that delivery before applying its pending move. Show that deferral in the HUD. Do not destroy cargo to make a movement command simpler.

If its destination disappears or becomes unreachable, release that destination reservation and try an appropriate owned store. If none is reachable, keep the actual cargo and report the blocked state. A manual move may then reposition the worker with its cargo; blocked delivery must not lock the unit forever. New pickup jobs are not assigned until cargo is settled.

The arbiter owns this rule. Movement, logistics, and combat cannot independently overwrite a worker's position or activity.

### 6.4 Cancellation

- Cancelling a queued production entry releases its unconsumed reservations and any reserved recruit.
- Cancelling active training releases the same settler and clears training work. Inputs remain actual stored goods; no fabricated refund.
- Excess delivered inputs are available for another valid job or return delivery.
- Cancelling a construction project releases source reservations and converts delivered project stock into returnable goods at that location. In-flight shipments reroute to owned storage; they are not also credited instantly to a treasury.

For construction, convert delivered material into ordinary owned ground-item stacks at the cancelled site. Logistics can recover those owned stacks as sources for return delivery. This reuses the item definitions and ground representation; it needs no special salvage-container type, new ledger, or loot table. Cancelling a site releases its goods exactly once before removing its project state.

This deliberately favors consistent physical accounting over preserving the prototype's instant refunds. It is a proposed rule for this replacement, not a compatibility requirement.

Cancellation addresses a stable queue/project ID. A repeated or stale cancellation does nothing beyond returning a rejection/result; it cannot release goods twice. Explicit movement interruption, Cancel, Pause, and destruction have distinct results and must not share an ambiguous "reset worker" routine that invents inventory.

### 6.5 Destruction and death

Destroyed production buildings lose stored goods; queued/reserved workers are released, and future deliveries reroute. Source reservations for goods that were never picked up are released. A dead worker loses carried cargo and releases claims.

The same loss policy applies to a destroyed construction site's delivered material. Remote reserved material is released, and surviving carriers retain their cargo. Cleanup emits explicit lost/consumed/produced quantities, so conservation checks can distinguish destruction from accidental deletion. Free cancellation recovers material; combat destruction does not create that refund.

Use these straightforward loss rules now. Neutral creatures do not produce loot. Later salvage/drop mechanics can change those explicit transitions without teaching each building how to drop its own special items.

Destroying a fort affects the match through its objective binding. Economy cleanup still settles references consistently; it must not depend on whether the HUD is currently showing Victory.

## 7. Interface falls out of these records

Select a barracks:

- Discover its queued-production capability and output IDs.
- Resolve each target's name, description, icon, creation cost, and work.
- Generate Produce bindings; sort through the global action-priority rule.
- Show queue entries and their stable cancellation IDs.
- Show status from production state: waiting for inputs, waiting for an eligible settler, recruit approaching, training, blocked, or complete.

Select a sawmill: inspect log inputs, plank output, staffing, current work, and stock. It need not show a fake Recruit or manually assigned Craft button; automatic production is a process, not necessarily a player command.

Select a worker: show its entity identity plus current job and cargo. The name/description can say “Settler — Lumberjack” because its assignment is harvesting trees. It remains a settler definition. The worker's build actions use building IDs and their creation costs.

Tooltips distinguish **price**, **requirements**, and **readiness**. “1 plank + 1 settler” is a price/input requirement. “Plank not yet delivered” is a readiness fact. Recruitment may be queueable while not ready to start. Construction can require available reservable materials at admission. One universal affordable boolean would lose this distinction.

These facts are provided as presentation data. HTML does not calculate recipe prices, decide who is recruitable, or inspect hidden enemy inventories.

## 8. Validation and proof cases

Before Play, validate that:

- Every output ID exists and has a creation method its producer can execute.
- All required external item inputs are accepted by the producer.
- Storage can accommodate a cycle, accounting for consumption/output.
- Staffing and work radius exist for methods that require them.
- Automatic production has one output; queued production has a bounded queue.
- The input/output kinds match the creation method, counts/work values are valid, and unit inputs support recruitment eligibility.
- Construction geometry and entrances are valid; work cannot be scheduled for an unusable producer.

The last point covers structural validity, not a promise that every future path remains open. Runtime occupancy, missing workers, changing territory, and destroyed sources need the blocked/retry contracts above. Static validation must not pretend to solve all future navigation.

Runtime tests should demonstrate:

1. Updating the warrior's JSON price changes every producer and tooltip consistently.
2. A new harvester building and existing resource/item definitions need no building-ID branch.
3. A full sawmill can convert inputs when that conversion leaves legal storage occupancy.
4. Two carriers cannot deliver into the same reserved capacity or spend the same goods.
5. Two barracks cannot recruit the same settler; transformation keeps its ID and population count.
6. Cancellation/destruction at every workflow stage leaves no duplicate items or stranded claims.
7. A house creates its declared bounded number of settlers; a barracks converts settlers instead of adding population.
8. A forester restores resource sites without spawning inventory trees or duplicating yield on reload.
9. Ground goods and building stock render from their actual quantities, not independent visual inventories.
10. Equal tick inputs produce equal assignments, inventory, queues, and combat-ready units on every peer.

The only new recipe-like data structure here is the target's `creation` block. The rest is a small set of explicit processes operating on unit, workplace, resource, and inventory state.

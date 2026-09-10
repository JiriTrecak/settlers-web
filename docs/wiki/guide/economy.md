# Economy and living workers

Your economy has two spendable resources: **[Amber](/resources/item-amber)** and **[Wood](/resources/item-wood)**. Your workforce is a separate strategic constraint. The same ant can gather, build or become a soldier, but cannot do all three at once.

## Gather → carry → deposit

Select Workers and right-click a [mine](/buildings/building-neutral-amber-mine) or [tree](/resources/resource-forest-tree). They approach, harvest and carry the load to a completed owned [Main Hall](/buildings/building-ants-fort). Resources become spendable **on delivery**, not when harvesting starts.

There are no lumber mills, planks, stone chains or economic piles on the ground in the current game. The Forester remains useful because it restores exhausted tree sites. Hero loot chests are separate from economic resources.

A dead worker loses its cargo. Losing a hall destroys the inventory it held. Keep the paths between sources and your drop-off safe.

## Mines and trees

Amber Mines are neutral buildings already present on the map. You can select them, inspect their remaining yield and assign workers directly. They do not need to be captured or constructed.

Each mine has a shared assignment capacity, shown as **assigned / capacity** above it. An assignment occupies a slot during the entire trip, including approach and return to the hall. Sending a group cannot overbook a mine. Retargeting a loaded worker also reserves its new assignment until the old load is delivered.

Trees are directly targetable, including their canopies. A felled tree stops blocking movement, falls and then sinks out of view. A timber worker can continue to another nearby tree. An exhausted mine does not automatically send its workers to an unrelated mine across the map.

A [Forester lodge](/buildings/building-ants-forester) employs a worker to restore suitable depleted tree sites. The replacement needs time to mature; a mature tree cannot appear through a unit occupying its space.

## Population is a living pool

{{stats:population}}

Capacity is **pooled per colony**, not permanently attached to the building that birthed a particular worker. Gatherers, builders, foresters, idle workers and workers inside training all count. Soldiers and heroes do not count toward this worker pool.

At capacity, birth progress waits and resets. A death or successful conversion to a soldier opens space and starts a fresh interval. The listed capacity is not a lifetime quota: your colony keeps making replacements.

A destroyed house removes its capacity, but excess existing workers survive. Births wait until there is room again. A paused producer retains capacity; blocked exits delay deployment.

{{stats:limits}}

## Turning workers into an army

{{stats:recruitment}}

The [Barracks](/buildings/building-ants-barracks) reserves the full resource bill immediately for **every unit you queue**, calls a real **available Worker** to its entrance and trains that ant. Unaffordable units cannot be queued. Cancelling any queue slot returns that unit's full reserved cost; the next unit is already paid for. Training is quick once the worker arrives. Traveling and a blocked exit can make the total wait longer.

An available worker has no assignment, cargo, active order, job or pending release. A mine assignment is protected even while the ant is between loads. Training does **not** silently strip your economy. If there is no eligible worker, the queue waits.

To mobilize gatherers, select them and issue **Stop**. Carried resources are delivered before they become available. Shift-clicking a train button does not secretly conscript assigned workers.

That trade is the heart of the economy: protect income for long-term growth, or deliberately turn working ants into immediate military strength.

## Construction and refunds

Workers can build on explored, clear, dry and sufficiently level terrain with accessible entrances. There is no owned territory radius or border-post requirement. Resource sources, water, obstacles and other buildings still restrict placement; mines reserve access space around themselves.

The full bill is reserved from hall stores when you commit. A worker then reaches the site and builds. No courier chain is needed. Damaged buildings can be repaired without a resource bill.

Cancelling construction or recruitment refunds reserved resources to an owned hall with space. If no accepting hall exists, that amount is lost rather than dropped onto the ground. A cancelled recruit is released when a safe exit is available.

## Future resources

A contested third resource for higher tiers has been discussed, but is **not implemented**. Today's decisions are about amber, wood, worker allocation, travel, replenishment and military conversion.

## Load size and initial scale

Workers bring **10 amber or 10 wood per full trip**. Amber takes 2.5 seconds of work per load; wood takes 10 seconds, with travel added in both cases. Depletion or limited storage can produce a partial final load without losing resources. Mature trees hold 100 wood. The price and starting-resource scale is deliberately close to Warcraft-sized numbers for this first playtest; worker conversion and automatic births remain our own economy. See the [implemented balance baseline](/development/first-balance-pass).

## Chopping and felling trees

A fresh tree has **10 chopping HP** and yields **10 lumber**. A worker swings once per second, removing one HP at axe contact. The first nine hits shake the tree; the tenth starts its **1.8-second fall**. The worker then carries the load home, where it becomes spendable. The fallen tree sinks at full size for six seconds and disappears.

Stopping or changing workers preserves damage already done. One worker reserves each tree, so multiple workers cannot duplicate the harvest. Workers automatically continue to nearby trees; foresters restore exhausted sites with full chopping health. Amber remains ten per trip.

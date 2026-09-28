# Economy and supply

Your economy has three spendable resources: **[Amber](/resources/item-amber)**, **[Wood](/resources/item-wood)** and contested **[Root](/resources/item-root)**. Your workforce is a separate strategic constraint. Workers gather and build; military units train independently at their production buildings.

## Gather → carry → deposit

Workers assigned to an Amber Mine pass through other units on the outward and return trip. Terrain, water and buildings still block them. Tree gatherers pass through units the same way; ordinary movement retains unit collision.

Select Workers and right-click a [mine](/buildings/building-neutral-amber-mine) or [tree](/resources/resource-forest-tree). They approach, harvest and carry the load to a completed owned [Main Hall](/buildings/building-ants-fort). Resources become spendable **on delivery**, not when harvesting starts.

There are no lumber mills, planks, stone chains or economic piles on the ground in the current game. The Forester remains useful because it restores exhausted tree sites. Hero loot chests are separate from economic resources.

A dead worker loses its cargo. Losing a Mound destroys the inventory it held. Keep the paths between sources and your drop-off safe.

## Mines and trees

Amber Mines are neutral buildings already present on the map. You can select them, inspect their remaining yield and assign workers directly. They do not need to be captured or constructed.

Each mine has a shared assignment capacity, shown as **assigned / capacity** above it. An assignment occupies a slot during the entire trip, including approach and return to the Main Hall. Sending a group cannot overbook a mine. Retargeting a loaded worker also reserves its new assignment until the old load is delivered.

Trees are directly targetable, including their canopies. Forests are solid: each tree blocks the ground under its branches, so units walk around a forest or chop a way in from the edge. A felled tree stops blocking movement, falls and then sinks out of view. A timber worker can continue to another nearby tree. An exhausted mine does not automatically send its workers to an unrelated mine across the map.

A [Forester lodge](/buildings/building-ants-forester) employs a worker to restore suitable depleted tree sites. The replacement needs time to mature; a mature tree cannot appear through a unit occupying its space.

## Contested Root and Tier 2

[Corrupted Root](/buildings/building-neutral-corrupted-root) grows outside the
starting bases, near guarded camps. Each deposit contains **3,000 Root** and
allows **five assigned harvesters**, shared across players. Workers carry
**10 Root per trip** and use the same unit pass-through rules as Amber miners.
Terrain and buildings still block them.

Build a Tier 1 [Rootworks](/buildings/building-ants-rootworks) within 12 cells of
a deposit. It is the **only Root drop-off**: a Mound or Bombardier Workshop cannot
receive a worker's Root cargo. Once delivered, Root enters the colony's shared
spendable account. Protect both the deposit and its delivery route.

Upgrade your starting [Main Hall](/buildings/building-ants-fort) in place to a
[Great Mound](/buildings/building-ants-great-mound) for **320 Amber, 180 Wood and
100 Root**. The upgrade takes 60 seconds and pauses that hall's unit training.
Canceling refunds its full price; destruction does not. The same building
remains your defeat-condition objective after upgrading.

Great Mound unlocks [Hunters](/units/unit-ants-hunter) at the Barracks and the
advanced [Bombardier Workshop](/buildings/building-ants-bombardier-workshop).
Hunters cost an available Worker plus Amber and Wood. Bombardiers also require
Root for every recruit. The [Ironroot Forge](/buildings/building-ants-ironroot-forge)
buys permanent colony-wide research; some research requires Great Mound and Root.
Research benefits existing and future eligible units, survives losing the Forge,
and refunds in full if canceled while queued or in progress.

## Supply

{{stats:population}}

Every unit consumes its declared supply. Workers, Warriors and Archers cost 1 each, Hunters 2, Bombardiers 3 and the Marshal 5. The HUD shows **used + reserved / capacity**. Hover it to distinguish living units from queued reservations. Supply is shared across the colony, including garrisoned units; unfinished buildings provide none.

{{stats:limits}}

## Training an army

{{stats:recruitment}}

Train workers at the Main Hall and soldiers at their production buildings. Training reserves the complete price and supply immediately; no existing worker is consumed or needs to approach the building. A fresh colony begins at 12/12 supply, so build a Mound to make room for growth.

Supply is checked again when a waiting unit starts training. **Losing a Mound does not pause units already in training.** They finish normally, even over capacity. Waiting entries keep their money and resume when enough supply is available. Existing units are never killed by capacity loss.

Cancel any queue entry to refund its held price and release its supply reservation. Blocked exits retain completed training until a deployment position opens. Destroying a trainer loses its reserved resources and releases its queue's supply. Reviving a hero also reserves supply; a started revival finishes despite later capacity loss.

## Construction and refunds

Workers can build on explored, clear, dry and sufficiently level terrain with accessible entrances. There is no owned territory radius or border-post requirement. Resource sources, water, obstacles and other buildings still restrict placement; mines reserve access space around themselves.

The full bill is reserved from hall stores when you commit. A worker then reaches the site and builds. No courier chain is needed. Damaged buildings can be repaired without a resource bill.

Cancelling construction or recruitment refunds reserved resources to an owned hall with space. If no accepting hall exists, that amount is lost rather than dropped onto the ground. Cancelled training never consumes or creates a unit.

## Load size and initial scale

Workers bring **10 amber or 10 wood per full trip**. Amber takes 2.5 seconds of work per load; wood takes 10 seconds, with travel added in both cases. Depletion or limited storage can produce a partial final load without losing resources. Mature trees yield 10 wood. Prices and starting resources are declared in `content/game.json`; see the [economy contract](/development/game/economy).

## Chopping and felling trees

A fresh tree has **10 chopping HP** and yields **10 lumber**. A worker swings once per second, removing one HP at axe contact. The first nine hits shake the tree; the tenth starts its **1.8-second fall**. The worker then carries the load home, where it becomes spendable. The fallen tree sinks at full size for six seconds and disappears.

Stopping or changing workers preserves damage already done. One worker reserves each tree, so multiple workers cannot duplicate the harvest. Workers automatically continue to nearby trees; foresters restore exhausted sites with full chopping health. Amber remains ten per trip.

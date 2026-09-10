# Colony economy

This is the running amber/wood economy, replacing the former production chains. The canonical declarations are in `content/game.json`; engine rules are in `src/sim/game/economy.ts` and `population.ts`.

## Harvesting and money

`item.amber` and `item.wood` are currencies. Workers harvest a finite amount from a targeted source, carry a visible load, and deposit it at an owned completed drop-off (currently the Main Hall). Money becomes available only on delivery. A full trip carries **10 amber or 10 wood**. Amber gathers ten per 2.5-second work cycle; wood gathers ten per 10-second cycle, plus approach and return travel. A depleted source or a nearly full destination can produce a smaller final load; resources are never invented to fill it. Mature trees hold 100 wood. These values are shared across gameplay, AI and editor-loaded maps. There are no loose currency entities, ground refunds, sawmills, lumberjack workplaces, stone deposits or planks. Hero equipment drops remain ground items and are independent of the economy.

The neutral `building.neutral.amber-mine` has a five-cell footprint, HP, a resource yield, an entrance, a three-cell construction clearance and ten gathering slots. It is selectable and targetable; it does not need to be captured or built. A gathering assignment occupies a slot throughout approach, harvesting and return to the hall. Assignment is checked sequentially for group orders, so simultaneous commands cannot exceed capacity. Capacity is shared by everyone using that mine. Retargeting a carrier reserves the new mine immediately while retaining its previous slot until the old load is delivered; group orders cannot overbook during that handoff. Inspection shows remaining amber and occupancy; remembered mines do not expose live changes through fog.

Workers can right-click actual tree canopies. Depletion removes the standing tree and blocking occupancy. A timber assignment can continue to another nearby tree of the same definition. Depleted mines do not silently redirect workers to a different mine. Foresters restore eligible exhausted tree sites using their native planting process; sites become blocking only when mature and clear of units.

Buildings and recruitment reserve their whole cost from hall stores atomically. Construction still requires an actual worker to reach the site and work, but no material delivery relay is required. Reserved money is unavailable to another order. Cancellation refunds held funds to an owned hall with capacity; any amount with no accepting hall is explicitly recorded as lost. Destroyed building inventory and dead workers' cargo are lost. No refund or death creates economic ground stacks.

## Living workers and replenishment

Each player starts with five workers: three assigned to amber and two to wood. The starting hall contributes eight capacity and one birth every 480 ticks (12 seconds at 40 Hz). Each completed house contributes three more capacity and one birth every 800 ticks (20 seconds). There is no lifetime limit on how many replacements a producer can create.

Capacity is pooled per owner: two halls and one house support nineteen living workers. All living workers count, including employed gatherers, builders, idle workers and contained recruits. Soldiers and heroes do not. Every producer checks the same population before each birth, preventing simultaneous producers from exceeding the limit. Available means no orders, employment, job, cargo, containment, pending release or pending movement.

At capacity, replenishment waits and resets its timer. Converting or losing a worker starts a fresh interval. A paused producer retains its existing capacity but does not progress. Destroying a house removes its capacity; existing excess workers survive, and births wait until there is room. Blocked exits delay deployment rather than losing a birth or spawning inside an obstacle. Production state is saved and deterministic.

## Recruitment and mobilisation

Warrior: one available worker plus **95 amber**. Archer: one available worker plus **145 amber and 20 wood**. A match starts with **500 amber and 150 wood**. Barracks cost 160 amber/60 wood, houses 80/20, foresters 120/80, Sanctuaries 180/50 and non-attacking Watchtowers 30/20. These prices belong to the output unit definition, never the barracks or UI. The initial timing is one second of training after arrival.

The barracks claims a real matching worker with no assignment, moves it to the entrance and contains it during training. It cannot steal miners, woodcutters, foresters or builders. A queue with no eligible worker waits. To mobilise your workforce, explicitly Stop selected workers; carried loads are first delivered safely. Shift-click training does not secretly recruit employed workers.

Successful training consumes the reserved bill and changes the same worker entity into the soldier. A blocked exit retains the worker and its money. Cancelling releases the worker (or waits for a free release cell), removes only that stable queue entry and refunds its reserved bill. Recruitment creates room in the worker pool only when conversion succeeds.

## Placement, AI and authoring

No territory boundary or ownership radius participates in placement. Ownership still governs commands, inventories and hostility. Construction requires explored, clear, dry and suitably flat terrain, legal entrance/access, source clearance, a compatible worker and sufficient funds. Fog is still meaningful.

AI reads the same public definitions and owner observations: it builds capacity toward its workforce target, reserves available workers, respects full mines and pays normal costs. The editor hides currencies from ground placement, forces mines to owner `none`, and preserves yields as initial resource amounts. All four authored maps use the current IDs and have had obsolete chain buildings and loose currencies removed. There is no migration fallback for old content or saves.

The future contested third resource is deliberately absent. A future currency/source can use this declaration boundary, but unlocks and higher-tier requirements need their own explicit design.

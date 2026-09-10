# Controls and command cards

Commands come from each selected entity's capabilities. Workers expose construction categories, Barracks expose recruitment, and heroes expose skills and inventory. You do not have to remember a different set of controls for every unit definition.

## Mouse and camera

- **Left-click:** select an entity or commit the active targeting command.
- **Drag a box:** select an army group; if no army is inside, select Workers.
- **Shift + selection:** add to or modify the selection.
- **Right-click ground:** move the selected units.
- **Right-click an enemy:** attack it.
- **Right-click a tree or mine with Workers:** gather from that source.
- **Right-click a dropped item with a hero:** approach and pick it up.
- **Arrow keys or screen edges:** pan the camera.
- **Home:** return to your Mound.
- **Hero portrait, top-left:** click to select; double-click to center the camera on the hero.
- **F3:** open debug controls.
- **Mouse wheel:** zoom with smoothing and momentum.
- **R / Shift + R while placing:** rotate the building in opposite quarter-turn directions.

Workers remain selected after committing a building. The first selected worker who is not already building takes the job. If all selected workers are building, an ordinary placement redirects the first; Shift queues the new site instead. A worker carrying resources delivers that load first, then builds. Shift also keeps placement mode active. The ghost and ground footprint let you inspect placement before spending resources.

## Queued orders and click feedback

Hold **Shift** when issuing a move, attack, gather, pickup or building placement to append it. Each unit can hold 16 pending orders. A normal command replaces the sequence; **Stop** clears it. Numbered icons beneath the focused unit's stats show pending orders.

A worker with an order waiting finishes one gathering load and delivers it before continuing. Queued construction sites are paid for on placement and reserved for the chosen worker. Canceling the worker's orders leaves the site standing; cancel the site itself to reclaim its resources. Invalid or vanished targets are skipped. Abilities and recruitment retain their separate controls.

Accepted movement clicks flash **white once**. Attacks flash **red twice**; tree and mine gathering flash **green twice**. Unit clicks include padding around the visible body, so clicking between legs or just beside a worker still selects it.

## Declared shortcuts

These keys and labels are generated from the command declarations, including menu categories and Back.

{{stats:shortcuts}}

A key only works when that command is available for the current selection. Ability shortcuts are listed on their [individual pages](/abilities/).

## Command card

Actions fill the card by priority in row-major order, left to right. **Back** occupies the first slot of the last row. Hover or focus an icon for its name, description, resource cost and shortcut. Categories open a submenu instead of crowding every possible construction command onto one card.

The worker's basic Build menu currently contains **Worker House, Barracks and Amber Sanctuary**. Forester and Watchtower are hidden from worker cards for now, but remain available in the editor.

## Observing and debugging

Assign all active player slots to AI in Skirmish to observe. The observer panel shows each colony's resources, resource income per minute, unit and Worker counts, and hero level.

Debug controls include timing/performance information, a visual fog reveal and faster match speeds. Speeding up a match advances simulation time faster; it does not change the underlying unit definitions. Persistent graphics settings let you reduce render resolution on high-density displays.

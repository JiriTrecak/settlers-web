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
- **Home:** center the selection; with nothing selected, return to the Mound.
- **Backspace:** cycle your Mounds.
- **Space:** cycle recent attacks, completed construction and newly spawned units.
- **F1–F3:** select a hero; double-press to center.
- **F8 or backquote (`):** select and center the next idle Worker.
- **Tab / Shift + Tab:** cycle subgroups without deselecting the army.
- **Ctrl-click or double-click a unit:** select matching owned units on screen.
- **Right-click a friendly unit:** follow it.
- **Right-click the minimap:** move there; active Move, Attack and Patrol targeting also works on the minimap.
- **Hero portrait, top-left:** click to select; double-click to center the camera on the hero.
- **Ctrl + F3:** open debug controls. **F10:** open game settings.
- **Mouse wheel or Page Up / Page Down:** zoom with smoothing and momentum.
- **R / Shift + R while placing:** rotate the building in opposite quarter-turn directions.

Workers remain selected after committing a building. The first selected worker who is not already building takes the job. If all selected workers are building, an ordinary placement redirects the first; Shift queues the new site instead. A worker carrying resources delivers that load first, then builds. Shift also keeps placement mode active. The ghost and ground footprint let you inspect placement before spending resources.

## Army groups

Select units or buildings, then press **Ctrl + 1–9/0** to assign a group. Press its number to recall it; double-press to center the camera. **Shift + number** adds the selection. The ten buttons above the HUD show each group's member count; Ctrl-click assigns, Shift-click adds, click recalls and double-click focuses. Dead members disappear automatically. Groups are included in local saves and start fresh in new matches.

## Combat and inventory

**M** chooses a movement destination. **A** chooses a target to attack or ground to attack-move through. **S** stops the current order and allows normal automatic targeting. **H** holds position, attacking only in range without chasing. **P** patrols between the starting point and the chosen destination, resuming after combat. Friendly Follow is also available on the command card.

The first six inventory slots use **Numpad 7, 8, 4, 5, 1, 2**. On keyboards without a numpad, assign convenient alternatives in Settings.

Hold **Alt** to inspect all visible health bars, **[** for friendly health bars, or **]** for enemies (including hostile neutral creatures). Release the key to return to the normal selected/damaged-unit display. These keys do not reveal unexplored entities or update remembered enemies through fog. All three can be rebound in Settings; on a Mac, Alt is the Option key.

## Queued orders and click feedback

Hold **Shift** when issuing a move, attack, gather, pickup, Hold, Patrol, Follow or building placement to append it. Each unit can hold 16 pending orders. A normal command replaces the sequence; **Stop** clears it. Numbered icons beneath the focused unit's stats show pending orders.

A worker with an order waiting finishes one gathering load and delivers it before continuing. Queued construction sites are paid for on placement and reserved for the chosen worker. Canceling the worker's orders leaves the site standing; cancel the site itself to reclaim its resources. Invalid or vanished targets are skipped. Abilities and recruitment retain their separate controls.

Accepted movement clicks flash **white once**. Attacks flash **red twice**; tree and mine gathering flash **green twice**. Unit clicks include padding around the visible body, so clicking between legs or just beside a worker still selects it.

## Customize your keys

Open **Settings → Keyboard shortcuts**, find an action, click its key and press a replacement. Clear removes a binding; restore defaults resets the layout. Conflicting keys are rejected with the conflicting action's name. Changes apply immediately and persist on this device. Command icons and tooltips display your overrides. Chat and settings typing cannot issue game commands; Enter remains the chat key.

An explicitly assigned Shift shortcut takes precedence over using Shift to queue another command. Group recall, assignment and addition have separate bindings, so changing recall does not silently move the other two keys. Held camera/health keys reset when chat or settings opens, focus is lost, or bindings change.

## Declared shortcuts

These keys and labels are generated from the command declarations, including menu categories and Back.

{{stats:shortcuts}}

A key only works when that command is available for the current selection. Ability shortcuts are listed on their [individual pages](/abilities/).

## Command card

Actions fill the card by priority in row-major order, left to right. **Back** occupies the first slot of the last row. Hover or focus an icon for its name, description, resource cost and shortcut. Categories open a submenu instead of crowding every possible construction command onto one card.

The worker's basic Build menu currently contains **Worker House, Barracks, Amber Sanctuary, Ironroot Forge and Rootworks**. Forester and Watchtower are hidden from worker cards for now, but remain available in the editor.

## Observing and debugging

Assign all active player slots to AI in Skirmish to observe. The observer panel shows each colony's resources, resource income per minute, unit and Worker counts, and hero level.

Debug controls include timing/performance information, a visual fog reveal and faster match speeds. Speeding up a match advances simulation time faster; it does not change the underlying unit definitions. Persistent graphics settings let you reduce render resolution on high-density displays.

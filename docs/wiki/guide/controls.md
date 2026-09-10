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
- **Home:** return to your Main Hall.
- **F3:** open debug controls.
- **Mouse wheel:** zoom with smoothing and momentum.
- **R / Shift + R while placing:** rotate the building in opposite quarter-turn directions.

Workers remain selected after committing a building. The ghost and ground footprint let you inspect placement before spending resources.

## Declared shortcuts

These keys and labels are generated from the command declarations, including menu categories and Back.

{{stats:shortcuts}}

A key only works when that command is available for the current selection. Ability shortcuts are listed on their [individual pages](/abilities/).

## Command card

Actions fill the card by priority in row-major order, left to right. **Back** occupies the first slot of the last row. Hover or focus an icon for its name, description, resource cost and shortcut. Categories open a submenu instead of crowding every possible construction command onto one card.

## Observing and debugging

Assign all active player slots to AI in Skirmish to observe. The observer panel shows each colony's resources, resource income per minute, unit and Worker counts, and hero level.

Debug controls include timing/performance information, a visual fog reveal and faster match speeds. Speeding up a match advances simulation time faster; it does not change the underlying unit definitions. Persistent graphics settings let you reduce render resolution on high-density displays.

# Game

Under the Canopy has four authored battlefields: Ant Colony — Compare, Mosswater Divide, Crownmere Basin (256 × 256), and Amberfall Wilds (512 × 512). Skirmish selects the map and each player's Human/AI controller. Taking Player 2 changes your start and authority; all-AI games open observer mode. Campaign is reserved and disabled.

Each starting setup supplies a Main Hall, five workers, two warriors, a Marshal, 60 amber and 80 wood. Three workers start gathering amber and two start chopping wood. Workers carry harvests directly home. There are no production chains or economic ground stacks. Foresters replenish exhausted tree sites. Buildings can be placed on any explored legal ground; territory ownership and border posts have been removed.

The hall produces one worker every 12 seconds and contributes eight living-worker capacity. Every completed house contributes three capacity and produces a worker every 20 seconds. These are shared limits per colony; recruitment and losses make room for replacements. See [the economy contract](economy.md) for assignment, capacity, funding and cancellation rules. All balance values live in `content/game.json`.

Barracks convert an actual available worker into a warrior or archer. Miners, woodcutters, builders and other assigned workers are protected from recruitment. A worker walks into the barracks, trains for one second, and emerges with the same entity ID. The hall has no defensive attack. Buildings and units have HP; repairs cost worker time but no resources. Losing the objective-bound hall ends the match; simultaneous loss is a draw.

Neutral camps aggro and leash home. They drop selectable hero loot. The Marshal levels to ten, learns three abilities and an ultimate, and preserves inventory and progression through death. A sanctuary revives that same hero. Ability targeting previews share their geometry with damage resolution.

## Controls

Click to select; Shift adds/removes. Drag selection favors controllable soldiers, then workers when no soldiers are in the area. Right-click ground to move; right-click a hostile unit/building to attack. Right-click a tree or neutral amber mine with workers selected to gather. S stops and releases their assignment; a carried load is returned before the worker becomes available. Left-click selects or confirms an explicit command. Right-click cancels active targeting. A followed by ground issues attack-move; A followed by a visible damageable entity forces an attack, including a friendly one. Edge-pan or arrow keys move the camera; Home returns to your hall. WASD does not pan.

Build (B) opens House and Forester. Advanced Build (V) opens Barracks, Watchtower and Sanctuary. R rotates placement; Shift+R reverses it. Placement retains the workers' selection. Escape cancels targeting, then navigates back. Command slots fill left-to-right across four columns and three rows; submenu Back occupies slot nine. Tooltips show declared names, descriptions, costs, shortcuts and unavailable reasons.

Selection cards show HP: click to focus, double-click to isolate, Shift-click to remove. A focused barracks exposes recruitment, rally, pause and its stable queue. Hall/house inspection shows replenishment progress. Mine inspection and its overhead label show occupied gathering slots. Workers retain their mine slot throughout the carry/return trip.

Resource counters show available amber and wood; tooltips distinguish stored, reserved and carried quantities. The worker counter shows living workers/capacity; its tooltip also shows available workers. Observer mode shows each player's income, bank, units, workers and hero level.

F3 exposes performance scopes, AI decisions, visual-only fog reveal and local match speeds 1×–4×. Settings persist rendering resolution. Save downloads a `.utcsave`; Load restores the same map/content revision, including pending commands and population timers. Incompatible previous formats are intentionally unsupported.

## Authoring

Editor → Entities places units, buildings, hero items and resources with explicit owners. Amber mines are neutral buildings; currencies cannot be placed as loose entities. Select edits placement/initial state. Spawn moves the whole declared setup. Entity undo restores entities, camps and spawns while retaining unrelated terrain/lighting changes. New/Save/Load operate on `.utcmap` JSON. Edit definitions opens the shared content graph; saving requires the development server.

The HTML HUD and Three.js scene consume observation data. Fog hides live enemy activity and preserves last-seen static information. The deterministic engine and lockstep transport are shared by local and multiplayer games. See [implementation contracts](../declarations/README.md) and [art direction](art.md).

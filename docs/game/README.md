# Game

Under the Canopy currently has two authored 256 × 256 maps: Ant Colony — Compare and Mosswater Divide. Singleplayer selects a map before starting; the latter is the mirrored battlefield with neutral wolves and ogres. The comparison scene and editor render the same declared entities and resources as a match.

Each starting setup supplies one objective-bound fort, eight settlers, two warriors, and physical planks/stone. All unassigned workers can carry. Build on clear owned ground; material reservations become carrying trips, then construction work. Lumberjacks harvest logs, sawmills make planks, stonemasons harvest stone, foresters restore exhausted tree sites, houses contribute a finite number of residents, and towers extend territory. Balancing values live in `content/game.json`.

Barracks turn a real unassigned settler and delivered materials into a warrior or archer. The same settler ID survives recruitment. The fort has no defensive attack. Units and buildings have HP; free repair takes worker time. Losing the objective-bound fort ends the match; simultaneous loss is a draw. Neutral units aggro players and leash back to their authored camps. There are no item drops, hero progression, or inventory mechanics yet.

## Controls

Click to select; Shift adds/removes. Drag selection favors controllable soldiers, then workers when no soldiers are in the area. Right-click ground to move selected units; right-click an enemy to attack. Left-click selects or confirms an explicit command target. Right-click cancels an active targeting mode. A followed by ground issues attack-move; A followed by a visible damageable entity forces an attack, including a friendly one. S stops. Move the mouse to a game-view edge or use arrow keys to pan; Home returns to the fort. WASD does not pan.

The command card comes from selected capabilities. A settler exposes its build list; a focused barracks exposes recruitment, rally, pause, and its stable queue. Selection cards show HP: click to focus, double-click to isolate, Shift-click to remove. Commands sort by priority from top-right. Root pages hold twelve commands; submenu pages hold eleven plus Back. Tooltips show declared names, descriptions, costs and unavailable reasons.

The economy counters show available goods. Hover reveals stored, reserved, loose, and in-transit quantities. At most sixteen item models represent a building's physical inventory. This display limit does not reduce store capacity.

F3 shows performance scopes. Settings persist resolution scale. Save downloads a singleplayer `.utcsave`; Load restores it in the same map/content revision, including pending commands. Previous formats are intentionally unsupported.

## Authoring

Editor → Entities places units, buildings, items and resources with explicit owners. Select edits placement/initial state. Spawn moves a whole declared starting setup. Entity undo restores entities, camps and spawns while retaining unrelated terrain/lighting changes. New/Save/Load operate on `.utcmap` JSON. Edit definitions opens the shared content graph; saving requires the development server.

The HTML HUD and Three.js scene consume observation data. Fog hides live enemy activity and preserves last-seen static information. The deterministic engine and lockstep transport are shared by singleplayer and multiplayer. See [implementation contracts](../declarations/README.md) and [art direction](art.md).

Worker construction is grouped into **Build (B)** for economy buildings and **Advanced Build (V)** for Barracks and Watchtower. Click a category, then a building, then a ground location. **Back** stays in the bottom-left of submenu pages. Escape cancels an active placement; another Escape goes back. Selecting another entity returns to its main commands. Movement and combat shortcuts remain available inside menus.

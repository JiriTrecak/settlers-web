# Campaign missions and Lua

Campaign missions use the ordinary map, entity definitions, simulation, combat, pathfinding, renderers and save system. Lua supplies scenario decisions: objectives, dialogue, reinforcements, orders and victory. A mission does not create a Mound or default starting army, and does not use the skirmish Mound-defeat rule or economy AI.

## Authoring a mission

1. Open a map in the world editor. Choose **Mission & Lua** in the top file toolbar.
2. Enable **Campaign mission**. Set campaign ID `vanguard`, mission title, ordering, and an optional **Hero level cap** (1–10). Leave the cap empty to use the hero definition’s maximum. These fields determine the mission-selection entry; the map description supplies its briefing.
3. Place units using the Entities tool. Select each entity and edit its **Script ID**. IDs are unique across the map. Letters, digits, dots, underscores and dashes are accepted by the rename control. Renaming updates camp membership; update corresponding Lua string references yourself.
4. For reinforcements, check **Spawn through Lua** on the placed entity. The editor still shows its intended location. Gameplay creates it only when the script calls `mission.spawn(id)`. Neutral creatures retain their authored camp, aggression and leash.
5. Enter named circular regions in the mission panel. Coordinates are map cells: `x`, `y` (the editor's world Z), and radius. Example: `[{"id":"crossing","x":121,"y":128,"radius":6}]`.
6. Write Lua, check syntax, then **Apply to map**. Save with the normal map controls. **Apply & play mission** stores the local map and opens a test match in another tab.

The script and regions live inside the `.utcmap` JSON `mission` field. There is no external script lookup at runtime. The shipped prologue's reproducible authoring recipe is `scripts/missions/vanguard-prologue.ts`; its adjacent `.lua` file is a source input to that recipe. Regenerating intentionally replaces the embedded shipped script; ordinary editor saves do not modify the recipe.

Mission maps support one or more consecutive player starts, beginning at Player 1. Starts set owner slots and initial camera positions; their skirmish setup/Mound fields are ignored in missions. Player 1 is the local campaign player. Other slots are available for scripted actors, not skirmish AI. The first campaign and current victory API target Player 1.

## Script execution and saved state

`on_start()` runs on the first simulation tick. `on_tick()` runs every four ticks after that: 10 times per simulated second. The simulation runs at 40 ticks/second. Speed controls scale both together.

Each callback runs in a **fresh Lua VM**. Top-level code should define functions; the mission API is only callable inside the callback. Local variables, globals, tables and closures do not survive to the next callback. Store persistent booleans, numbers and strings through `mission.set`, and retrieve them with `mission.get`. This makes saves, replays and lockstep independent of hidden interpreter stacks or closures.

```lua
function on_start()
  mission.set("phase", "travel")
  mission.objective("Reach the crossing.")
end

function on_tick()
  if mission.get("phase") == "travel"
      and mission.in_region("marshal", "crossing") then
    mission.spawn("wolf-one")
    mission.attack("wolf-one", "marshal")
    mission.set("phase", "fight")
  elseif mission.get("phase") == "fight"
      and not mission.alive("wolf-one") then
    mission.win()
  end
end
```

For a timer, save a deadline such as `mission.tick() + 240`, then compare the current tick with it. That is a six-second simulation timer, preserved by saves and replay. Do not use wall-clock timers.

## API

- `mission.get(key)` / `mission.set(key, value)`: persistent scalar state. Setting `nil` removes the key. Maximum 128 keys; strings up to 2,000 characters.
- `mission.tick()`: authoritative simulation tick.
- `mission.alive(id)`: true for an existing living entity; false before a deferred spawn or after death. Unknown authored IDs are errors.
- `mission.position(id)`: returns `x, y`, or `nil, nil` if the entity does not exist.
- `mission.in_region(id, regionId)`: tests a living entity's current cell against a named circle.
- `mission.spawn(id)`: activates a pre-authored entity marked `activation: "script"`. Each ID may spawn once. This permits preloading its model and validating definitions, ownership, camp membership and placement before a mission starts.
- `mission.move(id, x, y)`: submits an ordinary movement order through the native order system. Integer cell coordinates; bounds checked.
- `mission.attack(id, targetId)`: submits a forced attack order through the native order system.
- `mission.objective(text)`: replaces the displayed objective.
- `mission.say(speaker, portraitDefinition, text, seconds, cinematic)`: shows portrait dialogue for 1–60 seconds at the current simulation speed. Omit the final argument (or use `false`) for inline speech while units keep moving. Use `true` for a cinematic pause: small black bars, the HUD slides out, and the camera lens eases in by 8%. Camera position, selection, and player zoom are retained and restored automatically. A new line replaces the current one.
- `mission.win()` / `mission.lose()`: ends the mission with Player 1 victory or defeat.

Queries read the current simulation. Mutations are buffered in callback order, then applied after the callback succeeds. A spawn followed by an attack can reference that new entity. Queries within that callback still see the state before those buffered operations. Script errors discard the buffered operations and variable changes, stop further callbacks, and display the error above the battlefield.

## Determinism, boundaries and limits

Lua never receives a JavaScript object, native entity pointer, renderer, socket or unrestricted engine mutation API. Filesystem, network, `require`, JavaScript interop, `os`, `io`, `debug`, wall-clock time and random libraries are unavailable. The initial API deliberately exposes no standard libraries; Lua expressions, conditionals, functions and loops remain usable.

A callback is limited to 20,000 Lua instructions and 256 API calls. Strings in execution are checked against a 64 KiB limit every instruction, preventing accidental exponential string growth. Source is text-only and limited to 64,000 characters. These are practical authoring bounds, not a claim that the interpreter has undergone a hostile-code security audit.

Mission variables, spawn history, objective, dialogue deadline and errors are explicit simulation state, included in snapshots and checksums. Map revision includes the Lua source and regions. Save/load recreates interpreter execution from that source and saved state. Mission simulation tests compare checksums after restoring during the ambush.

The runtime can therefore execute the same script on every lockstep peer. Player commands still travel through the normal network command stream; script-generated orders are derived locally on each peer and must not be separately broadcast. Camera, portrait layout and presentation remain local. The current campaign launcher is single-player; campaign networking, synchronized dialogue choices/skipping and cross-mission progression need their own implementation.

## Editor bridge

The existing editor control bridge supports `mission` with `action: "get"` or `action: "set"` and a complete `mission` object (`null` disables it). `entities` supports `action: "rename"`, `id`, `nextId`. Both use the same validated authoring transactions as the UI. Existing entity placement accepts `activation: "script"` on mission maps.

## Validation

The regression suite covers syntax errors, unavailable capabilities, instruction limits, the three-unit start, dormant enemies, actual movement to the crossing and combat through victory, hero defeat, mid-ambush save/load checksum agreement, script failure without partial spawning, ID renaming and skirmish rejection of deferred entities.

## Level limits and guaranteed rewards

`mission.heroLevelCap: 2` stops XP at the threshold **entering level 2**, not at the threshold for level 3. Excess XP is discarded. Level-up stats and skill points work normally; the HUD labels the mission maximum. The prologue main route awards 295 XP before the cap, so optional camps are not required to reach level 2.

Camps accept either `lootPool` (the existing weighted random pool) or `fixedDrops` (an exact list of item definition IDs), never both. Example: `"fixedDrops": ["item.barkguard", "item.resin-salve"]`. The final defender drops every listed item once. Fixed drops consume no random rolls; normal ground-item pickup, inventory limits, and save/load still apply. An empty list gives no items. Existing legendary-camp restrictions apply to fixed T3 rewards too.

The **Camp rewards & encounters (JSON)** field in Mission & Lua edits these records together with mission metadata in one validated, undoable transaction. The editor MCP `mission` operation also accepts an optional complete `camps` array. Unknown/non-item drops are rejected before play.

## Cinematic time

Cinematics pause the **gameplay clock**, including movement, attack windups, effects, projectiles, cooldowns, regeneration, economy, and Lua `on_tick`. The outer match/transport clock continues consuming deterministic beats, decrementing a saved dialogue countdown. `pausedTicks` records their difference. This avoids shifting dozens of independent deadlines or letting buffs expire during a conversation. World saves validate both clocks, and the render snapshot follows gameplay time.

When the countdown finishes, Lua and gameplay resume. For consecutive cinematic lines, advance a saved stage and issue the next line in the next callback; a cinematic itself consumes no `mission.tick()` time. Use gameplay deadlines only for **inline** dialogue. The player cannot issue orders during a cinematic; orders from before it resume. Presentation transitions remain local. There is no skip/branch-choice command in this pass.

## Multi-stage objectives

Declare `mission.objectives` as an array of `{id, title, description, optional}` records. Start a stage with `mission.begin_objective(id)`, finish it with `mission.complete_objective(id)`, or mark failure with `mission.fail_objective(id)`. Only active objectives can finish; a completed/failed objective cannot restart. Complete the current primary objective before beginning the next. Optional objectives can remain active alongside it.

The HUD displays active stages and a collapsible completed-objective history. Future stages remain hidden until started. IDs and statuses are persisted, validated on restore, and included in checksums. The Mission & Lua panel exposes the declarations as **Objective stages (JSON)**; the editor MCP mission operation uses the same schema. `mission.objective(text)` remains available for dynamic mission notices and failure explanations.

```lua
mission.complete_objective("find-watch")
mission.begin_objective("rescue-watch")
```

## Rescuing and transferring units

`mission.transfer(entityId, "player.1")` changes a surviving military unit's ownership. It preserves the entity ID, position, health, progression and equipment, but clears its previous orders. The ordinary ownership-based rendering, selection, command permissions and visibility then apply. Destination owners must be declared map slots (or `"none"`). This initial transfer API supports non-camp military units; workers, buildings, camp creatures and contained units are rejected. Transfers are buffered with other Lua operations and work after a spawn in the same callback. Dead units are not resurrected.

The prologue's watch captain and ranger are deferred, unowned ordinary ant units. Entering their region spawns them fleeing toward the Marshal, with a forced ogre pursuit. After five seconds they turn and help fight, still under script control. The pursuing ogre has a larger authored leash than stationary camps so it does not abandon the chase and return home at the encounter's edge.

After the ogre dies, the surviving watch soldier gives a cinematic briefing. When the briefing ends, the survivors transfer to Player 1 and the next primary objective begins. Losing both soldiers fails the rescue; one survivor is enough. There is no invulnerability, scripted healing, or replacement of injured soldiers. Mid-rescue and mid-briefing saves retain ownership and objective state.

## Local game menu and save boundaries

`GameMenu` is shared by campaign and skirmish. A local save envelope (version 4) records `mode: "campaign" | "skirmish"`, the full frozen `match` configuration, and the nullable local `player` slot (`null` means observer), alongside the world, mailbox pipeline, and control groups. This version is independent of the network save envelope. The map's `mission` declaration determines its mode; changing only the save's flag cannot bypass filtering.

`SaveLibrary` stores named snapshots atomically in IndexedDB, avoiding localStorage's quota for large worlds. Lists and imports are mode-scoped. Loading checks map revision and player assignment, then preflights world and pipeline restoration before destroying the running screen. Restart creates a fresh session from the original match configuration, without the saved world's progress. Local menu pause stops both gameplay and transport ticks; campaign cinematic countdowns therefore remain frozen while making a save.

## Moving cinematic scenes

Use `mission.begin_scene(x, y)` to pin the camera to a ground point, show cinematic bars, hide the HUD, and lock player orders **while simulation and scripted movement continue**. Call `mission.end_scene()` to release the camera and controls; the camera stays at the scene location. F10 remains available, and its local menu pauses the scene.

- `mission.arrived(id, x, y)` checks that a living unit has finished its order and is within half a cell of the destination. Wait for actual arrival instead of guessing travel time.
- `mission.face(id, x, y)` interrupts the unit's order and smoothly turns it toward the point using its normal declared turn rate.
- `mission.facing_done()` is true when all scripted turns have completed or been superseded.

The prologue uses three stages before handing over control: entrance orders, inward turns around `(190, 195)`, then the paused opening dialogue. The walk-in takes roughly seven seconds. Scene framing, pending turns, and Lua stages survive saves; unit navigation and animation use the normal engine systems. Do not start a paused dialogue until the pending movement and turns finish. The presentation temporarily reveals a 24-cell circle around the scene camera. This does not explore the map, grant simulation/AI vision, or alter combat rules; normal fog returns at scene end.

Rain is authored in `landscape.environment.weather` (`kind: "rain"`, intensity `0.7`, wind X `1.2`, Z `0.4`). It uses the existing bounded, instanced weather renderer. The shared default day/night period is 600 seconds, including editor previews and ordinary matches.

# Settlement prototype

Open `/?map=twinwater-reach`, choose Single Player from the main menu, or use **Play Twinwater** in the editor's example strip. The editor link opens a fresh match in another tab so the authored landscape stays available. The editor toolbar's Play button still previews its camera and lighting.

Twinwater is a two-player map: blue starts southeast, red northwest. Each starts with one unique main fort, 40 planks, 30 stone, two builders and six unassigned settlers who all carry goods. Single player runs a deterministic economy opponent. Multiplayer uses the same map and rules through the existing MatchHost.

## Playing

Choose a building, then click clear, flat land inside your colored border. A green/red footprint and text explain whether the location is available. Escape leaves placement mode. Click a site to see construction and material deliveries; unfinished owned sites can be cancelled. Click an unassigned settler, then clear ground, to move it. Selected buildings show their specialist, activity, input/output chain and assigned deliveries. The economy bar shows busy/total carriers. Home fort and the minimap reposition the camera; WASD, dragging and wheel retain the game camera controls.

Start with a lumberjack, sawmill and stonemason. Ordering construction reserves its cost. Carriers collect batches from the main fort and deliver them to the site; builders walk there and construct only after all supplies arrive. A completed production building recruits an idle settler. Lumberjacks collect logs into a 16-item hut inventory. Carriers bring logs to the sawmill, where a resident sawyer converts them one-for-one into planks. Carriers take finished planks and stone to the main fort; stonemasons only harvest and bring stone to their workplace. Local storage applies backpressure when full; only delivered planks and stone can fund new construction. Foresters replant depleted tree sites within 32 cells; saplings mature after 1,600 simulation ticks. Depleted resources disappear and become walkable. Houses add three settlers. Completed towers extend ownership; construction sites provide no influence.

This is an economy and expansion sandbox. Combat units and attack commands, tower capture, food, roads as transport infrastructure, full game save/load are not implemented. Each fort has 1,000 health; the deterministic damage hook ends settlement simulation and disables construction when a fort falls. There is deliberately no client-supplied arbitrary damage command. Combat will invoke the hook after resolving legitimate attacks. The current MatchHost save envelope is not a settlement save feature.

## Authoritative boundaries

- `shared/settlement/rules.ts`: building costs, work, territory, workforce and limits. New rules require a rules revision bump.
- `sim/settlement/settlement.ts`: inventories, material reservations, buildings, workers, resource claims, path jobs and territory. It imports no browser, networking or rendering code.
- `sim/settlement/navigation.ts`: cardinal A* with stable tie breaking. Terrain heights are integer centimeters; worker positions are integer cells. Water, resource nodes, building footprints and steps over 90 cm block movement.
- `sim/world/world.ts`: applies committed actions in tick/player/sequence order, then deterministic AI decisions and a fixed 25 ms settlement step.
- `net`: assigns player identity from the bound slot and commits commands. It does not calculate the economy.
- `session`: converts input into commands and advances World only with a commit. Previews are advisory; the simulation validates again when the order executes.
- `render/settlement`: interpolates positions, animates limbs/cargo, draws borders and loads GLBs. Visual interpolation, light, camera and asset loading never affect simulation decisions.

Commands contain intentions (`build`, `cancel-building`, `move-worker`), not client-computed prices, ownership, paths or outcomes. The simulation rejects foreign control, overspending, occupied/wet/steep ground and inaccessible building entrances. Rejected commands produce local-player feedback without changing inventory. Input packets are bounded and structurally validated; duplicate confirmations cannot replay construction. Large local outboxes are sent in bounded batches.

## Inventory and jobs

Construction material has exactly one owner/location: spendable stock, site escrow, a carrier's cargo, or delivered material. Reservation transfers stock to escrow atomically. Pickup transfers escrow to cargo; delivery transfers cargo to the site. Cancellation refunds all three site-related locations once, then releases the footprint and workers. Work progress cannot begin before every material is delivered.

Worker routes and timers are state. A changed obstacle triggers deterministic replanning; a temporarily unreachable destination waits and retries instead of teleporting or completing work remotely. Resource nodes have a single claimant. Stable entity traversal and distance/id tie breaking decide contention. Gathered goods remain cargo until the worker reaches the depot. New residents use stable nearest-free spawn positions.

Workers currently pass through each other; they do not block navigation. Decorative foliage has no collision except resource-node cells. Building orientation and entrance direction are fixed. The main fort is the construction depot, while forestry workplaces have explicit intermediate inventories. Every settler without an allocated profession performs carrier jobs, including new residents from houses. An idle, empty-handed carrier can become a specialist; an assigned delivery must finish first. They reserve available goods and destination capacity in stable worker order, with construction first, finished output second, and sawmill log supply third. They validate both journey legs before accepting a task and retry routes if new obstacles appear. Reservations and cargo are included in checksums. Idle carriers can be moved manually and resume deliveries on arrival. Active deliveries cannot be interrupted by move orders.

## Territory

A main fort or completed tower projects a 38-cell circular influence. Within overlapping influence, the nearest tower owns a cell; equal distance between rival owners is contested. Neutral and contested ground cannot receive new buildings. A placement needs the entire footprint plus its clearance margin to be owned. Ownership is cached after tower completion, never inferred from rendering. Existing buildings do not transfer owner when the border changes; capture will need an explicit simulation rule.

## Lockstep and compatibility

Every peer loads the exact bundled `.utcmap`; its content fingerprint and `RULES_REVISION` form the match revision. Session refuses incompatible matches. No client derives gameplay geometry from Three.js raycasts, GLB bounds or GPU terrain shading: raycasts only choose requested cells.

Checksums include the settlement's next entity ID, tick, inventories, all entities, timers, cargo, resource claims, complete paths, terrain heights, ownership and occupancy. Cosmetic events and animation interpolation are excluded. AI uses the same world state and rules on every peer, with no wall clock or unseeded randomness.

The server remains a lockstep mailbox with authenticated slot binding and hash comparison, not an authoritative anti-cheat simulation. Internet latency, reconnect/resume and very long sessions need additional testing before release. Day/night is currently presentation only; if daylight later affects production, derive the gameplay phase from simulation ticks.

## Extending it

Add a building rule and a corresponding renderer asset without putting its simulation logic in the HUD. Further production chains should use item-keyed recipes and the existing building inventories and carrier reservations; retain the same transfer/conservation rules. Add explicit profession assignment/release commands when tool requirements and carrier allocation arrive. Navigation should gain shared path caches or a coarser strategic graph before greatly increasing the current 160-worker/160-building limits.

A future save must serialize complete World state, queued commands and lockstep pipeline together, validate against map/rules revision, then restore and verify the checksum. Reconstructing a settlement from a renderer snapshot is insufficient: view snapshots intentionally omit worker paths.

Military units and attack/capture commands belong in deterministic simulation systems and will use the existing building damage and fort-defeat hook. Territory should consume their completed capture outcomes. Renderer effects and sound should consume events without deciding outcomes.

## Assets and verification

`scripts/blender/settlement-assets.py` generates the tower, lumberjack hut, stonemason hut, house and articulated settler in an isolated Blender collection. GLBs and the editable source blend are in `assets/props/settlement`. Team material names are stable, and the renderer clones per-entity materials before tinting them.

`npm test` covers conservation, construction, production, territory, navigation and packet validation. `node --import tsx scripts/verify-settlement-network.ts` starts a temporary localhost MatchHost on port 18787 and two actual WebSocket clients. It runs 6,000 ticks on Twinwater, builds both economies and houses, checks every 100 ticks locally, and requires all 30 host checksum confirmations on each client. The script stops its server on exit.

MCP exposes `game_status`, `game_command` and `game_view`; the existing screenshot tool also captures a running game. Commands enter the normal lockstep queue. While testing the game, disable MCP in other editor tabs to avoid the existing single-tab hub's reconnect competition.


## Fort and forestry art set

`scripts/blender/forestry-assets.py` produces the unique main fort, log-built lumberjack, wheel-and-saw-bench sawmill, moss-roofed forester and individual `item-log`, `item-plank`, `item-stone` GLBs. The standalone editable Blender scene is `assets/props/settlement/Fort-Forestry-source.blend`; `forestry-preview.png` is a Blender studio render. Export copies are merged into material batches while the Blender source retains separate editable pieces.

`shared/settlement/stockpile.ts` lays out at most 16 actual inventory items beside the front entrance, in separate piles beside the entrance (up to four layers for logs/planks, with broader, lower stone stacks). Vertical spacing follows each item's physical height. Fort storage can exceed 16; its visualization is capped, not its economy. Construction sites display delivered supplies. Empty buildings show no invented output. Models use a ground-level origin and front faces point toward positive game Z. Build clearance reserves the stockpile yard and leaves the entrance lane clear.

The legacy `Stock.wood` wire/internal property now denotes spendable planks. Logs are a separate `ItemStock.log`; do not award construction currency at harvest time. The match rules revision is `settlement-5`, so older clients cannot silently share a match with the changed chain and footprints.


## Fog of war

Gameplay uses three knowledge states per player: 0 unexplored darkness, 1 explored fog, 2 current sight. The editor remains unrestricted. The fort reveals a 42-cell radius, towers 22, other completed buildings 12, sites 8 and settlers 10. These are radial sight ranges; terrain occlusion and shared allied vision are future rules.

`sim/visibility/visibility.ts` updates at deterministic eight-tick intervals (5 Hz). It keeps separate grids and last-seen building/resource/territory observations for every player. Enemy settlers have no ghost snapshots: leaving sight removes them from the player view. Remembered enemy buildings preserve their observed state; hidden construction, destruction and resource changes are learned only when sight returns. Building footprint visibility handles large buildings at sight edges. The HUD, picking, resource stamps, border posts, MCP game view and minimap consume the player-filtered view. Build previews require current sight before inspecting occupancy. Enemy colony totals and events are omitted.

The renderer shares one 256×256 visibility texture across scene materials. A separable CPU blur runs only on visibility updates; the GPU needs one lookup per fragment. This produces soft spatial edges without allocating fog geometry or lights. The minimap composites a cached world-space mask. Gameplay entity visibility always uses the hard simulation grid, never blurred pixels.

Exploration and remembered observations participate in lockstep checksums. `visibility.snapshot()` and `restore()` preserve the complete knowledge state, including intermediate explored/current grids, and previous view grids remain stable. A future full save must store this snapshot alongside the entire simulation and queued commands; this does not itself implement full-match save/load. The transport still shares the full deterministic simulation with peers, so this is presentation/gameplay fog, not an anti-cheat secrecy boundary against modified clients.


## Game controls and map orientation

The game-only bottom command dock contains the north-up square minimap, selection/activity details with the day/night clock, and six functional construction commands. Keys 1–6 select construction, Home centers the fort, and Escape cancels placement. The shared minimap now uses a square projection; its clicks, fog mask and camera footprint use the same world coordinates. Gameplay yaw is zero (north-up) with the existing perspective pitch and zoom. The authored terrain already occupies a 256×256 square, so its resource layout and mirrored starts remain intact. Combat commands and neutral camps are future gameplay work; the dock does not expose nonfunctional attack controls.

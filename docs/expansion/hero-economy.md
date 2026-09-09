# Hero, gathering and wilderness expansion

Implementation design for the requested expansion. This document describes intended behavior; it is not a completion report.

## Economy

Amber is the primary currency, extracted from ancient resin seams exposed among petrified roots. Wood is gathered from destructible trees. These are ordinary declared resources with yield, work duration, cargo type and a construction exclusion radius; future food and rare ores use the same gathering system.

Workers accept explicit gather orders by right-clicking resources. They walk to an available work position, gather a bounded load, return it to the nearest reachable owned completed hall that accepts that resource, deposit, and repeat. Interrupted workers preserve carried goods. Missing/dead/full halls cause a visible waiting state rather than lost goods or remote deposits. Depleted sources trigger a nearby compatible-source search. Workers start gathering on match initialization, with an explicit declared starting distribution between amber and wood.

All economic stock is physically delivered to halls. Construction and recruitment spend the owner's deposited stock in a deterministic hall order, reserving costs immediately and refunding cancellation according to one declared rule. No point-to-point delivery claims, producer input inventories, or free carrier pool remain. Builders still travel and work; recruitment still consumes/assigns a worker. The lumberjack automatically assigns workers to nearby trees, whose depleted entities disappear; foresters plant replacements. Old plank/stone recipe dependencies and now-redundant processing buildings must be removed or repurposed consistently across content, commands, AI, maps and docs.

Amber deposits leave build-free work aprons. Placement validates the entire candidate footprint against each deposit's exclusion zone. Starting halls and deposits must be authored with sufficient clearance and reachable worker routes.

## Hero and combat

A larger armored Ant marshal carries a mace. His own rigged export includes idle, walk, run, carry, attack, hit and death; spell animation is added where needed. Base damage exceeds ordinary warriors substantially, but soldiers remain relevant.

Hero progression is declared: XP thresholds, per-level health/damage growth, mana and inventory capacity. Runtime state contains XP, learned ability ranks, mana, cooldowns and inventory. XP is awarded once for a death to eligible nearby opposing heroes, evenly divided with stable entity-ID remainder assignment. Allied/forced friendly kills grant no XP. Neutral rewards cannot be farmed repeatedly from the same dead entity.

Marshal has three regular active abilities and one ultimate, detailed below. Explicit spell algorithms implement line damage, area damage, allied rally, and self-defense; authored spell ranks configure range, radius, damage, stun, duration, cooldown and mana. Presentation effects observe committed simulation events and never apply damage themselves.

## Items and loot

Equipment, consumables and economic goods are distinct declared item purposes. Equipment grants explicit stat bonuses; consumables enqueue an authoritative use command. Six hero slots, immediate transfer on reaching a selectable ground chest, deterministic capacity checks, drop/use controls, tooltips and full inventory feedback. Do not silently replace an item when full.

Each camp references a weighted loot pool. Easy/medium/hard pools contain weighted item entries plus optional no-drop weight and a bounded roll count. A snapshot-persisted integer PRNG gives reproducible random results without Math.random. Camp completion generates rewards once, at an accessible location. Shared chest geometry represents dropped items; icon/name/description remain item-specific. Hero death drops carried items on accessible ground. No XP or item state leaks through fog.

## Map and validation

Author the new 512 × 512 map last. Map dimensions become persisted author data and drive navigation, cell indexing, heights, fog, minimap, editor limits, camera bounds, snapshots and networking. Existing maps remain their authored dimensions. The new map has starting amber seams, woodland, open roads, water, and easy/medium/hard camps including melee and ranged units; routes and placement clearance are validated.

Verify economy conservation, interruption/reassignment, no remote deposits, tree depletion/replanting, reservations/refunds, simultaneous kills, shared XP, inventory capacity, seeded loot replay, ability targets/cooldowns/effects, fog filtering, save/restore/checksums, multiplayer commands, 512 pathfinding and map discovery. Inspect final models, all animation clips and in-game scale, plus runtime crowd/map performance. Model reports must distinguish completed visual checks from pending checks.

## Implementation checkpoints (2026-09-09)

- Camp loot is connected to authoritative deaths. `rules.lootPools` holds weighted entries; maps reference `camp.lootPool`. Snapshot state owns the PRNG and cleared camp IDs. Existing camps now reference easy/medium/hard item pools. Six item definitions have individual 128px icons and share the modeled neutral chest.
- Hero progression is declared through `behaviors.progression`: cumulative XP thresholds starting at zero, per-level health/damage/armor, and XP radius. `experienceYield` belongs to each defeated definition. Simultaneous combat resolves deaths before sharing XP, so dead heroes receive none; forced friendly kills grant none. Level-up preserves existing damage. `entityStats` supplies combat and public HUD values; exact XP is owner-only.
- Character GLBs now embed animation profiles. Existing ant GLBs received metadata only, with geometry and clips retained. New character exporter roles and studio controls are driven by those declarations.
- Marshal is integrated into each starting army, with its 6,512-triangle skinned GLB, independent rig instances, team color and eight animation clips. Studio run, attack and cast poses were inspected. Additional orbit/death and gameplay portrait checks remain.
- Inventory pickup/use/drop and equipped stat bonuses are implemented, including full-inventory rejection, simultaneous pickup ownership, death drops, and save restoration.
- Hall economy replaces transport claims entirely. `storage.dropoff` declares the stores funding construction and recruitment. Complete bills move atomically into project/producer escrow; cancellation refunds a hall, while hall destruction only destroys unreserved stock. Workers carry harvested resources to hall entrances. `work.harvests` declares allowable harvest recipes; `gather` is an authoritative command.
- The current currencies are `item.wood` and `item.amber`. Sawmill and stonemason remain authored scenery/building models but are removed from the worker build list and no longer run retired production chains. Forester replenishment and lumberjack harvesting remain active. Crafting is a generic tested capability with synthetic test declarations, not part of the current two-resource economy.
- All shipped maps have two new amber seams with clear ground around them. `constructionClearance` reserves a buffer around the multi-cell deposit footprint. `startingSetup.gathering` assigns three miners and three wood gatherers per player; two workers remain available. A live Mosswater check visibly confirmed mining and rising hall totals.
- Historical checkpoint: 241 tests passed before ability and large-map integration. The seam and chest are simplified geometry renditions of their concepts, not exact reference reproductions.

## Overnight scope extension

User explicitly authorized continued work until they stop the run. Finish the original playable expansion first, then continue useful improvements to editor, assets/foliage/rocks, atmospheric god rays/weather, visible archer arrows, and potentially a declarative particle/spell-effect editor. Verify current arrow presentation before replacing it. Keep the goal active while pursuing this expanded scope; do not declare the whole run complete merely because the original feature list is implemented.

Marshal is capped at level 10, with THREE regular abilities and ONE ultimate:
- **Faultline**: aimed mace shockwave, short line of physical damage and brief stun; deliberate ground targeting.
- **Rally the Colony**: nearby allied combatants gain temporary attack strength. Encourages combined armies, not a solo hero.
- **Iron Carapace**: activated defensive stance with temporary damage reduction; duration/cooldown prevent permanent invulnerability.
- **Crownfall** (ultimate, level 6): telegraphed ground slam with a large shockwave, damage and a longer control effect. Strong cooldown and mana cost.

Ability ranks, unlock levels, costs, cooldowns, effects and visual IDs must be declarations. Initial three abilities have three ranks each and ultimate one rank, giving ten total skill-point spends by level 10. No hidden per-hero scripting branches; commands and explicit effect systems own behavior.

### Ability implementation checkpoint

`rules.spells` declares names/icons/hotkeys/priority, target type, explicit effect algorithm, visual ID, and rank values. `behaviors.spellcasting` composes spell IDs, mana capacity/regeneration, mana icon, and learning-menu category. Runtime records store mana, learned ranks, cooldown deadlines and pending casts; timed effects reference spell/rank rather than duplicating balance values.

Marshal has ten possible skill-point spends by level ten: Faultline/Rally/Carapace each rank 1–3 at levels 1/3/5, Crownfall rank 1 at level 6. The command card derives learning and casting actions; K opens learning, Q/W/E/R cast abilities. Mana appears below portrait health. Friendly buffs never affect enemies; identical rally buffs refresh rather than stack. Damage packets join ordinary combat death/XP resolution. Stuns suspend movement/combat/work, and effects expire through an explicit timer phase.

Four spell icon originals and 128px derivatives exist. Cast animation is integrated. Declarative ring, shell and particle effects now render telegraphs and impacts. A live Mosswater check confirmed learning Faultline, its mana cost, cast animation and telegraph. Remaining visual QA includes impact timing and all four abilities in a full battle.

### Large-map and ranged-combat checkpoint

- `size: 256 | 512` is mandatory on maps. Simulation, motion, navigation, observations, height encoding, terrain/water/fog, minimap, editor brushes and camera bounds consume the loaded dimensions. The New dialog offers both sizes. Different-sized simulations can coexist and restore independently.
- Amberfall Wilds has 23 camps: eight easy, eight medium, six hard and a central hard encounter. Defenders supply 8,360 total XP, enough for both heroes to reach the 3,200-XP level-ten threshold if distributed. All camp locations have validated ground routes from the first starting area. Seven amber deposits and 4,853 trees support expansion.
- Thornspitter and Elder Thornspitter add ranged camps. The shared animated GLB has 3,456 triangles and six clips. Studio idle/walk/run/attack/hit/death samples and automated finite-pose/event tests passed. The model intentionally simplifies the reference's fine surface detail. Gameplay scale and crowd combat still need a closer visual pass.
- Ranged definitions declare `asset.projectile: "arrow" | "thorn"`. Authoritative attacks emit observer-filtered shot destinations, without exposing private enemy orders. The renderer draws visible shafts/heads/fletching or thorns along arcs. Damage remains authoritative at attack resolution; projectile arrival is presently visual rather than a delayed damage mechanic.
- Terrain stroke rasterization scans segment bounds rather than every grid cell against every segment. Fog blur updates only affected rows and columns. Combat acquisition excludes non-damageable resource entities. Observation keeps a derived visible-cell index, excluded from checksums and rebuilt on restore.
- Regression checkpoint: all 253 tests across 68 files passed, including save/restore after the visibility optimization. Production build passed before the small New-dialog addition. Live 512 gameplay and the editor island/causeway render correctly. Measured gameplay was around 97–115 FPS at 2560×1440 while multiple preview surfaces were open; this is not a verified 120-FPS result. Large-map initial foliage compilation remains expensive.

### Editor and terrain follow-up

The Effects workbench now previews and edits spell visual declarations through the same renderer used by gameplay. Live save, pause, scrubbing and Crownfall impact were checked. Saving content suppresses automatic page reloads, preserves the running editor and requires explicit reload to adopt rules. Particles are instanced in one draw per cue.

Terrain now consists of 32-cell patches sharing a material, preserving every original vertex while allowing camera/reflection/shadow culling. Tests verify total geometry, culling, raycasts and matching normals across edited patch boundaries. A close editor view measured approximately 697k total triangles after the change, but lighting/camera differed from the earlier overview; this is not a controlled percentage comparison. The large overview and late-day shadows still require performance attention.

### Encounter verification

A temporary flat encounter verified Marshal selection, Royal Crest pickup, dropping and re-pickup, stat updates without healing, camp clearance, level 2, and camp reward pickup. The temporary map was removed afterward. The check exposed a stockpile path that ignored asset scale; loose pickups now use declared scale and sit at the selectable entity position. A renderer regression test covers both. The map chooser now reads the map size instead of displaying 256 for every map.

### Visibility and ranged rendering follow-up

Visibility rasters and remembered borders are reused while sensor cells/radii and authoritative territory remain unchanged. Remembered entity data still refreshes each tick, and retained views remain immutable. Derived signature caches reset on restore. A forced-rebuild comparison covers movement, construction and restore. A 1,000-tick local construction profile measured 889 ms before and 78 ms after this change; this is a headless scenario, not a foreground FPS claim.

Hidden sessions continue fixed-step simulation and network commits but skip input, snapshot/DOM/minimap updates and rendering until visible. Visible but unfocused windows still render. Projectiles now use one instance batch per declared kind (arrow or thorn), with shared geometry and buffers that grow for volleys and are reused afterward. Gameplay damage timing remains unchanged.

Validation checkpoint: all 262 tests in 74 files passed in the resumed full suite, including economy, lockstep, snapshot, fog, pickup and projectile coverage. The earlier three failures were 20-second timeouts, not assertion mismatches.

Foreground check after closing old preview tabs: Amberfall Wilds starting area reported 120 FPS at 2400×2408 (2× DPR), approximately 2.8 ms GPU / 5.3 ms mean app CPU, with p95 CPU around 9 ms. This is a starting-area sample; it does not establish 120 FPS in every battle or editor view. Production build passed.

The hero selection panel now includes a compact XP meter, derived from the declared thresholds, with a next-level tooltip. Exact XP remains private to its owner. A regression covers level boundaries and the level-10 cap. The effects workbench locks edits during initial loading and saving; a live no-change save returned successfully. Fresh editor documents no longer show a stale edited label.

Forest batch rebuilds now preserve existing InstancedMesh objects and GPU buffers when their spatial/material group remains unchanged, and reuse capacity after depletion. Only growing/new groups allocate buffers; removed groups dispose them. Picking IDs and full-detail bounds update with the group. A lifecycle regression checks removal, transform correctness, stable unaffected buffers and disposal.

### September 9 resumed checkpoint

- Optional map-authored rain/snow now shares the game/editor renderer, bounded to one 768-instance batch. Existing maps stay clear. Weather edits preserve the live clock. See `weather.md` for schema and limits.
- Full suite: 266 tests / 77 files pass; production build passes. These counts include XP presentation, forest buffer reuse and weather checks.
- Effects workbench retains incomplete JSON independently per visual when changing abilities. A live check removed a comma in Faultline, switched to Rally and back, and confirmed the edit survived. Saving from Rally correctly rejected the invalid Faultline draft by name, with no content write. Test drafts were closed without saving. TypeScript validation passes after this UI polish.
- Performance remains scene-dependent; the earlier 120 FPS start-area sample is not a sustained whole-map/night-time guarantee. Low-angle shadow cost remains a profiling target.

### Reachable loot placement

Camp rewards, manual inventory drops and hero death drops share `dropPosition`. It searches nearby cells in a stable nearest-first order, keeps chests at least two world units apart where space permits, and requires free ground plus an unobstructed movement segment from the drop site. It cannot scatter rewards across water, through a building or over a cliff. The search is bounded to six cells and consumes no random state; a fully crowded site falls back to the original position so no item is deleted.

The simulation build is now `declarative-sim-7`: old deterministic clients/snapshots must not silently run the changed drop rules. Regression coverage includes multi-roll camp rewards, full six-slot inventory drops, map edges, no-space fallback, and identical placement after snapshot restore.

### Forester lifecycle and large-map startup audit

A real lifecycle regression now covers exhausted site → worker planting → saved growing tree → mature visible/blocking tree → resumed wood delivery to the hall. A second scenario revealed that integer-cell occupancy allowed regrowth while a departing unit's continuous collision footprint still overlapped the tree. Regrowth now waits for that full footprint to clear, using the same unit radius as movement. The departing unit reaches its original destination after the tree matures. This deterministic correction advances the simulation build to `declarative-sim-8`.

Current Amberfall Wilds audit: map validation passes; routes to all camp homes and player starting areas succeed; 4,853 trees, 23 camps, 8,360 total camp XP. After 2,400 normal ticks with no player input, each hall contains 108 wood / 84 amber, all twelve configured gatherers remain assigned, and no premature match outcome occurs. This demonstrates symmetric functioning startup logistics, not a full competitive balance claim.

### Pickup execution and incapacitation

Pickup follows the same execution gating as movement/combat: a stunned or currently casting hero retains the pickup order but cannot transfer the item until free to act. Invalid/missing targets still cancel normally. A regression places a hero beside a chest, issues pickup during a stun, confirms the chest remains through nine ticks, and verifies exactly one transfer on recovery, including snapshot replay equivalence. Simulation build: `declarative-sim-9`.

### Current asset verification (supersedes earlier carry-pose caveat)

The live `ant-marshal` studio at port 8780 was confirmed by its status endpoint before inspection. Carry was selected, paused and scrubbed at multiple times, with front, side and rear orbit views. Mace attachment and armor remained intact in those sampled poses. Blue ownership recoloring affected chitin/team surfaces while steel and bronze remained distinct. This closes the previously pending dedicated carry-pose visual check; it is not a claim of exhaustive frame-by-frame intersection testing.

The actual runtime Marshal and Thornspitter GLBs and every declared icon were rechecked through asset tests. These validate animation loading/finite transforms, the Marshal's attack event, starting hero strength, and PNG square dimensions no larger than 128 pixels. No assets were regenerated in this verification pass.

Remaining visual/performance evidence to strengthen before any whole-expansion completion claim: a sustained battle exercising all four Marshal abilities, clearly observed ranged projectile flight in gameplay, and crowded large-map performance across lighting conditions. Earlier isolated spell previews, functional tests and single-scene FPS readings do not substitute for those checks.

### Live encounter pass

A temporary QA map used ordinary starting units, three archers, a wolf/Thornspitter camp, three ground items and a stationary enemy barracks. The first attack-move cleared the small camp and produced its chest. A follow-up encounter visibly showed a Thornspitter projectile between the creature and the selected army, with damage pips updating. The archer was lost during that encounter before a clear arrow frame was captured; therefore arrow-flight visual verification remains open. The temporary map was removed from the shipped catalogue after inspection. No permanent map or balance declarations were changed for this check.

### Repeatable combat visual verification

`experiments/combat-check` now provides a development-only real-simulation encounter with pause/tick controls and stop-on-arrow. It closes the previously missing clear arrow-frame check: all three arrows were visible between archers and barracks at tick 40. Faultline, Rally, Carapace and Crownfall were issued as normal commands and their impacts inspected in the same fight. The fixture initializes a level-ten Marshal; it does not claim to demonstrate earning those levels in a full match.

Carapace's additive, double-sided sphere was visibly washing out the hero. Its impact shell now uses single-sided normal blending at low opacity; a repeat visual check confirmed the hero remains readable. Other effect algorithms and simulation damage were unchanged. Crowded forest performance across lighting conditions remains a separate check, not covered by this flat-ground fixture.

### Army render scaling

SettlementLayer now retains direct references to model body/carry/cargo/stock/selection/health objects in a WeakMap, replacing repeated recursive name searches every frame. A shared position vector avoids one allocation per entity per update, and attack-facing target lookup uses one per-update ID map rather than scanning the entity list for each attacker. Model replacement creates a fresh reference set; retirement remains collectible.

Renderer regression coverage confirms decoration updates perform no recursive name lookup across 60 updates and remain correct after an appearance asset replacement. The repeatable combat fixture now accepts `?crowd=200`: the observed sample had 2,291 draws and 16.60ms CPU entity-update/render-submission mean. This is a flat-ground, no-shadow fixture with animated models, not a forest/GPU/120-FPS claim. Material-group draw count is the next measured scaling concern.

### September 9 — army material batching

Combined compatible character material primitives at load time, preserving skinning, vertex positions, authored color/PBR factors and the independent team-color surface. The 200-warrior combat harness fell from 2,291 to 646 draw calls; observed CPU update/render submission fell from 16.6ms to around 5.5–6.0ms. Visual inspection shows intact equipment and red/blue ownership. This does not establish forest performance or a 120fps whole-game target. Regression coverage compares all four ant variants before/after at idle, run, attack and death poses.

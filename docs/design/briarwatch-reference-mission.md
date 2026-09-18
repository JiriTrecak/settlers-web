# The Defense of Briarwatch

Status: playable and verified. An ant-world reference mission, separate from the existing Vanguard chapters.

## Intent

A compact, hero-led expedition with four starting guards, a level-two ceiling, no base economy, and a settlement to save. The benchmark is Warcraft III's first Human chapter, The Defense of Strahnbrad. Match the useful geography, encounter sequence, recruitment opportunities, optional quest loops, rewards and escalation. Author new insect-world art and dialogue for each beat.

The quality test is an enjoyable mission played through with real movement, attacks, injuries and losses. A sequence of trigger teleports or enemies killed through debugging does not establish that.

## Route and encounters

The route begins in the northwest, descends south through a hamlet, bends east past an ambush and robbed merchant, then crosses a stream north into the eastern settlement. Forest barriers separate branches; the road and passable margins remain clear.

1. **Departure:** Marshal and four guards meet an elder commander. The elder goes toward the raiders' camp; the player must protect Briarwatch. Two destructible supply caches reward inspecting the starting camp.
2. **Hamlet:** two willing workers become controllable guards. A worried caretaker requests the rescue of a missing young ant.
3. **Rescue detour:** a clearing east of the hamlet holds two melee scavengers, one ranged scavenger and a breakable cage. Release the child and reunite them with the caretaker for an armor charm. The branch is optional.
4. **Betrayal:** a stranded traveler asks for help beside the road. Approaching reveals a concealed raider group. A group-healing supply is the reward.
5. **Stolen ledger:** witness a merchant being robbed. Thieves retreat to a southeastern forest pocket. Defeat their leader, physically pick up the ledger, then return it for a permanent hero reward. No credit merely for killing the leader.
6. **Bridge and gate:** fleeing inhabitants establish the threat before combat. The road crosses water and enters the town from the south.
7. **Town defense:** several short fights, a recruitable group of three surviving guards on the west side, a collapsing-house encounter and a hidden mana supply. Civilians flee along readable routes.
8. **Captives and commander:** the northern raider leader orders prisoners taken away. Defeat the leader and escorts to win; a short aftermath commits the Marshal to pursuing the captives.

The Marshal dying loses the mission. Optional quests may fail without ending the main mission. Dialogue must not overwrite other dialogue; optional completion must survive saving, dropping items, revisiting regions and a full inventory.

## Casting and assets

Marshal fills the young commander role; an elder ant leads the separate assault. Worker volunteers and town guards use our ant anatomy. The caretaker, child and merchant need distinct, readable silhouettes. Raider ants need hostile colors and recognizable melee/ranged/leader equipment. Environmental kit: resin-and-bark cottages, supply crates, merchant handcart, twig cage, settlement gate/palisade, ruined cottage and captives. Existing forest, bridge, foliage, lights and water assets can support the new authored layout.

New models must retain source recipes and Blender files, export through the asset pipeline, have appropriate clips and team colors, and be inspected from gameplay and cinematic distances. Temporary reuse must be recorded as temporary.

## Engine work

- Saved, deterministic mission inventory queries, grants and removal; no lost rewards when slots are full.
- Identity-preserving civilian transformation and ownership transfer.
- Destructibles and fixed loot using the regular damage/death pipeline.
- Permanent item rewards, a quest item presentation, and discoverable objective destinations.
- Dialogue scheduling, staged cinematic movement, survivor recruitment and safe optional-quest failure.
- No new map-specific behavior in the simulation or HUD; behavior comes from content and Lua.

## Acceptance

Play and capture both the direct route and all optional branches. Verify hero death, failed rescues, partially surviving defenders, full inventory, ledger drop/recovery, repeated triggers, reload during cinematics and combat, and deterministic restore. Inspect terrain connectivity, forest boundaries, all new asset clips, close-up portraits, movement/impact timing and frame timings. Keep existing maps and tests working.

## Research and version differences

Sources disagree on some unit counts and labels across original/Reforged difficulties. The target is the original mission's structure; use a documented normal-difficulty ant balance rather than claim an exact binary reproduction.

- [Gamepressure route guide](https://www.gamepressure.com/warcraft-iii-reforged/the-defense-of-strahnbrad/z1cfa7): numbered geography and main/optional path arrangement. Some enemy/item labels conflict with the sources below.
- [Blizzplanet walkthrough](https://warcraft.blizzplanet.com/blog/comments/the-defense-of-strahnbrad-warcraft-iii-reforged): encounter and cinematic ordering, volunteers, cage rescue, betrayal, merchant chase and return, town defenders, captives and aftermath. Dialogue will be newly written.
- [Gamer Walkthroughs](https://gamerwalkthroughs.com/warcraft-3-reign-of-chaos/human-campaign-the-scourge-of-lordaeron/the-defense-of-strahnbrad/): hidden consumables, branch rewards and encounter checks.
- [Wowhead Human campaign guide](https://www.wowhead.com/guide/warcraft-iii-human-campaign-the-scourge-of-lordaeron-walkthrough-tips-tricks): starting company, recruitment, level ceiling and quest rewards.
- [Original-release playthrough](https://www.youtube.com/watch?v=rOgt9Jn7d9A): visual and timing reference to review during the playable pass.

## Evidence log

The mission is authored in `scripts/missions/vanguard-briarwatch.ts` and `.lua`; its generated map is `assets/maps/campaign/vanguard-briarwatch.utcmap`. It appears as a separate campaign reference chapter and is excluded from skirmish.

Two full playthroughs use ordinary movement, attack, pickup and drop commands. No health edits, teleports or forced kills are used in those runs. The direct route won in 5m49s including dialogue, with seven survivors and 340 hero health. The optional route won in 7m20s with both optional quests completed, eight survivors, the armor ring, and the permanent 25 HP / 1 damage seed bonus. These are scripted route timings, not estimates for a first-time player exploring the map. No learned abilities or consumable activations were needed for these baseline wins. The driver asserts that the captain is visible when his briefing begins.

Evidence: `artifacts/briarwatch/direct-playthrough.json`, `optional-playthrough.json`, `animation-validation.json`, and `opening-performance.json`. The final full suite passed 936 tests across 223 files; branch tests cover hero death/restart, caretaker and youngling loss, merchant loss, full reward inventories, dropped/recovered ledgers, one-time returns, surviving defenders, and cinematic restore. Exchange, power-up, scripted-destruction and escort tests cover the new engine APIs. Snapshot checkpoints on the real optional route compare deterministic checksums.

The production build and generated wiki build both passed.

Three saved Blender sources passed packed-reference and geometry validation. Four skinned GLBs load in Three.js and every animation is sampled at 13 poses with finite bounds. Live previews checked walking, running, bow release and team recoloring; saved pose renders cover melee contact, the captain rear and death. The rear check found and fixed cloak intersection. Source recipes, GLBs, icon crops, palettes and asset records are retained.

The opening performance capture is a 10-second sample on this Mac at 1337×1204, medium atmosphere. It recorded 2.42 ms mean main-thread work (4.10 ms p95) and 6.32 ms mean GPU frame time (7.07 ms p95). Presentation averaged roughly 109 FPS, with an 8.3 ms median and 16.7 ms p95 interval. It is not a whole-mission or slower-hardware guarantee. There were other development tasks active during this capture; do not add overlapping GPU/CPU scopes together.

## Deliberate adaptation differences

- The army is our Marshal and ant Warriors, not a new Paladin/Footman faction. The Marshal retains his own learned abilities, armor system and attack timings. This makes the mission useful for testing our actual army; it is not a Holy Light balance reproduction.
- Four inventory slots replace Warcraft's larger inventory. Full inventories therefore explicitly delay quest reward delivery. The vigor reward gives concrete permanent bonuses rather than introducing Strength/Agility/Intelligence.
- Routes preserve the major branch arrangement and encounters, not a tile-for-tile terrain copy. New canopy foliage, a layered bridge, bark houses, twig cage, leaf cart and ant raiders replace human/orc assets.
- Dialogue is original, covering corresponding dramatic beats. There is no imported Blizzard dialogue, voice track or ripped art.
- Cache secrets and fixed drops are included; the original cosmetic night-ghost Easter egg is not reproduced. House collapse uses ordinary destruction followed by a ruin; it does not yet have a bespoke collapse animation or fire simulation.
- The source guides cover different releases/difficulties. Enemy health and damage are a normal-difficulty first pass for our army; direct and optional routes both remain winnable without debug assistance.

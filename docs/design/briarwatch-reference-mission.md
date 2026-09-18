# The Defense of Briarwatch

Status: in development. An ant-world reference mission, separate from the existing Vanguard chapters.

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

Research and engine audit complete. Implementation, model production and gameplay validation are pending. This document is not a completion report.

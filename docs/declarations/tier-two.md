# Ant Tier 2: implementation design

Status: implementation in progress. This document describes the intended complete pass, not a claim that all systems or assets already exist.

### Current implementation checkpoint

The goal remains active. This is the current state, replacing earlier chronological checkpoints.

- **Core systems implemented:** `requires` with shared live-owned-building prerequisite checks; `placementNear` with observed, finite-resource validation; specialized accepted-item drop-offs crediting the colony account; native paid in-place building upgrades; colony-wide paid research queues. Cancellation refunds exactly once, destruction loses unfinished purchases, completed knowledge persists, and save/restore validates task and research state. Simulation build is 21.
- **Mound → Great Mound integrated:** actual JSON costs 320 Amber / 180 Wood / 100 Root and 60 seconds. Same entity, footprint, entrance and behaviors; +600 HP capacity, armor 6, worker births pause then resume. The new raised command-storey model is 58,902 triangles / one mesh / 30 materials, with three `TC_TeamColor` flags. Own Blender/recipe/reference/palette/full-resolution comparison and delivery report in `experiments/assets/buildings/great-mound`; studio port 8791. Blender, GLB, white team vertex colors, blue flag recoloring and front/side/rear inspection passed.
- **Rootworks integrated:** 140 Amber / 80 Wood, basic card, 12-cell live-deposit placement constraint, only Root accepted. Model 11,004 triangles / one mesh / 17 materials; studio 8788. Source and report in `experiments/assets/buildings/rootworks`.
- **Corrupted Root integrated:** neutral targetable source, 3,000 Root, five gatherers, ten per trip, final partial load allowed, mineral unit-collision pass-through. Deposit model 8,106 triangles / one mesh / 13 materials; carried bundle 114 triangles. Source/report in `experiments/assets/buildings/corrupted-root`; studio 8790. Blender and exported source inspection passed. Native browser inspection confirmed the pale carried bundle on a Worker holding exactly 10 Root; the shared balance remains unchanged before delivery.
- **Ironroot Forge integrated:** 140 Amber / 70 Wood, basic card, three-slot paid queue. Current research: Serrated Tools, Reinforced Carapace, Broadheads, Driving Spear, Campaign Harness, and Saturating Shells. Harness requires Great Mound and costs 200 Amber / 80 Wood / 60 Root, 50 seconds, Marshal +200 HP. Source/report in `experiments/assets/buildings/ironroot-forge`; model 11,684 triangles / one mesh / 17 materials; studio 8789. Blender/GLB/orbit/recolor checks passed.
- **Verification:** latest full suite **475 tests passed across 121 files**; game build, TypeScript, wiki generation/type check and whitespace checks pass. Focused upgrade/research/Forge/Root/actual Great Mound flow tests pass (16 tests). The actual-content flow gathers 160 Root, upgrades for 100, purchases Harness for 60, and restores the save. Other tests cover births, wounded HP, hero revival, five-contact tree harvesting, refunds, duplicate queues, depletion, capacity and deterministic saves. The native browser test scene verifies upgrade model replacement, level/health/armor, research admission, full three-currency cancellation/refund, Root gathering label and observer delivery income. Research queue buttons retain their DOM nodes as progress changes, avoiding lost clicks. A stale loot-wiki test now uses its own weighted/two-roll fixture rather than assumptions about current balance.
- **Hunter integrated:** 4,328-triangle rigged model, eight animation states including charge, same size as the original ants; source/studio `experiments/assets/characters/ant-hunter`, port 8792. Barracks recruitment requires Great Mound, costs 190 Amber / 45 Wood / one free Worker. Native charge grants 2× movement and one 2× impact for a 3–7 cell clear approach, eight-second cooldown, at most 2.5 seconds active. Ordinary move, changed target, stun/root, expired/lost target cancel the burst; normal collision/pathing remains authoritative. Driving Spear research halves cooldown. Save build 21 persists active/cooling state. Six gameplay tests cover impact, no repeat in melee, interrupted/blocked/building approaches, worker recruitment, research, deterministic restore and invalid saved capabilities. Native renderer duel was visually inspected.
- **Bombardier integrated:** `experiments/assets/characters/ant-bombardier`, studio 8793; published `assets/ant-colony/characters/bombardier.glb` and manifest. 5,008 triangles / 2 meshes / 7 materials / one rig. Goggles, reinforced harness, offset back mortar, seven clips with braced attack and actual barrel recoil. Blender/GLB/loop/release/death/color/orbit/workshop-scale checks passed; two actual-export tests pass. Actual recruitment, Great Mound gating, 22-tick windup/release and Saturating Shells research are integrated and covered by gameplay tests.
- **Shell infrastructure implemented:** `combat.shell` declares flight ticks, radius and slow duration/strength; research can materially increase radius/slow. Persistent non-homing shots capture damage and faction eligibility on launch, survive shooter removal, resolve damage once on arrival and can be dodged. Buildings receive splash but no movement slow. Equal-strength slows refresh; overlapping strengths use the strongest active value, and a weaker longer effect resumes when the stronger expires. Observed flight/impact cues use two instanced render batches, with no renderer-authoritative damage. Nine shell tests pass, including deterministic midflight restore and no immediate damage. `tests/manual/shells.html` verifies arc, delayed damage, 80% movement and impact rendering using the actual Bombardier asset/definition and ordinary attack command.
- **Presentation:** `tests/manual/tier-two.html` provides a repeatable isolated native-renderer/HUD inspection scene (no changes to saved matches). Normal HUD currencies derive from content. Observer resource columns now also derive from currency definitions, including Root balances and delivery income. Generated wiki explains accepted drop-offs, prerequisites, upgrade and research costs/effects.
- **Workshop integrated:** Advanced Great-Mound-gated production building, 220 Amber / 120 Wood, 30 seconds, 1,400 HP. Model is 17,594 triangles / one mesh / 16 materials; source/report in `experiments/assets/buildings/bombardier-workshop`, last verified studio port 8795. Bombardier recruitment consumes one Worker, 220 Amber / 80 Wood / 40 Root in two seconds after arrival. Flags alone use team color.
- **Maps and AI:** two guarded Root deposits added to each playable battle map with native placement and route tests. AI prerequisites, specialized dropoffs, upgrade/research commands, investment savings, camp priority and gatherer reallocation are implemented. A passive-opponent run reached Great Mound. Contested duels have not yet proved full Tier 2 progression; construction service-point recovery is now under match verification.
- **Still required:** reliable full-match AI Tier 2 production/use; all-map visual inspection; final animation/muzzle/scale/performance verification and end-to-end T2 playtesting. No completion claim for the full pass.
- Preserve concurrent multiplayer, item/loot, neutral and terrain work. Asset studios are managed sessions; verify their identity before reusing or rebuilding.

## Progression

The existing Main Hall becomes **Mound**. Upgrade it in place to **Great Mound** for an initial 320 Amber, 180 Wood, 100 Root over 60 seconds. Keep entity identity, owner, stored resources, selection, rally, and map objective. Keep its footprint compatible so upgrading cannot overlap neighbors. Worker production pauses during the upgrade and resumes afterwards without increasing capacity (8) or birth rate (12 seconds). Damage remains meaningful during upgrading; cancellation refunds the funded price and preserves the original Mound. Destruction loses the committed upgrade resources. A colony with a living, completed Great Mound satisfies Tier 2 prerequisites.

The **Rootworks** is Tier 1: 140 Amber / 80 Wood, 30 seconds to construct. It must be placed within 12 cells of a living, nonempty Corrupted Root deposit, preserving the deposit's access clearance. This prevents a circular prerequisite. Workers deliver Root only to completed owned Rootworks; it accepts neither Amber nor Wood. Other drop-offs cannot accept Root. Delivered Root is spendable colony-wide through the existing inventory funding system. Currency credits go to the colony's objective Mound account immediately after valid physical delivery, not into the outpost's stock. Thus destroying a Rootworks does not erase earned Root; refunds also return currency to that account without needing a second physical delivery.

Deposits contain an initial 3,000 Root, admit at most **5 workers**, and yield **10 per full carry** on the same work-cycle timing as Amber. A final depleted load can be smaller. Active Root gatherers ignore unit collisions like Amber miners, but respect buildings, terrain and water. Losing a drop-off redirects loaded workers to another eligible Rootworks; with none, they hold their cargo. No conversion into Amber or delivery to the Mound.

Map deposits sit beyond starting bases, with neutral defenders. Each map needs accessible, contestable sites and enough clearance for Rootworks plus worker routes. Editor placement uses the same definitions; opening an existing map must not secretly add resources.

## Buildings and units

- **Hunter:** Barracks recruitment, visible but locked until Great Mound. Initial price 190 Amber / 45 Wood + one free Worker. 600 HP, 2 light armor, 24 melee damage every 1.4 seconds; trades armored staying power for pursuit. Automatic charge uses the current attack target, minimum/maximum activation distance 3/7 cells, 8-second cooldown, native pathing, a short speed burst and empowered next strike. No stun. Ordinary move orders never trigger charge; blocked activation does not consume cooldown. Facing and a spear-lowering animation make it readable.
- **Bombardier Workshop:** advanced construction after Great Mound, initial 200 Amber / 120 Wood. Recruits **Ant Bombardier** for 220 Amber / 80 Wood / 40 Root + one Worker. A stocky ant with a back mortar, a braced firing animation, slow movement and slow visible arcing shells. Initial blast radius 2 cells; 20% unit slow for 2 seconds, refreshed rather than stacked. Projectiles carry authoritative impact timing and location so moving enemies can dodge. Friendly splash is off initially. Buildings take damage but not slow. Normal units remain affordable when Root control is lost.
- **Ironroot Forge:** basic construction, initial 140 Amber / 70 Wood. Research is a colony-wide unlock, with prerequisites and costs declared as content. No repeated incremental tiers.

## Initial research roster

Each entry is bought once per colony and applies to existing and future eligible units. Duplicate purchases across forges are rejected. Numbers are starting values for playtesting.

- **Worker — Serrated Tools:** each axe contact removes 2 tree HP, cutting a full tree in five hits. Still 10 Wood per tree and carry. Visible tooltip describes the changed harvesting cadence.
- **Warrior — Reinforced Carapace:** +150 maximum HP and +2 armor. Adds only the gained HP capacity to current health; does not fully heal an injured soldier. A material frontline investment.
- **Archer — Broadheads:** +35% attack damage. A single substantial damage investment, not a ladder of small upgrades.
- **Hunter — Driving Spear:** charge cooldown 8 → 4 seconds; the existing double-damage impact remains. Requires Great Mound.
- **Bombardier — Saturating Shells:** blast radius 2 → 3 and slow 20% → 35%. Requires Great Mound and costs Root. Multiple slows still use the strongest active value rather than adding.
- **Marshal — Campaign Harness:** +200 maximum HP. Requires Great Mound and Root. Applies through death/revival without overwriting level or item bonuses.

Research queues are distinct from recruitment and unit orders. Costs reserve on enqueue, cancellation refunds once, completion records a persistent research ID. One active task per forge. Losing a forge destroys its unfinished paid research; completed research survives. Prerequisites gate purchase; losing the Great Mound does not undo completed research or paid recruitment/research. New Tier 2 purchases require a Great Mound again.

## Native systems and declarations

Use typed JSON declarations for prerequisites, upgrade/research products, accepted storage goods, placement-near-source constraints, combat abilities and research effects. Native systems own movement, task funding, transforms, projectile collision and effects. Do not build a general behavior scripting language or duplicate balances in the renderer.

Research modifies one shared resolved-stat/effect path consumed by simulation, HUD and AI. Health changes, charge cooldowns, splash parameters and harvesting effects have explicit native handlers. Player commands carry IDs and targets, not arbitrary stat overrides. Completed/pending research, building upgrades, charge state and projectiles participate in snapshots, validation, checksums and lockstep compatibility.

Command cards show unmet prerequisites, prices, research progress and cancellation. Resources strip, observer rates, worker gathering tooltips, AI spending/tech planning, editor content authoring and generated wiki must all understand Root and Tier 2.

## Art deliverables

Use the existing ant family, hall, barracks, sanctuary and resource reference images as the shared design language; new silhouettes are authored from this gameplay brief, and unseen surfaces are inferred. Required new models: Great Mound, Rootworks, Corrupted Root, Bombardier Workshop, Ironroot Forge, Hunter and Bombardier. Existing Mound geometry remains the Tier 1 hall. Buildings have visible `TC_TeamColor` flags; the neutral Root deposit has natural corrupted-root materials. Player ants retain the exact ownership material and independent instance colors.

Characters need real rigs, distinct idle/walk/run/attack/hit/death clips and the compatible carry state; Hunter also needs charge anticipation and Bombardier needs a mortar-specific attack. Publish engine GLBs and manifests from separate source folders. Each asset requires recipe/config, reference/palette, editable Blender file, full-resolution comparison, source/export validation, visual orbit/animation/color review, exported geometry metrics and a working local studio.

## Completion evidence

Verify a complete fresh match: clear camp, construct Rootworks, gather/deposit Root, upgrade Mound, recruit Hunter, construct Workshop, recruit Bombardier, purchase research, and fight. Exercise a full deposit, no drop-off, destroyed drop-off, resource depletion, canceled research/upgrade, duplicate purchases, injured upgraded units, hero revival, locked commands, save/restore and matching peers. Observe AI reaching and using Tier 2 without hidden map knowledge. Inspect every published model in the game and its studio; measure an army with the new animated units and projectiles. Run appropriate full game/content/network tests and game/wiki builds.

## Bombardier Workshop checkpoint

The Workshop asset is exported and declared: 9×7 footprint, 1400 HP, 5 armor,
220 Amber + 120 Wood, 30-second construction, Great Mound prerequisite and
Advanced Build card. It trains a physical free Worker for 220 Amber + 80 Wood +
40 Root in two seconds after arrival. Bombardier: 500 HP, 1 light armor, speed 3,
42 Siege damage, range 10, three-second cooldown, 22-tick windup, one-second
flight, radius 2 and 20% slow for two seconds. Siege currently has neutral 1×
matchups against every armor class, with normal numerical armor mitigation.

Saturating Shells at Ironroot Forge costs 200 Amber + 100 Wood + 60 Root and
50 seconds. Radius becomes 3, slow becomes 35%; slows never add together.
The real-content integration tests cover gating, physical recruitment, exact
Root refund and researched shell parameters on release. Workshop model:
17,594 triangles, 1 mesh, 16 materials; blue flag and rear/side inspection passed.
Runtime icons are 128×128. Native in-game model/shot alignment, maps, AI and
full Tier 2 playthrough/performance remain required before goal completion.

## Contested Root sites

`node --import tsx scripts/maps/tier-two-root.ts` authors two finite deposits
beside existing hostile camps on Worldroot Hollow, Crownmere Basin, Amberfall
Wilds and both Mosswater map copies. It preserves the existing camp members,
loot pools and terrain. Each deposit starts with 3000 Root; five worker slots
and ten-unit trips come from the shared definition. Starting bases remain at
least 40 cells away. Decorative stamps are removed only from the deposit and
its nearby Rootworks construction pad. These pads are empty terrain, not
prebuilt player structures.

`scripts/maps/tier-two-root-sites.json` records the exact deposit/camp/pad
coordinates. Native map tests verify dry, valid placements, guard aggro range,
paths from both starting bases to deposit and pad entrances, and actual
`canBuild` acceptance after scouting. The existing Worldroot central Amber
source and legendary camp roster remain unchanged. AI claiming and defending
these new Root sites, and visual inspection on the live maps, are still pending.

## AI progression checkpoint

The economic planner now consumes shared prerequisites, upgrade recipes,
research outputs and specialized dropoff declarations. Once it has four army
units, its minimum workforce and no observed threat near home, it can claim a
visible safe Root deposit with Rootworks, purchase Great Mound, add advanced
production and buy useful permanent research. Existing house/hero recovery
priorities remain ahead of these investments. Research is selected only when
its effects apply to units the AI currently owns. All spending goes through
ordinary commands, with one spending action per beat including upgrades,
research and revival.

Composition weights are Warrior 40 / Archer 30 / Hunter 20 / Bombardier 10;
locked or unaffordable units are skipped. Harvesting requires a completed
compatible dropoff, so the planner cannot strand workers at Root before a
Rootworks exists. Resource outposts use bounded local doorway checks rather
than a home-only flood. Outposts do not relocate the strategic home away from
the population-producing Mound.

Focused tests cover actual accepted upgrade/research commands, prerequisites,
Root dropoff completion, safe remote placement and visible-enemy avoidance.
Long-running real-map AI progression, camp priority/defense, and match-budget
tuning remain required; this checkpoint does not claim the AI completes Tier 2
in a full match yet.


## Full-match and native-render checks — September 10

The first Mosswater simulation against a passive opponent won at tick 17,083,
but never progressed beyond basic recruitment: every Amber delivery was spent
on Warriors. The planner now reserves the next outpost/upgrade/producer bill
once it has eight army units and no visible threat near home. Camps guarding
an unclaimed specialized resource receive a strategic priority bonus, without
revealing whether their guards have been killed in fog.

The revised seed-42 passive match won at tick 22,360 (9m19s simulation), with
Rootworks, Great Mound, Ironroot Forge, 340 Root in stock and three completed
researches (Serrated Tools, Reinforced Carapace, Broadheads). It had not built
Bombardier Workshop before victory. AI planning measured p50 1.95ms, p95 2.64ms,
p99 2.97ms in this headless run; these are not rendering FPS measurements.
Reports are in `experiments/ai/tier2-mosswater-passive*.json`.

`tests/manual/shells.html` now uses the actual Bombardier definition and normal
attack command, including the authored 22-tick windup. Browser inspection
confirmed one impact at 1.6 seconds, 38 damage after the target's armor, the
20% movement slow, team colors and impact indicator. The fixture starts paused
and discards paused wall time, so clicking Launch cannot accidentally fast
forward multiple attacks. Exact muzzle alignment and battlefield performance
still need inspection.

The 48,000-tick (20-minute) seed-42 AI duel completed without a winner.
Both sides completed the three basic Forge researches. Player 2 built
Rootworks, but neither upgraded its Mound or recruited Tier 2 units. This
identifies contested-resource exploitation under pressure as unfinished AI
work, not a demonstrated full Tier 2 success. The reproducible report is
`experiments/ai/tier2-mosswater-duel.json`. All 473 tests and TypeScript checking
passed at this checkpoint; the editor-hub tests require localhost socket access.

### Staffing new resource outposts

An established workforce must not prevent a newly built Rootworks from receiving
workers. When no unreserved idle gatherer is available, the economy planner can
transfer one empty-handed gatherer from an overfunded resource to an underserved
observed safe source with a compatible completed dropoff. Demand considers both
assigned gatherers and banked stock. Reallocation requires a 2:1 demand gap,
retains at least two gatherers on the donor resource, preserves workers carrying
cargo and pending movement orders, and has a 200-tick cooldown. It uses the same
ordinary gather command as a player. This is a general economic rule, not a
Root-specific worker exception.

The reallocation duel (`tier2-mosswater-duel-rebalance.json`, seed 42,
48,000 ticks) still did not reach Tier 2. Player 2 accumulated 2,275 Amber and
1,470 Wood, demonstrating that income alone was no longer the limiting factor.
Both players ended with zero-progress construction: player 2 Barracks at
(26,51), player 1 Forester at (196,201). The planner's one-construction-at-a-time
policy then blocks further economic construction. Construction reachability
and stalled-site recovery are the next evidence-driven investigation. This
run does not prove the outpost staffing change sufficient for full progression.
The updated suite passes 474 tests; TypeScript and generated wiki checks pass.

### Reachable building service points

A shared construction defect was reproduced with a doorway cell that was free
but enclosed by stationary units. `Economy.workPoint` previously tested only
the nearest free point and retried that inaccessible point forever. It now
tries each free point in the existing three-cell Manhattan service radius,
nearest first, and accepts only a successful native route. It does not expand
building interaction distance or bypass unit/static collision. A regression
scenario remained at zero progress before the fix and advances afterward.
The full suite passes 475 tests at this checkpoint.

The post-fix seed-42 duel reached tick 48,000 with **both Great Mounds**, no
unfinished construction, and delivered Root balances of 740 / 480. Player 2
completed Bombardier Workshop and Campaign Harness. Player 1 retained its
Rootworks; player 2's was no longer alive at the end. No Hunters or Bombardiers
were alive or queued in the final snapshot, so actual advanced-unit recruitment
and use remains unproven by this run. Report:
`experiments/ai/tier2-mosswater-duel-access.json`; full diagnostic snapshot:
`/tmp/tier2-duel-access.snapshot.json`. The next check must distinguish no
recruitment from recruited units dying, and verify advanced composition funding.

### Funding the intended army composition

After ranking composition deficits, the planner now saves for the next unlocked
recruit with an available producer instead of always buying a cheaper fallback.
This applies once the army reaches its declared minimum; below that floor,
immediate affordable replacements remain allowed. Saving requires each resource
to be in stock already or have a completed compatible dropoff, so a missing Root
supply cannot indefinitely reserve money for Bombardiers. Optional recovery and
forestry construction respect that recruitment reserve; actual fallen-hero
recovery retains its earlier priority.

Regression tests prove an underrepresented Hunter is saved for at 150 Amber,
then queued at 190, and that an army below its floor still recruits an affordable
Warrior. The match diagnostic now counts actual Worker-to-unit transformations
and authoritative shell launches; final survivors alone cannot prove whether
advanced units were used. It can also save/restore full compatible snapshots
and reports whole simulation-tick timings separately from AI planning timings.


Native Root cargo inspection is repeatable through `tests/manual/tier-two.html`
→ Inspect Root cargo. It issues the real gather command, advances until cargo is
acquired, then pauses and frames the worker. The browser showed the pale root
bundle, exactly 10 Root in cargo, and unchanged spendable Root before delivery.
This fixture does not inject cargo or alter saved matches.

The recruitment-instrumented baseline proves player 2 recruited one Bombardier
and launched two authoritative shells before losing it. The five-minute
continuation from tick 48,000 with composition savings recruited **one Hunter
per AI**. Player 1's Hunter was executing an attack-move with its army at the
end; player 2's remained alive near home. Reports:
`tier2-recruit-baseline.json` and `tier2-recruit-funded.json` in `experiments/ai`.

The continuation measured whole simulation ticks at p50 **3.67ms**, p95
**30.87ms**, p99 **58.85ms**, max **134.27ms**. These include simulation and AI,
not WebGL rendering. AI-only timings were insufficient to expose these spikes;
profiling and reducing native simulation tail latency remains necessary before
performance completion. Tests: **477 passed**, TypeScript and wiki generation
passed at this checkpoint.

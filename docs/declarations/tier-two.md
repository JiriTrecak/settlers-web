# Ant Tier 2: implementation design

Status: implemented and verified. See [completion audit](./tier-two-completion.md) for current requirement-by-requirement evidence and known limits. Chronological checkpoints below retain their historical context.

### Current implementation checkpoint

The Tier 2 pass is complete; the completion audit supersedes historical pending-work notes below.

- **Core systems implemented:** `requires` with shared live-owned-building prerequisite checks; `placementNear` with observed, finite-resource validation; specialized accepted-item drop-offs crediting the colony account; native paid in-place building upgrades; colony-wide paid research queues. Cancellation refunds exactly once, destruction loses unfinished purchases, completed knowledge persists, and save/restore validates task and research state. Simulation build is 22.
- **Mound → Great Mound integrated:** actual JSON costs 320 Amber / 180 Wood / 100 Root and 60 seconds. Same entity, footprint, entrance and behaviors; +600 HP capacity, armor 6, worker births pause then resume. The new raised command-storey model is 58,902 triangles / one mesh / 30 materials, with three `TC_TeamColor` flags. Own Blender/recipe/reference/palette/full-resolution comparison and delivery report in `art/sources/buildings/great-mound`; studio port 8791. Blender, GLB, white team vertex colors, blue flag recoloring and front/side/rear inspection passed.
- **Rootworks integrated:** 140 Amber / 80 Wood, basic card, 12-cell live-deposit placement constraint, only Root accepted. Model 11,004 triangles / one mesh / 17 materials; studio 8788. Source and report in `art/sources/buildings/rootworks`.
- **Corrupted Root integrated:** neutral targetable source, 3,000 Root, five gatherers, ten per trip, final partial load allowed, mineral unit-collision pass-through. Deposit model 8,106 triangles / one mesh / 13 materials; carried bundle 114 triangles. Source/report in `art/sources/buildings/corrupted-root`; studio 8790. Blender and exported source inspection passed. Native browser inspection confirmed the pale carried bundle on a Worker holding exactly 10 Root; the shared balance remains unchanged before delivery.
- **Ironroot Forge integrated:** 140 Amber / 70 Wood, basic card, three-slot paid queue. Current research: Serrated Tools, Reinforced Carapace, Broadheads, Driving Spear, Campaign Harness, and Saturating Shells. Harness requires Great Mound and costs 200 Amber / 80 Wood / 60 Root, 50 seconds, Marshal +200 HP. Source/report in `art/sources/buildings/ironroot-forge`; model 11,684 triangles / one mesh / 17 materials; studio 8789. Blender/GLB/orbit/recolor checks passed.
- **Verification:** latest full suite **483 tests passed across 124 files**; game build, TypeScript, wiki generation/type check and whitespace checks pass. Focused upgrade/research/Forge/Root/actual Great Mound flow tests pass (16 tests). The actual-content flow gathers 160 Root, upgrades for 100, purchases Harness for 60, and restores the save. Other tests cover births, wounded HP, hero revival, five-contact tree harvesting, refunds, duplicate queues, depletion, capacity and deterministic saves. The native browser test scene verifies upgrade model replacement, level/health/armor, research admission, full three-currency cancellation/refund, Root gathering label and observer delivery income. Research queue buttons retain their DOM nodes as progress changes, avoiding lost clicks. A stale loot-wiki test now uses its own weighted/two-roll fixture rather than assumptions about current balance.
- **Hunter integrated:** 4,328-triangle rigged model, eight animation states including charge, same size as the original ants; source/studio `art/sources/characters/ant-hunter`, port 8792. Barracks recruitment requires Great Mound, costs 190 Amber / 45 Wood / one free Worker. Native charge grants 2× movement and one 2× impact for a 3–7 cell clear approach, eight-second cooldown, at most 2.5 seconds active. Ordinary move, changed target, stun/root, expired/lost target cancel the burst; normal collision/pathing remains authoritative. Driving Spear research halves cooldown. Save build 22 persists active/cooling state. Six gameplay tests cover impact, no repeat in melee, interrupted/blocked/building approaches, worker recruitment, research, deterministic restore and invalid saved capabilities. Native renderer duel was visually inspected.
- **Bombardier integrated:** `art/sources/characters/ant-bombardier`, studio 8806; published `assets/ant-colony/characters/bombardier.glb` and manifest. 5,008 triangles / 2 meshes / 7 materials / one rig. Goggles, reinforced harness, offset back mortar, seven clips with braced attack and actual barrel recoil. Blender/GLB/loop/release/death/color/orbit/workshop-scale checks passed; two actual-export tests pass. Actual recruitment, Great Mound gating, 22-tick windup/release and Saturating Shells research are integrated and covered by gameplay tests.
- **Shell infrastructure implemented:** `combat.shell` declares flight ticks, radius and slow duration/strength; research can materially increase radius/slow. Persistent non-homing shots capture damage and faction eligibility on launch, survive shooter removal, resolve damage once on arrival and can be dodged. Buildings receive splash but no movement slow. Equal-strength slows refresh; overlapping strengths use the strongest active value, and a weaker longer effect resumes when the stronger expires. Observed flight/impact cues use two instanced render batches, with no renderer-authoritative damage. Nine shell tests pass, including deterministic midflight restore and no immediate damage. `tests/manual/shells.html` verifies arc, delayed damage, 80% movement and impact rendering using the actual Bombardier asset/definition and ordinary attack command.
- **Presentation:** `tests/manual/tier-two.html` provides a repeatable isolated native-renderer/HUD inspection scene (no changes to saved matches). Normal HUD currencies derive from content. Observer resource columns now also derive from currency definitions, including Root balances and delivery income. Generated wiki explains accepted drop-offs, prerequisites, upgrade and research costs/effects.
- **Workshop integrated:** Advanced Great-Mound-gated production building, 220 Amber / 120 Wood, 30 seconds, 1,400 HP. Model is 17,594 triangles / one mesh / 16 materials; source/report in `art/sources/buildings/bombardier-workshop`, last verified studio port 8795. Bombardier recruitment consumes one Worker, 220 Amber / 80 Wood / 40 Root in two seconds after arrival. Flags alone use team color.
- **Maps and AI:** two guarded Root deposits added to each playable battle map with native placement and route tests. AI prerequisites, specialized dropoffs, upgrade/research commands, investment savings, camp priority and gatherer reallocation are implemented. A passive-opponent run reached Great Mound. Recorded contested duels reached Great Mound and Rootworks on both sides; a Workshop produced a Bombardier that fired two shells, and the continuation recruited one Hunter per AI. Reports and exact limitations are documented below.
- **Completion:** full-session HUD/minimap/AI/fog runtime inspection and the final requirement audit are recorded in `tier-two-completion.md`. No Tier 2 implementation requirement remains open.
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

### Native simulation spike reduction

CPU profiling the saved tick-48,000 duel identified failed A* searches as the
main tail-latency cost. A free goal can belong to a small region enclosed by
standing units. Navigation now rejects occupied/fully enclosed goals, then
performs a bounded reverse reachability probe (128 discovered cells). If that
small region is exhausted without reaching the start, failure is proven without
searching the rest of the map. Otherwise the original forward A* runs unchanged,
including its stable tie order. This adds no pathfinding author configuration.

Observation also avoids cloning remembered records that are immediately
replaced by visible records, retaining the original entity insertion order and
copy isolation. Both optimizations preserve the exact resulting simulation.

Matched 2,000-tick CPU-profiled runs from the same saved duel:
- Before: p50 3.79ms, p95 60.14ms, p99 84.14ms, max 139.27ms.
- After: p50 3.96ms, p95 9.45ms, p99 11.28ms, max 14.20ms.
- Final serialized snapshots are byte-for-byte identical.

Reports: `experiments/ai/tier2-spikes-before.json` and
`tier2-spikes-pocket-profiled.json`. The unprofiled optimized run measured p95
8.79ms and p99 10.35ms. These are native whole-tick costs, not rendered FPS;
full-map browser rendering remains part of the final performance audit.
Navigation tests bound the number of terrain probes for enclosed targets,
check reopening their exits, and retain independent shortest-path comparisons.

### Live battlefield rendering checkpoint

The authored Mosswater Divide was opened in the native editor and match. Both
Root deposits were visible among the forest/clearing layout. At the broad editor
view, the Retina canvas (2560×1440, soft shadows) reported about 89 FPS and GPU
7.1ms mean / 8.3ms p95. This view included 8.17M triangles across all passes.

The settled starting-base match view at zoom 40 reported about 69 FPS, CPU frame
4.67ms mean / 7.5ms p95 and GPU 9.22ms mean / 10.47ms p95, with 1.97M triangles
across all passes. At 50% resolution (1280×720), a later view reported about
101 FPS and GPU 4.54ms mean / 5.46ms p95. The match/time-of-day changed between
samples, so these are observational bounds, not a controlled resolution speedup
benchmark. The original 100% native resolution preference was restored afterward.
No map was saved during the editor inspection. A stable 120 FPS is not yet
proven; remaining rendering work needs a fixed scene/time and camera benchmark.


### Fixed-scene rendering and Root-site visual audit

`reference-stage.html` now reads authored map files and their actual dimensions,
including Amberfall's 512-cell terrain. Its **Inspect Root sites** menu links to
all eight contested sites across Mosswater, Amberfall, Crownmere and Worldroot.
Both sites on each map were inspected in the native browser: deposits stand on
dry terrain, guards render, and adjacent construction clearings remain visible.
The last close-up was Mosswater west (106, 141), with the deposit, Ogre and
clearing visible beside the forest and river. This is visual placement evidence;
placement legality and reachability are covered separately by native map tests.

Repeat the controlled render check with:
`reference-stage.html?map=mosswater-divide&x=149&z=114&zoom=1&benchmark=1`.
It locks daylight to 11:00 and wind/water presentation to one instant. Each
resolution/shadow mode receives 120 warm-up frames and 240 measured intervals;
hidden-tab samples restart. Results include frame intervals and the existing
CPU/GPU profiler. Original resolution, shadows and debug preference are restored
on completion or navigation away. Full results are exposed in the page's
`data-benchmark` attribute for inspection.

Two completed runs held approximately **120 FPS in all four modes**. In the
second run, native soft shadows measured GPU mean 3.72ms / p95 4.75ms; half-scale
soft measured 3.15ms / 5.02ms; native filtered measured 3.54ms / 4.79ms; half-scale
filtered measured 3.04ms / 4.58ms. CPU presentation means were 2.15–2.19ms.
These are fixed, static Root-site results, not proof of 120 FPS during an active
Tier 2 battle. The earlier changing-camera match readings remain separate.

The final launch-alignment audit found a concrete remaining issue: shell effects
start at the shooter's center plus a hardcoded 2.1 height. The authored mortar is
side-offset, and the exported Bombardier rig has a mortar bone but no muzzle
socket. Correcting and verifying the projectile origin is still required.


### Bombardier muzzle correction

The Bombardier recipe and rebuilt Blender/GLB now include `socket_muzzle`,
parented to the recoiling mortar bone at the authored barrel mouth. Its asset
JSON declares `projectileSocket`; the renderer resolves it after character pose
updates and captures the launch position once per observed shell. A moving or
dead shooter cannot drag the trajectory. Mid-flight observation/save loading
without a captured muzzle uses the authoritative shot origin fallback. Gameplay
impact timing, damage, victims and slow remain entirely simulation-owned.

The exported runtime file matches the studio variant byte-for-byte: 5,008
triangles, two meshes, seven materials. Blender validation, packed reference,
full-resolution comparison, GLB animated-socket test, native studio attack and
blue ownership preview passed. The old studio port did not respond; the verified
replacement is `http://127.0.0.1:8806/`.

`tests/render/shell-effects.test.ts` verifies the initial muzzle position,
immutable flight after shooter movement, impact transition, and actual exported
socket recoil. Character/shell regression tests and production build passed.
The final game-camera muzzle inspection and active-battle performance audit
remain pending; this correction does not close the overall Tier 2 goal.

Verification: 479 tests passed in the sandbox; the two localhost hub tests could
not bind (EPERM), then both passed when rerun with local server permissions.
All 481 tests are accounted for. Wiki generation and diff whitespace checks pass.


### Native muzzle and active battle inspection

The shell fixture now has **Pause at muzzle release**. It pauses on the actual
simulation launch tick and freezes animation playback. Native browser inspection
showed the shell centered at the mortar opening, with target HP still 300/300
and 1.00 second remaining before impact. This closes the prior game-renderer
launch-position inspection gap.

`tests/manual/tier-two-battle.html` runs the real Game and Renderer on authored
Mosswater terrain/foliage at fixed 11:00. It places 12 Hunters, 12 Warriors and
eight Bombardiers on legal unoccupied terrain, then issues ordinary opposing
attack-move commands. The benchmark runs 30 seconds, excluding the first ten
seconds from frame statistics. It does not alter saved maps or matches.

At 2560×1440 / 2 DPR with soft shadows, the final run averaged **109.8 FPS**,
frame p95 **16.7ms**, native simulation tick p95 **5.1ms**. The fight launched
66 shells, recorded 1,023 unit-tick charge observations (not 1,023 distinct
charges), and left 13 of the 32 added troops alive. Native screenshot inspection
confirmed damaged red/blue troops fighting in the clearing. Final rolling GPU
mean/p95 was 3.51/5.22ms; CPU presentation was 2.28/3.60ms. These rolling windows
are shorter than the FPS measurement period.

Results: `experiments/ai/tier2-native-battle-render.json`. A preliminary run had
an undersized canvas and is excluded. The full-viewport uncached-view run
averaged 103.7 FPS. The final fixture caches view data between simulation ticks;
the main session currently rebuilds views each frame. No HUD/minimap is present,
so this is a native combat/rendering measurement, not complete-session throughput
or proof of sustained 120 FPS. Main-session snapshot/UI work remains a concrete
performance follow-up.


### Full-session resource presentation cleanup

Inspection confirmed that `Observation.view` already caches its entity snapshots
until observation updates/restore. Earlier notes suggesting repeated deep view
construction every frame were incorrect. The native battle fixture's local view
cache therefore does not establish a separate snapshot-allocation speedup; its
FPS differences must not be attributed to that change without profiling.

The full session did rebuild `resourceStamps` and JSON-serialize them every frame.
It now skips that scan while the observation's entity array is unchanged. A new
array (including same-tick fog perspective changes) is re-evaluated; existing
signature invalidation still refreshes restored/authored map props. Resource
appearance remains updated immediately after a tree starts falling. HUD input,
selection, interpolation and animation continue every render frame.

The targeted session suite passes 11 tests, including falling-tree removal,
same-tick view changes and map-prop invalidation. TypeScript passes. This removes
redundant work; no unmeasured FPS improvement is claimed.

Simulation compatibility advances to `declarative-sim-22` for the accumulated
Tier 2/native behavior changes. Older saved diagnostic snapshots and clients are
intentionally incompatible rather than silently diverging. Historical reports
above retain their original build context.


### Complete native progression regression and deliverable availability

`tests/game/tier-two-progression.test.ts` now exercises one continuous native
scenario using authored costs, durations, definitions and ordinary commands:
construct Rootworks, harvest and physically deliver 240 Root, construct Barracks
and Forge, upgrade Mound, construct Workshop, convert two existing Worker IDs to
Hunter/Bombardier, complete Driving Spear and Saturating Shells, attack an enemy,
and save/restore during a researched shell flight. Root begins at zero; the
source loses exactly 240 and the three upgrade/research/recruitment bills spend
all 240. Rootworks stores none of the delivered currency. Original/restored
simulations stay identical through subsequent combat damage. A moving target is
allowed to dodge the first shell rather than making the test force a hit.

The isolated map does not replace the separate guarded-map reachability tests,
AI duel evidence, or rendered battle checks. Its starting Amber/Wood funding is
explicit test setup; no Root, advanced unit or completed upgrade is injected.

Full suite after compatibility version 22: **483 tests across 124 files pass**.
Production build passes (existing Vite chunk-size/config warnings remain).

All seven source packages contain the configured Blender file, deterministic
recipe, reference, palette, comparison and delivery report. Five older studio
ports closed requests without responses. Replacement managed viewers were
started without stopping those processes; status identity and served GLB headers
were verified:

- Rootworks: http://127.0.0.1:8811/
- Ironroot Forge: http://127.0.0.1:8812/
- Corrupted Root: http://127.0.0.1:8813/
- Great Mound: http://127.0.0.1:8814/
- Hunter: http://127.0.0.1:8815/
- Bombardier Workshop remains responsive at http://127.0.0.1:8795/
- Bombardier remains responsive at http://127.0.0.1:8806/

These availability checks do not replace the earlier model/orbit/color/animation
inspections. The remaining completion gate is a final full-session runtime and
performance check, including HUD/minimap, and reconciliation of any outstanding
requirements against this collected evidence. No full-goal completion claim yet.

# Opponent AI design

Status: replacement implemented 9 September 2026. See [implementation.md](implementation.md) for the exact running contracts, tuning fields, validation evidence, and remaining limits. This document retains the broader design intent; aspirational examples below are not all implemented features.

## The experience we want

**One strong opponent that continually develops its economy, hero, and army, and converts that strength into a win.** Economic growth funds more options; hero experience and items increase the value of the same unit; the army protects both investments and creates opportunities to use them. These are coupled priorities, not separate playstyles. Its plans should remain discoverable and disruptable through play.

A good encounter might look like this: we spot a Marshal and escorts leaving to clear a camp. We raid the amber workers. Nearby defenders respond first; the expedition decides whether to abandon the camp. Our raid costs it income and perhaps a lost camp reward, but committing our whole army leaves our own hall vulnerable. None of that requires the opponent to know where our unseen army is.

The target is a satisfying roughly 15–20 minute skirmish on a suitable test map. That is a pacing aspiration, not a mandatory duration: a successful opening rush should win early, and a large map may take longer. No invulnerable opening period, free defensive hall attack, hidden reinforcements, resource multiplier, or losing-player handicap is proposed.

Read this document for the game design, [architecture.md](architecture.md) for contracts and the clean replacement, and [adversarial-review.md](adversarial-review.md) for ways this can fail and how we will test it.

## What the game actually supports today

This proposal was checked against running source, rather than assuming features from earlier design notes:

- `World` now owns the replacement AI brains. They coordinate growth, hero progression and army operations from an owner-filtered view plus a public initial-map briefing, submitting normal future-tick commands. The fixed ten-second build-order planner was removed.
- Workers gather wood and amber and carry them to drop-off stores. Construction and recruitment draw their bills from hall stores; the AI must not reintroduce deliveries between production buildings.
- Recruitment converts a real unassigned worker. A house creates three workers over its lifetime; it is not an ongoing supply-cap building. There is also a global declared unit limit. Replacing losses requires additional houses with remaining production, not merely keeping an old house alive.
- Starting setup currently gives eight workers, two warriors, and a Marshal; three workers are assigned to each resource initially. The AI should preserve functioning startup work.
- Workers can build barracks, lumberjack, forester, house, watchtower, and sanctuary. The current worker build list excludes another main hall. A watchtower extends sight and territory but does not shoot. Sawmill and stonemason definitions currently have no production behavior and are not in that build list. They should not appear in an AI economy plan because of their names or artwork.
- The Marshal has ten levels, six inventory slots, Faultline, Rally, Carapace, and Crownfall. Sanctuary revival retains the same hero, experience, learned skills, and items. Revival currently takes 400 ticks, **ten seconds**, costs no resources, and restores health and mana. The sanctuary itself costs resources to construct.
- Defeat currently follows destruction of the designated starting hall. Building another structure or possessing surviving units does not change that rule.

Source anchors: [World](../../src/sim/world/world.ts), [Game](../../src/sim/game/game.ts), [economy](../../src/sim/game/economy.ts), [content](../../content/game.json), [revival](../../src/sim/game/revival.ts). Some older expansion/declaration prose predates these changes; source and the dedicated current feature contracts take precedence.

Two important boundaries follow. Initial “expansion” means securing distant resources and territory while accepting the longer trip home. Economically meaningful satellite bases need a separately reviewed, buildable drop-off building with a real price; the current free setup-hall definition must not simply be added to the build menu. Also, the AI cannot manufacture army healing or new heroes when no such command exists.

## Economy, hero, and army: three connected investments

The economic target should keep evolving throughout the match: improve delivered income, grow the workforce, relieve bottlenecks, replenish resources where possible, and eventually expand. It must not finish an opening build order and consider its economy done. A bigger bank is useful only if it becomes productive capacity, survivable military strength, or a deliberate reserve for a concrete purchase.

Hero development is a strategic objective in its own right. Track XP to the next meaningful level or ability rank, useful equipment, health/mana, and how much field time is being lost. A nearby camp that unlocks an ability can be more valuable than a slightly richer but distant camp. Once that milestone is reached, reassess the opportunity to pressure the enemy. Do not farm forever while the army could win the match.

Army size and composition respond to both defense needs and the next operation. More units may protect additional gatherers, enable a harder camp for the hero, or turn a weak raid into a decisive attack. Recruitment also removes workers from the economy. The planner compares those consequences instead of enforcing a permanent worker-to-soldier ratio or three fixed spending percentages.

For example: the army can safely escort the Marshal to a nearby camp, and the enemy is not currently applying pressure. Keep improving the economy while the expedition earns a level. If a threatening enemy force is then observed, defer the next economic purchase, recruit enough support, and decide whether that camp can be finished before returning. The same AI makes both choices from the changed situation.

## High-level plan, army operations, and combat execution

Use a small explicit planner and task executors with three decision scopes:

1. **Strategy — what strength do we need next?** Set a rolling economic target, a useful hero milestone, army requirements, and spending/worker reservations. Examples: support a larger army without starving income; reach the next ability rank before attacking; rebuild enough workers after a raid. These goals run concurrently and can change when evidence changes.
2. **Operations — what should this force do from here?** Given the hero/army's actual location, health, mana, nearby camps, travel time, and enemy knowledge, select the next camp, defend, intercept, raid, assault, or regroup. The strategic plan supplies priorities and constraints; it does not prescribe every waypoint or lock the force into a stale camp route.
3. **Tactics — how do we execute this encounter?** Position units, choose reachable targets, cast abilities, manage pickups, and retreat locally. Pathfinding, movement, auto-attack, gathering cycles, and collision stay in the existing engine.

This is a division of decisions, not three competing army controllers. One main force containing the Marshal is enough initially, with explicit home/scout detachments where useful. Each unit has one task owner. An arbiter resolves unit and resource conflicts before normal game commands are submitted.

Plans have stages, completion conditions, failure conditions, and minimum commitments. An assault might be **assemble → travel → engage → regroup**. Strategy need not restart whenever the force sees a wolf; an operation can change when a camp proves empty without discarding the strategic goal of gaining a level. Significant danger can interrupt either level. Decisions use simulation ticks and bounded work; no universal behavior language is needed.

## Knowledge, uncertainty, and scouting

The opponent knows the map's initial layout. A frozen, sanitized **map briefing** supplies static geography, routes, authored camp locations, their public nominal difficulty/composition, and public initial resource sites. This supports useful camp routes from the start. It does not expose the live world: our bank balance, orders, recruitment queue, unseen units, camp deaths/damage, resource depletion, scripted hidden reinforcements, or actual future loot rolls remain unknown. Knowing possible start locations does not identify which player occupies one unless that assignment is explicitly public.

Keep initial expectations separate from current observations. A camp starts as **expected at this location**, not **verified alive now**. It can subsequently be seen active, seen empty, or confirmed cleared, with a last-observation tick. If we clear it outside its vision, its expectation does not change. It may travel there and find nothing; that wasted trip is a legitimate consequence of missing information. On arrival it updates its belief and chooses another useful operation.

An empty camp center alone does not prove every member is dead: enemies may have pulled them away. Partial sight or an empty visit produces uncertainty; witnessed completion can confirm a clear. Once cleared, a non-respawning camp must not become available again merely because memory aged. Future respawn expectations must come from declared public rules, with current occupancy still observed rather than read from world state.

Mobile sightings become dated beliefs: “several archers were near this crossing.” They do not stay attached to a moving hidden entity. Confidence declines with time, and the possible area grows along the known map. Buildings can be remembered until scouting disproves them, but their health and production cannot update through fog.

Public unit definitions are fair knowledge: the AI can understand what an archer normally does. Private item bonuses, unobserved cooldowns, and future player intentions are not. Information already visible to a player can still need a reaction delay before the AI acts on it.

Scouting verifies what is happening: locate the opponent at possible starting sites, check whether a camp remains available, assess occupation/depletion of a known resource site, check an approach for enemies, or resolve a stale threat. It does not need to rediscover every static landmark. One existing soldier is a reasonable initial scout; an unescorted worker should be a deliberate economic risk, not the default expendable sensor.

Fog must create opportunities for both sides. Knowing a second entrance exists does not reveal the force approaching through it. Destroying a scout should delay the opponent's updates. Repeatedly presenting the same decoy can reduce its priority, but that conclusion must come from observed encounters, not knowledge that the unit is a decoy.

## Economy: continual growth balanced against military needs

Workforce and resources are one budget. Before recruiting, account for gatherers, builders, workplace staff, recruits already reserved, and workers that houses will actually produce. Do not count all future house workers as available today.

At each economic review, compare the next productive investment with the next military requirement. Consider delivered income, worker utilization, depletion, travel/congestion, how soon the investment pays back, and whether the army can protect it. A profitable extra worker is a good default in a safe position; another barracks is not productive if the existing one cannot be funded. A credible attack can make immediate soldiers more valuable than an economic payback several minutes away. An opportunity to finish the enemy can justify spending the reserve.

Growth is an ongoing objective, not a command to add workers forever. Recognize saturation and diminishing returns. If a mine's access is already congested, improve another source or save for a concrete capability instead of sending more workers into the queue. The goal is a stronger economic position that supports the next stage of play.

Initial policy:

1. Keep the initial gathering jobs unless a real shortage or danger warrants reassignment.
2. Maintain a small construction/recruitment reserve. A worker in training cannot also be promised to construction.
3. Build enough worker housing to support both the economy and planned recruits. Recruitment reserves must protect a minimum viable gathering workforce.
4. Allocate spending to the next useful result: more workers, a usable barracks, the army needed for the next operation, tree replenishment, sanctuary access, or safe territory. Build additional production only when workforce and income can sustain it. Revisit the economic target after every meaningful gain or loss.
5. Reassign a few workers at a time according to resource shortage and actual delivery rate. Cargo en route is future income, not spendable money. Do not interrupt every worker on each economic review.

The lumberjack provides an automatic harvesting workplace; direct worker gathering already exists. It is an optional economic choice, not a fictitious prerequisite for wood. Foresters become valuable when local tree depletion justifies their worker and construction cost. They need access to depleted tree sites and must not obstruct the main hauling route.

Protect harvest access, building entrances, recruitment exits, and a route around the hall when placing buildings. Evaluate rotated footprints. A site that is technically legal but seals a worker lane is a bad plan. Failed placement should choose another known candidate and back off, rather than retry forever or scan the unseen world.

On a raid, move endangered gatherers toward a reachable safer point and dispatch nearby defenders. Do not automatically pull the entire economy. Remember the interrupted gathering assignment, then resume it only after the area has become sufficiently safe. An economic raid should cause lost income even when it causes no deaths.

Prepare for expansion in the planner now: a future candidate couples expected income and shorter hauling with construction cost, staffing, travel time, and the army needed to secure it. The sequence is verify/control the site → build a legally available drop-off → transfer/add workers → protect income. Keep it unavailable while no buildable drop-off capability exists. This extends the existing growth objective when the feature arrives, without requiring a second economy AI.

## Armies: purposeful fights and bounded pursuit

Start with three kinds of military work:

- **Scout:** gain information, avoid unnecessary fights, return or reroute if threatened.
- **Expedition:** clear a known camp, secure a resource approach, or raid a discovered hauling route. It has a destination, escort requirement, and limit on acceptable losses or pursuit.
- **Assault:** assemble a viable force and attack a discovered enemy base. Reinforcements gather at a staging point instead of streaming individually through the enemy army.

Home defense is a reserved assignment, not a fourth independent brain demanding the same soldiers. Recovery is a phase of a mission: withdraw, gather survivors, replace affordable losses, and decide what is feasible next.

Estimate local fighting strength from health, effective damage against observed armor, attack range, available frontage, hero abilities, and nearby reinforcements that the AI actually knows about. Use a conservative heuristic with uncertainty, not an exact future battle simulator. Seven melee units in a narrow approach should not be valued as if all seven can attack immediately.

An evenly matched fight can be worth taking for an exposed hall, resource route, or camp. A low-value chase should need a better advantage. Losing health faster than expected can trigger a retreat; separate entry and exit thresholds prevent one extra enemy from making the army oscillate.

Ranged units get bounded repositioning behind a screen, not perfect perpetual kiting by every archer. Focus fire considers overkill and the cost of reaching a target. Soldiers should not all walk past nearby threats to hit the weakest worker. Pursuit is limited by the mission, distance from support, and elapsed time. When a target vanishes, approach its last seen area or return to the mission; never continue tracking its hidden position.

Do not retreat every unit at a universal health percentage. Survival matters more for an experienced hero than an inexpensive escort; finishing a nearly destroyed enemy hall may be worth casualties. Conversely, “hero preservation” must not become endless dancing without ever risking a fight.

## Marshal, camps, and items

The hero is a central long-term investment, usually traveling with the main army. Strategy explicitly tracks its next useful level/ability and equipment improvement; the operations planner chooses activities that advance that goal. Its tactical executor may cast, reposition locally, use an item, or collect a reward, but it cannot silently take the army somewhere else.

Camp decisions weigh progress toward the next useful level, expected loot value, likely damage, travel/clear/recovery time, and the threat to home. Initial nominal composition from the map briefing supplies a starting estimate; sightings replace that estimate only for what was actually observed. Unseen damage, deaths, changes to membership, and actual loot rolls remain unknown. Do not automatically attribute nominal full-camp XP to a partially observed camp. A wounded expedition without healing should select a safer task rather than camp forever in the belief that health regenerates.

Distinguish experience from power: XP that reaches a valuable rank can justify a detour, while XP beyond the level cap has no progression value. Keep the hero within its declared experience radius when practical. Reevaluate military opportunity after a power increase instead of blindly continuing the camp itinerary. Hero death costs field time, mana/health opportunities, and possibly enemy XP even though its own accumulated level and items persist; do not model it as losing all progression, or treat persistent progression as making death free.

The bot may exploit a ranged advantage and pull enemies a reasonable distance, just as a player can. It should not intentionally optimize an endless leash-reset trick. If that trick is the universally best way to play, it is a neutral-combat rule problem to fix for everyone, not a reason to secretly strengthen camps against AI or players.

Marshal decision policies use the declared spell effect and rank values:

- **Faultline:** aim through a useful line of visible enemies, or stop a dangerous pursuer. Do not wait forever for a mathematically perfect line. Allow a valuable single-target cast.
- **Rally:** use when nearby allies are about to fight and can benefit during the duration. Avoid refreshing a still-useful identical buff.
- **Carapace:** respond to credible incoming pressure or cover an escape. Do not spam it merely because it is available.
- **Crownfall:** punish a visible cluster or commit to a decisive target; respect the cast time and the possibility that enemies leave the area.

Keep a mana reserve when escape or defense is likely. Point targeting uses a small candidate set and observed movement, never queued player destinations. Once a spell is committed, it can miss. Enemy spell avoidance uses visible telegraphs, reaction delay, and the same limited attention as other tactical orders; there is no hidden cast detector.

Declare one preferred legal skill progression, with evidence-based adjustments when useful. At each level, choose the next eligible ability. Ultimate eligibility is read from the rank definition, not hardcoded at level six inside the planner. Learn the ten available ranks by level ten without trying to overspend points.

Collect accessible useful items after securing a reasonable pickup window. Use healing or mana consumables when they have value, not at full resources. If six slots are full, evaluate a limited replacement by declared bonuses/purpose, issue an ordinary drop and pickup, and accept that someone else can take the dropped item. Do not delete items, know a chest's contents before the game reveals them, or chase loot through an enemy army.

When the Marshal dies, it remains on the owner's fallen roster. Ensure a sanctuary exists when affordable, queue revival once, and rally the returned hero with support. Never send successive revivals alone down the same lethal route. Items and experience stay intact. Current free, ten-second revival creates a serious suicide-healing and repeated-hero-XP risk; see the adversarial review before balancing the AI around it.

## One strong AI first

Build one opponent that can grow, develop its hero, defend, clear camps, pressure, and finish. Aggression and investment should emerge from the match situation. We do not need Warden/Raider/Forager personalities, multiple doctrines, or a profile selector to prove the core system.

Keep a single validated tuning record for composition preferences, skill priorities, risk thresholds, and bounded decision schedules. It should expose only values the implemented policies actually use. Additional styles can wait until we have a strong baseline and a reason to add them.

Strength should come first from competent macro planning, useful hero activity, and correct operations. Do not inject arbitrary mistakes to manufacture character, or spend the first milestone building difficulty variants. Fair knowledge, executable commitments, and avoiding command spam still matter.

Seeded tie breaking among comparable plans can avoid always taking the same route, but must not replace reasoning or create strategy thrashing. Adapt within the match based on observations and failed plans; cross-match learning and player profiling are out of scope.

## Decision timing; difficulty later

The first target is one strong configuration with the authorized initial map knowledge and fog-limited live information. Use bounded computation and meaningful-order intervals to prevent command churn. Tune reaction and coordination only after macro and hero decisions work; the previously suggested Normal/Easy/Hard presets are not implementation scope.

Use separate review cadences for tactical response, choosing the force's next operation, economic adjustment, and strategic targets. Tactical response should not wait for a slow strategic review. Frequent economy reviews should leave already useful jobs intact. Exact intervals are tuning hypotheses to measure, not human APM targets or a way to make the AI deliberately weak.

Future difficulty can adjust attention and coordination using the same planner. Resources, damage, costs, movement, and the map-information contract should remain unchanged. No difficulty changes invisibly during a match.

## What we deliberately reject

- A timed stream of free attack waves presented as a skirmish economy.
- An omniscient “director” deciding that the player needs more pressure.
- Perfect low-health evacuation and spell dodging across the entire map.
- An unbreakable fixed build order or universal worker/soldier ratio.
- A generic AI scripting language embedded in JSON.
- A large branching technology plan for buildings that currently have no economic function.
- A bot that stalls indefinitely to avoid losing, or stops trying because it estimates the player will win.

Campaign scripts can eventually orchestrate ambushes or reinforcements under explicit scenario rules. That is a different permission level from a fair skirmish player.

## Recommended first milestone

One strong opponent on Mosswater: continually developing economy, milestone-driven hero progression, an appropriately sized mixed army, map-aware operations, verification of camp state, retreat/recovery, sanctuary revival, and correct victory/defeat. The same controller should adapt between economic investment, hero development, and military pressure. Validate on Amberfall Wilds after the small-map loop works. No personality rollout is part of this milestone.

Before expanding scope, play both sides of a rush, an economic opening, and a camp-heavy opening. A good result is that each creates recognizably different opportunities and mistakes. We should be able to explain a loss from a replay and the opponent's observed information, not from hidden bonuses or unexplained perfect reactions.

The main decisions for our review are whether we want any economic revival price, what a future remote drop-off should cost and require, and how much retreat/kiting feels enjoyable. Current direction: one strong AI; economy/hero/army as connected goals; initial map briefing separated from live knowledge; expansion prepared in planning but not fabricated in gameplay; no deliberate suicide revival or free fort defense.

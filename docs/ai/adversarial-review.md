# AI adversarial review and acceptance plan

Status: implementation playtesting checklist. Automated gates and completed headless/browser checks are recorded in [implementation.md](implementation.md); the full scenario list below is not a claim that every human exploit has been tested. Read alongside [the game design](README.md) and [architecture](architecture.md). “Pass” below means behavior to verify during implementation and playtesting.

## Review conclusion

The proposed architecture is small enough for our roster and broad enough for future units. Its hardest problems are continually strengthening the economy while funding an army, turning hero milestones into useful pressure, distinguishing initial map knowledge from current occupancy, and avoiding conflicting orders. First prove one strong coordinated opponent; personalities are not an acceptance requirement.

Three tempting shortcuts would undermine the whole design: reading unseen live changes to pick goals; compensating for poor decisions with free economy; and solving every strategic weakness with instantaneous micro. Knowing the public initial map and camp sites is authorized and useful; polling their current state is not.

## Highest-risk current rules

### Free revival can become a healing exploit

Sanctuary revival currently restores health/mana in ten seconds and keeps equipment/experience. A damaged hero may be more valuable dead and revived than alive and far from home. Repeated hero deaths also need an explicit XP-farming audit; the current progression code grants experience at each eligible death, rather than maintaining a once-per-hero-lifetime exclusion.

The AI should not deliberately suicide for restoration or repeatedly feed an enemy hero. This policy does not make the underlying strategy fair or fun for humans. Before final balance, compare keeping the current rule against a declared revival resource cost and/or increasing revival time with level. Any change must apply to both players, preserve items, and be reviewed as game design. Do not silently add an AI-only cooldown or teleport recovery.

### Infinite camp leash attrition can dominate

Neutral camps return home without resetting health. A player or bot may chip them indefinitely from safety. Some pulling and ranged advantage are good counterplay; spending minutes on repeated reset loops is not the expedition fantasy.

Initially bound the bot's unsuccessful pulls and abandon or regroup if a camp is not productively engaged. Test whether ordinary ranged play still dominates all difficulty classes. If it does, review neutral behavior globally; do not make the bot intentionally incompetent while calling that balance.

### Resource expansion currently lacks new drop-offs

Remote workers return to the original hall. Long-distance amber access can be tactically interesting, but a 512×512 map can turn that into long periods of walking. Do not claim the AI has an expansion economy until we measure delivered income and travel time. Do not expose the current zero-cost setup fort as a buildable economic shortcut.

First measure expedition/travel pacing on Mosswater. Later decide whether a priced satellite store belongs in worker capabilities. Meanwhile, tower territory and escorted gathering are honest but limited expansion tools.

### Some apparent economy buildings have no current role

Sawmill and stonemason artwork is not evidence of a working recipe. A bot that faithfully builds them would look active while wasting resources. Use current capabilities to determine useful producers. Stale descriptions and old physical-delivery notes should be corrected during the implementation cutover, with a separate decision about future production roles.

## Scenarios: what must remain possible for the player

### S01 — Opening warrior rush

**Attack the design:** send the two starting warriors toward the enemy economy before it has a barracks. A hardcoded peaceful opening collapses; a cheating defender instantly spawns protection.

**Expected:** it reacts only after sight/damage evidence and delay. Nearby warriors defend, endangered workers move, and affordable recruitment/construction priorities change. Its hero can be away. It can lose workers or its hall.

**Pass:** no extra resources/units or automatic hall weapons; failure is a valid outcome. A failed rush leaves the attacker's economic/military commitment exposed. Test arriving through both a scouted route and an unscouted approach.

### S02 — One worker pulls the entire army

**Attack:** run a cheap unit repeatedly just inside vision, away from the hall and defenders.

**Expected:** a limited response or bounded local pursuit. Most units retain the real mission. Repeated sightings can lower urgency, but a worker beginning actual damaging construction near the base is new evidence.

**Pass:** the distraction buys some time or positioning without turning the army into a permanently controllable train. Escalating to a real attack still gets a response.

### S03 — Two simultaneous raids

**Attack:** threaten amber workers on one side and a construction site on the other while the Marshal is clearing a camp.

**Expected:** limited attention and squad ownership force prioritization. Protect the more consequential location, dispatch a nearby subset, or recall the expedition if its travel cost is justified.

**Pass:** it cannot issue perfect evasions to every worker on the first damage tick. One front may suffer losses. Defensive interrupts must not prevent all construction or recruitment indefinitely.

### S04 — Retreat into fog, then ambush

**Attack:** lure a pursuit toward a crossing, break vision, and place reinforcements beyond it.

**Expected:** the brain keeps a last-seen area, not a live target. It may scout, take a calculated risk, or stop at its pursuit limit. Stale threat confidence changes the decision.

**Pass:** the ambush can succeed. Moving unseen reinforcements to a different location must not change the bot's pre-contact intentions unless some owner-visible consequence differs.

### S05 — Archer kiting and focus-fire bait

**Attack:** kite a melee squad or place a wounded worker behind healthy soldiers.

**Expected:** melee returns to its mission when pursuit becomes unproductive, or pressures another reachable asset. Archers maintain some spacing; focus fire includes target access and wasted shots.

**Pass:** neither endless chase nor perfect frame-by-frame stutter-stepping. The wounded unit remains bait the AI can occasionally accept, but not a universal target-selection override.

### S06 — Chokepoint and blocked retreat

**Attack:** put a weaker visible force across a narrow bridge, then occupy the usual retreat route.

**Expected:** strength evaluation discounts unusable melee frontage. Retreat selects a reachable known alternative or a local fighting fallback. Small units cannot be assumed to pass through occupied allies.

**Pass:** no teleport, hidden-route oracle, or perpetual move/stop loop. A tactically trapped army can be destroyed. Logs distinguish a bad choice from a navigation failure.

### S07 — Economic over-recruitment

**Attack:** destroy several gatherers while the AI has soldiers queued and a half-finished house.

**Expected:** reevaluate pending worker promises, conserve a viable gathering/building workforce, and cancel/defer lower-value recruits when necessary. Count only remaining house output.

**Pass:** no conversion of the last useful worker just because the queue was accepted. No assumption that an exhausted house will regenerate population. If recovery has become impossible, no invented worker appears.

### S08 — Resource delivery and reassignment thrash

**Attack:** alternate wood/amber losses or repeatedly scare a carrying worker without killing it.

**Expected:** use delivery/availability separately, preserve safe handoffs, and change assignments with a deadband. Damage evacuation can interrupt work but does not duplicate carried goods.

**Pass:** the bank never spends projected cargo, a reservation is not counted twice, and the same worker is not continually reassigned before completing a trip. Harassment causes real lost income.

### S09 — Base placement deadlock

**Attack:** narrow terrain, mines close to spawn, units standing in candidate footprints, and multiple future buildings competing for space.

**Expected:** evaluate rotated footprints and corridors; try a bounded alternative; defer an infeasible project. Observe changed conditions before retrying previously blocked sites.

**Pass:** workers and recruits retain a route in/out. No infinite placement spam, negative bank, or broad scan that reveals hidden enemies by rejected build probes.

### S10 — Resource exhaustion and long travel

**Attack:** deplete the nearest trees and amber, then deny the next known deposit.

**Expected:** use actual regeneration capability for wood; scout another source, escort gathering, change spending, or attack for control. Trade travel cost against useful income.

**Pass:** it does not mine depleted nodes forever or expect amber to regrow. It can head to a known initial deposit before visiting it, but must inspect current depletion/occupation rather than choose from the engine's live resource list. A secret newly spawned deposit requires discovery. Measure delivered resources per worker-minute, not merely how many workers have orders.

### S11 — Interrupt the camp expedition

**Attack:** wait for the Marshal to fight an ogre, then raid home or contest its camp from a different direction.

**Expected:** compare camp progress and remaining danger to the actual home threat. It can finish a near-complete camp, withdraw, or detach support, with the costs of its commitment.

**Pass:** an expedition can be punished. The bot does not instantly disengage every neutral and teleport home; nor is it locked to finish a camp while its hall visibly dies. It can estimate initial composition from its briefing, but must not read unseen member deaths/damage, new reinforcements, or actual future loot rolls.

### S12 — Bait and dodge a spell

**Attack:** briefly cluster units, then split during Crownfall's cast; attack from an unseen angle while another group casts a visible ability.

**Expected:** target based on observed positions and modest prediction. Already committed casts remain committed. Visible enemy telegraphs can trigger a delayed, limited dodge; unseen casts cannot.

**Pass:** spells can miss, a valuable single-target use is possible, stun prevents illegal reactions, and post-cast orders resume the mission. Shape calculations match the actual spell and preview. No exact enemy cooldown polling.

### S13 — Full inventory and contested loot

**Attack:** six occupied slots, a stronger visible item near enemies, and someone else taking the intended pickup while the hero approaches.

**Expected:** skip unsafe loot or do a deliberate normal drop/pickup sequence. Recheck slot identity and target availability after receipts. Use a suitable consumable instead of deleting it when that makes sense.

**Pass:** no item duplication, auto-replacement privilege, stale-slot drop, or endless attempts to collect a vanished chest. Losing dropped loot is an allowed consequence.

### S14 — Hero death and sanctuary camp

**Attack:** kill the hero, destroy the queued sanctuary, or wait outside its deployment area.

**Expected:** use the private fallen roster, queue once, rebuild when affordable, preserve all items/experience, and choose a safe regroup point after revival. A blocked exit is a wait state, not permission to force a spawn.

**Pass:** no repeated solo charge into known lethal enemies and no deliberate suicide to refill mana. Measure XP awarded across repeated hero deaths as a balance risk, not just item persistence.

### S15 — The opponent is ahead

**Attack:** offer an apparently empty base after losing an army, or turtle and wait for the AI to camp indefinitely.

**Expected:** scout enough to support its estimate, assemble, and press an objective. Uncertainty must not always trump a large advantage.

**Pass:** it makes an effort to finish the designated hall, rather than exhaust every camp or reach level ten first. It does not know the true emptiness of an unseen base. An ambush can still reverse the attack.

### S16 — The opponent is behind

**Attack:** remove all gatherers or all affordable rebuilding options while leaving a small army alive.

**Expected:** stop queuing impossible economy; choose a realistic raid, defense, or last assault from what remains. No endless stockpiling for an unattainable project.

**Pass:** it remains coherent and mortal. Do not invent surrender commands; surrender is separate UX/rules work. Respect the existing hall defeat condition and stop planning when outcome is final.

### S17 — Clear its intended camp outside its vision

**Attack:** clear a known camp while the AI is pursuing another objective. Keep this outside its observations and other legitimate feedback, including nearby-hero XP awards. In a second version, merely pull the creatures away from the camp center.

**Expected:** the initial briefing still says a camp belongs there. The bot may travel to inspect/clear it. On observing an empty site, it updates its belief and chooses another operation toward the same hero milestone. An empty center with incomplete evidence does not automatically prove a permanent clear.

**Pass:** pre-observation plans are independent of the hidden clear; no remote camp-completion signal updates the brain. An observed empty site stops repeated wasted trips. A confirmed non-respawning clear does not become an expected fresh camp when memory ages. Saving/restoring cannot refresh the briefing from the now-cleared world.

### S18 — One camp short of a hero power increase

**Attack:** put the hero just below a useful declared ability-rank threshold, with a nearby modest camp, a richer distant camp, and an opportunity for pressure after leveling. Repeat at maximum level and with a nearly defeated enemy hall.

**Expected:** consider the nearby milestone's time-to-power, learn a legal rank, and reassess whether to pressure. Keep the hero in XP range where practical. At the level cap, remove further XP value; a winning assault can outweigh farming even below the cap.

**Pass:** the hero is an explicit strategic investment, neither an ordinary disposable soldier nor a reason to farm every camp forever. Its tactical executor does not fight the army's mission ownership. The economy continues working while it develops.

### S19 — A quiet opening becomes prolonged economic stagnation

**Attack:** stop pressuring after the opening so a fixed build-order bot has nothing left to build. Repeat with safe resource access saturated, another source available, and a credible enemy force then appearing.

**Expected:** continue seeking useful income/workforce improvement and army capacity. Recognize diminishing returns, resource mix, travel cost, and actual next needs. A real threat changes the growth/recruitment tradeoff; an army's camp operation does not suspend the economy manager.

**Pass:** no permanent opening workforce, endless unused bank, blind worker spam, or fixed growth percentage. Explain why another worker, house, army reinforcement, or concrete reserve is the next useful investment. After defending a raid, reconsider affordable growth rather than remaining in emergency mode forever.

### S20 — Future expansion becomes legally available

**Attack:** in a future declared-content fixture, introduce an affordable buildable drop-off near a known resource site. Vary protection cost and income improvement; compare against a version where the capability is absent.

**Expected:** the existing growth planner can consider verify/secure → construct → staff → protect alongside growth at home and army reinforcement. Initial resource knowledge does not reveal current defenders or remaining reserves. Site conditions can invalidate or defer the project.

**Pass:** no expansion action under today's capabilities; no copied zero-cost setup hall or counted income before delivery. With the feature available, its worker and escort commitments use the same reservations/task ownership as other goals. This is a future integration gate, not a claim that expansion is implemented now.

## Technical acceptance gates

### T01 — Hidden-state independence

Feed the same immutable initial map briefing, frozen owner observation, receipts, content, brain state, and seed into two decisions while changing hidden enemy orders, inventory, live camp survival/damage, resource depletion, loot outcomes, or current locations in the surrounding test worlds. Commands and next brain state must match until observations legitimately differ. Also audit imports/capabilities to ensure the planner cannot access live world truth. Changing the authorized initial briefing may legitimately change its opening plan; do not classify that as cheating.

Do not compare full world checksums after changing hidden physics and conclude that all differences are cheating: shared movement/combat can legitimately create different later observations. Test the brain boundary directly and separately test the filtering adapter and initial-briefing compiler. Include different neutral loot seeds with the same observed input, remembered buildings whose real health changes unseen, and a map with secret scripted placements excluded from the briefing.

### T02 — Save, restore, and lockstep

Save during a pending reaction, an unfinished incremental search, an unacknowledged build, a retreat, a cast, an item swap, a revival queue, and a trip toward a camp secretly cleared by the player. Restore the authored initial briefing and saved beliefs, then run the same future inputs. Require identical AI commands and checksums. Repeat with different rendering/frame rates; no wall clock enters decisions.

Run multi-peer cases with simultaneous human/AI spending and actions, plus two AI players. Ensure each AI intention is generated exactly once logically per peer, with stable ordering and receipts. Cover terminal match outcome before a pending plan would fire.

### T03 — Conflicting ownership and starvation

Force a builder to be requested for recruitment and gathering, a hero to be requested for loot and defense, and continuous combat while houses need rebuilding. Assert one conflicting actor assignment, consistent resource promises, bounded response, and progress in both macro and tactical lanes.

Inject rejected commands, actors killed before execution, queue funding changes, and no progress on a route. Reservations release/reconcile and retries are bounded. Do not use localized strings to infer these outcomes.

### T04 — Maximum map and army cost

Use Mosswater and 512×512 Amberfall Wilds with increasing armies, two active bots, and the supported maximum slots in a synthetic scaling case. Capture AI observation/planning/arbitration cost, path requests, candidates visited, commands issued, and allocation volume. Inspect p50/p95/p99 tick/frame time with and without bots in equivalent scenes.

Verify work-count caps under adversarial event floods and dense visible enemies. A time-budget cutoff must never make peers choose different commands. A ten-second average can hide a disastrous one-tick search spike, so retain the tail measurements.

### T05 — Content and rule changes

Change a unit's price, range, armor, speed, recruit input, a spell's radius/level requirement, and a house's spawn limit in a validated test registry. Confirm costs, hero milestones, and legality come from content. Remove a capability and verify the AI does not issue that action. Invalid policy references fail loading with a useful location; supported alternative definitions require no asset-name switch.

No promise that any arbitrary mod produces a balanced opponent: the contract is safe legal behavior, explicit unsupported capabilities, and authorable preferences, not automatic strategic genius for unknown mechanics.

Include an allied player with a different owner, a passive neutral scenario unit, a hostile neutral, and an unowned item in these fixtures. Only valid hostile targets should become combat goals. The planner must not use forced friendly fire to bypass normal target validation.

## Human evaluation

Run short focused cases first, then complete matches with human rush, economy, and camp-heavy approaches. Vary spawn sides and a small seed set. Use matched AI policy, briefing, and content versions when comparing changes. Bot-versus-bot soak tests reveal stalls and determinism issues, but do not establish fun.

Record meaningful events: productive income and workforce growth over time, idle bank with no planned purchase, army strength relative to economic commitments, time to useful hero milestones and subsequent pressure, first scouting contact, worker losses and recovery, recruitment workforce minima, home-defense recalls, aborted chases, army wipe/reassembly, camps contested or discovered empty, useful/missed casts, hero revivals, rejected command rate, time to actual victory, and the share of time armies spend without useful progress.

Ask after each human match:

- Could I infer something about its plan and exploit that information?
- Did harassment buy meaningful time, resources, or position?
- Did it ever seem to know something it could not have seen?
- Did it pressure me without making every unit impossible to catch?
- Could I understand both its successes and its mistakes?
- Was the finish decisive, or did the match drag after the outcome felt clear?

Do not optimize for a single win-rate target before defining the player skill group and sample. No numerical win-rate claim can substitute for readable counterplay. Release the single baseline when it develops all three investments coherently, completes real matches, passes the live-information/determinism gates, has no repeatable universal manipulation loop, and human playtests find its commitments useful to play against. Personality variants are not a release gate.

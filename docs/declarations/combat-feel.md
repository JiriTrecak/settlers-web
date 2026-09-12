# Combat feel: active implementation pass

## Outcome and acceptance

Orders must respond immediately in presentation and promptly in authoritative simulation. Units should travel naturally in groups and maintain useful approaches to moving opponents. Weapon damage, release and contact must correspond to the visible animation. Validate mixed armies, tight passages, chases, retreat, repeated orders, fog transitions, low FPS and multiplayer replay determinism. Passing isolated tests alone is not completion.

## Confirmed starting defects

- `Combat.resolve` applies ordinary melee/ranged damage immediately when cooldown is zero. `SettlementLayer` then sees an increased cooldown and starts the attack animation. Contact is consequently late by the animation's windup.
- `ProjectileEffects` renders arrows after damage has already been applied, with a cosmetic flight duration unrelated to simulation.
- Chasing only refreshes a route when it is empty, so moving enemies leave attackers chasing obsolete positions. Route retries are 20 ticks (500 ms).
- `Combat.plan` stops a unit when the target is in range, before movement runs; `resolve` checks range again after the target moved. Slight movement can therefore deny the strike before a windup even exists.
- Move groups receive a fixed four-column destination layout based on actor enumeration, with no assignment based on current positions. This creates avoidable crossing and detours.
- Rendering uses a fixed 0.35 positional lerp rather than sampling authoritative positions on a frame-rate-independent clock.
- Hit reactions can interrupt attack animation. Cooldown deltas are an unreliable attack event stream during frame skips.

## Design direction

One authoritative attack cycle should own start, contact/release, and recovery timestamps. Cooldown is the interval between starts, not a signal to infer animation. Animation samples that cycle using the asset's authored contact fraction. Damage cannot be caused by render callbacks.

A valid attack starts within normal weapon range. Small target motion during windup receives bounded range tolerance; it should not require an exact second range equality. Genuine escape, target death, explicit cancel, stun and invalid targets remain meaningful. Movement can cancel recovery after release without undoing a hit or bypassing weapon cooldown. A new pre-release order cancels the strike. Ordinary projectiles need authoritative launch and impact state; launched projectiles can survive shooter death. Area shells remain dodgeable at their committed ground position.

Global navigation handles static terrain. Moving units require local avoidance and destination allocation, not just repeated A* searches treating every moving body as permanent terrain. Chase replanning must notice a moving destination before reaching an obsolete endpoint, and must be bounded to avoid pathfinding spikes.

## Research status

Primary developer reference located: [AI Navigation: It's Not a Solved Problem — Yet](https://www.gdcvault.com/play/1014514/AI-Navigation-It-s-Not), GDC 2011, including Blizzard's James Anhalt. The public page establishes authorship but does not expose the talk transcript; detailed algorithms are not yet verified from it.

[AI Arena's SC2 compatibility patch](https://github.com/aiarena/sc2patch) is a primary implementation artifact for its own mod, not Blizzard's source or a guarantee of current ladder behavior. Inspect actual weapon data before citing specific timing values.

Community discussions suggest Warcraft's damage-point/backswing/range-motion-buffer and StarCraft's range-slop distinctions. Treat these as leads to verify against authored game data or developer documentation, not as authoritative exact engine semantics. The rules above are our design decisions, not a claim of an exact Warcraft clone.

## Implemented so far

- Normal melee, arrows and mortar share an authoritative windup/release/recovery timeline. The renderer seeks the authored animation around its contact fraction. Hit reactions do not preempt committed attacks.
- Melee gets a declared bounded range buffer after commitment. Movement cancels an unreleased attack without resetting its cooldown. Arrows apply damage at authoritative impact and survive shooter death; mortar retains a fixed ground target.
- Command acknowledgments render immediately. Local commands enter the next 25 ms simulation tick, with no extra empty tick; remote input flushes immediately instead of waiting for the send timer. Remote lockstep retains a shared network pipeline, now selected from server-measured latency at match start (see below).
- Compact destination assignment reduces unnecessary crossing. Explicit move/attack routing can exit a surrounding friendly formation; service routes still consider occupied work entrances. Collision avoidance remains an active concern.
- Unit facing is authoritative world yaw. `movement.turnRate` is degrees per second (initially 720). Units immediately start the shortest turn, then travel or start attack windup once aligned. A 180° turn takes 250 ms at this initial value. These are our units and values, not Warcraft's undocumented numeric scale.
- Directional spells schedule their cast start after turning; their effect delay follows that start. Self abilities do not add a facing requirement. Replacement move/stop/attack orders cancel an unreleased spell and refund its mana/cooldown; appended orders wait. The renderer uses authoritative rotation instead of snapping toward position differences or targets.
- The worker work pose requires an empty route, so turning before departure cannot mistakenly show a build/chop pose.

## Latest checks and remaining work

A 16-unit movement case exposed delayed initial routing inside a group: the original pathing eventually recovered, but some units did not start on the first tick. The new path setup starts all 16 immediately. A live Worldroot preview rendered at approximately 117 FPS near the starting base; this is not a large-battle performance result.

The 514-test full suite passed after turning and spell cancellation were added. A targeted renderer test also verifies paused single-tick presentation. Full-suite and real combat visual checks remain necessary after each substantial movement change.

Open `/combat-lab.html` on the development server for disposable scenarios using the real Game and SettlementLayer. It supports a duel, archer scenario, 12-vs-12 mixed armies, slow motion, pause/step, and movement/stop/reversal controls. This does not load or mutate a saved map or running match. A live duel reached repeated timed strikes and decreasing health on both units. Initial lab order-to-tick measurement was about 104 ms with multiple previews open; this remains a latency investigation, not evidence that the responsiveness goal is complete.

- Better local steering and congestion handling, especially opposing groups and narrow passages.
- Moving-target pursuit and last-seen handling in real fights.
- Attack-speed phase scaling is now captured at windup start and survives a mid-swing bonus removal and snapshot restore.
- Full input-to-unit latency measurement, including low FPS and network jitter; immediate markers alone are insufficient.
- Repeatable mixed-army combat benchmark, visual contact and projectile launch checks.
- Regression, replay determinism, CPU budget and completion audit. The broader combat goal is unfinished.


## Traffic and timing follow-up

The combat lab now includes a 48-unit friendly counterflow scenario through a three-cell passage. This deliberately stresses passage negotiation independently of enemy combat. Small steering and waypoint-skipping prototypes improved that case but regressed narrower and denser cases; they were removed. Current congestion handling remains unfinished. In particular, the existing yielding can displace units far from their intended lane, and repeated path searches become expensive under pressure. Do not interpret the new lab as a solved movement benchmark.

The [ORCA authors' research overview](https://gamma.cs.unc.edu/ORCA/) describes reciprocal local collision avoidance with shared responsibility. It is a research direction, not an algorithm implemented here. A replacement must also respect our finite turn rates and deterministic simulation.

Locomotion presentation now uses `lastMovedTick`, written only when authoritative position changes. A remaining path no longer displays running while the unit is stationary or turning. Attack phases store the resolved `cycleTicks` at their start; windup and recovery scale against the declared base cycle. Later changes to equipment, buffs or levels affect the next attack, not the current contact timestamp. Save validation checks against that captured cycle, with a simulation-build bump for the changed state contract.

Validation for this follow-up: 528 tests across 141 files passed, including local multiplayer transport; typechecking, production build, wiki generation and whitespace checks passed. A live isolated duel showed 120 FPS and one order-to-next-tick sample of 5.7 ms. The 48-unit counterflow fixture showed about 100 FPS and a 26.6 ms sample while congested; these are single browser observations, not latency distributions or completion evidence. The stress fixture was paused after inspection.

## Bounded traffic searches and movement indexing

Temporary unit congestion now caps a reroute at 125% of the terrain-only route plus four cells. The cap is also limited by the existing corridor, and A* prunes candidates whose path cost plus admissible heuristic exceeds that budget. Initial orders and routes around real terrain keep their ordinary unrestricted search. Recomputing the terrain budget prevents successive traffic retries from ratcheting the allowed detour across the map. If the local alternative is unavailable, the unit retains its intention and retries; it must not travel around a distant wall end to avoid a briefly occupied entrance.

Movement builds an ephemeral cell index for live, uncontained, collision-participating units. Each move/release updates that index immediately; a `finally` scope discards it after the movement pass. Swept-disc collision and cell availability queries inspect nearby buckets, preserving their existing exact tests. Non-movement queries still inspect live state directly. A differential replay compares every checksum against full scans, including a mid-run restore; the index changes query cost, not simulation results.

Reproduce the congested traffic matrix with `node --import tsx scripts/bench/combat-traffic.ts`. Optional `--gaps=1,3`, `--units=8,24`, and `--ticks=1600` narrow the run. Counts are per side. The fixture simulates 40 seconds by default and reports crossings, CPU duration, slowest tick and checksum. The wall spans the map except for the specified opening; opposing armies share an owner to isolate movement from combat.

In the measured 1-cell, 24-per-side case, the previous implementation took about 40.1 seconds of CPU time and crossed 3 east / 5 west. The revised run took 0.77 seconds with the same crossing counts. This is a headless fixture result, not an FPS claim. Across the new matrix, 8-per-side groups pass narrow gaps, but larger groups still stall: the 3-cell, 24-per-side case crossed 22 east / 14 west in 40 simulation seconds. These failures remain part of the acceptance work.

A quarter-cell local-path prototype was also evaluated. It cleared the one-way case but jammed opposing queues, including with early look-ahead. It was removed from runtime. Remaining work needs coordinated early avoidance and passage negotiation; simply adding finer path grids after queues make contact does not solve it.

Validation: 534 tests across 142 files pass, including multiplayer transport, a blocked-passage/reopening test, cost-bounded A*, indexed/full-scan equivalence, release/containment/death index updates and a 400-unit query-work check. Production build passes. The broader combat goal remains active.

Visual follow-up: the live mixed 48-unit, three-cell fixture reached 24/24 crossings in each direction by tick 2136. The inspected frame reported 120 FPS and its initial order-to-next-tick sample was 10.6 ms. A replacement reverse order brought the red group back across the passage, with a 7.5 ms sample; the preview was then paused. This is a different formation/type mix from the headless matrix and does not erase its unresolved jams.

## Weapon-range approaches and observed-position pursuit

Attackers now choose a reachable cell within their declared weapon range instead of asking for a fixed-order nearest cell around the target center. Candidate scoring prefers a short approach from the attacker's side, with a soft penalty for friendly attackers already routing to the same slot. Rotated building footprints are included. Clear approaches are preferred before at most eight alternate path searches; collision availability is checked lazily rather than scanning every firing position. A still-valid firing destination is retained, avoiding the former six-tick reroute loop caused by comparing it against only 75% of weapon range.

Units keep native `pursuit` state containing the target ID, last observed cell and observation tick. When a target leaves vision, they cancel an unreleased strike and travel to that observed location. They do not update the location from hidden target movement. Reacquisition resumes the attack immediately; an unsuccessful search completes an explicit attack or returns attack-move/patrol to its original route. New player orders cancel pursuit immediately. Hold never pursues. Automatic pursuit may switch to a new visible threat; explicit targeting keeps its chosen target. A witnessed death clears memory and allows the queued order to proceed, while an unseen removal does not disclose the death. Camp leashes and work assignments supersede pursuit.

This is an intentional game-rule change from dropping an attack as soon as vision is lost. It is particularly relevant to our archer, whose current vision and weapon range are both ten cells. No vision, weapon range or damage values changed. Normal attacks still require a perceived target at release; pursuit does not grant shooting through fog. Last-observed cell precision matches the existing integer route destinations. Save validation checks the observation tick and map bounds; simulation build 26 includes the new state and approach decisions.

The combat lab now has an actual moving-target archer fixture, a melee pursuit fixture, and controls to move/reverse the blue target. Lab actors begin on Hold so they do not start fighting before Engage. Tests cover building-side choice, distinct approach positions, ranged spacing and retained paths, hidden-motion independence, unseen removal, re-acquisition, cancellation, queued movement after a witnessed death, resumed attack-move, new visible threats and replay restoration during search.

Validation for this pass: 545 tests across 143 files pass, including local multiplayer tests; typecheck and production build pass. In the live slow-motion archer scenario, the retreating/reversing target took successive hits while the archer retained range spacing (target HP 276 then 252, archer HP 375 in the inspected frames). The melee reversal fixture completed pursuit and killed its target. Both previews were observed around 120 FPS; the melee Engage-to-next-tick sample was 3.3 ms. These isolated observations do not replace the outstanding mixed-army congestion, contact-frame and network-latency audits. The preview was paused after inspection.

## Bounded multiplayer input pipeline

Remote confirmations now use the displayed simulation tick plus the match's configured input delay. They no longer follow elapsed wall time after a slow frame or suspension. Previously, a stalled client could confirm 200 empty ticks ahead; the next click then had to follow that irrevocable promise, adding approximately five seconds of delay at 40 simulation ticks per second.

The first order in a simulation beat still flushes immediately. Further orders in that beat stay in the outbox and share the next packet (up to the existing 64-action packet limit). This bounds the confirmation frontier to `currentTick + delay + 1`, even during a click burst or suspension. It preserves order and queued actions without changing the Room protocol. A burst exceeding 64 actions drains over subsequent simulation beats. Immediate local visual acknowledgments remain independent of authoritative execution.

Remote catch-up now permits eight simulation ticks per frame, retaining every committed tick. The former cap of two could not sustain a 40 Hz simulation below 20 rendered frames per second. This is a bounded recovery allowance, not permission to skip simulation or predict damage. Missing commits still stall the simulation.

Regression scenarios use the real Session, Room, Lockstep and World paths with ordered delayed packet delivery: ten seconds without displayed progress, 10 FPS rendering, a large 150-order burst, variable 25–75 ms one-way delivery, unequal client frame rates and a suspended peer. They compare action order, commit contents and equal-tick world checksums. These tests do not measure an internet connection. At this stage, multiplayer still used a fixed eight-tick (200 ms) delay, with up to one additional tick for input. The measured-pipeline follow-up below replaces that default for sufficiently measured connections. Congestion handling and the full animation/contact audit remain unfinished.

Validation: all 549 tests across 144 files pass, including local network socket tests. Typecheck, production build, wiki generation and whitespace checks pass. This closes the avoidable buffering regressions; the broader RTS combat goal remains active.

## Passage diagnostics and reached waypoints

The [traffic audit](traffic-audit.md) records the longer passage fixtures, waiting-component diagnostics, rejected predictive-avoidance experiments and remaining work. The benchmark accepts `--report=/tmp/traffic.json` for per-second progress and read-only unit blockage diagnoses. A retry path containing reached anchors now consumes them before turning, preventing a zero-length leg from bypassing the facing gate for the next leg. Simulation build 27 and a save/replay regression cover this correction. The crowd prototypes that regressed narrow or dense cases are not enabled in gameplay.

Build 28 adds bounded destination escapes around stationary friendly bodies, preserving physical collision, turn rates, moving reservations and immediate order replacement. The three-cell 48-unit fixture now has all units arrive instead of leaving three stuck near their destination. Full opposing-stream congestion remains unresolved. Hero pickup orders also route through temporary allied traffic, and self-spell cues/saves retain precise between-cell coordinates. Details, limitations and evidence are recorded in the traffic audit.

## One simulation clock for combat presentation

`PresentationClock` advances visual time by at most one fractional tick beyond the latest observation. If simulation updates stop, animation stops at that bound. Locomotion, reactions, death playback and corpse lifetime now consume elapsed presentation ticks instead of wall-clock time. On catch-up, existing loops consume the confirmed elapsed simulation time; newly observed reactions and deaths start without consuming the interval before they appeared. This prevents running in place during a network stall and prevents an uneven frame from immediately exhausting a new death animation.

Attack and work poses continue to seek their authoritative phase. Arrows, mortar shells, tree animations and spell effects now share the same fractional tick. Pausing holds that phase instead of snapping back to the last integer tick; stepping while paused advances it. Rewinding resets the clock. Transform smoothing still settles onto the last observed position and facing during a stall, and command acknowledgment effects remain on real time so feedback is immediate. These are renderer changes; they do not change damage timing, movement speed, serialized simulation state or the multiplayer build.

The combat lab includes **Stall simulation**, which freezes observations while leaving the renderer running at its ordinary speed. This is distinct from Pause and reproduces the old animation drift. A live archer fixture held its arrow, bow pose and target stride at tick 24 over separate inspected frames with the renderer reporting 120 FPS. Resuming at quarter speed continued the fight and reduced health on both units; the lab was left paused. Its displayed input latency included manual paused stepping and is not a responsiveness measurement.

Tests use real ant GLBs and cover bounded stalls, uneven frames, catch-up, pause/step, rewind, shared effect timestamps, attack contact phase and corpse lifetime. All 564 tests across 147 files pass, including multiplayer socket tests. The outstanding dense opposing-stream deadlocks and broader combat acceptance audit remain open.

## Continuous-position path connections

Build 29 connects an interrupted mover's actual position to A*'s start-cell center when a wall corner prevents reaching the first waypoint directly. Both connecting sweeps must be clear; normal turning and movement traverse the added waypoint. This fixes repeated rejection of reachable routes without snapping units or removing collision. The expanded rotated/asymmetric traffic matrix shows substantial improvements and remaining deadlocks; exact results and limitations are in the [traffic audit](traffic-audit.md#connecting-continuous-positions-to-a-grid-corridor). All 570 tests pass, including four-orientation connection, collision, speed, interruption and replay regressions. Passage negotiation remains part of the active goal.

## Automatic targeting at the front line

Build 30 changes automatic combat acquisition. Between committed attacks, a unit pursuing an out-of-range target may choose the closest visible hostile already within weapon range. This check uses the existing eight-tick stagger (at most 200 ms between checks per unit). It clears the old approach and refreshes pursuit memory. A current target still in range remains selected, preventing unnecessary target switching. Explicit attack orders retain their specified target, committed windup/release/recovery is not interrupted by this automatic check, and normal move orders still suppress combat. This is our intentional combat rule, not a claim of exact Warcraft targeting semantics. No damage, health, speed or range values changed.

The previous implementation could keep a front-line unit routing toward a distant automatically acquired target while an immediately attackable enemy stood beside it. The focused regression failed before this change. Coverage now includes switching to the immediate threat, retaining explicit focus, preserving an in-range target, respecting visibility, preserving a committed swing after its victim retreats, immediate replacement movement, and deterministic replay.

`node --import tsx scripts/bench/combat-frontline.ts` runs eight mixed-army fixtures: 12 or 24 units per side, basic or advanced rosters, open terrain or a three-cell passage. Advanced rosters include marshals, warriors, hunters, archers and bombardiers. This is a combat stress fixture, not a legal roster or balance recommendation. `--ticks=9600 --report=/tmp/frontline.json` extends the run and records survivor/traffic details. Local before/after evidence is under `tmp/traffic/2026-09-10-frontline-*.jsonl` and `2026-09-10-frontline-long.json`.

Across the initial 120-second fixture runs, samples with an out-of-range automatic target despite a visible hostile in weapon range decreased from 865 to 17. Sampling occurs after movement on each unit's staggered acquisition tick, so a few newly created range opportunities can still appear. Seven fixtures resolved within 120 simulation seconds; the remaining basic 24-per-side passage battle resolved at tick 5446 (about 136 seconds) in the longer run. Some units died without a recorded attack; completion of these fixtures is not proof that every unit has an ideal engagement. Winners and fight lengths changed, as expected from a targeting-rule change. Friendly counterflow and destination-packing failures remain separate open work.

The live lab now includes a 24-versus-24 advanced mixed army and survivor counts. The inspected fight showed mortar flights, changing health, and eventually five red survivors with no blue units. Its sampled initial order-to-next-tick time was 6.7 ms; the near-end inspected frames reported 120 FPS with only seven, then five living units. These are isolated observations, not a full-army performance claim. All 577 tests across 149 files pass, including multiplayer socket tests. The broader combat goal remains active.


## Measured multiplayer input buffer

The host now measures each connected player's round-trip time through nonce-based transport probes. The client echoes the nonce without supplying a timing value; replies are consumed before gameplay listeners attach. Five recent samples are retained, at least three fresh samples are required, and the slowest recent RTT across players determines a shared input buffer. Spectators do not increase the buffer. Initial probes run in a short burst; the server's maintenance pulse refreshes measurements afterward.

The selected delay is `ceil((worst RTT + 25 ms) / 25 ms)`, bounded to 2–40 simulation ticks. Missing or stale measurements impose at least the existing eight-tick fallback; a measured slow peer can still increase it. Thus a measured low-latency lobby can use a 50 ms buffer instead of 200 ms, while a 150 ms RTT chooses 175 ms. These are configured pipeline durations, not promises of total click-to-visible-response latency. Input scheduling, display frames, network jitter and simulation stalls can add time.

All players receive the same delay in the match configuration. It is frozen during play, recalculated on a fresh restart, and preserved when loading a save with committed pipeline state. Disconnect/reconnect clears the member's measurements. Lobby rows show measured RTT and the proposed input buffer. These transport measurements do not affect simulation checksums or change the simulation build. See [latency protocol](../../src/net/latency.md) for freshness, validation and timing details.

Tests exercise real Session/Room/Lockstep paths at 5, 25, 75 and 150 ms simulated one-way latency, check prompt actual facing response, and compare action logs, ticks and world checksums. Jitter and suspended-peer cases cover both measured and fallback pipelines. A real loopback WebSocket test verifies probe handling before listeners attach and identical start configurations. Additional tests cover forged/duplicate/expired replies, cross-member nonces, reconnect fallback, spectators, restart and save restoration. All 590 tests across 151 files pass. This is reproducible simulated-network and local-socket evidence, not an internet benchmark.

The updated MatchHost server must be deployed/restarted for hosted matches to use its probes and selected buffer; this pass did not deploy the production server. Buffer selection currently happens only at match start, so unexpected mid-match jitter still causes lockstep stalls rather than automatic delay adjustment. Friendly traffic congestion, destination packing and the broader combat acceptance audit remain open.


## Local clearance during long move orders

Build 31 lets an isolated mover escape parked friendly bodies and rejoin a distant route. The previous four-cell final-destination gate could trap it forever on a long order. The bounded local search now returns to an intermediate corridor waypoint, retaining the remaining route, speed, finite turns, collision and immediate interruption. Active nearby traffic retains its existing negotiation. The [traffic audit](traffic-audit.md#escaping-parked-allies-along-a-distant-corridor) records the reproduced failure, rejected broader prototypes, save-state contract, full rotated/asymmetric matrix, mixed-combat and live-preview evidence. All 597 tests pass. Opposing-stream deadlocks remain unfinished work.


## Complete traffic blocker diagnostics

The traffic report now identifies physical blocker IDs as well as occupied cells, including the mutual body blockage that concealed the primary three-unit passage deadlock. Gameplay collision queries and all 24 traffic-matrix checksums remain unchanged. Four priority-inheritance prototypes improved isolated cases but failed wider regression checks and were removed. The [traffic audit](traffic-audit.md#physical-waiting-dependencies-and-rejected-priority-inheritance) records the evidence, source research and next coordination experiment. All 600 tests pass; durable yielding and opposing-stream congestion remain unresolved.

## Compact formation preservation — build 35

The later crowd-recovery passes are recorded in the [traffic audit](traffic-audit.md). Build 34 completes all 96 move orders in each of eight long passage fixtures, but ordinary movement needed a separate measurement. `scripts/bench/army-movement.ts` now runs 30 open-terrain cases: 12, 24 or 48 warriors; short, cardinal and diagonal moves; and reversals after one second. It records first translation, median/final arrival, traveled distance and CPU time. These are simulation measurements, not end-to-end input/render latency.

The benchmark exposed repeated formation reshaping: the 12-unit rectangular group was assigned a new compact, partly diamond-shaped destination layout on every order. A six-cell move took 163 ticks (4.075 seconds), although speed alone calls for about 60 ticks. The new native formation rule preserves an already compact footprint when all translated slots and their straight terrain routes are valid. Otherwise the previous slot assignment remains in use. See `src/sim/game/formation.md` for the bounds and fallback rules.

The same short move now finishes in 64 ticks (1.6 seconds), with mean travel reduced from 7.3 to exactly 6 cells. The 12-unit long diagonal falls from 390 to 249 ticks. All 30 ordinary movement cases finish; first translation occurs within 1–10 ticks depending on facing. Reversals retain finite turning and replace the order immediately. Two 48-unit horizontal reversal cases finish four or five ticks later, so this is not an across-the-board transit improvement.

All 24 narrow-passage matrix checksums remain identical because the terrain-obstructed translation falls back to the previous assignment. Six of eight mixed-army checksums remain identical. The two open-field 12-per-side fights change winning side and duration because approach positions changed; both resolve. Formation preservation applies to Attack-move as well as Move, so these combat differences are intentional consequences to evaluate during play, not changes to unit stats or damage rules.

All 629 tests and the production build pass. Seven added tests cover preservation/fallback, unique rounded slots, four movement directions, collision clearance, prompt turning on reversal and deterministic replay even when the reversed command lists actors in the opposite order. The simulation identifier is `declarative-sim-35`. The Combat Lab includes **Compact army short move**.

Evidence is under `tmp/traffic/2026-09-10-formation-{baseline,ordinary,traffic,frontline}.jsonl`. Passage throughput, mixed-speed crowds, animation/contact coherence and the broader acceptance audit remain active work.

## Authoritative hero casting poses

The Marshal previously played `cast` at the controller's fixed playback speed even though regular spells wind up for 20 ticks and Crownfall for 40 ticks. Its release gesture could therefore precede the ultimate's actual resolution. Observed casting now includes `startTick` as well as `resolveTick`; it remains absent during the prerequisite turn. The renderer seeks through the windup using that authoritative interval, just as melee/ranged strikes already follow their native contact timeline.

Assets may declare `castContact`, a normalized point in their authored cast clip (0–1). The Marshal declares `0.68`, matching the end of its authored release gesture in `art/sources/characters/ant-marshal/model.py`. The fallback for other cast-capable assets is `0.55`. This is presentation metadata, not a damage trigger. Native spell resolution still controls effects, damage, cooldowns, refunds and mana. Changing this field changes the content fingerprint but not native simulation rules; the simulation build remains 35.

When pending casting disappears on its release tick, the renderer continues from the release pose into a short visual recovery. Movement, a new attack or a damage reaction can interrupt recovery. If casting disappears before its expected resolution, the renderer exits the windup immediately, including when the replacement move is still turning in place. Late observations seek to the current windup phase. Pauses and network stalls cannot run the gesture ahead of the presentation clock. An entire cast missed between observations is not reconstructed; authoritative visual cues still control the effect. If cancellation is first observed after the scheduled release, pose recovery alone cannot distinguish that from completion, and does not fabricate a spell effect.

Two real-Marshal-GLB tests cover 20/40-tick casts, contact, recovery, replacement orders during turning, late observation, stalls, pauses and unchanged simulation checksum. The facing test checks the observed start/resolve timeline and its absence before facing completes. All 631 tests across 154 files and the production build pass. The Combat Lab now includes **Marshal spell release** and **Marshal ultimate release**. In a paused, stepped live check, Crownfall's target stayed at 300 HP through tick 20 and fell to 20 HP at tick 40 with the release pose/effect; interrupting Faultline at tick 10 started the opposite turn at tick 11 without releasing the spell. The lab's input timing readout includes manual pauses in this check and is not latency evidence.

## Bow-origin projectile presentation

Arrows previously launched from the simulation origin plus a fixed 1.5-unit height. The actual archer's bow at release is forward of its feet and around 1.1 units high before instance transforms. `asset.ants.archer` now declares the existing `projectileSocket: "socket_handL"`. SettlementLayer samples this after applying the authoritative attack pose and world transforms, using the same observed-socket resolver as mortar shells.

ProjectileEffects captures the visible socket once per fresh missile. It clones that position, so later motion, another attack or shooter death cannot pull an airborne arrow. A flight first observed more than one tick after launch uses its recorded ground origin and the previous fixed-height fallback; it never samples a potentially relocated shooter. Flights that disappear from observer-filtered input immediately lose their cached origin and render instance. Reappearing late flights use the fallback. Targets continue to follow the observed authoritative destination; flight timing, homing behavior and damage are unchanged. One instanced draw per projectile kind remains in use. The runtime arrow geometry is slimmer and shorter to better match the nocked arrow; thorns are unchanged.

Three added tests cover fresh/late launch sampling, shooter movement/removal, target movement, exact impact retirement, hidden/reappearing flights and a real rotated archer GLB whose rendered launch point equals its posed bow socket. The existing 200-arrow volley test still verifies batching and buffer reuse. All 634 tests across 154 files and the production build pass. No simulation rules or build identifier changed; the asset declaration changes the content fingerprint.

Live Combat Lab verification used **Archer and moving target**, paused and stepped: the first arrow launched at tick 21 from the bow, approached the still-running target through tick 31, and disappeared with the target's HP changing from 300 to 288 at tick 32. Manual stepping is visual/contact evidence, not an input-latency measurement. Thin arrows remain deliberately exaggerated slightly relative to the authored nocked arrow for readability at gameplay zoom. Internet multiplayer deployment and the broader movement/combat acceptance audit remain unfinished.

## Mixed-army final approach — build 36

A new mixed-speed audit reproduced a bombardier stuck permanently beside parked allies after crossing a narrow passage. A bounded outer ring of local rejoin candidates fixes the packed final approach while preserving the original candidate preference and path-search budget. Four rotated regressions cover collision, arrival and deterministic save replay. All ordinary mixed movement and mixed-army combat benchmark checksums remain unchanged; one existing warrior passage case and the newly found mixed case gain their final arrival. See the [traffic audit](traffic-audit.md#mixed-speeds-and-packed-final-approach-build-36) for measurements and the remaining slow mixed-counterflow case.

## Turn-aware waiting graph — build 37

The waiting graph now obeys the movement system's facing prerequisite. A still-turning actor cannot create a fictitious physical waiting cycle before it can attempt its next leg. Four rotated tests cover this gate. Existing measured passage and combat checksums are unchanged. Faster global/terrain-specific recovery triggers and longer waits were tested and rejected due to larger-stream throughput regressions; see the [traffic audit](traffic-audit.md#recovery-timing-experiments-and-turn-aware-waiting-build-37). Dense counterflow remains active work.

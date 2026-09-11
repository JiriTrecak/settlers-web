# Traffic investigation: passage negotiation

The combat goal is not complete. Passing a small army through a gap does not establish that dense armies, opposing streams, destination packing and immediate reversal work well.

## Reproducible evidence

Run `node --import tsx scripts/bench/combat-traffic.ts --gaps=1,3 --units=24,48 --ticks=4800 --report=/tmp/traffic.json`. Counts are per side. The report records crossing progress every simulation second, then diagnoses each unit's next nominal step and strongly connected waiting components. Diagnostics are read-only. `turning`, `terrain`, `occupied-cell`, `body`, `clear` and `arrived` distinguish different causes. This is a snapshot; a clear next step does not prove sustained progress. In particular, repeated rerouting can keep a unit moving locally without crossing the passage.

The September 10 run is saved locally at `tmp/traffic/2026-09-10-current.json`. After 120 simulation seconds:

- One-cell gap, 24 units per side: 3 east / 5 west crossings; a three-unit circular wait and several units stationary for more than 75 seconds.
- One-cell gap, 48 per side: 11 east / 0 west; a circular wait plus body and cell blockage. This is a persistent deadlock, not merely a slow traversal.
- Three-cell gap, 24 per side: 24 east / 23 west; 45 units had completed their routes, while three remained blocked by occupied cells near their destinations. There was no circular waiting component in the final snapshot.
- Three-cell gap, 48 per side: 21 east / 13 west; 31 had arrived, 34 had a nominally clear next step and 25 were turning. Low crossing progress despite local activity indicates route/turn churn as well as collision problems.

The occupied-cell guard reserves more space than the physical 0.4-cell combined body diameter. Simply removing that guard was tested and rejected: it caused formerly successful small head-on streams to deadlock. Narrow passage control cannot be fixed by relaxing contact checks in isolation. Allowing diagonals, changing yield-side preference, limiting yielding to opposing traffic and exempting stationary friendly cells were also rejected after matrix regressions.

## Predictive avoidance experiment

[UNC's ORCA research](https://gamma.cs.unc.edu/ORCA/) motivates choosing compatible velocities before bodies meet. The experiment constructed reciprocal velocity constraints, solved for a nearby preferred velocity, added nearby terrain constraints and retained the engine's final swept collision check. It also experimented with a short-lived steering choice and handling incompatible constraints. Research snapshots are kept outside runtime in `tmp/traffic/reciprocal-prototype/`.

One variant passed all 24 units in each direction through the three-cell gap within 40 simulation seconds, improving the baseline's 22 east / 14 west at that time. However, the same variant failed the one-cell and 48-per-side cases. It is not enabled in gameplay. The mathematical guarantees of an instantaneous reciprocal-velocity solver do not automatically apply to our finite-turn, stop-before-facing movement model or to the experimental terrain approximation.

The experiment also exposed the need to repair a path after lateral avoidance changes its approach to a corner. Reusing the original waypoint can point into terrain. Removing all visible intermediate waypoints is not a safe general fix: it can erase a deliberate yield step and recreate head-on contention.

## Applied correction

Retry/yield paths can contain repeated or already-reached waypoints. The movement pass now consumes these before the facing gate. Previously, the zero-length leg could be skipped inside the translation loop, allowing translation toward the following leg with the old facing. The regression checks immediate turning without translation and identical save/replay continuation. Simulation build 27 includes this correction.

Validation: 551 tests across 145 files pass, including multiplayer socket tests; typecheck, production build and wiki generation pass. The live mixed 48-unit passage remained visibly congested despite reporting approximately 120 FPS. A replacement reverse order reached the next simulation tick in a sampled 6.4 ms and brought the red group back out; by tick 3194 all 24 westbound units had crossed and no red units remained east of the wall. The disposable lab was paused afterward. This verifies that the reversal remains responsive in that fixture; it does not establish acceptable passage throughput.

## Next engineering work

Treat the cases separately without weakening the final objective:

1. Resolve destination packing around stationary friendly bodies with actual swept clearance and a bounded local escape path. Do not push Hold units, teleport units, or pretend they reached an inaccessible destination.
2. Make passage yielding persist long enough to finish the maneuver; distinguish that route intent from an ordinary path corner. Repeated global replanning must not undo a yield every few ticks.
3. Coordinate opposing streams before narrow entrances fill. Test both arrival orders, rotated passages, asymmetric army sizes and command reversal. A one-direction-only success is insufficient.
4. Integrate any predictive steering with turn-rate limits, authoritative movement and save state. Verify that heading and locomotion match actual travel, and that replacement player orders interrupt negotiation immediately.
5. Re-run the full traffic matrix, deterministic replay and mixed combat scenarios, then inspect the live combat lab. Narrow fixtures and average FPS alone cannot establish completion.

## Destination escape implementation

Simulation build 28 adds bounded local navigation near a blocked destination. It activates within four cells of the chosen destination when a nearby stationary friendly body may be blocking the coarse route. The local search uses quarter-cell samples, a maximum of 256 visited nodes and actual swept terrain/body clearance. It retains whole-cell reservations for moving units and enemies. Hold units are not moved or pushed. The path is straightened locally without deleting yield steps from unrelated routes.

The resulting `unit.detour` stores its fixed-point waypoints and destination. Travel obeys the same speed and finite facing rules; every step rechecks terrain and bodies. An obstruction discards the detour for a later retry. Stop, replacement orders, a new route, spells, completed pickups, work cancellation, containment and release clear it. Save validation checks the destination, route identity and bounds. The original global route remains responsible for getting across the map; this local escape is not a substitute for passage negotiation.

The new 120-second report is `tmp/traffic/2026-09-10-local-path.json`. In the three-cell, 24-per-side fixture, all 48 units now finish their routes; previously 45 finished and three remained blocked near destinations. Both directions cross fully. The one-cell and 48-per-side crossing counts remain unchanged in this matrix, so the large opposing-stream problem remains open. The 48-unit destination fixture took approximately 1.03 seconds of CPU time for 120 simulation seconds, compared with approximately 0.93 seconds in the earlier run; these are separate headless observations, not a controlled FPS benchmark.

Hero pickup routing now treats allied bodies as temporary traffic rather than immediately reporting a reachable item as unreachable. Tests cover pickup from the enclosure and saving immediately after collection. Spell interruption testing also exposed a separate precision issue: self-spells store continuous caster positions, but cast/cue schemas required integral cells. Native spell coordinates now share the continuous coordinate schema already used by mortar shells, and visual origins use the caster's precise position. Visibility checks convert the target back to a rounded map cell. Authored map placements and command targets remain integral.

The combat lab includes **Packed destination escape**. A selected warrior leaves four stationary Hold units through physically clear space. Slow-motion and stepped inspection confirmed the active detour, a 45-degree travel heading, unchanged guard positions and eventual arrival. The lab remains disposable and was paused after inspection. Network, combat and broader crowd checks remain part of the active goal.

Validation for build 28: all 560 tests across 146 files pass, including local network sockets. Typecheck, production build, wiki generation and whitespace checks pass. New regressions cover real-clearance escape, untouched Hold units, a blocked doorway, bounded failed searches, a body entering the escape route, replacement Stop/spells, pickup completion, corrupted detour saves, and precise self-spell replay/visibility. The broader goal is still active.

## Connecting continuous positions to a grid corridor

Build 29 corrects a path-adapter failure exposed by the crowd experiments. A* searches from the mover's rounded cell center. A mover partway through that cell can be beside a wall corner, with no clear direct sweep to A*'s first waypoint. The old adapter rejected the whole route in that situation, even though traveling to the start-cell center first was clear. This could leave the unit retrying indefinitely.

The adapter now checks both sweeps: actual position to start-cell center, then center to the first corridor waypoint. It inserts the center only if both are clear. It never moves or snaps the unit during planning, never bypasses a blocked connection, and retains ordinary arbitrary-angle straight routes. The mover traverses the connector with normal speed, turning and collision checks. Failed planning preserves the current route. Simulation build 29 separates peers with the old routing behavior.

The preceding longer-yield and continuous-sidestep prototypes are not in runtime. Longer yields improved some cases but regressed others. Continuous sidestepping exposed this connector failure but still regressed opposing traffic after the connector was fixed. Only the independently verified route connection was retained.

### Expanded evidence

The benchmark now accepts `--rotations=0,1,2,3` (quarter turns) and `--opponents=48` (asymmetric right-hand army size). Crossing counts use the original corridor coordinates after undoing rotation. `arrived` counts actors whose move order, path and goal have all completed; it is distinct from merely crossing the opening. The diagnostic also reports `waiting-route` when an actor has no path but still has an unreached destination, rather than incorrectly calling that arrival.

The 24-case comparison uses one- and three-cell gaps, 8/24/48 units per side, all four orientations and 120 simulation seconds. Local artifacts are `tmp/traffic/2026-09-10-start-connect-before.jsonl`, `2026-09-10-start-connect-after.jsonl`, and `2026-09-10-start-connect.json`. The baseline runner substitutes only the previous Spatial.route method in an isolated process; it does not modify the live game.

- Completely finished scenarios increased from 8/24 to 12/24.
- Original orientation, one-cell gap, 24 per side: crossings improved from 3 east / 5 west to 24 / 24. Forty-seven of the 48 units finished their destination order; crossing and arrival are not interchangeable.
- Original orientation, three-cell gap, 48 per side: crossings improved from 21 / 13 to 48 / 48. Ninety-two of 96 finished their orders.
- Rotated 180 degrees, three-cell gap, 48 per side: crossings changed from 44 / 25 to 43 / 23. The current yield policy remains sensitive to geometry and traffic order; this is not a uniform throughput improvement.
- An asymmetric 8-versus-48 matrix is stored in `2026-09-10-start-connect-asymmetric.jsonl`. Seven of eight cases crossed both armies completely, but only two completed every destination order. The original-orientation one-cell case still deadlocked before either army crossed.

Focused regressions reproduce the blocked initial sweep in all four orientations, check every traveled segment and speed bound, reject a traffic-blocked connector, verify Stop, and compare save/replay checksums. All 570 tests across 148 files pass, including local multiplayer sockets. The live lab now offers one-, three- and five-cell passage widths. Its mixed 48-unit one-cell fixture remained congested at 4/24 crossings in each direction around tick 2243, despite reporting 120 FPS. The sampled initial order-to-next-tick time was 12.5 ms; this is a single observation, not a latency distribution. Coordinated yielding, remaining destination packing and mixed-army acceptance remain unfinished.


## Escaping parked allies along a distant corridor

Build 31 removes an unnecessary dependency between local clearance and final order distance. A warrior surrounded by four parked Hold units could escape when clicked nearby, but remain at `(100.4, 100)` indefinitely when sent to `(120, 100)`. The old local search only activated within four cells of the final destination. An isolated run using the previous movement methods still had the move order pending after 500 ticks; the current methods reached `(120, 100)` and completed it. No guard was moved.

For a distant order, the mover now chooses a nearby point along its existing corridor, finds a bounded local escape around the parked bodies, and resumes the remaining corridor afterward. It retains the original goal. The native detour records both that goal and the intermediate `waypoint`; save validation checks the detour endpoint against the first remaining corridor waypoint. Completing the local detour consumes only that waypoint, rather than declaring the entire route complete. Replacement orders and the existing cancellation paths still discard it immediately.

The search radius, quarter-cell sampling and maximum 256 visited nodes are unchanged. A projected rejoin point is about three cells ahead and must be within four cells of the mover. Rounding it can move it across a terrain corner, so up to nine nearby grid anchors are considered with stable distance/coordinate ties. The chosen anchor must have a terrain-clear continuation to the original waypoint and a free endpoint. Only one bounded local search follows. Every actual movement segment retains swept terrain checks, physical unit collision, movement speed and finite turning. Tests cover a bent corridor that exposed an invalid rounded connection during implementation.

This extension is for parked-body clearance. If another routed unit is within four cells, a distant escape defers to the existing traffic negotiation. The earlier nearby-destination escape remains available. An unrestricted version changed moving-stream negotiation and severely regressed the original one-cell 24-per-side fixture (48 crossings down to 11). Expanding the final-destination radius to eight cells also produced a counterflow regression. Neither prototype is retained. Their local measurements are `2026-09-10-parked-unrestricted-prototype.jsonl` and `2026-09-10-parked-radius-prototype.jsonl` under `tmp/traffic`.

### Validation and limits

The final 24-case matrix is `tmp/traffic/2026-09-10-parked-corridor.jsonl` with diagnostic snapshots in the matching `.json`. It uses the same 120-second, four-orientation, one-/three-cell, 8/24/48-per-side fixtures as the build-29 baseline. Crossing counts do not decrease in any case; arrival counts improve in three:

- Rotated 90 degrees, one-cell gap, 24 per side: 47 to 48 arrivals.
- Rotated 90 degrees, three-cell gap, 48 per side: 95 to 96 arrivals.
- Rotated 270 degrees, three-cell gap, 48 per side: 67 to 68 arrivals; crossings remain 47/29.

Completely finished symmetric scenarios increase from 12/24 to 14/24. The eight-case asymmetric 8-versus-48 run (`2026-09-10-parked-asymmetric.jsonl`) adds one arrival in the 90-degree one-cell case, 52 to 53, with unchanged crossing counts throughout. These are small destination-clearance gains, not a solution to opposing-stream deadlock. In particular, the original asymmetric one-cell case remains blocked.

All eight extended mixed-army frontline fixtures resolve, with the longest at tick 5040 (126 simulation seconds). The reports are `2026-09-10-parked-frontline.jsonl` and `.json`. Some units still die before recording an attack; fight winners and lengths may change when approaches change. These fixtures do not establish ideal micro or crowd behavior.

Seven new regressions cover four-orientation long orders, collision/speed/facing bounds, unchanged Hold units, retained corridor identity, save/replay, immediate replacement, invalid saved rejoin points and a bent terrain corridor. All 597 tests across 152 files pass, including local multiplayer sockets. The live **Parked allies and distant move** lab showed an active escape at tick 28 with 135-degree facing, then a completed distant move while the four guards remained in place. A running sample measured 6.0 ms from input to the next simulation tick; the manually stepped sample includes user-controlled pause delay and is not a responsiveness measurement. The preview reported 120 FPS with five units, not a full-army performance result.

Coordinated counterflow, dense formation packing, visual body spacing and the broader combat acceptance audit remain open. The goal remains active.


## Physical waiting dependencies and rejected priority inheritance

The next investigation reproduced a persistent three-unit dependency in the natural asymmetric fixture: `--gaps=1 --units=8 --opponents=48 --ticks=1600`. The leading `left-0` stops at `(127.4, 121)` behind `right-18` at `(128.4, 121)`. That ant's retreat route is blocked by `right-0` at `(128.8, 121)`, while `right-0` is physically blocked by `right-18`. All three still have move orders; the two rear units have been stationary for more than 1,300 ticks. This is a cyclic dependency with an upstream waiting unit, not a terrain connectivity failure.

The previous diagnostic reported `reason: body` with no blocker IDs. Its strongly connected component analysis therefore missed the main `right-0 ↔ right-18` cycle. `Spatial.unitSegmentClear` now optionally appends every physical blocker ID to a supplied diagnostic array. Normal gameplay calls retain their first-collision early return and do not allocate an array. The report merges physical and occupied-cell dependencies, exposes the two lists separately, and checks actual local-detour waypoints. It excludes the mover's current coarse cell just as movement does, while still checking bodies sharing that cell. Subset reports identify blockers outside the subset without inventing graph rows or cycles for them.

The corrected report is `tmp/traffic/2026-09-10-physical-dependencies-chain.json`. It identifies `left-0 → right-18 → right-0 → right-18`, plus another three-unit cycle. It is read-only and does not choose movement or disclose this information to a player. Three added tests cover the previously missing physical edge, partial reports, local-detour direction, complete blocker collection, indexed/full-scan equivalence and unchanged world state. All 600 tests pass. The 24-case traffic matrix (`2026-09-10-physical-dependencies-final.jsonl`) has identical crossing counts, arrival counts **and checksums** to build 31. The simulation build stays 31.

### Experiments rejected

Four ephemeral priority-inheritance variants were evaluated. They derived directed dependencies from nearby intended movement, propagated a root priority and depth, and changed which neighbor received yielding preference. The first variant cleared the natural 8-versus-48 deadlock (all 56 crossed, 54 arrived at 120 seconds). An isolated three-unit reconstruction also cleared when inheritance was enabled and remained frozen for 800 ticks with the previous movement method. Those successes did not generalize sufficiently:

- Unrestricted inheritance finished 16/24 symmetric cases, versus 14/24 for the retained build. However, the original one-cell, 24-per-side case fell from 47 arrivals and 24/24 crossings to 2 arrivals and 1/1 crossings. A higher aggregate completion count is not an adequate acceptance criterion.
- Requiring a one-second stall finished 14/24. The 90-degree, three-cell, 48-per-side case regressed from 96 arrivals and 48/48 crossings to 77 arrivals and 39/44 crossings.
- Limiting changed priorities to direct dependency pairs finished 15/24, but still severely regressed the original one-cell, 24-per-side case.
- Limiting changes further to persistent mutually blocked pairs finished 14/24. The original three-cell, 48-per-side case regressed from 92 arrivals and 48/48 crossings to 70 arrivals and 48/30 crossings.

None is enabled. The movement context was restored byte-for-byte to the pre-experiment version. Source snapshots `priority-unrestricted.ts`, `priority-stalled.ts`, `priority-direct.ts`, `priority-cycle.ts` and the `2026-09-10-priority-{matrix,stalled,direct,cycle}` reports are under `tmp/traffic` for investigation, not production imports.

### Research and next decision

[Okumura et al., Priority Inheritance with Backtracking (IJCAI 2019)](https://www.ijcai.org/Proceedings/2019/76) combines inherited priorities with coordinated next moves and backtracking. Its finite-arrival result depends on a graph-cycle condition. Our prototypes only altered yielding preference: they did not implement PIBT, reserve a compatible set of moves, or satisfy its movement and graph assumptions. Its guarantee therefore does not transfer to our continuous positions, finite turning and narrow passages.

The evidence argues against further tuning of ID preferences alone. The next hypothesis to test is a durable yielding maneuver: select a checked escape pocket, preserve the original route, finish moving into that pocket, give the waiting actor room to pass, then reconnect to the original corridor. A replacement player order must cancel it immediately. The maneuver needs explicit native state and save/replay validation if it persists across ticks. Holding positions, terrain, physical collision and enemy ownership must remain respected. Coordinating the escape destination and the waiting interval is unimplemented work; this paragraph is a proposed next experiment, not a claim that it resolves congestion.

The combat goal remains active. No new gameplay movement policy was shipped from this investigation.

## Build 32: durable recovery experiment

The subsequent pass implements the escape-pocket hypothesis above. After five seconds without movement, a mover inside a friendly dependency cycle can reserve a checked side pocket, keep its original order, move aside, briefly wait for the blocked leader, and reconnect. Replacement commands cancel the maneuver immediately. The native state, spatial reservation and save validation are described in `src/sim/game/trafficRequests.md`.

The one-second trigger was rejected because it interfered with traffic that was still resolving naturally. Reserving pockets alone did not fix those regressions. The retained five-second trigger is a recovery fallback, not an acceptable target for ordinary command latency.

The final 120-second asymmetric matrix clears the original one-cell 8-versus-48 deadlock: all 56 actors cross, with 55 at their final destinations, versus zero crossings before. In the symmetric 24-case matrix, full completion rises from 14 to 15 cases. The 270-degree three-cell, 48-per-side case improves from 68 arrivals and 47/29 crossings to 95 arrivals and 48/48 crossings. However, the original three-cell 48-per-side case slows from 92 to 85 arrivals (48/48 to 48/44 crossings), and the 90-degree one-cell case slows from 50 to 47 arrivals (31/21 to 31/17 crossings). These are real short-run regressions.

At 300 seconds, those crossing delays recover. The original three-cell case improves from 95 to 96 final arrivals; the 270-degree three-cell case regresses from 96 to 95. Both have all 96 actors across. The 270-degree one-cell, 48-per-side fixture remains deadlocked at 24 arrivals and 24/0 crossings. Thus this pass resolves one demonstrated persistent failure without establishing general congestion correctness. Dense counterflow and final destination packing remain open work.

Final evidence: `tmp/traffic/2026-09-10-durable-{matrix,long,asymmetric}.jsonl`, with detailed matrix/long snapshots alongside. The 300-second baseline is `2026-09-10-durable-baseline-long.jsonl`. Its runner asserts that the benchmark game's movement prototype is actually patched; an earlier runner outside the repository loaded a second module identity and was discarded as invalid baseline evidence.

All 610 regression tests pass, including ten recovery cases covering rotated geometry, swept terrain/body clearance, replacement orders, save/replay, invalid saved metadata, reservations, and leader stop/death/timeout. The simulation compatibility identifier advances to `declarative-sim-32`. This remains an incomplete part of the active combat goal.

## Build 33: choose a feasible yielder at a narrow opening

The remaining 270-degree one-cell deadlock put `right-17` inside the gate at `(121, 127.4)`, `left-12` outside at `(121, 127.8)`, and `right-0` behind at `(121, 126.4)`. The lower-ID outside actor blocked the inside actor, while the following actor prevented retreat. The priority rule insisted that the inside actor yield, although only the outside actor had a usable side pocket.

Negotiation now tests the preferred escape path and, at a terrain constriction, can reverse the yielding request to another stalled member of the same cycle. Both immediate lateral directions must be blocked by terrain before this alternative is considered. Native orders, ownership, reserved destinations, finite turning and swept collision checks are unchanged. No unit is displaced or teleported by another unit's command.

An unrestricted version cleared the narrow deadlock but slowed the original three-cell, 48-per-side case from 85 to 75 arrivals at 120 seconds. Restricting the reversal to terrain constrictions eliminates that wider-passage regression. Against build 32, the final 24-case matrix changes only three results: the 180-degree one-cell 8-per-side fixture improves from 8 arrivals / 4+4 crossings to all 16; the 270-degree one-cell 48-per-side fixture improves from 24 arrivals / 24+0 crossings to 43 arrivals / 33+10 crossings; the 270-degree one-cell 24-per-side fixture has 47 rather than 48 final arrivals, with all units across in both versions. The latter remains a destination-packing regression and is not hidden by aggregate results.

At 300 seconds, all eight 96-unit fixtures have 48 crossings in each direction. The formerly frozen fixture has 95 final arrivals, versus 24 in build 32. This proves recovery for these fixtures, not a universal congestion guarantee or fast enough transit. Every asymmetric crossing count is unchanged, but the original one-cell 8-versus-48 fixture ends with 54 rather than 55 final arrivals at 120 seconds. All eight mixed-army frontline outcomes/checksums remain identical to build 32.

Four new rotated regression cases reproduce the narrow-mouth arrangement and check original-order completion, terrain clearance and body separation. The full suite passes 614 tests. The live Combat Lab adds **Narrow-mouth yielding reversal**; after Reset and Engage, all three real ant models finish on the intended sides and become idle. One running input sample measured 7.8 ms to the next simulation tick; this small scene does not establish large-army latency or frame-rate guarantees.

Evidence is under `tmp/traffic/2026-09-10-feasible-yield-{matrix,long,asymmetric,frontline}`. The simulation identifier is `declarative-sim-33`. The active goal still includes congestion throughput, exact destination packing and broader combat-feel verification.

## Build 34: rejoin beyond occupied waypoints

The last actors in three long-running fixtures had already crossed the passage, but their intermediate route points had become occupied by finished allies. Local repair tried to rejoin the occupied point itself. For example, the 270-degree three-cell case stopped at `(118, 143.4)` behind the waypoint `(118, 144)`, occupied by `right-4`. Read-only inspection found many physically clear local bypasses, but the old endpoint choice rejected them before searching.

Local corridor repair now skips physically occupied intermediate endpoints and chooses a checked nearby anchor with a terrain-clear continuation to the remaining corridor. If every remaining endpoint is occupied, it can reconnect toward the ordinary nearby-free destination supplied by movement, provided the direct terrain corridor is clear. The new route is installed only after the local path passes the existing swept terrain/body checks. It never clears a move order merely because a unit is close enough, pushes a parked ally, or changes the recent-traffic exclusion rule.

Skipping intermediate points alone was insufficient: it left actors stuck when the last endpoint was also occupied. The complete change handles both. A proposed change to how long-stalled neighbors count as active traffic was unnecessary and is not implemented.

Against build 33, all eight 96-unit fixtures now finish all 96 move orders within the 300-second horizon (previously five finished 96 and three finished 95). Every actor still crosses in the intended direction. In the 24-case 120-second matrix, only the 270-degree one-cell 24-per-side result changes: 47 arrivals become 48. No crossing or arrival count regresses. In the asymmetric matrix, the original one-cell fixture improves from 54 to 56 arrivals, and the original/270-degree three-cell fixtures improve from 55 to 56; other counts stay the same.

Seven of eight mixed-army frontline fixtures retain identical checksums. The 24-per-side basic army through the three-cell passage changes: all 48 units now participate, versus 47; combat finishes at tick 4872 rather than 5040. The winning side and survivor counts are unchanged, but remaining health and attacks differ. This is an intentional consequence of movement repair, not identical simulation behavior or proof that all combat scenarios are solved.

Eight added regression cases cover all rotations with occupied intermediate endpoints and with an occupied final endpoint. They validate the repaired route, preserve stationary guards, check swept clearance, complete the original move intention and compare save/replay checksums for 400 ticks. All 622 tests and the production build pass. The simulation identifier advances to `declarative-sim-34`.

Evidence: `tmp/traffic/2026-09-10-corridor-rejoin-{matrix,long,asymmetric,frontline}.jsonl`, detailed matrix/long reports, and `2026-09-10-corridor-rejoin-probe.jsonl`. The disposable Combat Lab includes **Occupied corridor waypoint**. These results remove the demonstrated permanent destination stalls; passage throughput, normal-size army feel and command/animation coherence still require the broader active goal's checks.

## Mixed speeds and packed final approach — build 36

`scripts/bench/mixed-movement.ts` adds 12 real-declaration transit cases: 12/24 units mixing hunters, warriors, Marshals, archers and slower bombardiers; open ground or one-/three-cell passages; ordinary orders or a reversal after 100 ticks. All finish. Every unit translates on the first tick of the initial forward order; after reversal the slowest first translation ranges from 10 to 28 ticks, including finite turning and waiting for physical clearance. These are native movement timings, not click-to-visible latency measurements. Longest individual stationary interval while an order is active is 39 ticks in this matrix.

`combat-traffic.ts --mixed` applies the same composition to opposing friendly streams. At 120 seconds, six of eight rotation/width fixtures finish all 48 orders, one has 47 arrivals despite all units crossing, and the fourth one-cell orientation is still transporting units (34 arrivals). At 300 seconds that latter case finishes, but the 47-arrival case remains stuck. The diagnosis isolates one bombardier at `(145.497,121.437)`, targeting `(150,122)`, next to its stationary army. The 3×3 set of local rejoin candidates around its projected forward point is completely occupied; valid nearby anchors outside that square exist.

Build 36 retains the original nine candidates and only if none is usable checks the 16-cell outer ring. Candidates must still lie within four cells of the unit and satisfy terrain, reservation, body and onward-terrain checks. Only the chosen endpoint gets the existing bounded local path search (256 nodes); there is no expanded detour radius or unbounded search. Moving-stream exclusions, ownership, original orders, collision, finite turning and interruption behavior remain intact. This fallback does not attempt every candidate if the selected endpoint's local path search fails; that broader issue remains a separate possible limitation.

The failed mixed fixture now completes all 48 orders by the 120-second checkpoint. The other seven mixed-counterflow checksums are identical. All 12 ordinary mixed movement checksums and all eight mixed-army combat checksums are identical. Of the existing 24 warrior-counterflow fixtures, 23 retain identical checksums; the 180-degree, one-cell, 24-per-side fixture improves from 47 to 48 arrivals with the same complete crossings. No checked fixture regresses in arrival count. The fourth one-cell mixed orientation still takes longer than 120 seconds to transport everyone, so this does not establish acceptable throughput for all crowds.

Four rotated native regressions reconstruct the packed final approach, require arrival, preserve parked guards, check swept terrain/body collision and speed bounds, and compare save-restored replay checksums on every tick. The Combat Lab includes **Packed army final approach** using the actual bombardier model. Reproducible output is under `tmp/traffic/2026-09-10-{mixed-ordinary,mixed-baseline,mixed-long-baseline,mixed-repaired,anchor-traffic,anchor-frontline}.jsonl`. The simulation build is `declarative-sim-36`; old native saves/replays must obey the existing build compatibility rules.

Validation: all 638 tests across 154 files pass, as do the production build and whitespace check. In the live **Packed army final approach** preview, the bombardier visibly escaped its initial blocked position and finished idle at the destination beside the unchanged parked army. The preview was left paused. Visual crowd spacing and slow mixed counterflow still warrant further work; completion of this fixture does not establish the full combat-feel goal.

## Recovery timing experiments and turn-aware waiting — build 37

The mixed-counterflow delay was investigated with three bounded experiments, all now removed:

- Reducing the global stall threshold from 200 to 40 ticks gets all eight 48-unit mixed fixtures home by 120 seconds. However, the 90-degree, three-cell, 96-unit warrior fixture loses 22 arrivals at that checkpoint. Earlier recovery can disrupt traffic still resolving normally.
- Restricting the 40-tick threshold to a confirmed cycle whose members are trapped laterally by terrain preserves wider passages and the smaller mixed improvement. But three of four 96-unit one-cell streams lose 3, 9 or 10 arrivals at 120 seconds. All eight long 96-unit fixtures still finish by 300 seconds; eventual completion does not establish better throughput.
- Extending those constrained maneuvers' waiting deadline to 240 ticks does not eliminate the tradeoff. It remains experimental evidence only; native waiting deadlines are still bounded to 120 ticks, including save validation.

Reports are `tmp/traffic/2026-09-10-{yield40-mixed,yield40-warriors,early-neck-mixed,early-neck-warriors,early-neck-long,early-neck-long-wait}.jsonl`. CPU maxima from overlapping benchmark runs include contention and JIT overhead and should not be read as a game performance comparison.

The investigation exposed a separate correctness issue: dependency construction predicted a blocked movement segment even if that actor still needed to turn before it could attempt the segment. Build 37 excludes outgoing waiting edges until the unit can face its next actual waypoint within the current tick's declared turn allowance, matching `GameContext.move` (including its one-degree tolerance). This prevents a rotating actor from closing a fictitious directed waiting cycle. It neither skips the turn nor speeds it up. The 200-tick recovery threshold, pocket timeout, feasibility checks and ordinary traffic policies remain unchanged.

Four rotated tests verify that a 180° or 20° prerequisite turn cannot close the waiting cycle, while an 18° next-tick turn at the default turn rate can. The existing yielding tests continue to cover collision, interruption, saved native recovery and replay. All 24 warrior-counterflow and eight mixed-counterflow benchmark checksums remain identical to build 36, as do all eight mixed-army combat checksums. This is a correctness guard for untested order/turn combinations, not a claimed throughput gain on the existing fixtures. The Combat Lab includes **Turning actor at a narrow gap**. The native build identifier is `declarative-sim-37`.

The slow mixed stream remains unresolved. Future throughput work should measure how long individual dependency cycles persist and whether completed yielding maneuvers actually clear the passage, rather than adopting a shorter global timer on the strength of the smaller cases.

Validation: all 642 tests across 154 files and the production build pass. The live turning-gap fixture shows recovery inactive while the rear unit starts its 180-degree turn (tick 201), active after the facing prerequisite completes (tick 215), and all three original orders eventually finished. It was left paused. Manual pause/step timings are not latency measurements. The experiment did not improve the existing slow counterflow benchmark, and that limitation remains open.

## Measuring route churn instead of only eventual arrivals

`combat-traffic.ts --report=...` now includes a read-only `TrafficRecoveryTrace`. It samples unit movement and yielding state each tick, recording travel distance, final displacement, stationary samples, longest stationary interval, and individual yielding episodes with their actor, leader, escape pocket, start/deadline/reached/end ticks and leader displacement. Episode end reasons describe observable state: `ended-before-pocket`, `deadline`, `leader-finished`, `leader-cleared`, `other`, or ongoing. They are not fabricated internal events or proof of a particular collision cause. No profiling state enters native saves, commands or checksums. CPU timings with reporting include diagnostic overhead.

The 270-degree, one-cell, 24-per-side mixed scenario completes by tick 6000 (150 seconds). Over that run the 48 units accumulate **8,835.29 cells of travel**. The longest-travel actor moves **315.32 cells**, despite a cross-map order requiring only a few dozen cells of displacement. There is only **one coordinated-yield episode**: it starts at tick 809, reaches its pocket at 843 and ends at its deadline of 929. The leader advances 1.66 cells over the episode. Repeated coordinated-yield episodes therefore do not explain this fixture's long completion time. Route churn and ordinary traffic stalls need separate attention.

Two movement prototypes were tested and removed:

- Removing the older one-cell sidestep entirely causes severe jams. The first three mixed fixtures complete only 4, 4 and 6 orders at tick 4800, compared with all 48 on the accepted build. The broader run was stopped once those regressions were established.
- Keeping that sidestep only when the bounded A* retry fails reduces summed travel in the slow mixed case to **5,202.12 cells** (about 41% less), and all eight mixed cases finish by tick 4800. But the warrior matrix regresses: the 90-degree three-cell 96-unit case loses 23 arrivals, and the zero-degree three-cell 16-unit case loses two arrivals. Successful coarse routing alone is not sufficient evidence that the sidestep is dispensable under crowd pressure.

Neither prototype is enabled. `GameContext` is byte-identical to the accepted build-37 version; the simulation identifier remains 37. The retained deliverable is the reproducible diagnostic, which lets future movement changes be assessed for excess travel and recovery effectiveness as well as arrival count. The next investigation should identify repeated route/side-step choices around the same local obstacle and preserve useful local progress without simply removing the escape behavior.

Evidence is under `tmp/traffic/2026-09-10-{recovery-baseline,no-aside-rejected,trusted-route-mixed-rejected,trusted-route-warriors-rejected,trusted-route-trace-rejected}` with `.json` or `.jsonl` as appropriate. Running the 6000-tick fixture with and without reporting produces the identical native checksum **2554344414**. A regression test also records a complete three-unit yielding fixture and compares native checksums against an uninstrumented save-restored replay on every tick.

Validation: all 643 tests across 154 files pass, along with typechecking and the whitespace check. No gameplay change was retained in this diagnostic pass; dense counterflow remains unresolved.

## Sidestep loop experiment — rejected after the long run

An unfinished follow-up removed repeated sidestep anchors and extended narrow-gap recognition to cardinal terrain sides. It reduced the slow mixed fixture's summed travel from 8,835.29 to 5,766.65 cells and completed all eight 48-unit mixed crossings by tick 4800. However, the 96-unit matrix traded substantial progress between orientations. At tick 12000 the zero-degree and 90-degree one-cell cases still had only 92 and 95 arrivals, where the accepted build completed all 96. The experiment was reverted before the controls audit; native build 37 is retained. The corrected four-rotation small fixture alone was insufficient acceptance evidence.

Prototype source and fixtures are preserved under `tmp/traffic/loop-erasure-*-rejected.ts` and `staggered-mouth-fixture-rejected.txt` for investigation, outside the active game and test suite. This is an unresolved movement issue, not a controls change.

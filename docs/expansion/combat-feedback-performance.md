# Combat feedback and performance captures

This pass adds visual impact feedback, layered spell authoring, silent ant articulation and tools for identifying rendering or simulation stalls. It does not add audio.

## Confirmed impact feedback

A short directional chip/spark burst accompanies an observed loss of HP. Attacking without dealing damage does not emit a hit. The renderer uses only observed entities, so hidden attackers are not revealed. The shared pool holds at most 64 bursts / 512 particles and removes bursts when their target leaves observation or their short lifetime expires. These particles have no collision or gameplay effect.

## Talking ants

Worker, Warrior, Archer, Marshal, Hunter and Bombardier have separate mandible bones. Text timing opens and closes the jaws, with punctuation and spaces creating pauses. Speech runs after the body animation mixer and does not replace locomotion, attacks or casting. Death closes the jaws. Each clone controls its own bones.

Use the optional final `actorTag` in `mission.say` to name the speaker. Heartwood Vault's lines now identify Marshal and Scout explicitly. Existing 2D portrait images remain static; the animation is on the actual 3D unit. The character studio has a **Speaking** checkbox for inspection. See [mission scripting](/development/mission-scripting) and the asset handoff at `art/sources/characters/SPEECH-RIG-HANDOFF.md`.

## Capture a slowdown

1. Open **Debug** while the slowdown is visible. Keep the same map, camera, viewport and graphics settings when comparing changes.
2. Choose **Capture 10 seconds**. Play through the problematic situation. Wait for **Capture complete**.
3. Use **Copy report** to copy the finished capture as JSON. **Set baseline** stores that capture for comparison with the next one. **Download trace** exports measured CPU spans and sampled simulation, AI, frame-interval and GPU counters as trace-event JSON.
4. Repeat after changing one variable. Compare GPU frame/atmosphere, CPU scopes and frame intervals separately. Negative baseline percentages mean less time.

The overlay reports the fraction of presented frame intervals over the 120 Hz budget, mean, p95 and p99 latency, a recent-frame graph, and counters for render calls, geometry, effects and simulation work. Captures retain up to 4,096 samples per scope and the 40 worst frames exceeding the 8.33 ms budget. GPU frame, scene, atmosphere and portrait queries rotate without nesting and only run while profiling is enabled. Unsupported GPU timer extensions leave GPU timings unavailable rather than estimating them from CPU submission time.

CPU scopes overlap and must not be added together. GPU timings arrive asynchronously. A spike record contains the latest sampled scopes, not a causal per-frame trace. The downloadable trace records CPU scopes at their actual start/duration, while simulation/AI/GPU counters are timestamped when delivered. These counters are not execution spans; GPU results in particular arrive late. Trace storage is capped at 64,000 events, with any dropped events reported in the download button and file metadata. Starting another capture replaces the previous trace. Counters in the summary report are the last frame, not capture averages. Close other GPU-heavy tools before comparisons, and repeat runs before making a performance claim.

## Changes made from profiling

- The spell studio freezes its covered map renderer and stops its own render loop when the document is hidden.
- Scenery lights cache unchanged declarations and camera selection instead of rebuilding a JSON signature every frame. Terrain changes explicitly invalidate their sampling.
- Spell particles share geometry/masks, instance draws and cached terrain samples. Global budgets bound expensive visual combinations.
- The fog marcher uses a deterministic 32 KiB 3D noise lattice instead of recomputing eight hashes for each interpolated noise lookup. Fog resolution and march-step counts were retained; noise detail changes slightly because the texture repeats.
- Observation maintains overlapping per-sensor coverage and updates only changed sight edges. Trees publish immutable projections refreshed by harvest/regrowth receipts. Resource gathering counts and work jobs are indexed once per update; units remain fully projected. Explicit tooling edits, replacement and restore rebuild derived data. Fog memory retains the last witnessed state rather than leaking offscreen resource changes.
- Visibility footprints use an LRU cache bounded by both entry count and 4 MiB of cell IDs. Existing terrain occlusion rules remain intact.
- Worker candidate searches share body blockers and a bounded proof of a closed starting pocket. A boxed-in worker no longer repeats a map search for hundreds of tree candidates.
- A* reuses typed heap storage, retains integer costs and stable ties, and caches static legal edges separately from moving bodies. Building/resource changes invalidate neighboring edges. The subsequent sector pass rebuilds affected terrain clusters and their boundary links instead of flooding the complete cell grid.
- Combat planning shares target terrain checks and uses spatial buckets for occupancy. Reservations remain per actor and no cache survives movement.
- AI intent is tracked per actor, independent of squad membership. A new reinforcement or stalled unit receives an order without resetting every progressing member's path. Continuing high-priority orders still reserve the actor for that decision beat.
- Simulation telemetry separates worker assignment, queued orders, inventory planning, combat planning, idle movement and actual movement. Paused cinematics clear previous tick timings rather than displaying stale work.
- Profiling uses fixed-size timing rings instead of shifting arrays. GPU timer polling avoids GL state queries when disabled and idle. Reference-stage measurements clear the previous mode's samples after warm-up.

## Measurement and limits

The fixed Heartwood Vault gallery comparison used camera x=130, z=144, zoom=1.4, a 2560×1440 drawing buffer, full rendering scale and soft shadows. Heavy Blender/test jobs were finished before the comparison. Average GPU frame time changed from **8.84 ms to 6.74 ms**; atmosphere from **7.12 ms to 5.49 ms**. CPU frame means were **2.62 ms and 2.36 ms**.

This is a fixed-scene diagnostic, not a battle FPS result. GPU-frame p95 was **10.18 ms before and 10.76 ms after**. Tail latency did not improve in that run. Browser/GPU scheduling remained variable, and the half-scale filtered-shadow case was essentially unchanged. The optimization reduces measured average cost, but does not establish that every slowdown has been resolved. Large battles should be captured separately using the new tooling.

The target is **8.33 ms for the whole frame at 120 Hz**, including headroom for slower machines. A subsystem taking 2 ms is already a quarter of that budget. Average improvements alone do not meet this target; p95/p99, worst ticks, loading events and command latency must also be measured. Simulation ticks and rendered frames have different cadences, so simulation timings are reported separately rather than relabelled as FPS.

The deterministic Four Crowns baseline used seed 731942, four AI players, 5,759 trees and 12,000 ticks (five simulated minutes), ending with 246 living units. It measured **7.42 ms** mean simulation time and **2.99 ms** mean observer projection, with **11.98 ms p95**, **24.02 ms p99**, and **78.97 ms maximum** simulation time. After incremental observation, worker search batching, planning indexes and local connectivity updates, the same match measured **4.04 ms** simulation and **0.81 ms** observer projection; simulation p95 was **6.70 ms**, p99 **19.44 ms**, maximum **81.70 ms**. Both runs ended at checksum **4037915886**. The identical result establishes behavioral equivalence for this scenario, not universal correctness. The worse maximum also makes clear that the frame-budget problem was not yet solved.

A saved late-match checkpoint then isolated the remaining route-heavy section. Adding static edge caching reduced the measured mean from **6.07 ms to 4.26 ms**, p95 **10.97 to 7.38 ms**, and p99 **34.29 to 23.99 ms** over 800 ticks; both ended at checksum **3455796132**. The earlier run included CPU profiling overhead, so this is diagnostic evidence, not a clean percentage-speedup claim.

The final AI-continuity run measured **4.84 ms** mean simulation time and **0.96 ms** mean observer projection. Simulation p95 was **8.69 ms**, p99 **19.79 ms**, maximum **77.71 ms**; observation update averaged **0.99 ms**, with p99 **3.41 ms**. Two runs reproduced checksum **2082484745** and 250 living units. One run contained an unexplained 28.6-second wall-clock stall and is retained as an anomalous raw artifact, not used for the reported averages. These tails are still outside the target. The AI continuity fix intentionally changes command traffic and therefore the subsequent battle. Its results must be compared with repeat runs of the new behavior, not presented as an identical-workload speedup. The subsequent [spatial sector pass](/development/expansion/spatial-sectors) implements hierarchical routing and local sight/resource candidate queries; its repeat runs and scaling measurements are documented separately. No claim is made that the game meets the complete 8.33 ms budget or that this hardware represents slower machines.

Reproduce CPU measurements with `npm run bench:sim -- --map four-crowns --ticks 12000 --output /tmp/utc-simulation.json`; add `--trace-navigation`, `--trace-routes` or `--trace-slow` to attribute expensive searches, per-unit route bursts and slow ticks. `--checkpoint` and `--resume` isolate repeatable late-match cases. Raw runs and profiles for this pass are under `tmp/combat-polish/` in the development checkout.

## Acceptance checks

Expanded regression: **899 tests across 214 files**, verified by the full run plus focused rechecks after updating the old cache-forcing test and adding the frame-budget assertion. **Five Building Studio tests** passed earlier. Typecheck/game build and generated wiki build passed. Browser checks covered layer duplication/removal, draft retention, source save validation, effect framing, Rally activation/mana consumption, profiler capture completion, baseline comparison and trace capture readiness. Trace-event contents and bounded storage passed automated tests; the in-app browser did not expose a verifiable download event, so end-to-end file download remains unverified. No game console errors were reported in the checked mission session. Saved-source validation and actual GLB checks cover all six published character variants; the asset handoff records per-file metrics and visual-check limits.

The production bundler still warns about large chunks. This pass does not claim to solve bundle size or every large-battle frame spike.

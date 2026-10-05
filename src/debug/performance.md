# Performance debug

Debug · Ctrl+F3 toggles the persistent opt-in overlay in game/editor. Copy report
exports rolling mean/p95/max milliseconds and last-frame counters. GPU timing
uses asynchronous EXT_disjoint_timer_query_webgl2 queries, bounded to four
pending queries; unsupported browsers are labeled. CPU scopes overlap.
Rebuild events have their own sample history and are not per-frame averages.

In a local match, enable **Show ground navmesh (cyan)** beside **Show unit
paths** and **Show walkable / blocked cells**. Cyan edges show the clearance mesh
used for ordinary-size ground units' global routes. Owner-coloured lines show
the smoothed routes units actually follow, including local grid fallbacks.
Bridge maps, flying/differently sized bodies and traffic-constrained requests
still use their specialized solvers. The overlay shows only the default radius.

Mesh construction runs in a dedicated debug worker. Input is copied only when
static collision changes; queued revisions coalesce, and unchanged clearance
tiles reuse their triangulation. Input/mask scanning and display-buffer rebuilds
are still full-snapshot operations, separate from production incremental navigation.
Closing debug or disabling the overlay terminates the worker and disposes GPU
buffers. No overlay work runs in ordinary matches. The panel/report includes mesh
radius, polygon/source-triangle counts, build time, rebuilt tiles and collision revision.

Production routing prepares the default mesh during load. Building/tree edits
update a shared collision array at changed cells and lazily rebuild affected
32-cell tiles plus their footprint halo. Query polygons retain stable tile/local
IDs; only affected border links change. Connectivity is recomputed on the much
smaller tile-region graph. Detail scopes separate **Collision contours**,
**Polygon links and connectivity**, **Mesh corridor search** and **Mesh route
validation**. Match counters expose accepted mesh routes, fallbacks, expanded
polygons and tiles built (including load). Route acceptance validates the real
body sweep, traced grid steps and any caller cost bound; the grid solver remains
the correctness fallback. Collision and yield rules are unchanged. Long traffic
queries use a modest search bias for sparse traffic and dense convoys. Crossing
orders from the same controller, nearby opposing traffic from other controllers,
and short queries retain exact grid search. Distant unrelated orders cannot disable
convoy routing; all bodies remain collision blockers. The weighted frontier reopens improved
cells and obeys the original cost limit. Reports expose **Biased long traffic
searches (match)** and **Traffic terrain budget reuse (match)**. Cached terrain
limits never cache moving blockers; static/position/profile changes invalidate
those limits. Dirty mesh tiles retain geometry and links when their clearance
mask is unchanged. Small edits retain unchanged clearance-mask samples within
each tile too: changed-cell receipts bound the affected area. Without a complete
receipt, for broad edits, or for large clearance radii, masks rebuild in full.

Routing merges triangles into deterministic convex polygons with at most six
vertices, within each clearance tile. It retains collinear edge subdivisions so
neighboring portals stay connected; obstacle boundaries, height cliffs and tile
seams are not simplified. The debug worker uses the same polygon generator and
shows these routing edges, with unchanged tiles retaining their merged geometry.
Merging uses canonical numeric vertex/edge IDs instead of repeated coordinate
strings; its geometry and merge order are unchanged.
Different corridors may change movement/combat outcomes; verify route clearance,
quality and cold/warm lockstep agreement, not equality to obsolete trajectories.

Local steering reuses exact terrain-only quarter-cell sweep results in sparse
8-cell tiles. Each body radius retains at most 128 tiles (512 KiB of typed
buffers), with at most four radius profiles. Nearby occupancy edits discard the
affected tiles plus the body footprint halo; explicit terrain rebuilds clear
them. Arbitrary endpoints, longer rays, bridge layers and airborne movement
retain their existing checks. Moving bodies and reservations are always live.
`Local terrain and reservation sweep` separates this work from ordinary route
sweeps; `Local body sweep` measures the nearby-body snapshot checks. Body-first
rejection avoids terrain work for already-obstructed local detour candidates.
These caches are derived, unsaved, and must produce identical warm/cold paths.

Terrain sight skips groups of quarter-cell ray samples only when conservative
four-cell height bounds prove the entire group clear. Remaining groups keep the
original sample positions and interpolation. Bounds cost 32 KiB on a 512 map;
visibility rules and update frequency are unchanged.

Match captures also expose opt-in hierarchical simulation timings under
`Detail inclusive · …` and `Detail self · …`, through the same debug report and
`game_performance` MCP. Inclusive parents contain their children; add **self**
times only. Known idle scopes emit zero each tick, so intermittent AI decisions
and checksum work are not accidentally reported as per-tick event averages.
`Worker · tick total` includes lockstep, world tick, bookkeeping and periodic
network hashing. Projection, encode, transport and main-thread decode remain
separate costs. Detailed instrumentation adds overhead; use an unprofiled run
of `scripts/bench/match-budget.ts` for budget comparisons.

For a live match, `game_performance({action:'capture',mode:'budget'})` keeps core
worker/frame timings but disables hierarchical simulation instrumentation, trace
allocation and profiler display updates for ten seconds. `mode:'details'` (the
default) retains the diagnostic hierarchy and trace. Each report records its
sampling mode; the Detailed simulation timings checkbox also controls ordinary
rolling captures. Changing modes clears pending worker samples first.
`HUD · fog state`, `HUD · settlement controls`, `HUD · mission controls`,
`HUD · selection overlays` and `HUD · hover raycast` break down HUD input/data
work. `Worker · snapshot postMessage CPU` measures the worker's actual send call
and arrives with the next snapshot; `Worker snapshot receive (CPU)` includes
decode, frame hooks and acknowledgement. Do not add decode again to that parent.
`Worker snapshot delivery` is elapsed latency, not CPU. Native deserialization
before the receive callback is still outside these JS scopes, so they alone do
not establish complete cross-thread CPU acceptance.

Minimap fog retains a pixel buffer and consumes bounded local receipts from
decoded fog patches. Decoder arrays mutate in place: use explicit cursors from
`shared/snapshots/decodedBytes`, never buffer identity, to determine changes.
Receipts reuse packed wire indices without another scan/copy or protocol field.
New/replaced/untracked buffers and missed history fall back to full comparison;
unchanged pixels do not upload, changed pixels upload their bounding rectangle.
No canvas resize occurs unless the raster dimensions change.

For lighter slow-tick attribution, use `bench:match -- --budget-tail …`.
It retains the slowest 1% of the **same accounted-total ticks**, copying the
existing settlement stage and AI timers only when a tick enters that bounded
set. `slowTicks[].stages` and `.ai` do not enable hierarchical instrumentation;
`details` remains false unless separately requested. Stage parents overlap their
children: do not sum them. This is still diagnostic capture, not final budget
acceptance, because retaining those records can influence later allocation/GC.

`--thread-cpu` additionally samples Node's `process.threadCpuUsage` around the
same measured span. It reports `Accounted thread CPU (diagnostic)` and
`Off-thread time (diagnostic)`, plus `threadCpuMs` / `offCpuMs` on retained slow
ticks. Use this to investigate host contention; wall-clock budget accounting
stays unchanged. It requires a Node runtime exposing `threadCpuUsage`, adds
counter-call overhead, and excludes work on other threads. Neither its CPU
percentile nor wall-minus-thread time establishes browser budget acceptance or
identifies why CPU throughput changed.

`--allocation-profile /tmp/match-allocations.json` records sampled allocations
including already-collected objects, after the 200-tick warm-up. It covers the
runtime/codecs and benchmark bookkeeping; estimates are diagnostic, not exact
allocator-byte counts or budget measurements. `--gc-report` records GC pauses
and overlaps them with the actual timed intervals of the slowest 1% of ticks.
These pause times are already inside total time—never add them again. Neither
option forces GC or changes simulation decisions. Use an ordinary unprofiled
run afterward for timing, and actual browser transport/HUD for full acceptance.

Mutation-capable status passes use `GameContext.entitySnapshot()` for stable
membership with live entity fields. Membership copies survive unchanged ticks;
create/remove/reindex invalidate them. Direct bulk edits must reindex, as with
other context indexes. Observation privately caches footprint cell arrays by
entity identity, definition, position, rotation and floor. These are derived
caches, absent from saves; they never cache sight eligibility or visibility.

With `--details`, that benchmark also keeps complete profiles for the slowest 1%
of measured ticks (`slowTicks`) and their mean self/inclusive contributions
(`tailProfile`). These describe the *same* slow frames, not a sum of independently
computed category percentiles. The opt-in runtime/MCP scopes now break down
autocast actor construction, visibility and allied mana, harvest progression,
deployment, regrowth, static occupancy, sector preparation and command kinds.
`Resource regrowth` separates timer scanning/maturation from other economy work;
`Regrowth clearance` is its physical-placement child. Pending timers use the
context's derived resource index: schedule/cancel via `setRegrowth`, notify other
resource mutations with `resourceChanged`, and rebuild indexes after bulk state
replacement. `Sight masks / Terrain sight footprint` separates terrain LOS/cache
work from coverage merging and fog publication. Both use the same opt-in profiler.
Player-view construction separates `Actor projection`, `Known scenery projection`,
`Colony summaries` and `Entity ordering`. These scopes apply to AI observations as
well as human views, so inspect their parent scope before comparing costs.
Receipt-driven static edits reconcile coverage only for changed footprints;
unchanged scenery uses visibility-mask deltas. Bulk edits retain the full refresh.
Static occupancy additions have their own scope: normal building placement
updates only the new footprint, then invalidates dependent navigation cells and
sectors. Global terrain/state edits still use the explicit full rebuild.
Autocast includes a visibility-candidate query before actor materialization.
Neutral candidates reject their existing sight-radius limit before LOS; player
candidates retain shared vision, including distant allies. Stat resolution is
reused only within a single actor/caster/source record, never across effects.
Movement scopes separate terrain/reservation sweeps, physical body sweeps, free
position queries, detour/yield searches and traffic request discovery. Combat
planning separates target indexing, visibility and weapon terrain clearance.
`scripts/bench/match-budget.ts --trace-routes` retains the 32 slowest path queries
with tick, actor, start/goal, dynamic blocker count, cost bound, result length,
expanded nodes and fallback count. Like `--details`, this is diagnostic overhead
and must be disabled for budget acceptance.

The Heartroot four-player CPU target is **3 ms p99**, not a mean. Routine network
checkpoints target **0.1 ms per check**: existing counters/economy totals plus at
most 32 actors read directly from the maintained body index. `sim/game/checkpoint.ts`
contains the exact coverage. Fog, forest payloads and AI internals are deliberately
omitted; many internal differences will only surface through sampled gameplay
outcomes, and some may never be detected. No work is relocated into other systems.
`World.checksum('full')` remains an explicit expensive correctness audit, absent
from the routine worker path. Neither mode implements resync or anti-cheat.

Audit every full rebuild by its trigger, affected entities/cells/observers and
downstream dependencies. Local changes should do local work; prove equivalence
against a full refresh, and explicitly justify any remaining global invalidation.
Include dependent route connectivity, not just geographical proximity. Shifting
unchanged work to another subsystem does not satisfy the optimization objective.

For unexplained self time, `scripts/bench/match-budget.ts --cpu-profile
/tmp/match.cpuprofile` records a Chrome/V8 CPU profile after map generation and
save restoration, covering the live benchmark loop. Open it in DevTools' profiler
to inspect hot functions and GC activity. This is diagnostic instrumentation;
run again without sampling or `--details` for budget measurements. Route traces
now report mesh expansions and rebuilt tiles separately from grid expansions,
so a costly mesh update does not misleadingly appear as a zero-work query.
`bench:match --verify-projection` checks each decoded worker frame against its
source. `--verify-restore` reconstructs an independent runtime halfway through
the run, compares full audits thereafter and compares final snapshots. These are
correctness modes, not budget measurements: comparisons and the second runtime
can affect later allocation/GC even though they are outside the timing span.
In a shared workspace, pass `--save-content /tmp/match-content.json` when
creating a benchmark checkpoint. Subsequent budget, restore and four-peer runs
accept `--content /tmp/match-content.json`; the registry validates its fingerprint
before use. This captures definitions for reproducible experiments only. It does
not change game publication, relax save validation, or freeze engine code/maps.
Do not compare timing runs from different content fingerprints as matched pairs.

Use `npm run bench:match -- --four-peer --checkpoint <local-save> --ticks 1200
--output <report>` for the four-replica lockstep/restore verifier. It uses the same
bundled production modules and project Node executable as the budget benchmark;
`--resume` on this verifier instead takes a raw World snapshot. Do not bypass
the save identity guard if content or map versions differ. This is a correctness
run, not a CPU budget.

For source-transform experiments use `npm run bench:match -- --vite-config <path>
…`; this preserves the same project Node executable, bundle options and cleanup
as the production benchmark. The runner prints its executable/version. Do not
compare variants launched with a different shell Node version.
The `Snapshot exchange` metric directly measures encode + clone + decode;
its percentile must not be reconstructed by adding component percentiles.

Traffic discovery has candidate/index/dependency/cycle/priority/escape scopes;
resolved unit stats are attributed to their callers only when profiling is on.

Frame interval measures the app loop (including the existing 40 Hz unfocused
fallback), not render submission cadence. GPU time covers the entire render,
including recursive water reflection renders. Three.js info auto-reset is
explicitly disabled and reset once per presented frame so reflections cannot
silently reset triangle/draw-call accounting. Category counts cover color
passes; total counters also include shadow passes. Read timings rather than
comparing old incomplete counters to the new all-pass total.

`scripts/bench/four-peer-match.ts` is an offline correctness harness. It compares
full-state hashes at every 100-tick checkpoint and deep-compares final snapshots,
including a synthetic transport stall. This deliberately expensive audit does
not change the live game's lightweight checksum and is not a CPU-budget run.

Resolution settings are available in both main-menu and in-game Settings:
50%, 75%, 100% of physical device-pixel resolution. The scale is persistent,
applies immediately, follows resize, and only affects WebGL, not DOM UI.

Optimization pass:
- Preserve scenery array identity across economy revisions unless actual
  resource removal changes stamps: avoids repeated forest rebatching, buffer
  uploads and contact-mask regeneration.
- Spatial prop/cover batches enable camera and shadow frustum culling.
- Pine LODs are generated by scripts/ant-colony/tree-lod.mjs from originals,
  retaining vertex/material data with a 1.5% simplification error target.
  Regenerate these after changing original pine exports. Nearby geometry is
  retained; switching includes hysteresis.
- Forest green is now a terrain moss texture with sparse low leaf geometry;
  distant leaves retain their outline while omitting the center crease.
- Soil fissures use the authored texture instead of a per-pixel Voronoi loop.
- Wet-cell bounds cull water/reflections when outside the view. Stationary
  reflections update at 15 Hz; camera changes update immediately.
- Sun shadow coverage scales with gameplay zoom. Hidden tabs simulate but
  skip GPU presentation. Stop idle agent preview pages between benchmarks.

Validation: production build and 8 targeted graphics/map/lockstep tests pass.
Retina browser check: 1280x720 CSS at DPR2 offers 2560x1440 native and
1280x720 at 50%; the half-resolution buffer persisted after reload.
Reference screenshot visually checked: tmp/ant-colony/optimized-final-compare.png.

Latest isolated uncapped benchmark (vsync disabled only in a separate temporary
browser, never in the user's browser), Mosswater initial view, 1681x850 DPR1:
frame interval mean 4.55 ms (~220 FPS), p95 5.70 ms; CPU mean 4.24 ms,
p95 5.40 ms; GPU mean 5.32 ms, p95 6.50 ms. Source report:
tmp/ant-colony/profile-uncapped.json. Actual display presentation depends on
refresh rate/resolution and needs verification in the user's game window.
The benchmark is not a guarantee for every map, camera or future army size.

Deep navigation/sight diagnosis uses the same opt-in hierarchy plus bounded
`SimulationProfiler.count` work records. Counts never contain entity IDs and are
not milliseconds. The worker sends `workCounters` separately from timing samples;
`game_performance` reports them in `values` as `Work since previous snapshot · …`.
These are totals over ticks since the prior published snapshot, not rates. They
clear on profiling mode changes and restore. Disabled counters read no clock and
never affect simulation decisions. Benchmark `work` includes total, per-tick mean,
maximum and active ticks; `slowTicks[].work` belongs to the same retained tick.

Sight scopes distinguish sensor eligibility/indexing, unchanged contributions,
changed-position/radius/height causes, footprint cache hits/misses/evictions,
terrain candidates/rays/coarse bounds/fine sample groups, coverage span differences,
actual fog transitions, immutable buffer copies, publication and scenery memory.
A cache miss is not necessarily a ray march: clear shelves use row spans.
Navigation distinguishes reservation creation, obstruction classification, physical
body checks, local grid expansion, exhausted versus capped local searches, traffic
recovery, target candidates/visibility, attack positions and global route search.
Repeated route tracing adds a bounded per-actor census; identical actor/destination/
static revision does not imply identical moving blockers or safe route reuse.

With both `--details --gc-report`, timestamped disjoint coarse stages expose
`gc.stages` and `gc.slowTicks[].stages`: elapsed time and overlapping GC pause time.
These timestamps identify where GC paused execution, not who allocated the garbage.
Other stages may account for remaining overlap. GC time is already included in
elapsed time; do not add it again. Fine timing scopes, counters, tracing and their
worker payloads materially perturb the diagnostic run. Compare only an ordinary
unprofiled run to the budget, and do not treat diagnostic category percentages as
an exact decomposition of unprofiled p99.

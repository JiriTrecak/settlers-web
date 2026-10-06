# Performance and match loading

> Earlier measurements below used retired Heartroot/Threewater maps and remain
> historical records. For current runs, use `--map amberwake-basin` (or
> `amberwake-frost`). The lockstep harness is now
> `scripts/bench/multiplayer-match.ts`; it creates one replica per player slot.
> `node scripts/bench/run-match-budget.mjs --multiplayer --map amberwake-basin`
> runs the current two-player benchmark; four-player maps still support four peers.


A smooth RTS needs predictable frame times as well as a high average frame rate.
A half-second work-assignment search is visible even when the surrounding frames
are fast. Measure simulation, presentation, and the GPU separately, and keep
commands and combat authoritative while optimizing them.

## Before the match starts

The match loading screen remains visible through these stages:

1. Construct the map-backed simulation and its spatial data.
2. Load gameplay models, map scenery, ground-cover geometry, GLTF texture
   dependencies, declared command icons, and fonts.
3. Initialize textures and compile the material variants against the actual game
   lights and fog shader. Render a small offscreen preparation pass to upload
   shared geometry and skinning buffers.
4. Present the initial battlefield, release the input barrier, and start the clock.

File progress counts completed requests in this load, including dependencies.
Synchronous preparation stages use a named indeterminate indicator: a file count
would not describe shader compilation or terrain generation honestly.

The loading screen yields to the browser between major stages. Required asset
failures stay on the screen with a return-to-menu action. Cancelling invalidates
the session generation, releases input listeners, and disposes its renderer.
Resources that finish loading after cancellation are also disposed. If shader
compilation is already polling GPU programs, final disposal waits for it to finish.

Network listeners bind before asynchronous loading. Loading clients withhold
simulation confirmations until ready, so the shared room cannot run ahead of a
slow peer. Hidden clients can finish preparation and subsequently keep lockstep
running without drawing a hidden battlefield.

Preloading prevents first-use downloads for the declared match assets. It does
not promise that browsers can never pause: garbage collection, GPU scheduling,
operating-system sleep, and newly created runtime instances still need measurement.

## Measuring a change

### Map editor

`editor_performance` exposes the same profiler through MCP, without rebuilding
the map or refreshing its hierarchy. `get` reads build stages, the last scene
presentation, rolling frame samples, and a completed capture. `capture` records
10 seconds; `census` attributes the next frame's draws to scene branches;
`trace` returns Chrome trace JSON. `reset` clears rolling timings and `enabled`
controls sampling. Capture and census enable sampling automatically. Build
stages are always recorded, even when frame sampling is disabled.

The **Opening** tab and MCP `startup` report retain the initial editor load's
map compilation, renderer creation, terrain upload, first scene submission,
remaining asset waits and final scene synchronization. These wall-clock phases
start at map preparation, excluding page/module download. Frame submission is
not GPU completion. Asset-group waits overlap; never sum them. A `superseded`
opening means the document changed before its assets finished loading.

While the opening screen covers the editor, both the regular frame loop and
renderer presentation are suspended. Scene synchronization and asset loading
continue; one complete frame is submitted before the loading screen closes.
`firstFrameMs` now measures that complete first submission, rather than the
earlier partially loaded scene. Tests cover asset waits, cancellation, compiler
failure and a replacement document during opening.

Terrain GPU arrays and foliage tinting share immutable decoded tile bytes with
a 64 MiB LRU and at most four concurrent fetch/decompression jobs. GPU textures
remain independently owned. Decoding preserves all RGBA channels; failed loads
can retry. In paired fresh-page production runs on Heartroot (browser HTTP cache
not cleared), remaining terrain readiness fell from 2.20 to 0.96 seconds.
Overall opening changed only from 4.43 to 4.32 seconds: units/buildings became the
last asset group at 2.09 seconds after first submission. A later profiled reload
took 4.22 seconds, with terrain readiness at 1.99 seconds: asynchronous completion
times also include delays from main-thread placement, batching and shader work,
not just network/decompression. First submission was 2.10–2.14 seconds. These are
startup samples, not a frame-rate claim or a cold network benchmark.

Canopy preview defaults **off in the map editor**. Enable **Preview canopy** in
**Environment** for a visual check, or use `editor_preview` with `canopy: true`.
This viewport switch skips canopy lighting and biome forest surroundings; it
does not edit biome definitions, saved maps, or game rendering.

For a repeatable CPU generation run:

```sh
BENCH_RUNS=6 npm run bench:authoring -- assets/maps/skirmish/heartroot-glade.utcmap
```

The first run warms caches; the report includes individual timings, generation
stages, object counts, and an output checksum. Heartroot's initial 512² baseline
was 41.8 seconds; brush-mask indexing, exact query pruning and allocation removal
reduced the warm mean to 2.09 seconds on the same machine (99,703 generated objects, unchanged
checksum). This measures CPU compilation, not downloads, scene construction, or
time to the first frame. The current full compile, including reusable placement
candidates, averaged 2.17 seconds after meadow and coverage optimizations and
2.06 seconds after conservative river-band rejection and bounded noise-lattice
reuse. The complete map checksum remains identical. Browser
figures must state camera and render resolution.

Two narrower benchmarks isolate placement and object edits:

```sh
node --expose-gc --import tsx scripts/bench/placement.ts
node --import tsx scripts/bench/editorEdits.ts assets/maps/skirmish/heartroot-glade.utcmap
```

The foliage ground-color bake has a separate real-map benchmark:

```sh
node node_modules/vite-node/dist/cli.mjs --config vitest.config.ts scripts/bench/groundTint.ts
```

It loads actual terrain tile pixels and reports a checksum of the entire output.
The first sample includes texture loading; subsequent samples reuse decoded tiles
but rebuild the tint raster. Heartroot's 545² raster with 52 paint layers dropped
from 223–241 ms to 11.1–11.6 ms with the exact same RGBA checksum. Sparse paint
visits and double-precision color lookup tables preserve layer order and every
rounding step. A production-browser drag measured an 8.4 ms bake; initial cold-JIT
baking took 32.5 ms. The `Foliage · ground tint bake (event)` scope measures CPU
work after textures resolve. It occurs asynchronously, outside the synchronous
editor commit timer, which still measured 238 ms in that capture.
Skipping prop height resampling for compiler-verified coverage-only updates then
reduced the grounding scope from 9.3 to 0.2 ms. The equivalent real oak drag
measured 227 ms synchronous release, 8.2 ms subsequent tint bake, and at most
0.6 ms per preview. New placements still sample the current height callback;
terrain and water changes continue to reground existing props.

Minimap scenery classification/sorting can also be isolated from Canvas drawing:

```sh
node --import tsx scripts/bench/minimapScenery.ts
```

The benchmark compares against the original filter/sort path, including a moved
tree on each run. Heartroot retains 15,977 markers from 100,072 props. Caching
classification by asset and retaining unchanged marker records reduced warm
indexing from 8–10 ms to roughly 2–4 ms. Render-relevant changes and the source
order of tied markers still invalidate the index; changes to non-marker foliage,
elevation and rotation alone do not. Value snapshots also detect in-place stamp
edits submitted in a new array. The corresponding production-editor oak drag
measured 4.7 ms indexing (previously 9.6 ms), 24.3 ms complete minimap update,
and 219 ms synchronous release. That release is still above the frame budget.

Repeated scatter passes reuse double-precision slope samples for the exact same
immutable carved grid and candidate list. Terrain replacement invalidates these
weakly owned samples; meadow bands, spacing and object exclusions are still
evaluated for every edit. Exclusion circles now use eight-metre buckets instead
of sixteen, followed by the unchanged exact distance test. The warm Heartroot
movement benchmark fell from 121 to 104 ms in the third sample; initial full
compilation remained about 2.1 seconds with the same complete map checksum.
The live oak drag measured 100 ms compilation and 204 ms synchronous release
(previously 113 and 219 ms). Preview remained at most 0.6 ms. Fresh-versus-reused
results also match on Oakfall Hollow, Crown Marsh Frost and Threewater Forest.

Compiler isolation and delivery can be measured without changing editor behavior:

```sh
node --import tsx scripts/bench/authoringWorker.ts
BENCH_TRANSPORT=delta node --import tsx scripts/bench/authoringWorker.ts
```

The browser editor now uses the actual compiler in a persistent worker for
committed authoring edits and terrain rebuilds. The Node harness remains useful
for isolating compilation and delivery from rendering. Initial opening now starts
the same worker during document replacement; attaching the renderer does not
restart it or duplicate the compile. A loading screen remains until compilation,
scene publication and required asset waits finish. Headless callers without Worker
retain synchronous compilation. Cancellation, failure, and replacing the document
during opening have regression coverage.

Sending Heartroot's full object graph and 70 MB of typed arrays by structured
clone produced 190–223 ms parent heartbeat gaps on edits. The production transport
in `src/shared/authoring/worker` sends changed records, numeric ordering handles
and transferable copies of new buffers. Compiler caches are never detached.
Unchanged receiver buffers, fields and paint retain identity; removed buffers are
released and resent if undo restores them. Chunked decoding yields between small
batches. Real-worker tests compare every delivered scene with synchronous output,
including height/water samplers, duplicate stamp IDs, undo, failure recovery and
queued requests. Benchmark heartbeat timings exclude correctness comparisons.

Authored edits compile an isolated history transaction and publish only after
success. Queued commands, map replacement, concurrent surface changes and MCP
readiness are covered by regression tests. Legacy terrain tools coalesce pending
surface builds and skip obsolete results; the displayed scene stays on its last
accepted surface until the new one is ready. Object drag previews remain immediate.

A live Heartroot oak release returned from the pointer handler in 0.3 ms, with
worker compilation of 121 ms, encoding of 88 ms and decoding of 21 ms (233 ms
round trip). Publication still took 125 ms; a repeat measured 114 ms. These are
separate costs: background compilation does not make publication hitch-free.
Subsequent paint-identity preservation avoids unnecessary terrain raster rebuilds,
but final publication scheduling and initial load remain optimization targets.

The transfer now preserves whole unchanged record collections, including resource
arrays and ownership maps, and skips reindexing identical immutable generated
arrays. A live Heartroot rotation/undo check reduced decode work from 18 ms to
about 3 ms; repeated worker round trips measured 98–114 ms (17–20 ms compilation,
70–86 ms encoding). Encoding still scans reconstructed stamp records. Unchanged
collection identity is tested alongside reordered, removed and restored records.

Placed grass compares its captured instance groups and terrain identity rather
than destroying every GLB/instance batch when the scenery array changes. It keeps
meshes, pending loads and wind state for unrelated prop edits; actual grass poses,
addition/removal and terrain replacements still rebuild. Warm Heartroot publication
measured 48–61 ms, with no terrain upload or grass tint bake. Compiling the initial
scene in the same worker removes the field-identity handoff: the first rotation
and undo measured 53 and 64 ms, versus the earlier 116 and 244 ms. Neither uploaded
terrain. This still exceeds a frame budget and is not a worst-case guarantee.

Known starting-unit/building models and the biome's terrain tile pixels now begin
loading while the worker compiles. They reuse the normal model cache and bounded
tile decoder; no scene instances or GPU texture arrays are created by prefetch.
Actual scene readiness still gates opening. Broad prefetch of every possible
scenery species was tested and removed because it increased contention without
reducing total opening time.

On production Heartroot 512², focused prefetch left units/buildings ready before
scene publication and reduced the subsequent terrain wait from 1.50 seconds to
185–205 ms. Two fresh-page runs finished in 4.34 and 4.56 seconds, with 0.85–0.91
seconds of scenery readiness and 0.54 seconds in final scene synchronization and
render submission. This is not an overall opening-speed win over the earlier
4.32-second worker-opening run; final rendering and placement remain targets.
The browser HTTP cache was not cleared, and optional frame profiling was disabled
for these two samples. No graphical settings or map content were reduced.

Placement compares normal hierarchy cloning, flattened static placement and
compact instance records (shared geometry/materials, folded exporter pivots).
Compact records keep one root and per-part matrices; mesh nodes are created lazily
for precise selection/camera raycasts. In three 10,000-sapling runs, creation took
19–20 ms versus 74–86 ms for flattened copies; transforms and bounds matched.
The edit benchmark
rotates and raises one object, verifies the result against a full compile, and
checks terrain-buffer reuse. Neither command writes the map. On the same machine,
10,000 sapling placements fell from about 220 ms to 74 ms; Heartroot's pose-only
compilation averaged 32 ms versus 2.92 seconds for a full compile. The live editor
measured 25 ms compilation plus 77 ms presentation for a rotation commit. Spatial
edits still regenerate vegetation exclusions; these numbers do not describe drag
release after moving an object or a layer brush stroke.

The edit benchmark also measures a spatial move and compares its complete result
against a fresh compilation. With unchanged layer definitions, moves reuse carved
terrain, water courses, mask indexes and terrain-valid placement candidates.
Clearance, minimum spacing and tree-dependent meadow bands are re-evaluated in
the original order. Heartroot's CPU movement compile fell from 1.74 seconds to
0.19 seconds after exact nearest-tree pruning, reusable meadow noise, sparse paint
indexes and max-blend coverage pruning. A production-browser move measured
142 ms compilation plus 173 ms presentation before terrain-resource reuse; the
latest same-move check measured 104 ms plus 98 ms after incremental nearest-tree
tiles, reused wetness samples and sparse minimap blending. This still warrants further work.
These plans are weakly held,
keyed by the compiled surface, and invalidated by terrain, biome, catalogue or
surface-layer changes. Vegetation edits retain carving, river detail candidates
and unchanged layer plans. Changed/deleted vegetation plans are discarded; every
generation still resolves dynamic spacing, footprint exclusions and meadow bands.
The benchmark compares the complete generated result against an
uncached compile; the full Heartroot output checksum remains unchanged.

Live pointer tests on Heartroot at 1280×720 measured an oak drag preview at
0.45 ms mean (0.6 ms maximum across eight updates) and one 239 ms release commit.
A new 16 m foliage brush stroke initially rebuilt the whole scene in 1,718 ms.
Passing the previous compile through the brush command and retaining unaffected
layer plans reduced a matching gesture to 209 ms (107 ms generation, 89 ms
presentation); preview updates averaged 0.28 ms, maximum 0.6 ms across nine updates.
New layers use random IDs, so their small scattered-object counts vary between
gestures. Compiler tests compare incremental output with a fresh compile of the
**same document**, including recipe inputs, visibility, order, deletion and undo.
These release times remain above one frame and are not a claim of hitch-free
terrain sculpting or arbitrary brush sizes. Test map edits were undone.

The SVG shape overlay caches the selected document snapshot by history identity,
revision and selected layer ID. `AuthoringHistory.scene` returns a defensive clone;
reading it every frame previously invalidated the mask on every animation frame.
The Canopy Pines mask on Heartroot (990 strokes, 1,974 points) cost 95 ms per redraw
and caused periodic 110–115 ms frame intervals. The renderer also reapplied camera
matrices separately for every projected point.

A shared camera/viewport projector now prepares matrices once per redraw. In the
live production editor the selected mask drew once in 3.1 ms and did no additional
idle rebuilds. A zoom gesture produced 89 redraws averaging 4.2 ms, p95 5.6 ms,
maximum 10.8 ms. Stationary frame intervals afterward had p95 15.2 ms versus
112.4 ms before; camera framing differed after reload, so this is a stall-removal
check, not an isolated GPU comparison. The user's unsaved document was exported
and verified identical after reload.

Cursor movement only updates the cursor. Live strokes append projected points in
ordered add/subtract order; undo, history replacement, viewport/camera changes and
terrain replacement invalidate the appropriate cache. Tests use a cloning history
getter, cover zero idle reprojections, one camera preparation per redraw, appended
points and changed selection. The profiler exposes redraws as `Editor shape overlay`.

Committed base-height, hill, plateau, curve and sculpt edits upload the final compiled
terrain once. They no longer upload the intermediate base height first; minimap and
scenery are refreshed from the same compiled surface. Regression tests compare the
displayed heights, watercourses and generation with a fresh compile, including sculpt
release. Height edits retain geometry/noise candidate plans but recheck current
slope, river depth, embedding, occupancy and meadow bands. With unchanged surface
recipes, carving replays only base vertices that changed; slope masks also refresh
the surrounding sample neighbourhood. Paint weights and water-course geometry
are height-independent. Prior outputs and base snapshots remain immutable. Changed
rivers/paths invalidate scatter exclusion plans; changed recipes, layouts and
catalogues invalidate affected inputs conservatively.

The same live Heartroot hill commit fell from 1.99 seconds (1.63 seconds generation)
to 483 ms (143 ms generation). It still spends 218 ms uploading/re-grounding terrain,
51 ms synchronizing scenery and 65 ms updating the minimap. These remain above a
frame budget. CPU-only repeated edits measured 178–224 ms on Heartroot, 31–40 ms
on Oakfall, 14–21 ms on Crown Marsh Frost and 37–51 ms on Threewater. All twelve
edited results and their restorations matched fresh compiles, including object
order, heights, surface masks and resources. Run the repeatable check with:

```sh
node --import tsx scripts/bench/terrain-edits.ts assets/maps/skirmish/heartroot-glade.utcmap
```

Additional map paths can be supplied in the same invocation. It reports fresh and
reused CPU timings with stage breakdowns; comparisons run outside timed sections.
Compiled fields also record exact changed-height bounds and whether water inputs
are unchanged. This provenance uses weak keys for both snapshots, so the current
field does not retain the undo history. Material/minimap geometry rasters refresh
only the changed interpolation/slope neighbourhood; map-edge clamping is included.
Terrain mesh patches consume the same bounds. Untracked mutable fields fall back
to their existing full-sampling path.

Water resources survive local height edits only after every affected wet/dry
center and corner is checked. Unchanged topology retains flow, meshes, shaders and
reflection targets; depth-texture rows receive the changed ground samples. Initial
full uploads remain full until acknowledged by the renderer. Changed shorelines,
courses or unsupported sources still rebuild conservatively. The full Heartroot
hill commit fell again to 269 ms: 141 ms generation and 45 ms terrain presentation
(including 0.7 ms water work, versus 104 ms previously). Minimap cartographic
shading fell from 43 ms to 8 ms. These are one-machine short-edit observations,
not an active-match or arbitrary-stroke guarantee.

Live sculpt pointer previews still use the mutable dirty-region path and need
further profiling separately from committed edits.

Terrain material and minimap rasters separately cache exact double-precision
height/water/slope samples when the surface is verified unchanged. Material and
vegetation masks still refresh. Mutable sculpt updates invalidate those samples.
Compatible terrain edits retain tile arrays, macro textures, displacement assets,
and pending loads. Only changed masks/slots upload; unchanged height and ambient
textures survive. Asset/layout changes replace the owner, with disposed guards on
late loads. Authored mask bytes pass directly to the GPU texture builder; enumerable
lazy base64 properties preserve the serialized source contract for inspection/export.
Mask owners are immutable and texture buffers must never mutate their source bytes.
Encoded heights and layer slots are weakly cached with the verified surface raster.
In the same production move, terrain material work fell from 51.3 ms to 14.6 ms;
the removed mask base64 round trip alone had cost 20.3 ms. Separate profiler scopes
report height/slot encoding, material rasterization and mask binding. Regression
checks cover painting, sculpting, changed assets/layouts, late loads, and restoration
of earlier masks; live undo restored the exact original scene.
Minimap coverage blending processes RGB together and skips empty weights; its
Heartroot CPU raster benchmark fell from 53 ms to 18 ms with identical bytes.
This isolated result does not include canvas drawing or scenery silhouettes.
Geometry-dependent minimap lighting is also reused. Coverage blending shares the
terrain renderer's ordered nonzero-paint index, retaining null slots for unsupported
materials so indices never shift. The live blend fell from 24 to 4 ms and the total
terrain raster from about 50 to 7 ms. Nearest-tree edits re-evaluate every tree in
tiles touched by changed influence squares, preserving old rasters for undo and
falling back to a full raster for broad changes. Their live cost fell from 44 to
6 ms. Wetness samples are tied to the immutable carved surface, not the mutable
coverage buffers. Consecutive panel notifications are coalesced
into one refresh per action (previously five). The scene hierarchy uses a windowed
React tree so DOM work scales with visible rows rather than the document size.
The production edit test reduced combined panel/React render work from roughly
90 ms (five full panel refreshes) to 11 ms (one panel refresh plus React commits).
The React render-and-commit scope is separate from the synchronous panel scope.

The map editor's **Performance** button (Ctrl+F3) opens a shadcn/Zinc window with
frame graphs, latest procedural-build and presentation stages, and a one-frame
draw census. It supports ten-second captures, JSON reports and Chrome trace export.
The UI polls at 500 ms only while open; it uses `WorldEditor.performanceControl`
and `performanceReport`, the same operations exposed by `editor_performance` MCP.
`frames.series` contains the latest 120 independent CPU, GPU and interval samples;
capture aggregates still cover the complete recording. The editor suppresses the
legacy profiler panel; game diagnostics keep their existing presentation. Closing
the window restores the sampling state from before it opened. This UI is a
diagnostic aid: opening it adds UI work, so compare runtime captures under matching
conditions.

A production Heartroot game-camera capture at (112,112), zoom 1, 1280×720 at 1 DPR,
soft shadows and canopy preview off recorded mean CPU frame work of 4.38 ms,
p95 4.7 ms, and mean GPU time 1.93 ms. Presented intervals averaged 13.34 ms with
no samples over 16 ms during that 10-second idle capture. This does not measure
an active match, brush editing, cold loading, or another camera/resolution.

The current optimization work also covers initial scene construction, incremental
editing, steady-state rendering, and game verification. After those measurements,
the map-editor UI is moving to shared shadcn/Zinc primitives. The compact React
hierarchy, file bar, toolstrip, camera controls, environment panel and performance
window now use those components. Remaining inspector and auxiliary panels still
need migration. The environment panel defaults canopy preview off, and a playing
day cycle updates its React controls only when the displayed minute changes.
Spell and Effect Studio changes are a separate workstream.

Enable **Debug** in a match. The overlay includes CPU timings, asynchronous GPU
queries where supported, resolution, draw calls, geometry, and instance counters.
**Copy report** exports the rolling measurements. The editor MCP's
`game_performance` operation reads the same report plus renderer diagnostics.

A 120 FPS frame has an 8.33 ms budget. Simulation ticks remain 25 ms apart (40 Hz);
rendering interpolates between them. CPU scopes overlap: “App frame total” includes
simulation and presentation, and “Present total” includes WebGL submission. Do
not sum all the rows. GPU time runs on a separate processor and can overlap CPU work.

Use a production build for final visual measurements. Record the map, camera,
match time, player/observer perspective, fog reveal, resolution scale, shadow
setting, and unit count. Compare the same scene. Test both a base and a crowded
fight, then pan into a previously unseen region and place a new building.

### Deterministic simulation benchmark

```sh
npm run bench:sim -- --map four-crowns --ticks 12000 --output /tmp/four-crowns.json
```

This runs four AI players for five simulated minutes with seed `731942`, on the
512 × 512 Four Crowns map. It builds the full observer view every tick, includes
AI decisions, discards 200 warm-up samples, and records mean, p95, p99, maximum,
phase timings, unit counts, and a final deterministic checksum.

For a long soak, use `--ticks 48000` (20 simulated minutes). For path diagnostics,
add `--trace-navigation`. `--checkpoint 7290` saves a diagnostic world snapshot to
`/tmp/simulation-checkpoint.json`; `--resume /tmp/simulation-checkpoint.json`
continues from that state. Restored runs have cold caches and must not be confused
with uninterrupted timing runs.

Stop browser matches and other benchmark/test processes before a comparison.
CPU profiling adds overhead. Laptop sleep or background throttling invalidates
wall-clock measurements; rerun rather than averaging the pause away. The benchmark
is a CPU workload, not a browser FPS prediction.

## Implementation boundaries

### Simulation indexes

The context maintains structural indexes for units, buildings, bodies, and vision
providers. Systems still check current life, ownership, readiness, and behavior.
Recruitment retains entity identity; restoring a save rebuilds the indexes. Trees
no longer participate in unit collision, population, or target-candidate scans.

Combat uses a spatial broad phase that includes building footprints, followed by
the same exact range, hostility, and visibility tests. Distance and ID tie-breaking
remain unchanged. No attacks are delayed to meet a wall-clock budget.

Static navigation components quickly reject disconnected destinations. They
invalidate when the walk grid changes and include the same ground-step limit.
They are only a rejection test: A* still chooses the route and handles dynamic
traffic. A sub-cell departure check rejects routes whose first waypoint cannot
be reached, avoiding repeated successful A* searches followed by smoothing failure.

### Immutable observations

Unchanged neutral forest resources reuse immutable public projections. Fog memory
retains the previous projection when a tree changes out of sight. Ownership-private
views, current visibility, damage, felling, and appearance are still evaluated;
the renderer never receives mutable simulation entities.

Resource scenery preserves its array identity when stamp values are unchanged.
This avoids serializing and rebuilding an entire forest every render frame.
Static observation footprints rebuild only when their structural data changes.

### Rendering and asset preparation

Scenery and ground cover use spatially partitioned instances for camera and shadow
culling. Their static matrices do not update every frame. A curve-segment spatial
index keeps meadow generation exact without testing every paint-curve segment for
every grass candidate.

Compatible static model surfaces merge into one geometry. Their authored linear
colors become vertex colors; material factors and procedural shader variants must
match. Siblings that already share the exact material and local transform can merge
without recoloring; this also preserves textured and seasonal surfaces. Transparent,
animated, and skinned surfaces remain separate. Different textured, seasonal, and
team-color materials are never collapsed into one material. This reduces submissions without simplifying the source silhouettes.
Merged buffers and replaced source resources are owned and disposed by the layer.

Static scenery placement factories retain mesh-local shader coordinates and exact
world transforms while eliminating redundant exporter groups. Rigs, animated
hierarchies, morph targets and non-mesh attachments retain their original hierarchy.
The live Heartroot startup comparison retained 100,072 props, 17,264 spatial
batches and 736 cells. Compact records reduced placement from 370 ms to 251–281 ms;
batch rebuild varied from 251–293 ms versus 287 ms before. Opening remained about
4.1 seconds, so this is a construction/allocation improvement, not proof of instant
loading. Per-phase MCP scopes separate bounds/indexing, contact/dew aggregation,
mesh grouping, instance buffers and cell bounds. A real oak drag after the change
measured 0.38 ms mean / 0.60 ms max preview and 231 ms release; undo restored the
entire normalized saved map. Release remains above an interactive frame budget.
Drag previews update instance matrices directly; committing a preview compares
against its last indexed pose so spatial cell membership and contacts cannot remain
at the old location. Rotation/elevation/lock edits reuse compiled terrain and scatter;
the same conservative invalidation check runs for undo and redo. New object fields
invalidate reuse unless explicitly proven independent of generation.

Settlement presentation filters resource-only entities once per observation.
Tree animation scans focus on damaged trees; standing trees remain instanced.
Actual attacks, axe contacts, and casting phases retain their authoritative timing.

Visible unfocused windows keep requestAnimationFrame. A worker timer takes over
when the document is hidden or frames stall; it does not cap a visible game at
40 FPS. Both paths share one elapsed-time clock to avoid double-counting resumed
frames.

## Regression expectations

Performance changes must preserve command responsiveness, collision and slope
rules, target choice, fog memory, recruitment, tree harvest timing, and multiplayer
checksums. Run the focused acceleration tests and the full test suite. Compare a
fixed-seed match checksum before and after changes that claim to be behavior-neutral.

The initial five-minute baseline reached checksum `2314625604` with 244 live units.
The indexing and observation optimizations retained that result. Timing reports
are machine-specific; keep measured gains separate from a guarantee of 120 FPS.

Three.js documents the shader-preparation API and its dependence on the configured
scene lights/environment in its [WebGLRenderer reference](https://threejs.org/docs/pages/WebGLRenderer.html).

## Map browsing and published previews

Skirmish, multiplayer thumbnails and the editor map picker consume a lightweight
map summary. They never generate terrain, load models or run full playability
validation while browsing. Project map parsing and simulation fingerprints are
lazy; full validation still runs when saving/authoring and starting a match.

`npm run maps:previews` publishes 512×512 WebP strategic atlases and
`assets/maps/previews/index.json`. It samples the compiled terrain offline: biome
colors, slope relief, woodland, waterways, surface paint, amber and camp symbols.
Starting-position/selected-player markers are lightweight UI overlays. Unchanged
inputs are skipped. `npm run maps:previews -- heartroot-glade` regenerates one map;
`--force` forces regeneration; `npm run maps:check` fails on stale/missing outputs.
The normal game build invokes this generator automatically before bundling.

For custom artwork, place `<map-id>.preview.png` (or `.webp`, `.jpg`, `.jpeg`)
next to its `.utcmap`, then run the same command. Artwork is center-cropped to a
square, encoded to WebP, and shown without automatic coordinate markers. Commit
both source artwork and generated output. A changed map without a refreshed
preview, or an older browser-local save, gets a static placeholder instead of
blocking the menu to generate an image. Export local maps into the project map
folders to publish their previews.

Measured on the five current project maps: the old `playableMaps()` call alone
cost 3,821 ms before synchronous thumbnail painting. The metadata-only call costs
0.61 ms in the same Node/Vite benchmark. The actual Skirmish screen constructor
measured 1.5 ms in an isolated browser harness using production UI code; that is
construction time, not a claim about cold network loading or first paint.
All five WebP images total approximately 320 KB. Runtime tests prohibit world
compilation during browsing and prohibit full map access in preview rendering.

### Scenery ray queries

Camera-boom obstruction and scenery picking reject spatial cells before testing
individual placements/batches. They retain exact mesh intersections for candidates,
ignore render visibility (an offscreen object can still obstruct a camera), and
accept rays whose origins are inside a containing cell. Drag previews expand the
original cell bounds immediately; commit rebuilds tight bounds and membership.
This also prevents a dragged prop disappearing when it leaves its old cell.

`npm run bench:scenery-rays` compares the former full scan against the spatial
query on 100,000 synthetic props and 100 camera rays, and fails if hit distances
differ. The first measured comparison was 594.45 ms versus 30.91 ms total
(5.94 versus 0.31 ms/query), with zero distance difference. This is a CPU query
benchmark, not measured gameplay FPS or a world-opening improvement. Live MCP
profiling exposes `Prop camera obstruction` and `Camera obstruction candidates`.

### Compiler serialization

Scene-transfer records serialize in native JSON chunks instead of invoking a
replacer and stringifying each individual object. Exceptional values (including
signed zero, non-finite numbers, sparse arrays and explicit undefined) retain the
structured-clone path. Packet layout, double-precision poses, chunked yielding,
ordered deltas and retained snapshot identities are unchanged. Unchanged ownership
maps retain their ordered record collection even when projection returns a new Map.

An alternating before/after/after/before benchmark of the real 99,703-object
Heartroot snapshot measured 489–520 ms before versus 383–386 ms after for encoding.
Every decoded snapshot was strictly equal to the compiler output and all packets
retained the same 134,990,861 transferred bytes. This is serialization time only;
GPU upload and initial model loading are separate unresolved startup costs.

The real worker benchmark (`BENCH_TRANSPORT=delta node --import tsx
scripts/bench/authoringWorker.ts`) checks the initial scene plus six edits against
main-thread compilation. Add `BENCH_EDIT=rotate` to exercise pose-only edits;
the default moves an object and invalidates affected vegetation. Timing windows
exclude those correctness comparisons and report parent-thread heartbeat gaps.

Generated scenery/resource projections retain per-object identity while their
immutable source object, catalogue entry and map size are unchanged. Weakly held
cache entries live no longer than generation plans. Resource-cell competition is
still resolved in source order on every projection; it is never cached across
reordering. Pose-only worker edits on Heartroot measured 58–94 ms round trip after
this reuse, versus 92–119 ms immediately before, with the same 111-byte deltas.
All seven worker replies (initial plus six rotations) matched independent full
compilation; tests additionally cover catalogue replacement, resized map bounds,
reordered resource overlaps, undo, and retained records.

### Shared embedded scenery images

`PropField` pools identical embedded PNG/JPEG images across GLB loads for the
lifetime of its renderer. SHA-256 image bytes, MIME type and native sampler
settings identify reusable templates. Each material receives a separate Texture
with shared immutable Source storage; UV transforms, channel, colour space,
anisotropy, names and extras remain independent. Native/extension loaders retain
ownership of external images and compressed/extended texture formats. Failed
loads are evicted, and closing the field clears the pool.

The scenery catalogue contains 107 embedded image uses but only 42 unique images.
The browser benchmark rendered all 106 scenery models with native and pooled
loaders: every RGBA pixel matched, and every model produced nonempty pixels.
Image uploads fell from 108 to 43 (including one non-pooled upload),
with allocated textures falling from 109 to 44 including the test target.
Repeated runs in both load orders measured 256–538 ms versus 138–448 ms inside
upload calls; these timings vary with driver contention. The 65-upload reduction
was identical in every run. Both paths released every model-owned GPU texture;
the same single renderer-owned texture remained until context destruction.
These are CPU submission timings in an isolated WebGL benchmark, not GPU execution
time or a measured reduction in total editor opening time.

Run `npm run bench:textures` for the repeatable browser comparison. It prefetches
model files before timing decode, compares each rendered pixel, supports reversing
the comparison order, and reports allocation cleanup. The regular editor profiler
and MCP expose `Scenery embedded images`, `Scenery shared image loads`, and
`Scenery unique embedded images`; renderer asset diagnostics expose the pool too.

### Scenery spatial batch sizing

Small scenery now uses 48 m cells instead of 24 m. Shadow-casting scenery retains
48 m cells, with separate caster/scatter namespaces so sharing a cell size never
turns small foliage into shadow casters. Density, geometry, material and wind are
unchanged. `updateLOD` also skips the batch walk when no alternate LODs exist.

`npm run bench:scenery-cells` loads the actual scenery of any shipped map and
compares 24/48/24/48 m layouts over six fixed cameras. It checks nonempty renders
and every RGBA pixel, reports CPU submission time and GPU timer queries, and can
download a report. Wind and lighting are fixed; main and shadow culling use the
same paths as the renderer. This is a scenery-only benchmark, not game FPS.
Rebuild timings include disposing/allocating changed batches and are not startup
comparisons. HMR is disabled to keep unrelated development from resetting a run.

Heartroot's 100,072 props dropped from 17,264 to 10,672 batches. Overview draws
fell from 18,848 to 12,256; base-view draws from 3,278 to 2,625. In alternating
runs, overview CPU submission medians were 225–228 ms before and 127–131 ms
after; a later repeat measured 65–68 ms versus 35–37 ms, showing the sensitivity
of absolute timings to runtime/driver contention. Draw counts and pixel results
were identical in both runs. Some closer views had no consistent timing improvement: larger cells also
submit more offscreen triangles, so reduced draw count does not imply a uniform
GPU improvement. At that stage the overview remained too expensive, motivating
the visible-range compaction below.

Other overview draw counts: Oakfall 6,060 → 4,412; Crown Marsh Forest 4,235 →
3,115; Crown Marsh Frost 1,020 → 931; Threewater 4,225 → 3,485. All six views
in every alternating comparison retained identical pixels. Focused regressions
cover separation of caster/scatter groups, ray picking, drag previews and batch
reuse. The 100,000-prop ray benchmark also retained identical hit distances
(566.5 ms full scan versus 31.2 ms spatial query for 100 rays in this run).

### Visible scenery draw compaction

Spatial cells are still the authoritative batches for editing, ray picking and
frustum tests. The renderer now concatenates visible cell ranges into one
InstancedMesh per exact geometry/material/render-state combination. It copies
the original Float32 transforms and instance colours without changing shaders,
textures or geometry. Transparent batches keep independent sorting identity.
Main and shadow passes have separate buffers, so unchanged views do not alternate
uploads between two visibility lists. Edits, harvests, model swaps and LOD changes
refresh group membership; unchanged groups retain buffer capacity.

Cell boxes now enclose placement geometry instead of the boxes around batch
spheres. Wind adds a conservative local/world displacement envelope that handles
nonuniform scale and shear; ground-conforming underlays retain their previous
sphere bounds. This alone only removed roughly 1% of Heartroot's draws. Combining
visible ranges is the substantial improvement.

The browser benchmark's **Visible draw compaction** comparison alternates the
old cell draws and the production compactor, at identical cell sizes. Enable
**Moving camera** to test visibility changes and uploads during panning; the wind
time is configurable. Six views include a close perspective camera, tight RTS,
base and full overview. Pixel comparisons reject empty renders and compare every
RGBA channel, alongside triangle counts and CPU/GPU samples. This remains an
isolated scenery benchmark at 640×480, not a full-game frame rate measurement.

Heartroot's moving overview fell from 12,245 draws to 367 with the same
25,382,767 triangles and zero changed pixels. Alternating integrated runs measured
CPU submission medians of 102/172 ms versus 7.6/7.7 ms; available GPU samples were
23/30 ms versus 8.9/6.7 ms. Its centre view fell from 3,424 draws to 267. Some
timer queries expire or report disjoint results, so missing GPU measurements are
reported as unavailable rather than zero. Absolute timings are contention
sensitive; identical pixels, triangles and reduced draw counts are the stable
invariants. Stationary and moving Heartroot comparisons at multiple wind phases
passed. Runtime tests cover separate pass buffers, unchanged upload versions,
preview/commit, removal, colour updates, transparent sorting and disposal.

All five shipped maps passed alternating moving-camera comparisons (24 renders
each) without changed pixels or triangle counts. Other moving overview draws:
Oakfall 4,362 → 256; Crown Marsh Frost 868 → 116; Crown Marsh Forest 2,981 → 252;
Threewater 3,449 → 405. Moving-camera verification now additionally hashes every
pan frame after timing: Heartroot passed 288 SHA-256 frame comparisons with zero
mismatches. Readback drains the GPU queue between those samples; this verification
run measured overview CPU 18–20 ms versus 5.2–5.5 ms and GPU 15.6–17.0 ms versus
6.6–6.8 ms. Do not compare these absolute timings to the earlier undrained run.

The performance panel's Draw calls tab and MCP reports expose `Scenery draw
groups`, `Scenery visible draws`, `Scenery shadow draws`, both pass compaction
timings, and `Scenery visible/shadow upload bytes`. Upload byte counters describe
the instance ranges marked for upload this frame and should settle to zero when
the camera, visibility and scenery are unchanged.

The full Heartroot editor at 2560×1440/2 DPR recorded 412 total draws and 6.02M
triangles across all passes. A 10-second capture measured CPU frame p50/p95
5.6/6.5 ms and GPU frame p50/p95 16.27/36.58 ms; presented intervals were about
33 ms. Scenery submitted 123 visible and 102 shadow draws, with zero instance
upload bytes on stationary frames. This is not a 120 FPS result: GPU scene work
remains the main steady-state cost. The diagnostic bundle omitted publication
validation because an unrelated assistant-trial icon failed its size rule;
normal build validation remains unchanged.

A further recipe-specific scenery prefetch experiment found exactly the required
models in all five maps (1–6 ms discovery), but did not improve total startup.
Its reduced final asset wait moved work into earlier construction and contended
with scene preparation. It was removed. Startup runs also varied substantially
with shader/driver preparation, so reduced asset-wait time alone is not accepted
as evidence of a faster opening.

Expanded startup driver scopes identified unconditional shader diagnostics as a
separate cold-start cost: 86 `getShaderInfoLog` calls took 2.70 seconds and 43
`getProgramInfoLog` calls took 1.48 seconds in one full-editor opening. The shared
Display now checks each program's link status once, requesting detailed program
and vertex/fragment logs only on failure. Failed links remain reported; successful
shader warning logs are no longer fetched automatically. Context-loss results
are retried. This applies to the game, editor and other shared-Display views.

Two fresh-page Heartroot diagnostic runs after this change opened in 5.59 and
4.36 seconds, with first-frame WebGL submission of 658 and 613 ms, versus 6.29
seconds in the preceding diagnostic run. No successful-program log reads remained,
and no shader errors were reported. Driver/cache state still affects startup;
these are local observations, not a cold-network guarantee or steady FPS gain.

A per-instance visibility experiment was rejected after alternating moving-camera
Heartroot tests. Conservative wind-expanded bounds preserved every image (288
frame hashes matched), and restricting tests to meshes of at least 128 triangles
reduced close-view submission by 25–34%. However, CPU medians rose from roughly
2.3–3.0 ms to 3.7–4.8 ms while GPU gains were inconsistent. Reusing the coarse
sphere test to bypass fully visible batches did not remove that regression.
The runtime experiment was removed; lower triangle counts alone are insufficient.
The scenery benchmark now also compares 48 m versus 24 m **Compacted cell size**
for both casters and scatter, retaining the production draw compactor.

The compacted 24 m test also preserved all 288 frame hashes but regressed moving
CPU submission: centre 2.5–2.9 → 5.6–5.8 ms; overview 4.6–5.2 → 10.9–11.0 ms.
Centre triangles fell 7.68M → 5.73M, with only about 0.5–0.7 ms less GPU time.
Production therefore retains 48 m cells. Both rejected experiments show that
reducing offscreen triangles must avoid repeatedly walking/packing more source
batches; the next approach needs a cheaper visibility/update structure.

### Unchanged-view visibility cache

Scenery now retains separate main/shadow frustum snapshots alongside its packed
instance lists. An identical frustum reactivates that pass without scanning cells
or batches. Rebatching, geometry/LOD changes and drag previews invalidate both
snapshots. Restoring logical meshes for captures does not discard the packed
lists. Runtime tests cover pass switching, restore, moving cameras, drag previews,
removal and explicit source-colour invalidation. Shader wind does not invalidate
these conservative visibility bounds.

`npm run bench:scenery-visibility` isolates this CPU work without WebGL: 10,688
synthetic batches, two passes, 120 samples per alternating run. Local medians were
0.77/0.85 ms for repeated scans versus 0.0013/0.0005 ms with cached lists. This is
not a full-game FPS measurement. The live diagnostic editor confirmed no repeated
scenery scan, but its embedded browser viewport reported 0×0 and resizing timed
out; its overall frame timings were discarded. A valid full-size capture remains
required. The shared Display also skips GPU/portrait presentation for zero-sized
canvases, including embedded views where `document.hidden` remains false.

### Candidate-cell rejection before random sampling

River decoration and vegetation scatter reject cells whose entire jitter envelope
misses the requested signed-distance band, before computing hashes or patch noise.
The bound expands by the maximum diagonal jitter displacement; accepted points
still use the original random channels, exact distances and placement arithmetic.
Candidate-budget accounting remains unchanged. This particularly avoids sampling
the large empty interior/exterior around narrow river-bank bands.

Alternating isolated Heartroot compiler runs measured approximately 2.20–2.21 s
before versus 1.93–1.95 s with the river prefilter; river details themselves fell
from 372 to 105 ms in the repeated comparison. Adding the scatter prefilter gave
1.88–1.91 s warm runs. These are CPU compiler measurements, not editor startup.
All five maps retained identical checksums for terrain, coverage, paint, generated
objects, projected stamps and resources; Heartroot still generates 99,703 objects.
The 112-test authoring suite passes, including worker transport and incremental
editing. A boundary test exercises jitter corners, negative coordinates, holes,
repainted regions and narrow shore bands.

### Compiler decode task scheduling

The compiler client yields its main-thread decoder after roughly 4 ms of work.
It now uses a client-owned MessageChannel instead of repeated zero-delay timers:
browser timer clamping was adding about 120–154 ms of waiting to Heartroot's
initial snapshot. Disposal closes the channel and releases outstanding waits;
the client's existing cancellation checks prevent publishing a disposed scene.

`npm run bench:worker-decode` opens an isolated browser benchmark on port 5186.
It compiles Heartroot through the production worker, then alternates fresh
timer/task decoders against the exact same transferred packet. Every decoded
record, owner and terrain-buffer element is compared outside the timing window.
Two local runs (12 decodes) matched exactly. Timer-based wall times were
245–302 ms; MessageChannel times were 135–165 ms. Measured work slices were
4.5–5.3 ms versus 6.9–10.9 ms respectively, and maximum 8-ms heartbeat gaps were
10.6–13.6 ms versus 13–20 ms. Queued tasks remove artificial waiting but are not
a guarantee that GC or individual decode operations fit the 4-ms target.
These are CPU decode measurements, not FPS or total world-opening timings.

### Skip impossible scatter candidates

Scatter now tests its fixed cell-probability draw before computing jittered
positions, exact mask distances and patch noise. Later probability modifiers are
bounded to [0,1], so a draw above the unmodified probability can never survive.
The same stateless random channels and accepted placement arithmetic are retained.
Unfaded scatter also accepts tiles proven entirely within the requested distance
band; uncertain boundaries and all distance-dependent edge fades remain exact.

Alternating isolated Heartroot compiler runs measured 1.82–1.89 s before and
1.65–1.69 s after the combined changes (warm runs). The tile-containment change
alone did not show a convincing total-time gain. All five shipped map output
checksums remained identical; boundary/CSG, incremental editing and real compiler
worker coverage pass in the 125-test targeted suite. These timings concern CPU
generation, not complete world construction or rendering.

### Pose projection and stable-order transfer

Object rotations, elevations and lock edits reuse the generated collection's
scenery/resource projections and owner map. Authored resources are still merged
first, so moving/reordering an authored tree preserves resource-cell priority.
New generated collections, changed catalogue identity and map dimensions rebuild
the cache. Weak keys release it with its immutable generation snapshot.

The worker record encoder also retains its handle/index table when record IDs
remain in the same order. It emits only changed rows; structural changes continue
through the full ordering/removal path. Tests include duplicate IDs, signed zero,
chunk boundaries, resource precedence, catalogue changes and immutable undo.

Alternating Heartroot CPU runs measured roughly 22–29 ms for warm pose commits
before (occasional 73-ms outlier) and 5–7 ms after projection reuse. The browser
benchmark's **Measure edit round trips** button uses the production compiler
client and worker. With projection reuse, rotations/undo took 21–29 ms round trip;
retaining the encoder index reduced this to 12–17 ms (encoding 13–18 → 3–6 ms).
These measurements exclude renderer publication and are not full interaction/FPS
claims. All five shipped map output checksums remained identical, and the targeted
compiler/editor suite passed 127 tests.

### Incremental scenery contacts and dew

**Superseded by the unused-terrain cleanup below.** This experiment optimized a
legacy contact consumer later proven disconnected from the active shaders. Only
the incremental dew mechanism remains; the contact path has been removed.

`SceneryGroundData` retains ordered slots for each placed model's contact and dew
contribution. A pose edit replaces just that model's entries in copied packed
snapshots, avoiding an iteration over every `Object3D` and the former temporary
100k-element bead list. Ordinary tree edits retain the dew buffer. Add/remove,
prototype replacement, changed contact eligibility (for example elevation), and
changed bead counts rebuild the slots in placement order. Contact objects and old
snapshot arrays stay immutable so terrain dirty-region detection still works.

Live Heartroot rotation/undo profiling (99,703 generated objects) previously
recorded 17.4–20.2 ms in `Prop batch · collect contacts and dew (event)`. The first
optimized pair took 1.9 ms each; eight subsequent edits averaged 1.69 ms, p95
1.9 ms. Complete prop rebatching averaged 8.28 ms, p95 10 ms. These are CPU event
measurements, not an FPS result: this diagnostic browser had a collapsed canvas.
An explicit 1280×800 offscreen capture successfully rendered the edited area.
Total editor publication still averaged 76.7 ms in that repeated run; prop sync
and minimap work remain targets.

Regression coverage compares packed contacts and Float32 dew against exhaustive
collection through pose edits, undo, preview/commit, elevation changes, removal,
re-addition and different contribution lengths. It also verifies old snapshots
are untouched and pose-only collection does not traverse the forest.

### Stable document order through edits

Existing object and layer edits now replace the record at its original index;
only new IDs append. Both single commands and batches use the same implementation.
Previously every edit removed and re-appended a record, changing equal-depth
minimap painter order and forcing structural worker transfer even for a rotation.
Keeping layer order also prevents an ordinary property edit from changing the
composition order. Undo/redo still restores exact document snapshots.

Eight live Heartroot rotation/undo edits after this change produced no minimap
scenery raster events (previously eight, averaging 8.88 ms). Minimap indexing
averaged 1.64 ms instead of 5.69 ms. Editor publication averaged 53.46 ms, p50
48.7 ms, compared with 76.66 ms, p50 76.2 ms in the previous run. The last measured
worker transfer encoded in 2.8 ms with an 11.1 ms round trip, compared with 15.5 ms
encoding / 23.3 ms round trip before. This is the actual editor command path,
not the isolated worker harness. Measurements are CPU events with a collapsed
viewport, so they do not establish full-size frame rate. Scenery synchronization
still scans the full list and remains a bottleneck.

Validation: 133 tests across all authoring tests, layered-editor/async-compilation
and minimap-index tests; TypeScript; regenerated all five preview publications.
Single and batch edits, new insertion, locking and exact undo/redo are covered.

### Resolved-root scenery synchronization

`PropField` retains a parallel array of resolved placement roots once an entire
stamp list has loaded. For matching IDs/assets/variants in matching order, sync
uses those roots directly rather than looking up every ID and scanning membership
again. It validates the full layout before mutating any root. Structural changes,
prototype URL changes and unresolved assets retain the existing asynchronous
path; generation checks prevent an obsolete load from installing a cached list.
Preview/commit and preview cancellation still compare against both visible and
indexed poses. The cache adds one root reference per placement.

Eight live Heartroot rotation/undo edits measured combined `Prop sync` mean
14.41 ms / p50 13.2 ms, versus 21.70 ms / p50 16.8 ms in the previous run. Total
publication mean was 48.61 ms / p50 43.9 ms, versus 53.46 ms / p50 48.7 ms. These
short CPU samples show an improvement, not a guaranteed frame-time reduction.
The combined scope includes grass and scenery lighting: separate scopes now
expose `Scenery sync · placed grass`, `Scenery sync · model placements` and
`Scenery sync · lights` in the same performance UI and MCP reports.

28 focused renderer tests and TypeScript pass, including delayed replacement,
stale completion, preview restoration, static batching, bounds, removal and
contact/dew snapshot parity. Full-size interactive frame timing is still pending.
The instrumented repeat (eight edits) measured grass mean 1.17 ms, model
placements 9.31 ms and lights 2.94 ms; total publication mean 46.25 ms / p50
44.4 ms. Model-placement traversal remains the largest of those three scopes.


### Remove disconnected terrain work

Tracing `TerrainMaterial.onBeforeCompile` and its depth variant showed both use
`ImportedTerrainMaterial` exclusively (including generated authored terrain).
The wrapper's contact/light texture, paint weights, road/moss mask, water-level,
season tint and floor uniforms were never bound to those shaders. Their CPU
rasterization and pixel allocations therefore could not affect rendered output.
Removed that path and its renderer calls, plus the scenery contact contributors
that fed it. Terrain painting still goes through `authoredTerrain`, while live
point lights, source terrain occlusion and dew remain unchanged.

`DewPlacements` now owns only packed dew data and `dewRevision` advances only when
its buffer changes. Ordinary scenery pose edits no longer upload unchanged dew.
The obsolete buffer tests were removed; replacement coverage asserts that road
and cover masks reach the actual color/depth shader inputs, independently survive
cover removal, and that dew packing preserves old snapshots and placement order.

Eight Heartroot rotation/undo edits measured total publication mean 33.17 ms,
p50 31.7 ms, versus 46.25 ms / p50 44.4 ms before this cleanup. One matching
1280×800 lossless capture was byte-identical before and after (4,096,000 RGBA
bytes, zero differences). A 512 map also avoids 4 MiB + 6×545² bytes of unused
terrain pixel allocations, plus the per-prop contacts. These buffers had not been
bound/uploaded by the active shader, so this is CPU memory/work savings, not a
claim of reduced GPU texture bandwidth. Interactive full-size FPS remains open.

31 focused tests and TypeScript passed. The broader renderer run passed 320 tests,
with one skipped and one failure in `aura-layers.test.ts` (four vampiric-aura layers
versus three expected), in the separately owned spell work. That failure was not
changed by this optimization.
Normal `npm run build` still stops at the separate publication error
`asset.assistant-trials.frost-relay-icon: icons must be square and at most 128px`.
The diagnostic build used for render comparison omits only that publication gate;
the normal build and its validation remain unchanged.

## Fixed-resolution world rendering benchmark

The Performance dialog has **Benchmark 1080p**. MCP exposes the same operation:
`editor_performance` with `action: "benchmark"`, optional `width`, `height`, and
`frames` (defaults 1280×720, 24 frames; bounded at 2560×1440 and 120 frames).
It uses the production world renderer, atmosphere, LOD, main/shadow culling and
an offscreen target without screenshot readback. Two warm-up frames are excluded.
Reports include CPU and asynchronous GPU samples, percentiles, draw/triangle
counts, resolution and camera pose. Camera movement or a changed map invalidates
the run. Resetting timings or replacing the map clears the previous result.

GPU queries have bounded polling, always release their resources, report missing
results as unavailable, and stop retrying after three failures. They yield through
MessageChannel rather than nested timers. A collapsed/background browser may
still withhold GPU results; this is reported rather than interpreted as zero cost.
The tool excludes simulation, UI and browser presentation: **it is not an FPS
benchmark**, and live interaction captures are still required.

Heartroot's central free-camera view (256,256, zoom 40, yaw 45°, pitch 35°), canopy
preview off, measured 24 valid GPU samples at both sizes on the diagnostic build:
1280×720 CPU mean 2.92 ms / GPU mean 6.05 ms, GPU p95 7.56 ms;
1920×1080 CPU mean 2.55 ms / GPU mean 11.33 ms, GPU p95 13.32 ms.
Both submitted 500 draws and 8,638,580 triangles across passes. This is a new
baseline, not a measured rendering speedup. The diagnostic bundle bypassed only
an unrelated content-publication gate; normal release validation remains required.
Two repeated fixed-time captures were pixel-identical. The earlier saved capture
has different creature visibility/shadows, so it is not a whole-image parity proof.

A subsequent live 10-second Heartroot capture at 2560×1440 (2 DPR), top-down with
Canopy Pines selected, recorded 1,086 CPU frames: CPU mean 2.52 ms / p95 2.80 ms;
543 GPU frame samples: mean 7.85 ms / p95 8.78 ms. The unchanged view submitted
395 draws and 7.04M triangles, with zero visible/shadow instance upload bytes.
There were 115 missed refreshes out of 1,087 intervals (10.58%) against the
observed 8.3 ms refresh cadence. This validates cached idle selection at full
resolution; it does not yet establish smooth continuous panning/zooming or
completion of the broader 120 Hz performance goal.

## Top-down mask motion

Exact overhead orthographic masks now retain ordered add/subtract strokes in map
coordinates. Pan/zoom updates one affine SVG transform rather than recreating
and reprojecting every polyline. Mask/fill bounds intersect the inverse-projected
viewport plus a two-pixel antialias margin, avoiding map-sized mask surfaces at
close zoom. Oblique/perspective views keep terrain-aware point projection.
Document replacement/undo rebuilds the strokes; live painting appends points.

On Heartroot with Canopy Pines selected, four alternating wheel zooms measured
95 old overlay updates averaging 3.85 ms (p95 5.10, max 7.90), versus 94 retained
geometry updates averaging 0.072 ms (p95/max 0.20). These are CPU overlay timings,
not a claim that whole-frame rendering became 53 times faster. Fixed-view browser
screenshots were visually consistent. Regression tests cover cursor independence,
ordered subtraction, append-only painting, undo, viewport changes, offscreen
strokes entering view, bounded mask surfaces and fallback projection.
The final version, including viewport-bound updates, repeated the zoom test with
82 updates averaging 0.154 ms (p95 0.20, max 0.30): approximately 25× less overlay
CPU time than the original camera-reprojection baseline. TypeScript, the diagnostic
build, seven focused tests and the final live zoom/coverage check passed.

## Reuse water construction samples

Native water construction now retains the flow scan's cell-center wetness and
caches shared mesh-corner wetness/heights for the duration of one build. Adjacent
shoreline triangles and tile boundaries no longer repeat those terrain/watercourse
queries. Caches are not retained between builds, so sculpt changes cannot reuse
stale answers; imported water follows its existing path.

`node --import tsx scripts/bench/water.ts assets/maps/skirmish/*.utcmap` reports
six warmed timings per map plus a SHA-256 covering flow, ground, profiles, mesh
positions and indices. All five before/after hashes matched exactly. The final
run measured Crown Forest 67.4→56.8 ms, Crown Frost 69.3→56.5 ms, Heartroot
101.2→92.3 ms, Oakfall 95.0→78.7 ms, Threewater 230.0→166.6 ms. An earlier run
measured larger savings; retain the final figures rather than the best sample.

Live Heartroot water construction measured 96.8 ms versus the earlier 124.8 ms
scope. A 1280×800 fixed-time capture matched the pre-change image byte-for-byte
(all 4,096,000 RGBA bytes). Five focused water tests, TypeScript and the diagnostic
build passed. Tests include non-tile-aligned dimensions, shared shoreline corners,
cache lifetime, partial depth uploads and topology-changing sculpt edits.

## Exact affine placement bounds

Compact scenery placements select each output axis's extremal corner directly
rather than transforming all eight bounding-box corners. The calculation preserves
Three.js's multiply/add order, with a fallback for projective transforms. Negative
scales, shear and singular transforms retain the original exact bounds; motion
padding and picking behavior are unchanged.

The 10,000-pine placement benchmark's warmed bounds phases changed from 4.33/4.93
ms to 2.47/1.37 ms. First-run results were similar (7.96 versus 7.66 ms). A live
Heartroot indexing stage was 90.3 ms versus the earlier 88.2 ms, so **no total
startup improvement is established by that live sample**. The isolated warm-path
improvement must not be presented as a full-map startup speedup.

Fourteen tests passed across affine bounds, static placement and visible scenery
(including 1,000 exact comparisons against Three's eight-corner implementation).
TypeScript and the diagnostic build passed. The fixed 1280×800 live capture was
byte-identical to the reference image. The next startup investigation should focus
on placement allocation, grouping and buffer construction, not assume bounds
account for the remaining model/placement wait.

## Snapshot restoration and incremental edits

Before implementing persistent compiled-map storage, `scripts/bench/scene-rehydrate.ts`
checks structured-clone/restore costs and the first pose edit against a fresh
compilation. It found that restored scenes lost their compiler dependency provenance:
Heartroot restoration itself took <1 ms after a ~305 ms clone, but its first pose
edit unnecessarily recompiled for 1,673 ms.

`SceneSnapshotReader` can now associate a trusted snapshot with the exact input
map and catalogue; the worker client supplies its canonical catalogue. This does
not establish cache freshness on its own: a future persisted cache must verify
compiler/content and map keys before accepting snapshots. No persistent cache is
currently enabled by this change.

All five maps matched fresh output after restoration and editing. First restored
pose edits changed as follows: Crown Forest 233→9.5 ms, Crown Frost 72→6.3 ms,
Heartroot 1673→63.3 ms, Oakfall 319→29.3 ms, Threewater 534→8.9 ms. Terrain identity
was retained in each. These measure edits to decoded snapshots, not an improvement
to the existing continuously-running worker's already incremental editing path.
Fifteen worker/transfer/startup tests and TypeScript passed, including rejection of
reuse after water-level or catalogue changes. This is groundwork for faster
reopening, not proof that startup is now near-instant.

## Persistent compiler snapshots (built editor)

The compiler worker keeps the most recently opened world in IndexedDB, using the
same compact, lossless record/buffer transport as worker messages. The cache key
includes every authored map input (including signed zero/undefined distinctions),
a storage format number, and the hashed bundled worker URL. Changing any bundled
compiler/content dependency invalidates the entry automatically. Only one world
is retained per origin; generated worlds never become repository assets.

A hit restores terrain/water callbacks and exact dependency provenance, then uses
the normal worker transfer and incremental editing path. Only initial compilation
consults storage. Brush/object edits do not write snapshots. Publication precedes
optional cache persistence. Unavailable, blocked, timed-out, invalid or quota-limited
storage falls back to compilation, and malformed data cannot poison the fresh
worker transfer sequence. `editor_performance.compiler.cache` reports initial
hit/miss/disabled/invalid/unavailable and lookup time; `compileMs` is zero on a hit.
The stored generation-stage profile describes the original build, not restoration.

Persistence is **disabled in the Vite development server**: stable source URLs do
not fingerprint compiler changes, so reusing them across HMR would be unsafe.
Built editor workers use their content-hashed bundle URLs. A development-safe
invalidation mechanism remains work to do. This cache is currently used by the
map editor worker, not the game simulation's independent startup compiler.

Measured on a diagnostic built Heartroot editor (512², 99,703 generated objects):
initial compiler round trip 1,806.5 ms versus 624.8 ms cached; first rendered frame
3,366.0 ms versus 2,805.9 ms. A subsequent cached load measured 782.0 ms round trip
and 2,871.3 ms first frame. These are observed loads, not a statistical FPS claim.
Model/texture setup and rendering still dominate part of startup; this is not yet
near-instant construction. The first raw-object cache experiment only saved about
0.1 seconds overall and was replaced with compact records before acceptance.

`node --import tsx scripts/bench/scene-cache.ts assets/maps/skirmish/*.utcmap`
checks all five maps through compact storage/restoration against fresh generated
objects, stamps, resources, owners, heights and water samples. Its in-memory
structured-clone timings are CPU diagnostics, not IndexedDB/disk benchmarks.
Runtime regression tests cover exact restoration, compiler/map invalidation,
corruption/storage failures, pose/movement/water edits and undo. Live rotation and
undo were also checked on cached Heartroot without saving map changes.

Faster startup exposed an existing camera-only visibility issue: frozen baked
units' holders woke up when the camera reached them, but the GPU instance list
stayed empty until an editor edit. `SettlementLayer.setViewFrustum` now flushes
that list only when a frozen unit wakes; stationary frames add no instance upload.
A real baked-mesh regression checks this without simulation ticks. The cached
Heartroot capture after the fix matches the original 1280×800 reference exactly
(all 4,096,000 RGBA bytes), including neutral creatures and their shadows.

## Scenery construction attribution

`editor_performance.sceneryConstruction` and the Performance window's Opening tab
now separate prototype loading, placement creation and render-batch construction.
The expandable model table reports per-asset fetch/parse wall time and synchronous
preparation time. Model loads overlap; do not sum their durations or interpret them
as CPU work. Reports retain one row per current prototype and clear replaced assets.

An instrumented Heartroot opening measured 88 prototypes, about 8 ms total model
preparation, 287 ms awaiting prototypes, 247 ms creating 100,072 placements and
245 ms constructing batches. This points to instance construction rather than
model preparation as the next CPU target. The load/parse values also include image
decode and scheduling, not only network transfer.

Batch grouping now reuses each prototype's geometry/material key inside an
already-partitioned spatial cell. It creates the combined cell/mesh key once per
output batch, instead of once per mesh instance. In a live Heartroot comparison,
the grouping scope fell from 58.0 to 41.5 ms; total batch work stayed approximately
245/244 ms because other scopes varied. This is an allocation reduction, not proof
of a faster overall opening. The before run missed the compiled-world cache and
the after run hit it, so their overall startup times are not a valid comparison
for this grouping change. Existing batching, static-placement and visible-draw
checks cover retained buffers, mixed assets, disposal, edits and visibility.

Verification: 28 tests across prop-batch reuse, static placement/material batching
and visible scenery draws passed; TypeScript and the diagnostic build passed.
The final Opening tab was checked live, including its 88-asset breakdown and cache
status. A second optimized opening recorded 38.5 ms grouping and 230.8 ms total
batch construction. The fixed Heartroot screenshot remains byte-identical to the
reference (4,096,000 RGBA bytes). None of these checks claim a steady-state FPS
increase; grouping executes when constructing/rebuilding scenery in both editor
and game.

### Compact scenery placement records

Static scenery placements now retain only transforms, prototype references,
metadata and per-part world matrices. They no longer construct a Three.js Group
for every placement. Ray picking, selection and inspection lazily materialize a
real hierarchy; subsequent pose changes keep that hierarchy synchronized. Rigs,
bones, morphs and other dynamic scene nodes retain the existing clone path.
This is shared by game and editor scenery construction.

The 10,000-pine CPU benchmark previously measured 16–17 ms creating the compact
Group roots; records measured 6–7 ms in the first comparison and 10–15 ms in a
later run under different system load. The benchmark reports zero eagerly
allocated scene nodes for static records (it previously reported one per root).
These are allocation/matrix tests with placeholder textures, not GPU benchmarks.

On the full Heartroot map, creating 100,072 placements measured 138 and 183 ms,
versus the preceding Group measurements of 247–263 ms. Batch construction remained
242–273 ms. Overall cached opening measured 2.57–2.67 seconds, so this does **not**
establish a total startup improvement or completion of the loading goal. Snapshot
transfer/decode and first GPU submission remain substantial costs.

Verification: 31 tests across static placements, batch reuse, static batching,
visible scenery draws and dew placement passed; TypeScript passed. Coverage
includes source quaternion/Euler synchronization, mirrored/nonuniform transforms,
exact bounds and ray hits, lazy materialization, selection and edits after
materialization. The diagnostic build passed (the unrelated content publication
gate remains bypassed only in that diagnostic configuration). Live Heartroot
selection and four rotation/undo pairs passed without saving the map. Its fixed
camera render matched all 4,096,000 RGBA bytes of the preceding reference.

### Replay cached transfer packets

A cache hit now reuses the stored record chunks instead of decoding and then
JSON-encoding the same world again. The worker still decodes its own authoritative
scene, initializes delta handles and scene identity counters, and copies terrain
arrays before transferring them. Subsequent edits and undo use the ordinary
incremental path. Corrupt bootstraps discard all stream state and compile afresh.

Heartroot's browser cache-hit encoding/bootstrap fell from 195–217 ms to 75–81 ms;
worker round trip measured 543–561 ms versus 649–680 ms immediately beforehand.
Complete cached openings varied from 2.32 to 2.63 seconds, so the reliable gain is
in the transfer stage, not a guaranteed total-load reduction. The in-memory CPU
benchmark measured 320→88 ms and exact restored results for all five maps. This
cache optimization currently applies to the built editor; dev caching remains
disabled until compiler revision invalidation is reliable there.

Verified with 22 transfer/cache/compiler/startup tests, TypeScript, a diagnostic
build, four live rotation/undo pairs, and a byte-identical fixed Heartroot render.
Checks include duplicate IDs, exceptional values, retained buffer identity,
terrain replacement/restoration, detached transport buffers and corrupt bootstrap
fallback. The startup test renderer now implements the scenery diagnostics method
introduced by the earlier profiling work. Map preview publications were refreshed.

### Heartroot match focus (2026-10-03)

The current priority is four-player match stability, not further editor chrome or
startup micro-optimizations. A five-minute, four-AI Heartroot profile identified
terrain sight/shot sampling and harvesting-related presentation work. AI runs are
workload proxies; they do **not** establish four-human network stability.

- Ordinary prop additions/removals no longer repack all forest dew; actual dew
  contributors still update correctly. Live harvesting samples fell below the
  profiler's 0.1 ms resolution for dew collection.
- Minimap scenery retains record identities across harvests and repaints affected
  32-pixel tiles. A scratch canvas preserves curve antialiasing; directly clipping
  paths was rejected after pixel comparisons failed. First loads/large edits use
  a full raster. Live redraws averaged 1.55 ms (13 changes), versus the earlier
  12–14 ms full redraws. Index scanning remains a separate 5–8 ms cost.
- Tactical rays reuse endpoint heights and sample scalar coordinates without
  temporary point objects. A frozen 2,400-tick checkpoint continuation produced
  the same checksum (`1925732430`) before/after. Mean tick time changed only
  17.08→16.67 ms in that run; this is not a claim of a large overall speedup.
- `game_performance` now includes the completed capture, not only rolling samples.

Run the Canvas2D pixel regression with
`npx vite --config scripts/bench/minimap-harvest/vite.config.ts` and open
`/scripts/bench/minimap-harvest/index.html` on port 5186. Its 100,000-prop fixture
compares the production incremental painter with a full redraw over 49 edits,
including overlapping crowns, moves, additions and boundary cases: zero changed
channels. Readback canvases use a consistent software backend to avoid browser
GPU/CPU raster switching contaminating equality checks.

The live four-colony diagnostic build still exceeded frame and simulation budgets;
concurrent host activity also affected timings. Do not label it multiplayer-ready.
Next priorities are navigation/combat spikes, minimap/index publication, and GPU
scene/postprocessing costs with a repeatable camera and graphics configuration.
WebGPU is not a drop-in fix: Three.js WebGPURenderer does not support our existing
ShaderMaterial/onBeforeCompile path (see the official WebGPURenderer manual).
Consider compute culling/visual particles after profiling; preserve the CPU
lockstep simulation and first optimize the existing renderer.

#### Follow-up: simulation queries and isolated rendering

Idle separation now opens the same local unit index used by movement, updates
reservations after assigning an escape route, and releases the index in a
`finally` block. A frozen Heartroot continuation (tick 10,000 to 11,200,
238 units at the end) reduced this stage's mean from 1.14 to 0.24 ms and p99
from 2.13 to 0.80 ms. Both runs produced checksum `3526835738`.
Combat approach rays now wait until the existing retry deadline; an empty route
also skips the redundant old-goal ray. The same continuation retained the same
checksum. Its timing run was host-contended, so no additional speedup is claimed.
The navigation trace now wraps `Spatial.findPath`, which includes actor-specific
navigation grids and layered routes; instrumenting only the default grid missed
real searches.

After exiting the other diagnostic editor/match views, a 10-second four-AI
Heartroot capture at 2560 × 1440 measured 4.01 ms mean GPU time (p99 6.55 ms).
It rendered 286 animated units and about 99,658 props, with 252 draw calls at the
capture endpoint. Mean frame interval was 10.22 ms, but p99 was **66.30 ms**;
worker simulation mean was 20.92 ms, p99 48.10 ms. This build includes the minimap,
dew and ray-sampling changes above, but predates the separation/approach fixes.
The earlier GPU result around 23 ms was contaminated by multiple concurrently
visible renderers, not evidence of a single-match GPU regression.

Harvest updates still scan the scenery list in multiple consumers: prop sync
reached 19.3 ms, and minimap classification averaged 8.54 ms per change. These
main-thread spikes are a higher priority than a renderer migration. A good
average frame rate does not satisfy the stability goal. Verification for the
simulation changes: 23 movement/pursuit/deployment tests, 17 lockstep tests and
TypeScript passed, including changed-terrain retry behavior and checksum equality
against unindexed collision scans. Four-human testing remains outstanding.

#### Incremental match scenery publication (2026-10-04)

`SceneryComposition` publishes presentation-only changes between immutable game
scenery lists. It compares the observed resource portion, retains unchanged
resource stamp identities, and leaves the static map portion alone. Publication
metadata holds revision tokens rather than previous arrays, avoiding a retained
history of entire forests. Ordinary mutable editor inputs, a different base,
skipped publications and incomplete model loading retain the full-sync fallback.
No simulation state, save format, visibility rules or lockstep code changed.

Consumers forward filtered publications: grass and lamp lists remain identical
when unaffected; bridge surfaces remain cached; prop synchronization applies
removals/additions/replacements directly; the minimap drops removed entries
without reclassifying the forest. Pure source reordering does not require prop
transform updates, while minimap source order is still respected. Renderer asset
diagnostics include `synchronization` counters for incremental/scanned updates
and changed placement counts, available through `game_performance`.

Run the CPU-only comparison with:
`npx vite-node --config vitest.config.ts scripts/bench/scenery-updates.ts`.
It exercises the production layers with 100,000 synthetic props and 30 harvests,
measuring the final 25 after warmup. It verifies identical surviving prop IDs and
minimap order. The final implementation measured 39.52→4.99 ms mean per update;
an earlier run measured 27.83→2.65 ms. Host load changes absolute timings. These
include CPU rebatching but exclude GPU work, image rasterization and composition
of the input list, so they are **not whole-game frame times**.

A fresh four-AI Heartroot capture with the initial removal fast path measured
prop-sync p99 6.4 ms (previous isolated capture 18.1 ms), minimap classification
mean 5.52 ms (previous 8.54 ms), and frame p99 41.8 ms (previous 66.3 ms). The new
run was later in the match with 309 animated actors versus 286; it is supporting
live evidence, not a paired replay comparison. Its worst frame was still 91.3 ms
and worker p99 61.4 ms. The final addition/reorder handling and sync counters were
added after that capture and need another live capture. Saved older workloads
were correctly rejected after concurrent content changes; validation was not
bypassed. Diagnostic builds continue to omit the unrelated publication gate and
are not release-build proof.

Regression coverage includes unchanged resource appearance, sequential harvests,
discovery, moves, source reordering, skipped publications, asynchronous placement,
terrain changes, lamp invalidation, and mutable editor inputs. The browser minimap
oracle now independently rebuilds its scenery index rather than sharing the
incremental index: the final 49-update run matched every RGBA channel. The final
35 targeted regression tests and TypeScript passed. Current next priority: remaining harvest rebatching and match
simulation/frame-tail costs at normal speed, followed by real network testing.

#### Cached scenery draw signatures (2026-10-04)

Harvest rebatching now checks render-state components and reuses the serialized
signature when they are unchanged. Geometry, material UUIDs (including in-place
array changes), transparency, shadow flags, layers, order, instance colors and
custom shadow materials still invalidate the key. Group ordering and rendered
content are unchanged.

The real Heartroot browser ABAB comparison in `scripts/bench/scenery-cells/`
used 100,072 props, 10,672 spatial batches and 261 draw groups with the production
48-metre layout. Uncached sync means were 2.77/2.79 ms; cached means were
0.93/0.53 ms. All RGBA channels matched across 24 rendered views. This measures
CPU draw-group synchronization, **not whole-frame performance**; GPU timings from
that run are not used because another paused match renderer remained open.
The synthetic `scripts/bench/scenery-draw-groups.ts` benchmark also isolates this
stage. The 27 relevant render tests and TypeScript passed, including changes to
every signature component. Four-player match tail latency remains the priority.

#### Ground-navigation edge probes (2026-10-04)

A fresh five-minute Heartroot run attributed its largest simulation spike
(87.8 ms) chiefly to combat route planning (65.1 ms). Tracing now wraps
`Spatial.findPath`, including the body-specific navigators actually used in a
match. A proposed layered-ground fast path was discarded: current Heartroot
uses the ordinary ground graph, so that change did not address this workload.

The ground navigator now caches each requested direction independently. Its
reverse reachability probes previously computed all eight outgoing collision
sweeps for every newly visited cell. Invalidation, diagonal clearance, moving
body checks, A* ordering and route tie-breaking are unchanged.

`scripts/bench/navigation-edges.ts` runs seven search pairs from the slow-match
trace against actual initial Heartroot collision geometry. Its eager oracle
reproduces the previous edge-cache algorithm; ABBA runs compare identical full
routes. Over 35 measured searches, collision probes fell from 64,040 to 19,940
(69%). Eager means were 1.00/0.84 ms; lazy means 0.50/0.35 ms. This is a cold-edge
microbenchmark, not the developed match or multiplayer frame-time result.
Navigation, sector, pursuit and lockstep checks passed (41 tests); TypeScript
passed. The simulation benchmark accepts `--checkpoint-output` so a new run does
not overwrite the checkpoint belonging to a frozen older content bundle.

Two separately frozen builds (previous eager navigator versus current lazy
navigator, otherwise matching sources/content) completed 12,000 ticks with the
same checksum `3428025050` and 240 surviving units. Whole-run simulation means
were 16.27 versus 17.58 ms; observer projection also rose 2.03→2.18 ms, and host
load varied substantially. These runs establish outcome equivalence, **not a
whole-match speedup**. The paired microbenchmark's reduced collision work is the
performance evidence. Late-match spikes remain unresolved; the final diagnostic
browser build still needs a fresh isolated capture and real network testing.

#### Resource projection across worker frames (2026-10-04)

Decoded snapshots now retain a derived resource-scenery revision when only
nonvisual fields change. A weak association lets `ResourceScenery` reuse its
previous projection without scanning the forest on every worker frame. Placement,
asset/scale, depletion and felling changes invalidate it; ordinary amount changes
above zero do not. Removals, membership/order updates and decoder resets also
invalidate. Unknown arrays retain full projection. No packet/save/simulation
format changes. The profiler exposes `Resource scenery projection`.

`npx vite-node --config vitest.config.ts scripts/bench/snapshot-scenery.ts`
exercises production encoding, transferable cloning and decoding with 14,000
resources, 240 moving actors, amounts changing each frame and six harvests. ABBA
projection means were 0.931/0.870 ms without hints and 0.043/0.049 ms with them;
final scenery matched. Timings exclude encoding/transfer/decoding and are not
frame-time claims. 36 session/input/lockstep tests, TypeScript and the diagnostic
build passed.

The first live revision (before narrowing amount-change invalidation) captured
10 seconds at tick 7553: 214 animated actors, 99,977 props, 222 draw calls and no
shader-link failures. Frame mean/p99/max were 9.69/24.10/49.70 ms; worker simulation
14.31/41.90/74.30 ms. Resource projection still averaged 0.49 ms because resource
amounts changed frequently; that observation drove the final revision above.
The final revision needs a fresh live capture. Browser input/capture stopped
responding during the follow-up; the diagnostic match tab remains for recovery.

A sampled late-match CPU profile also identified terrain sight queries. A
200,000-query trace contained only 0.5% exact repeats. Finer height bounds and
integer-coordinate shortcuts preserved results but did not establish a useful
elapsed-time gain, so they were discarded. `bench:sim --trace-sight /tmp/sight.json`
can record up to 200,000 queries after 200 warmup ticks for further analysis.

#### Four-replica developed-match replay (2026-10-04)

`scripts/bench/four-peer-match.ts` runs four independent Heartroot simulations
through production `Room`/`Lockstep`, with ordered synthetic message delays and
one 32-beat upstream stall. It accepts `--checkpoint` with an ordinary local save;
normal snapshot validation remains active. It compares all four checksums every
100 ticks and at the end. This is CPU/consistency tooling, not real network or FPS
measurement. Example:

```sh
npx vite-node --config vitest.config.ts scripts/bench/four-peer-match.ts \
  --map heartroot-glade --checkpoint /tmp/heartroot-resource-checkpoint.json \
  --ticks 400 --output /tmp/heartroot-four-peer-restored.json
```

The exported live four-AI match restored at tick 46,404 and reached 46,804 with
331 units per replica. All five checksum checkpoints matched, including after
the synthetic stall. Per-replica tick means were 15.87–16.12 ms and p99 values
33.39–34.20 ms. Those tails still exceed the 25 ms simulation tick budget.
A separate 800-tick replay attributed mean 5.19 ms to movement, 3.60 ms to ability
lifecycle and 1.46 ms to sight masks. Spell implementation remains another agent's
scope; movement is the next performance target. These are concurrent-host CPU
measurements, not a claim that four real clients are ready.

`game_checkpoint` exposes the existing local save/load operations through MCP;
it does not bypass map/content/player validation and cannot restore remote games.
`game_performance` accepts `action: capture` to start a ten-second profile, then
`action: get` to read it. The final resource-revision browser verification is still
pending: automatic approval review blocked reloading the advancing live match,
even after offline checkpoint restoration succeeded. The running tab was retained.

Both simulation scripts now include map/content fingerprints in reports. Freeze
the simulation benchmark before collecting a checkpoint for paired experiments:

```sh
npx esbuild scripts/bench/simulation.ts --bundle --platform=node --format=esm \
  --banner:js="import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" \
  --outfile=/tmp/heartroot-frozen.mjs
node --cpu-prof --cpu-prof-dir=/tmp /tmp/heartroot-frozen.mjs \
  --map heartroot-glade --ticks 12000 --checkpoint 10000 \
  --checkpoint-output /tmp/heartroot-frozen-world.json
```

Use that same bundle when resuming its checkpoint; never bypass mismatch checks
to reuse a save after a content change. Keep the map source unchanged as well.

#### Collision-sweep allocation reduction (2026-10-04)

Movement sweeps reuse radius-dependent sampling offsets (bounded to 32 patterns)
and pass scalar coordinates into the ray marcher. The order and number of
collision probes are unchanged, including corners and wide-body interior rays.
The cache contains geometry only, never collision answers or simulation state.

`scripts/bench/motion-sweep.ts` compares the previous allocation-based oracle
against 20,000 mixed short/long queries. ABBA means were 12.02/11.89 ms before and
10.37/10.46 ms after (~13% lower isolated sweep time), with identical acceptance.
The oracle test also matched every ordered probe over 3,000 queries, varying
map size, boundaries, body radius, slope/obstacle predicates and cache eviction.
66 movement, scale, layered-floor, traffic and lockstep tests passed.

A frozen Heartroot comparison changed only the compiled motion module, retaining
identical content and all other code. Four 800-tick replays from tick 10,000 ended
with checksum `2395927842`. Whole-tick means were 7.57/7.72 ms before and 7.64/7.65
ms after: **no demonstrated whole-match speedup**. This is a small allocation
improvement, not a solution to late-match spikes. The initial shared TypeScript
failure in a concurrently edited ability test was subsequently resolved outside
this work; the latest full TypeScript check passes.

The same frozen optimized build subsequently advanced from tick 10,000 to 46,800.
Across that continuation the simulation mean/p99 were 10.41/28.49 ms, with a
407.55 ms maximum. Combat planning separately peaked at 218.52 ms. The run
eventually settled to 148 units and low tick costs, so its final checkpoint is
not representative of the preceding stall. The checkpoint/trace investigation
below isolates that cost; this result does not establish match readiness.

#### Long-route smoothing spike (2026-10-04)

The detailed replay reproduced the planning stall at tick 35,326. Individual
route summaries hid its aggregate cost because many orders each took less than
the trace's 10 ms reporting threshold. A one-tick CPU profile attributed about
217 ms to `Spatial.clearSegment` while smoothing routes, versus about 12 ms to
the path search itself. The old smoother checked successively longer full rays
for every intermediate grid waypoint, producing quadratic work on long corridors.

`farthestClearWaypoint` now probes exponentially and refines the first blocked
interval. Every selected shortcut is explicitly checked by the existing complete
terrain, body and portal sweep. Visibility need not be monotonic: failing a probe
can miss a later shortcut, but cannot accept an unchecked segment. Adjacent
waypoints remain the fallback. This intentionally can choose different valid
waypoints; old and new world checksums are not expected to match.

In frozen ABBA 400-tick replays from tick 35,000, changing only this smoother,
the tick-35,326 planning cost fell from 222.77/221.76 ms to 23.16/40.24 ms.
Whole-tick maxima fell from 232.80/231.30 ms to 31.99/49.03 ms; mean tick time
changed from 13.77/14.10 to 12.76/12.71 ms. Both optimized runs ended with checksum
`3479468344`, versus the baseline's repeatable `722026803`. This is a reproduced
spike reduction, not proof that every match tick meets budget.

The 516 gameplay/network tests passed, including socket tests rerun with loopback
listener permission. A further regression exercises a long, interrupted movement
order around a wall, limits long-sweep queries and checks every returned segment.
Helper coverage includes nonmonotonic visibility and logarithmic work on a
4,095-waypoint clear corridor. The simulation benchmark now supports
`--profile-tick <absolute tick> --profile-output /tmp/tick.cpuprofile`, capturing
that simulation tick and its observer projection; a live CLI proof produced a
valid CPU profile. Existing captures made by the temporary spike script contain
the simulation tick only. Benchmark windows now report absolute and elapsed ticks,
and reports include runtime identity and process CPU time alongside wall time.
Full TypeScript passed. The normal Vite build remains blocked by content
validation: `asset.assistant-trials.frost-relay-icon` is not a square icon of at
most 128 px. This asset belongs to concurrent assistant/spell work and was not
modified or exempted from release validation.

### Shared navigation corner sweeps (2026-10-04)

A longer optimized replay (ticks 35,000–37,000) exposed a different hitch at
36,875: a cold A* search spent about 78 ms checking body clearance, rather than
smoothing its resulting route. Diagonal edges checked the same four directed
cardinal corridors repeatedly. `Navigation.edge` now shares the existing cached
cardinal results with those corner checks. No extra cache arrays, simulation
state or reduced collision checks are introduced; occupancy invalidation still
clears the surrounding affected edges.

Frozen ABBA replays changing only this cache reuse kept checksum `2206401568`
in all four runs. Tick 36,875 fell from 99.45/133.57 ms to 60.51/60.36 ms
(planning: 86.08/119.16 to 47.91/46.80 ms). This is a tail-latency improvement:
whole-run averages did **not** improve, at 13.07/13.44 ms before and 13.57/13.55 ms
after; optimized p99 was 33.73/33.94 ms. Remaining spikes exceed the 25 ms
simulation budget. These Node measurements are not rendered-frame timings.

Regression coverage checks each directed terrain sweep occurs at most once
between invalidations, and compares cached/uncached paths on directed slopes,
small grids, moving blockers and changed corners. All 519 gameplay/network tests
passed (the two socket tests required a separate run with localhost listener
permission); full project TypeScript passed.

The four-peer benchmark accepts `--resume /tmp/simulation-checkpoint.json` as
well as `--checkpoint` local saves. Raw simulation snapshots pass normal World
validation, then start a fresh transport at the restored tick; this does not
test restoration of an in-flight mailbox. A current-source run from tick 35,000
through 35,400 had 230 units, matching checksums in all four replicas at five
checkpoints, and recovered from the injected 32-beat upstream stall. This replay
includes the previously expensive smoothing event. A second run from tick 10,000
through 10,400 ended with 238 units and also matched all five checksum checkpoints
across four replicas, including the transport stall. Local-save mode continues to
restore the original transport pipeline. Browser verification of the new build
and actual multi-machine player tests remain outstanding.

### Compiled adjacent body sweeps (2026-10-04)

`adjacentSweep` compiles each grid-center direction from the existing `clearSweep`
predicate trace, deduplicating identical directed probes. It stores geometry only
(at most nine patterns per body navigation), checks footprint boundaries, and
queries live terrain/occupancy each time. Sub-cell motion, smoothing, air routes
and layered bridges retain their existing paths. Tests compare results and every
distinct successful probe against the original across map sizes 1–512, radii
0–16,000 fixed units, directed slopes, boundaries and changing obstacles.

Frozen ABBA replay, ticks 35,000–37,000: the cold-search tick 36,875 dropped from
59.97/62.38 ms to 23.86/23.74 ms (planning 46.29/47.80 to 11.15/11.24 ms).
All four final checksums were `2206401568`. Average simulation time was essentially
unchanged (13.47/13.42 versus 13.32/13.30 ms); other spikes remain, so this is not
an overall p99 or FPS improvement claim. All 521 gameplay/network tests passed,
with the two localhost socket tests rerun with listener permission. Project and
benchmark TypeScript checks passed.

The next profiled event, tick 36,248, is aggregate army rerouting: 23 substantial
successful routes to neighboring formation destinations, rather than one slow
collision sweep. A* dominates after the above fixes. The benchmark now accepts
`--trace-routes --trace-tick <absolute tick>` to include every route at that tick
even below individual timing thresholds, with per-search expansion counts.
Group routing needs further work; it must preserve reachability and deterministic
results rather than silently dropping orders or collision checks.

### A* queue and candidate work (2026-10-04)

Navigation now rejects candidates with an already better known cost before
consulting terrain/body edges. Its queue stores the integer `f=g+h` priority
once, recovering `g` exactly on removal, and the main expansion loop avoids
iterator destructuring. The heuristic, tie order, movement costs, destination
checks and collision rules are unchanged.

Frozen ABBA runs over ticks 35,000–37,000 retained checksum `2206401568` in every
run. The army-routing tick 36,248 fell from 64.97/65.51 to 52.66/53.47 ms;
36,288 fell from 72.94/68.91 to 57.44/58.80 ms. Whole-run mean stayed near
13 ms; p99 was 32.08/37.05 before and 30.12/30.39 ms after. These specific
replayed spikes improve, but still exceed the 25 ms simulation budget.
All 545 gameplay/network/AI tests passed, including a new independent Dijkstra
oracle for optimal detour costs and exact cost limits. The two socket tests
were rerun with localhost listener permission. Full TypeScript passed.

A current-source four-replica replay then ran from 35,000 through 36,300,
covering the army rerouting events: all 14 checksum checkpoints matched, all
replicas reached the end, and the injected 32-beat transport stall recovered.
This remains a synthetic transport/CPU test, not real-network or rendered-frame
verification.

Command tracing also identified AI reinforcement retargeting as a remaining
cause: player 4 reissued 22–23 movers at ticks 36,128, 36,168, 36,208, 36,248
and 36,288 as the leader moved roughly 5–7 cells between orders. Existing exact
intent matching treats every new rendezvous point as a new order. This requires
a separate continuity fix; no AI order behavior was changed in this pass.

### Reinforcement rendezvous continuity (2026-10-04)

The AI now keeps a reinforcement's current attack-move while it is actually
moving toward a destination inside the leader's existing 16-cell join radius.
Stopped units, incompatible orders, different floors and a leader outside that
area still retarget. This changes AI decisions deliberately; player commands and
simulation scheduling are unchanged. Decisions use only observed unit state,
with no new cache or save fields.

Frozen ABBA replays from 35,000 to 37,000 reduced expanded path cells from
2,417,507 to 1,921,765 (20.5%). Planning p99 fell from 10.43/10.61 ms to
5.07/5.76 ms. Whole simulation averages changed only slightly (13.18/13.35 ms
to 12.98/13.08 ms), and other 59–61 ms spikes remain. Search counts did not fall
(3,228 versus 3,268), because the changed AI decisions change later combat and
movement. Old/new match checksums therefore differ intentionally; both new runs
ended at `238343062`. Four current-source replicas then ran the same 2,000 ticks:
all 21 checksum checkpoints matched, all ended with 224 units, and the injected
transport stall recovered. This is not a real-network/FPS benchmark.

Unit and AI decision tests cover keeping a progressing route, recovering a
stalled reinforcement, floor/intent changes, movement beyond the join radius,
and identical decisions after restoring the same saved AI inputs.

For memory-pause diagnosis, `simulation.ts --gc-report --trace-slow` records
Node GC events after warmup and monotonic timestamps for slow ticks. GC durations
overlap existing simulation/view timings; never add them to tick totals. This
diagnostic is optional and does not alter the game runtime.

All 548 gameplay/network/AI tests passed (the two socket tests required a rerun
with localhost listener permission). Full project and benchmark TypeScript
checks passed. An isolated GC-instrumented replay retained checksum `238343062`:
simulation mean 12.99 ms, p99 29.50 ms and maximum 52.53 ms. A 43.30 ms major GC
event overlapped that maximum at tick 35,313. The measured window recorded 3,299
GC events totaling 1,661 ms; these are overlapping diagnostic durations, not
additional simulation time. This identifies allocation/collection pressure as
the next investigation, not proof of a particular allocation source or a browser
frame-time result. Current-source live rendering still requires verification.

### Allocation pressure and eliminated colonies (2026-10-04)

`bench:sim --allocation-profile /tmp/battle.heapprofile` samples allocations
after the 200-tick warmup, including objects already collected by minor/major GC.
It uses a local inspector session (no listening port) and a 64 KiB sampling
interval. The raw profile retains allocation call stacks. These are statistical
allocation estimates, not peak or retained memory. Run without this option for
timing comparisons; the JSON report marks allocation-profiled runs explicitly.
The collected-object switches follow the [DevTools HeapProfiler protocol](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/js_protocol.json).

The Heartroot battle profile identified repeated owner-string schema parsing in
native vision relationships, point churn in sight-mask construction, and repeated
point/bounds reads inside terrain rays. Owner comparisons now use validated slot
numbers; sight masks reuse local endpoint records; rays compute invariant bounds
and deltas once. Terrain interpolation, sampling positions and visibility rules
are unchanged. A new full-ray oracle checks fractional/elevated/boundary rays and
visible-cell masks against unaccelerated marching.

Across 1,000 sampled ticks (35,200–36,200), estimated allocations fell from
30.03 GB to 20.85 GB; these totals include short-lived garbage and are not resident
memory. Unprofiled ABBA replay timings over 35,000–37,000 improved from
12.97/13.12 ms mean and 29.24/28.46 ms p99 to 10.03/10.15 ms mean and
21.69/22.92 ms p99. Every run retained checksum `238343062`.

The profile also exposed a full observation rebuild on every tick after any
colony had been eliminated. Cleanup now refreshes observation a second time only
when actors were actually removed or victory was declared. Two further replay
runs measured 8.16/8.12 ms mean, 18.93/18.96 ms p99 and 38.00/38.13 ms maximum,
with the same checksum. GC duration in these runs totaled 945/945 ms versus
1,658/1,610 ms in the original pair. The remaining maximum is still above the
25 ms simulation budget; this is CPU evidence, not a claim of stable rendered FPS.

All 550 gameplay/network/AI tests passed, including an elimination regression
comparing snapshots, checksums and all player views with forced full refreshes,
continued play, save/restore and final victory. Full project and benchmark
TypeScript checks passed. Four replicas matched all 21 checkpoints over the
2,000-tick battle and recovered from the synthetic 32-beat connection stall.

A separate before/after pair at ticks 10,000–11,200 kept all four colonies active
(18 workers and 22–24 army units each). Mean simulation time fell from 7.40 to
6.11 ms, p99 from 17.81 to 16.59 ms, and maximum from 29.46 to 24.62 ms. Both
ended at checksum `2480912570`; this shorter single pair supports the improvement
outside elimination cleanup but is not a long-match stability guarantee.

### Group-order search queue (2026-10-04)

The remaining tick 35,206 spike performs 31 path queries for an army order,
mostly distinct goals in the same formation. CPU profiling placed about 25 ms
inside A*. Its frontier uses `MonotonicNavigationQueue`: reusable radix buckets
for integer f priorities, with `NavigationQueue` retaining binary h/cell ordering
inside the minimum-f bucket. This relies on the consistent octile heuristic:
newly discovered f cannot be lower than the last popped f. All route choices and
tie ordering are preserved, and buffers grow only with the largest frontier.

Moving the binary queue methods out of per-search closures first reduced that
tick from 38.52 to 32.72 ms. The radix prototype then measured 29.76/30.02 ms;
integrated source measured 29.76 ms followed by a repeated binary-queue baseline
of 32.27 ms. Planning fell from 26.20 to 22.74 ms in that comparison. Whole-run
mean and p99 changed little; do not extrapolate this focused improvement to FPS.
Checksums remained `238343062`. All 552 gameplay/network/AI tests passed, including
independent sorted-frontier checks for ties, growth, interleaved operations,
integer radix boundaries, list-slot reuse and reset with an unconsumed frontier.
Project and benchmark TypeScript passed.
Four replicas again matched all 21 checkpoints through tick 37,000 and recovered
from the injected transport stall. The remaining group-order tick still exceeds
the 25 ms simulation budget and needs further work.

### Shared formation corridors (2026-10-04)

Nearby ground movers in one synchronous combat-planning pass can now reuse a
checked route to a nearby formation destination. `RouteCorridors` keeps at most
16 original routes (64 waypoints each); nothing survives the pass or enters a
save. Owners and physical body dimensions must match. Reuse excludes traffic
avoidance, finite-cost queries, flying units and layered bridge navigation.
Every segment, including the joining segment and changed destination, runs the
existing body/terrain clearance sweep. Routes longer than 1.2 times the direct
distance fall back to ordinary A*. Movement still performs its normal collision
and separation checks. The shared-corridor count is exposed in match performance
telemetry alongside search and expansion counts.

An isolated ABBA experiment on the exact tick 35,206 scenario reduced planning
from 23.33/22.97 ms to 6.50/7.06 ms, and total tick cost from 30.47/29.40 ms to
12.53/13.34 ms. Twenty-two routes were reused; the largest path-length increase
relative to independent searches was 2.8%. Unlike the queue optimization, this
intentionally changes valid route choices, so later battle states can differ.

Two integrated 2,000-tick replays (35,000–37,000, first 200 ticks excluded) measured
7.91/7.92 ms mean, 17.38/17.58 ms p99 and 24.72/24.05 ms maximum. Repeated baselines
measured 8.01/7.94 ms mean, 18.29/19.10 ms p99 and 55.65/56.23 ms maximum; earlier
baseline runs had lower maxima, so these maximum ratios are not a general speedup
claim. Searches fell from 3,268 to 2,912 and expanded nodes from 1,921,765 to
1,698,335; 148 requests reused corridors. Both optimized runs ended at checksum
`1795214292` (baseline `238343062`).

All 557 gameplay/network/AI tests passed. New coverage checks full segment
clearance, route ownership, compatibility and distance limits, excessive detour
fallback, blocked destinations, traffic/cost exclusions, exception cleanup and
formation travel without overlaps. A cold restore mid-travel matches the warm
replica every tick. Four Heartroot replicas matched all 21 checksum checkpoints
through tick 37,000 and recovered from the synthetic 32-beat transport stall.
Project and benchmark TypeScript checks passed. This is CPU/lockstep evidence;
latest-build browser frame times and real-player Internet sessions remain unverified.

A separate 1,200-tick pair at tick 10,000 kept all four colonies active, each with
18 workers and 22–24 army units. Mean time was essentially unchanged (6.27 ms),
while p99 fell from 15.73 to 14.67 ms and maximum from 35.67 to 19.36 ms. Eighteen
corridors were reused; searches fell from 1,158 to 1,079. This single shorter pair
supports the group-order improvement but does not establish full-match stability.

### Long-battle cleanup audit (2026-10-04)

Extending the Heartroot replay to 12,000 ticks (35,000–47,000) exposed limits that
the short run missed: major GC pauses of 44–48 ms and a 237.62 ms tick at 46,689.
CPU profiling attributed most of that tick to rebuilding static occupancy after
each colony actor was removed. `Economy.remove` now calls
`Spatial.refreshAfterRemoval`, which compares the complete ordered live blocker
inputs before deciding whether a full rebuild is needed. The comparison includes
identity, definition, position, rotation, surface, scale and active resource state;
other blockers killed in the same damage batch are detected too. Explicit
`rebuild()` remains unconditional for terrain/array editors. Rebuild invalidation
also shares one changed-cell list instead of repeatedly copying complete sets.
These are derived caches, excluded from saves and checksums.

The same 12,000-tick replay after the change ended at the identical checksum
`4178217886`. Mean simulation time was 8.23 ms versus 8.31 ms, p99 19.26 versus
19.60 ms, and the cleanup tick fell to 107.23 ms. A shorter replay pair measured
237.87 versus 118.79 ms at that same tick. A new `Colony cleanup` timing exposes
this previously unscoped work; it still accounted for 89.81 ms in the long run.
Major GC still reached 45.06 ms, so neither issue is considered fully solved.

All 560 gameplay/network/AI tests passed, including occupancy comparisons with
forced rebuilds through geometry changes, depletion, overlapping resource order,
removal and simultaneous unit/building deaths. The four-player elimination test
also compares against unconditional occupancy and observation rebuilds. Four
replicas matched all five checkpoints across ticks 46,600–47,000, including the
synthetic connection stall, and retained checksum `4178217886`. TypeScript passed.

### Incremental blocker removal and paced replays (2026-10-04)

Removal now identifies the deleted static input. If every remaining ordered input
is unchanged and the deleted blocker shared no cells with another blocker in the
same occupancy array, only its cells are cleared and the affected navigation
regions are invalidated. Resource blocking beneath a building is preserved.
Overlaps are detected during full rebuilds; overlapping removals and any unrelated
input change fall back to that full rebuild, retaining original ownership order.
This avoids rebuilding the entire forest when one ordinary building disappears.

The 12,000-tick Heartroot replay again ended at checksum `4178217886`. The cleanup
tick fell from the original 237.62 ms to 32.33 ms (20.44 ms in colony cleanup),
with 8.28 ms mean, 19.35 ms p99 and 36.32 ms maximum across the measured window.
A short replay of the same ending measured 46.37 ms at the cleanup tick. These
are individual runs with different warmup lengths, not a fixed timing guarantee.

The simulation benchmark accepts `--pace-ms 25` for a headless 40 Hz schedule and
reports `tickStartLateness`; its default remains unpaced. This allows event-loop
and GC idle work between ticks without including the idle delay in simulation
time. It does not simulate rendering or browser scheduling. A paced 2,000-tick
Heartroot replay at tick 35,000 retained checksum `1795214292`, measured 8.81 ms
mean / 18.18 ms p99 / 24.40 ms maximum, and 2.47 ms p99 start lateness. Its longest
GC pause was 3.68 ms; the unpaced long replay reached 5.66 ms. This does not prove
that the earlier 45–48 ms major-GC pauses cannot recur.

All 564 gameplay/network/AI tests passed, including incremental building removal,
warm navigation-cache invalidation, both overlap ownership orders and a resource
underneath a removed building. Four replicas matched five checkpoints through
tick 47,000 with the injected connection stall. Project and benchmark TypeScript
checks passed. A read-only browser check found the existing diagnostic match had
ended (player 3 won), so its current rendering timings are not battle evidence;
latest-build live verification remains pending.

### Fresh four-player match and worker scheduling (2026-10-04)

A fresh Heartroot match ran for 12,000 ticks from startup with all four AI
colonies still active at the end (18–19 workers and 22–24 army units each).
After the first 200 warmup ticks it measured 5.35 ms mean, 14.83 ms p99 and
32.26 ms maximum simulation time; initialization was 1.78 seconds. The final
checksum was `3167567589`. This is a fresh-match CPU baseline, not rendered FPS.

Worker scheduling now subtracts CPU time already spent simulating/projecting/
encoding from the next timer delay. Missing committed turns use a tick-length
fallback poll instead of repeatedly scheduling zero-delay attempts; network
arrivals wake a worker that has an outstanding tick. Catch-up still yields
between ticks, and no simulation rule, commit ordering or tick is skipped.

All 87 session/network tests passed. The real-worker regression withholds the
other player's turns, verifies bounded polling with no simulation advancement,
then releases committed input and verifies resumed play. Existing real-worker
tests also cover matching lockstep hashes, commands, snapshot backpressure,
save/restore and accelerated publication limits. Deterministic scheduler tests
cover variable CPU work, pause, acceleration and backlog. TypeScript passed.

Latest-build live battle verification remains pending the existing reload
approval. Normal release validation still fails on the other workstream's
`asset.assistant-trials.frost-relay-icon` (icons must be square and at most 128px).
Do not infer readiness for player testing from the headless results alone.


## Whole-match CPU budget investigation (2026-10-04)

Current target: **3 ms p99 for non-render computation across four players, one human
and three AIs, on Heartroot**. Do not claim success from average or world-tick time alone. Browser input/HUD work
and worker delivery still need live accounting before full-budget acceptance.

Standing objective requirement: for every rebuild, scan and invalidation, identify
the triggering change, the affected entities/cells/observers, and downstream
dependencies. Prefer work proportional to that affected set. A building placement
must not imply revisiting distant unrelated scenery or vision; maintain local
occupancy and sight changes where valid, propagating only dependencies that can
actually change (including routes whose connectivity is affected). Retain a full
refresh for genuinely global changes or unclassified external edits. Verify local
updates against the full reference path. Moving the same work to another phase
does not count as an optimization.

`src/sim/profiling.ts` supplies opt-in hierarchical inclusive/self timings,
separate from saved state and gameplay. The worker publishes them to existing
debug captures and `game_performance` MCP. Categories include lifecycle,
autocast visibility/scoring, aura recipients, containment, linked forms, summons,
interval reactions, persistent instances, projectiles/chains, route requests,
sector corridors, reverse reachability, A-star expansion, moving-body indexes,
target acquisition, individual AI decision phases, economy and checksum phases.
Existing observation scopes separate sight masks and scenery knowledge.
Inclusive scopes overlap: sum self time, never all displayed rows. Known idle
categories report zero per tick. Detailed profiling is diagnostic, not a budget
acceptance mode.

`scripts/bench/match-budget.ts` uses the production SimulationRuntime and snapshot
codecs. It runs one idle human plus three AIs, includes the network checksum at its
actual eight-tick cadence, and times projection, encoding, transferable clone and
decoding separately. It supports `--details`, `--save`, `--resume`, `--ticks`,
`--map` and `--output`. Use the normal validated local save for paired runs.
In-process clone is a transport CPU proxy, not measured browser IPC. An idle human
startup is not a substitute for a busy four-army battle.

Paired unprofiled checkpoint test, Heartroot seed 731942, ticks 6001–8400,
first 200 ticks excluded, Node 22/macOS arm64:

- Accounted non-render CPU: **7.97 → 7.12 ms mean**, **28.00 → 26.73 ms p99**.
- World tick: **4.95 → 4.14 ms mean**.
- Ability delivery: **0.726 → 0.131 ms mean**.
- Ability lifecycle: **1.218 → 1.022 ms mean**.
- Both runs finish with checksum **2923285889**, 229 live units including neutrals.
- Safe changes: filter interval-trigger candidates before sorting/allocating
  timer sets; reuse one stat evaluation per actor/access description. No persistent
  stat cache, rule changes, targeting cadence changes or checksum coverage changes.

Detailed attribution after these fixes: checksum fog/knowledge 1.27 ms/tick,
checksum game state 0.93 ms/tick, autocast visible-target enumeration 0.55 ms/tick,
observation 0.50 ms/tick. Checksum averages include seven zero-work ticks per check:
its actual work is roughly 18.4 ms every eighth tick. The earlier world-only
benchmarks omitted this multiplayer cost. Reducing checksum frequency alone
cannot eliminate the individual stalls; a tight tail-latency budget requires
cheaper checking. The user subsequently authorized rotating samples of passive
forest and fog instead of repeatedly digesting their full payloads (see below).

Evidence: `/tmp/heartroot-budget-control-plain.json`,
`/tmp/heartroot-budget-final-plain.json`,
`/tmp/heartroot-3ai-traits-after.json`; reports are local diagnostics, not shipped
assets. Regression run: 767 tests across game, AI, network, sessions and selected
ability mechanic/lockstep suites; profiler tests check self-time accounting,
zero idle samples, clock-free disabled scopes and state equivalence.

### Lightweight divergence signal versus full audits

`World.checksum()` now reads existing simulation counters, economy totals and
core fields from **at most 32 actors** in the already-maintained body index.
No forest/fog scan, AI snapshot, route traversal, recursive hash or serialized
state is built. Nothing is added to the per-tick maintenance of other systems.
Index selection depends only on simulation tick and index length; repeated calls
and restoration do not move a hidden sample cursor. A stable roster is covered
within `ceil(actorCount / 32)` checkpoints (roughly 2 seconds for 300 actors at
40 Hz / eight-tick cadence). Actor churn can extend coverage; this is a heuristic
signal, not a guarantee that every divergence will eventually be found.

Counters include entity/actor counts, IDs, RNG, job/projectile/spell counts and
existing production/consumption/loss totals. Sampled actor fields include identity,
owner, position, health, inventory, current order, production progress and core
cast state. Fog, remembered knowledge, AI internals, passive forest payloads,
full paths and many detailed spell fields are deliberately omitted. Differences
confined to these may remain undetected until they affect a sampled outcome.
There is **no new resync system**, anti-cheat authority or automatic heavy audit.
Map/content identity is still checked at match start.

`World.checksum('full')` retains the original expensive audit for explicit
correctness tests and diagnostics. Spell-category lockstep tests compare this
full digest each tick in addition to the runtime signal; the four-peer benchmark
also verifies full end-state equality. Build `declarative-sim-92` prevents mixing
checksum protocols. Production snapshot validation remains strict.

Tick-6000→8400 Heartroot replay, profiling disabled, after 200 warmup ticks:

- **275 actual checks: 0.025 ms mean, 0.043 ms p99, 0.047 ms maximum.** These are
  per-check timings, not averages diluted by the seven non-checking ticks.
- This replaces the original 18.45 ms/check and the intermediate 2.26 ms/check
  sampled full-state approach, which was still too expensive.
- Accounted non-render CPU: **4.68 ms mean / 13.03 ms p99**; the overall **3 ms p99
  goal remains unmet**. No computation was shifted into other simulation phases.
- Full end-state audit remains **2923285889**, with 229 live units.
- This is an idle-human / three-AI headless replay, excluding browser UI/input
  and real worker delivery; it is not a four-army human battle acceptance test.

Evidence: `/tmp/heartroot-checkpoint-signal-plain.json`. For this comparison only,
the isolated benchmark save's build tag advances from 90 to 92 with an assertion
that every gameplay value is unchanged. Tests cover sample bounds/cycles, ignored
payloads, selected-field changes, read-only reuse of indexes, create/remove/restore
parity, large counters, and insertion-order-independent stock fingerprints.
Validation: 775 regression tests passed, plus application/benchmark TypeScript
checks. Four independent replicas replayed ticks 6000→6600 through Room/Lockstep
with synthetic delayed delivery and one connection stall, matching routine
checkpoints and the full end-state audit (`/tmp/heartroot-signal-four-peer.json`).

### Section 1: economy stalls from static occupancy rebuilds

The renewed 3 ms p99 goal starts with complete slow-tick attribution.
`match-budget.ts --details` keeps the slowest 1% of frames and reports mean
contributions within that same cohort. This exposed resource depletion as the
largest tail contributor: finishing a single harvest rebuilt every static
footprint, averaging 8.59 ms per depletion in the diagnostic replay. Ordinary
mean timing hid this because it happened on only 30 of 2,200 measured ticks.

Depletion now uses verified incremental occupancy removal. Derived owner stacks
are recorded only for overlapping cells during the existing occupancy rebuild;
removing one footprint restores the remaining last writer locally. Changes to
unrelated static geometry still trigger the conservative full rebuild. Completion
of construction verifies that its already-occupied footprint is unchanged.
Navigation invalidation and sector preparation still happen immediately; no
gameplay update or simulation cadence was reduced.

Paired unprofiled Heartroot tick-6000→8400 replay, identical map/content:

- Economy: **7.84 → 1.17 ms p99**, 0.241 → 0.141 ms mean.
- Accounted non-render CPU: **13.33 → 9.31 ms p99**, 4.66 → 4.52 ms mean.
- Both full end-state audits: **2923285889**; 229 live units.
- Detailed replay: all 30 depletion events use local removal, with no fallback
  rebuilds; removal plus sector preparation averages 1.19 ms per event.

Evidence: `/tmp/heartroot-section1-before-plain.json`,
`/tmp/heartroot-section1-after-plain.json`,
`/tmp/heartroot-section1-final-detail.json`. This remains the idle-human headless
baseline, not final 3 ms acceptance. Next contributors are observation refresh,
ability target construction/visibility and the remaining build-command rebuilds.
Validation: 781 regression tests and application/benchmark TypeScript checks pass.
Four replicas with synthetic delayed delivery and a connection stall match all
seven checkpoints and full audit `3789296646` at tick 6600, unchanged from before
this optimization (`/tmp/heartroot-section1-four-peer.json`).

### Section 2: actor membership must not reclassify the forest

Creating or removing an ordinary actor invalidated observation's entire entity
classification. Observation now consumes context creation/removal receipts when
they explain every revision since the previous update. It changes only the actor
list and preserves stationary indexes and resource projections. Resource changes
still refresh through their existing receipts. Static changes, unexplained
revisions, restore/reindex and explicit editor updates retain the full path.
Vision sensors and sight-mask updates have separate detailed timing scopes.

Paired unprofiled Heartroot replay, ticks 6001–8400, first 200 excluded:
- Observation p99: **2.36 → 1.07 ms**; mean **0.479 → 0.453 ms**.
- Observation static-index p99: **1.85 → 0.034 ms**.
- Accounted non-render p99: **9.57 → 9.15 ms**; mean **4.50 → 4.56 ms**.
  The average has not improved; this addresses a specific tail-latency spike.
- Both replays retain full audit `2923285889` and 229 units.

Evidence: `/tmp/heartroot-section2-before-plain.json`,
`/tmp/heartroot-section2-after-plain.json`,
`/tmp/heartroot-section2-after-detail.json`. The headless/idle-human coverage limits
above still apply. Remaining global rebuilds include building placement; audit
their affected footprints, observers and route dependencies before optimizing.
Validation: 787 tests pass (two localhost socket tests rerun with sandbox access),
including forced-full observation comparisons, mixed changes, transient actors,
restore and immutable prior views. Application TypeScript check passes.
Four independent replicas with synthetic delayed delivery and one stall match
all seven checkpoints and the unchanged full audit `3789296646` at tick 6600
(`/tmp/heartroot-section2-four-peer.json`).

### Section 3: local building occupancy on placement

The build command now appends the new building's footprint to synchronized
occupancy rather than re-rasterizing every forest resource. Overlap owner stacks
retain entity-order precedence. Only newly blocked cells invalidate navigation;
existing clearance padding, sector boundary links and connectivity propagation
remain unchanged. Unsupported insertion order falls back to rebuild; external
edits to existing blockers still require the explicit full refresh.

The three measured build events averaged **11.77 → 0.75 ms** for occupancy plus
sector preparation in detailed captures. This removes rare stalls; it is not a
large mean-time saving. Paired unprofiled ticks 6001–8400 (200 warmup excluded)
measured total non-render **9.34 → 9.03 ms p99**, **4.58 → 4.65 ms mean** and
**19.52 → 16.12 ms maximum**. Both end at full audit `2923285889`, 229 units.
The overall budget is still unmet, and the headless/idle-human limitations remain.

Evidence: `/tmp/heartroot-section3-before-plain.json`,
`/tmp/heartroot-section3-after-plain.json`,
`/tmp/heartroot-section3-after-detail.json` and the preceding section's detailed
capture. Focused tests cover real build commands versus forced full rebuilds,
route-cache invalidation, successive overlapping additions/removals, and fallback
for duplicate or out-of-order additions. Building observation classification is
still conservative; ability target enumeration is the next major CPU contributor.
Validation: 791 regression tests and application TypeScript pass. Four replicas
with synthetic delays/stall agree at all seven checkpoints and retain full audit
`3789296646` at tick 6600 (`/tmp/heartroot-section3-four-peer.json`).

### Section 4: reject unseen spell targets before constructing actors

Autocast previously materialized combat/source records for every live body, then
performed neutral line-of-sight tests before rejecting targets beyond the existing
24-unit sight radius. The game host now offers an optional ordered visible-target
query using the same visibility predicate as direct targeting. Cheap radius
rejection precedes LOS; detailed records are built only for surviving candidates.
Player casters retain full shared vision (including distant allies), and other
hosts retain the original fallback. Stats are resolved once per actor/caster
record and reused for its source snapshot, with no cache spanning mutations.

Paired unprofiled Heartroot ticks 6001–8400, excluding the first 200:
- Ability lifecycle: **0.972 → 0.450 ms mean**, **4.02 → 0.99 ms p99**.
- Total accounted non-render: **4.52 → 4.03 ms mean**, **8.93 → 7.62 ms p99**.
- Both end at 229 units and full audit `2923285889`.

The isolated candidate-query change reduced detailed visible-target enumeration
from **0.519 to 0.019 ms/tick mean** before the additional stat reuse. No update
cadences, ranges, spell scoring or choices changed. The total budget is not met;
movement/combat planning now leads remaining costs, and live browser/busy human
coverage is still required.

Evidence: `/tmp/heartroot-section4-before-plain.json`,
`/tmp/heartroot-section4-after-plain.json`,
`/tmp/heartroot-section4-query-detail.json`. New tests compare the original full
enumeration with the query for player/neutral casters, air and concealed targets,
exact sight-radius boundaries, distant player allies, autocast events/full state,
and stat reuse without stale source records.
Validation: 1,344 tests across game, networking, AI, sessions and the entire ability
suite pass; application TypeScript passes. Four replicas with synthetic delayed
delivery/stall retain all seven checkpoint matches and full audit `3789296646`
at tick 6600 (`/tmp/heartroot-section4-four-peer.json`).

### Section 5: movement attribution and a routing policy decision

Added opt-in scopes for terrain/reservation and body sweeps, nearby free positions,
local detours, yielding, traffic-request discovery, combat visibility, weapon
terrain clearance and target indexing. The benchmark's `--trace-routes` retains
32 bounded query records, including expanded nodes and whether a route succeeded.
These records diagnose searches; they are not an unprofiled budget result.

In `/tmp/heartroot-section5-before-detail.json`, ordinary movement terrain sweeps
average 0.021 ms/tick and physical body sweeps 0.026 ms/tick. A* expansion beneath
move orders contributes 1.04 ms on average within the slowest 1% of whole ticks.
The 18.4 ms maximum in that capture warranted query-specific evidence rather
than assuming all collisions or all searches were equally expensive.

`/tmp/heartroot-section5-routes.json` identifies successful long-distance routes:
- Tick 6451, warrior 4476: (82,101) → (76,415), 319 route cells, 4,119 nodes
  expanded, 8.69 ms; no dynamic blockers or full-search fallback.
- Tick 7807, warrior 4422: (445,388) → (428,76), 321 route cells, 7,721 nodes,
  3.09 ms; no dynamic blockers or fallback.
- Warrior 4490 receives successive changed distant goals at ticks 7891, 8051,
  8171 and 8291; fresh successful searches expand 3,417–5,417 nodes.

Both diagnostic replays retain full audit `2923285889`. This is evidence of valid
long routes and repeated distant replanning, not an infinite failed-search loop.
No routing policy changed. Requested user direction before implementing either
route reuse with a checked new ending (which can retain a small detour), bounded
multi-tick planning (which delays readiness), or further exact-path optimization.
Validation: 82 focused movement/navigation/profiling tests pass; application and
benchmark TypeScript checks pass. No gameplay change is included in this section.

### Section 6: global navigation and crowd movement are separate workstreams

User direction: first make long-distance terrain routing fast and optimal; group
orders, yielding, pushing and crowd avoidance are a separate subsequent problem.
Do not trade away reachable passages or route quality to produce a faster timing.
Keep the interfaces compatible with shared destination routing, but do not change
collision behavior or group orders as part of the global-routing experiment.

The development-only Recast/WebAssembly probe lives in
`scripts/bench/global-navigation.ts`. It consumes current simulation ground
walkability/occupancy and heights, never renderer triangles or moving-unit
occupancy. No runtime code imports Recast. Run it with:

```sh
npx vite-node --config vitest.config.ts scripts/bench/global-navigation.ts \
  --checkpoint /tmp/heartroot-3ai-6000-checksum92-save.json \
  --queries 32 --repeats 10 --output /tmp/heartroot-navmesh.json
```

The dedicated config avoids invoking unrelated asset-publishing validation.
Reports include build/input costs, polygons, tiles, cold queries, warm query
distributions, full-body validation, endpoint/partial failures, route lengths
against the existing smoothed routes, and before/after full-state checksums.
Both all-query timings and timings restricted to mutually successful queries are
reported. Never call the latter an overall replacement speedup. This is a frozen
world microbenchmark, not whole-match p99, and the existing smoothed route is not
an exact Euclidean shortest-path oracle. Bridge decks are currently excluded and
their count is explicit; no hidden grid fallback repairs the candidate results.

Initial Heartroot checkpoint evidence (`/tmp/heartroot-navmesh-quality.json`):
- 196,983 ground cells became 31,084 polygons in 256 tiles; build 1.52 seconds,
  input extraction 42 ms. This bake cost is not paid per query.
- All 32 selected long routes are reachable using current navigation. Candidate
  Recast routes pass authoritative body sweeps and exact endpoint connections for
  23; nine terminate short. Library `success` alone is insufficient.
- On the 23 valid pairs, warm query mean is 0.201 ms versus 1.718 ms for current
  A*, p99 1.025 versus 4.913 ms. Across all queries including failures, candidate
  p99 is 2.433 ms; these are not 320 independent orders or whole-match timings.
- Accepted candidate paths average 6.6% longer than current smoothed routes;
  worst is 35.3% longer. Representation/clearance and corridor selection both need
  investigation before attributing the detour to the search algorithm alone.
- Full-state checksum remains `1406845104` before/after; zero simulation ticks
  advance. Coordinates from later recorded slow queries are explicitly retested
  against this frozen checkpoint, not represented as exact later-world replays.

A finer 0.125 voxel / smaller radius-erosion trial
(`/tmp/heartroot-navmesh-fine.json`) produced 65,142 polygons, a 3.50-second build,
27 clearance failures and five partial paths. Finer sampling alone is not a fix
for the mismatch between Recast erosion and the game's square body sweeps.

Next acceptance gates: accurate clearance-preserving representation, complete
routes, shortest-path verification (polygon A* plus funnel is not a guarantee of
global Euclidean optimality), local tile-update costs, bridges/body profiles,
deterministic replica validation, then integration and whole-match accounting.
An optimal mesh-search candidate is Polyanya:
<https://www.ijcai.org/proceedings/2017/70>. No candidate has been promoted to the
live simulation, and neither the global-routing nor whole-match budget is met.

Validation: 25 tests across probe acceptance, grid navigation, sector navigation
and smoothing pass; application and benchmark TypeScript checks pass. The final
`/tmp/heartroot-navmesh-verified.json` repeats the same 23/32 accepted routes and
length ratios after adding endpoint-height checks and aggregate quality counters.
Its valid-pair query p99 is 1.022 ms versus 4.892 ms; full audit remains unchanged.

### 7. Clearance mesh and weighted search experiment — 2026-10-04

This section records the prototype experiment. Section 8 supersedes its
integration status and aggressive weight-2 performance figures.

The routing objective now explicitly permits modest detours for substantially
lower CPU cost. Global Euclidean optimality is **not** an acceptance requirement.
Reachability, body clearance, destination accuracy, deterministic integration,
and visibly reasonable paths remain requirements. A heuristic weight is a tuning
parameter, not a proven upper bound on the final detour.

`src/shared/navigation/groundMesh.ts` constructs a tiled polygonal representation
directly from static collision and height-step boundaries. Cuts preserve square
body clearance on the simulation's fixed-point lattice (with a two-step safety
margin), avoiding the second Recast voxel-erosion approximation. Disconnected
islands, holes within islands, and differently subdivided tile seams are covered
by tests. This is planar ground geometry, not a general layered surface mesh.

`groundMeshQuery.ts` uses weighted A* over triangle portals, followed by funnel
tightening. Small spatial buckets locate endpoints; connected-component labels
reject impossible destinations without exhausting the graph. Default weight 2
favours speed. Weight 3 saved little mean time in the original 32-query sample
but increased detours, so it was not selected. Queries do not reuse cached routes.

Reproduction (same frozen Heartroot tick-6000 save as section 6):

```sh
npx vite-node --config vitest.config.ts scripts/bench/global-navigation.ts \
  --checkpoint /tmp/heartroot-3ai-6000-checksum92-save.json \
  --queries 128 --repeats 10 --representation exact --weight 2 \
  --output /tmp/heartroot-groundmesh-final.json
```

Observed final run: 40,414 triangles in 256 tiles; collision input copy 5.88 ms,
mesh plus query-index construction 135.91 ms. Of 128 requests, all 117 grid-reachable
routes passed the authoritative square-sweep and endpoint checks. Both systems
rejected the other 11; there were no unexpected route failures. Full-state audit
was unchanged. Warm queries across all requests: grid mean 1.817 ms / p99 6.361 ms;
mesh mean 0.061 ms / p99 0.231 ms (about 30× / 28× faster). Including explicit
post-query collision validation: mean 0.122 ms / p99 0.322 ms. Paths averaged 3.54%
longer than smoothed grid routes; p99 stretch 15.4%, worst 19.5%. These are a frozen
world microbenchmark, not whole-match acceptance or a guarantee for other maps.

The live game debug panel now overlays the candidate mesh in cyan alongside the
existing actual unit paths and collision cells. Builds are off-thread, requested
only on static collision revisions, and reuse unchanged tile triangulations.
The input and clearance masks are still scanned across the snapshot. This is
debug-only: the authoritative simulation still uses its existing grid solver.
The panel is bounded so long timing labels cannot obscure the whole battlefield.
Live Heartroot validation confirmed rendering, movement paths and toggle disposal.

Remaining production gates: dirty-region input/index updates (including component
splits), bridge decks and movement/body profiles, deterministic replica validation,
safe integration with existing route-following, and whole-match p99 measurement.
Do not claim the complete 3 ms CPU goal from these results. The existing invalid
`asset.assistant-trials.frost-relay-icon` blocks normal Vite startup; browser testing
used a temporary isolated Vite config without the content-authoring plugin and
did not modify that asset or repository validation.

### 8. Authoritative ground-mesh integration — 2026-10-04

Normal ground units now use the clearance mesh for long routes (at least 16 cells
on either axis), including AI orders. Production uses weight **1.2**: weight 2
failed Heartroot's existing start-route fairness and camp-clearance checks.
The fairness test now measures the actual smoothed movement path, and camp
clearance samples every smoothed segment. Neither tolerance was relaxed.
Prototype speed figures above therefore do not describe production performance.

The mesh is built at world initialization/restore. Building and tree occupancy
changes update shared collision input only at changed cells. `GroundNavigation`
marks affected 32-cell tiles plus their body-clearance halo; local prefix tables
rebuild only those contours. Graph updates replace changed tiles and their
incident borders, preserving unrelated neighbor links. Connectivity visits
tile-level regions rather than every triangle or terrain cell. Stable tile and
triangle IDs, ordered links and integer search costs preserve replica tie-breaking.
The mesh and its caches are derived state, not serialized gameplay state.

Each returned funnel segment passes authoritative body sweeps. Its actual
sub-cell polyline is traced into legal adjacent cells, retaining the existing
movement, smoothing, cost-budget and save contracts. Rounding funnel corners
before tracing was insufficient and is deliberately avoided. Collision failure
falls back to the grid. Short/local routes, temporary traffic blockers, other
body radii, flight and maps with bridge decks retain their specialized routing;
this is not yet a replacement for every movement profile.

Frozen tick-6000 Heartroot comparison: 128 pairs, ten warm repetitions; all 117
reachable pairs valid, 11 unreachable in both systems, no unexpected failures.
Grid mean/p99: **1.885 / 6.642 ms**. Production routing, including sweep validation
and conversion: **0.450 / 2.367 ms** (about **4.2× / 2.8×** faster). Mesh funnel
length versus smoothed grid averages +1.29%, p99 +10.20%, maximum +11.74%; this
is neither a global shortest-path proof nor a guarantee for other maps. Initial
input copy took 5.84 ms and full mesh/index construction 104.77 ms. The full-state
audit remained unchanged during the frozen query test.

Four-player resumed match, human idle plus three real AIs, ticks 6000–8400 with
200 warm-up ticks: accounted non-render CPU **mean 3.969 / p99 6.923 ms**, versus
**4.064 / 6.975 ms** before integration. Whole-match p99 is effectively unchanged
and **does not meet 3 ms**. Changed routes also change subsequent gameplay, so
this is the same initial workload, not an identical per-tick query replay.
There were 278 mesh searches, all accepted without fallback, and 506 remaining
grid searches; grid expansions fell from 963,017 to 480,880. Sixty-one tile
replacements occurred during the workload (the cumulative 573 also includes
constructor/restore initialization). Orders/navigation remains the largest tail
category: p99 3.560 ms, including movement 2.505 ms and combat planning 1.232 ms.
These percentiles overlap and must not be summed. Remaining local routing,
obstacle-update spikes and non-navigation systems need separate investigation.

Accounting includes runtime, periodic checksum, production projection, codec and
an in-process transfer clone. Browser IPC, UI/input and rendering are excluded;
this is not acceptance of the full non-render browser budget or a human battle.
Per-check checksum p99 was 0.040 ms.

Validation: 99 tests across 16 files passed, covering local edits, component
split/rejoin, cold/warm equivalence, full rebuild invalidation, bridge fallback,
movement, map route quality, worker snapshots and two-peer lockstep/save restore.
The final allocation-only query change also passed all 26 focused mesh/map/net
tests and application TypeScript. Live Heartroot smoke testing confirmed AI play,
player movement and **Show ground navmesh (cyan)** alongside unit paths, with no
browser errors. The debug worker's snapshot build is separate from production's
local updates. Detailed contour and polygon-link timing scopes are available.

Reproduce current production measurements (run alone, without tests or a match
in another browser tab):

```sh
npx vite-node --config vitest.config.ts scripts/bench/global-navigation.ts \
  --checkpoint /tmp/heartroot-3ai-6000-checksum92-save.json \
  --queries 128 --repeats 10 --representation exact --weight 1.2 \
  --output /tmp/navigation-production-final-micro.json
npx vite-node --config vitest.config.ts scripts/bench/match-budget.ts \
  --resume /tmp/heartroot-3ai-6000-checksum92-save.json --ticks 2400 \
  --output /tmp/navigation-production-final-match.json
```

### 9. Movement and combat-planning investigation — 2026-10-04

The 3 ms p99 objective remains active work, not an achieved budget. New diagnostics
split traffic discovery into candidates, body index, dependency construction,
cycles, priority propagation and escape feasibility. Resolved stat costs are
attributed to callers in detailed profiling. `match-budget.ts --cpu-profile
/tmp/match.cpuprofile` samples only the live workload, excluding map compilation
and restore. Route traces distinguish grid expansions, mesh expansions and tile
replacements. Sampling and detailed instrumentation are not acceptance runs.

Behavior-preserving fixes in this pass:
- Traffic dependencies inspect only the next non-coincident waypoint; they no
  longer allocate coordinates for the entire remaining route before choosing it.
  A regression test appends 200 distant waypoints and verifies none is visited,
  with identical recovery requests.
- Units with no relevant statuses/modifier sources return early from control
  checks, rather than allocating empty modifier arrays and immunity sets. No
  status result is cached; newly applied effects remain immediately effective.
- Mesh seam updates filter only triangles on that seam, in place, and sort only
  boundary triangles in unchanged neighbors. Interior polygons are untouched.

A/B evidence uses the same tick-6000 checkpoint through tick 8400, with 200
warm-up ticks. Temporary read-only Vite source overrides restore the earlier
algorithms without changing the shared checkout; both sides retain equivalent
diagnostic scopes, disabled for measurement. Runs execute sequentially A/B/B/A:
before mean 4.622 and 4.508 ms, p99 8.023 and 7.975 ms; after mean 4.458 and
4.252 ms, p99 8.099 and 7.639 ms. Average CPU savings are modest; p99 overlaps
and no reliable tail-latency improvement is claimed. These current runs also
vary from section 8, so do not compare isolated headline timings as a controlled
speedup. Reports are `/tmp/movement-ab-{before,after}{1,2}.json`; temporary source
overrides are in `/tmp/movement-ab`. Every run ends with full audit `385344171`,
identical routing counters (506 grid, 278 mesh searches), and 229 units.
Validation: 82 tests across ten files pass, including traffic recovery, immunity,
mesh edits, formation/group/layered movement, body indexing and two-peer lockstep.
Application and benchmark TypeScript checks pass.

The initial detailed capture attributes about 0.78 ms per worst-1%-tick to local
grid A*, on average across those tail ticks. For example, the marshal retry at
tick 7767 searches 2,676 cells from (463,318) to (428,436), with 182 occupied
cells and a bounded cost of 182,000. Temporary congestion still recomputes the
route toward its distant destination, including a terrain-only budget query.
That is a distinct problem from the now-integrated global terrain mesh.

The user subsequently authorized autonomous decisions. A bounded local corridor
repair was prototyped and **rejected**: it reduced this replay's movement p99 to
0.73 ms but caused major opposing-traffic stalls. Its implementation was removed.
A CPU win with lost arrivals does not satisfy the goal.

### 10. Lifecycle scope and long traffic retries — 2026-10-04

The goal remains **3 ms p99 for complete non-render work**, including real browser
transport and UI. These results are headless evidence, not goal completion.

Retained changes:
- Unit-only containment, linked forms, weapon casts, hero return and item lifecycle
  loops reuse the maintained unit index. Fallen/held actors remain included, and
  mutation-sensitive loops retain snapshots. Generic statuses on other entity
  kinds are not narrowed. Observation resolves sight sources once per update,
  then applies each observer's existing sharing rules.
- Long traffic searches (at least 64 cells) use a 1.2 weighted heuristic only with
  at most three occupied cells within eight cells of the start. Dense traffic
  retains exact search: broad application changed crowded crossing behavior.
  The weighted solver uses a binary frontier, reopens improved closed cells,
  and retains the admissible lower bound for the caller's cost limit. This is
  a deterministic route-quality tradeoff, not a change to collision or cadence.
- A stopped actor reuses its terrain-only detour limit. Position, destination,
  body profile and static revision guard one scalar record per actor. Live
  traffic paths are still recomputed. Cold restore produces the same result.
- Dirty mesh tiles compare their clearance masks before replacing triangulations
  or graph links. Unchanged tiles retain both. Actual changes still match cold
  mesh builds, including seams and disconnected components.
- Dynamic grid obstacles use epoch-stamped integer membership rather than hash
  lookups in every expanded edge. The reusable mask is allocated only for a
  solver that encounters traffic; changing blockers never enter terrain caches.
- Empty modifier resolution shares an immutable empty list instead of constructing
  nested empty arrays for ordinary unmodified units.

Controlled sequential after/before/before/after replays, tick 6000–8400 with 200
warm-up ticks: before mean 3.616/3.587 ms, p99 6.588/6.365 ms; after mean
2.951/2.966 ms, p99 5.269/5.221 ms. A final run including the membership-mask and
empty-modifier changes measured mean **2.920 ms**, p99 **5.104 ms**. The latter
small change is not isolated evidence of a whole-match speedup. Overall target
is still unmet. Reports: `/tmp/overnight-navigation-{before,after}{1,2}.json`,
`/tmp/overnight-final-match.json`; baseline module overrides:
`/tmp/overnight-navigation-before/config.mjs`.

Final routing: 525 grid searches / 151,797 expansions; 211 biased traffic
searches; 555 terrain-budget reuses; 121 mesh queries / 58,535 polygon expansions.
561 tile builds include 512 load/restore builds, leaving 49 during the replay.
Uncached limits yield exactly the same final full audit (`2477931964`) but require
304 mesh queries. Mask-based tile reuse retains that audit and avoids 13 unchanged
tile rebuilds. Scope-only lifecycle changes retain the original `385344171` audit;
the new weighted routing intentionally changes the subsequent match trajectory
(230 rather than 229 living units), while repeated runs remain identical.

Traffic qualification uses `combat-traffic.ts --travel=160 --gaps=1,3 --units=8,24
--rotations=0,1 --ticks=2400`. All eight retained-policy fixture end hashes match
exact routing; dense single-cell crossing remains imperfect in both versions.
The benchmark now rebuilds navigation after writing its synthetic terrain wall.
Raw unrestricted weighting and bounded corridor repair both failed this quality
check and are not the shipped policy. Unit tests cover weighted reachability and
strict cost budgets, live blockers, cache invalidation, cold restore, shared sight,
containment/linked forms, hero return, and lockstep. TypeScript checks pass.

Flow fields remain a candidate for large groups sharing a destination, not a
replacement for collision and traffic negotiation. The tiled approach described
in [Game AI Pro, chapter 23](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter23_Crowd_Pathfinding_and_Steering_Using_Flow_Field_Tiles.pdf)
is the relevant starting point. No full-map flow field was added in this pass.
The next acceptance work must include active army battles and real browser CPU;
a mostly idle human slot with three AI controllers is not sufficient coverage.

The final four-peer run (`/tmp/overnight-four-peer.json`) replayed tick 6000–8400
through Room/Lockstep with delayed ordered transport and one injected 32-beat
stall. All 25 checkpoint comparisons and all four end-state full audits agree
(`2477931964`, 230 units per peer). This is correctness evidence, not an Internet
latency or browser CPU benchmark.

Next diagnostic capture: `/tmp/overnight-next-detail.json` and
`/tmp/overnight-next.cpuprofile`. Sampling highlights snapshot fog differencing
(`ViewEncoder.bytes`), unit stat resolution, moving-body index construction and
observation. Remaining slow routes include a dense warrior retry at tick 6782,
(464,317) → (428,437), 2,531 grid expansions. Some extreme per-scope outliers
include GC and profiling overhead; do not infer algorithm cost from a single
maximum. The fog receipt and body-index changes below follow from this profile. Match
acceptance still needs active armies and live browser worker/HUD accounting.


### 11. Snapshot fog receipts and refreshed collision buckets

`VisionMask` now publishes its existing changed-cell indices through a local
`ByteChangeJournal`. Snapshot encoding visits those indices instead of scanning
the complete map. History is capped at 16 publications and 16,384 indices; it
never links old full arrays. Coalesced frames, restored/changed owners, expired
history and unregistered/layer-projected arrays retain correct fallback behavior.
The wire protocol is unchanged. Encoder defensive byte copies still protect
callers that mutate external arrays in place. Tests cover repeated/reverted edits,
walk-deck fog, transfer detachment, history bounds and stream reset.

Sequential replay before/after (`/tmp/fog-receipts-{before,after}.json`): encoding
mean **0.267 → 0.020 ms**, p99 **0.348 → 0.047 ms**. Accounted CPU mean
**2.970 → 2.723 ms**, p99 **5.096 → 4.999 ms**. Both full audits are `2477931964`.

`Spatial` retains bucket storage between movement/planning passes, while each
`beginUnitMovement` still refreshes every current actor's collision state.
Replacement object identity on restore, membership, movement, containment, death,
exemptions and yield reservations are revalidated. Outside the scope, queries
still consult live entities. Buckets are membership sets, never gameplay priority
orders; traffic dependency IDs are sorted before making decisions. Warm/cold
collision tests and full-state replay remain equal. The isolated whole-match
comparison measured mean **2.712 → 2.702 ms**, p99 **5.114 → 4.868 ms**, which is
not strong enough to assign the tail difference solely to bucket reuse. The
structural benefit is fewer short-lived bucket allocations.

`match-budget.ts --human-army 32` explicitly stages a mixed human force near its
hall and sends one attack-move after warm-up via production lockstep input. All
three AIs remain active. Reports record attacks by owner, participants, combat
ticks and surviving staged soldiers. This is a controlled battle fixture, not
ordinary production startup or a substitute for browser acceptance.

### 12. Active-army evidence, local clearance and flow-field feasibility

The staged 32-unit assault does produce combat: 4,271 of 4,800 ticks contain
weapon attacks, 67 units participate, and all four player owners attack (plus
neutral camps). It is not four simultaneous armies fighting in one arena, and
all 32 staged humans survive this interval. Initial accounted CPU measured mean
**4.625 ms / p99 9.994 ms** (`/tmp/heartroot-active-assault.json`). This exposes a
much larger gap than the idle-human fixture. Diagnostic capture:
`/tmp/active-assault-detail.json` and `/tmp/active-assault.cpuprofile`.

Dominant slow-tick work: traffic grid expansion (~2.08 ms self on the worst 1%),
local detour body sweeps (~1.40 ms), observation, and stat resolution. A long
traffic retry from (81,444) to (82,92) visits 6,858 grid cells; nearby crowded
movement still takes the exact traffic solver rather than the static navmesh.

Retained behavior-preserving follow-ups:

- Local detours snapshot nearby body positions, collision modes and dimensions
  once per synchronous query. They reuse the same physical sweep predicate,
  including overlap escape and deck-height separation. Probes outside the local
  square fall back to the live query. No snapshot survives a movement decision.
- Local A* uses the existing binary frontier with the same f/h/node ordering,
  replacing a linear scan and splice of the open set. The search radius and
  expansion cap are unchanged.
- Unmodified unit stats share frozen definition/research results. Progression,
  equipment, item/spell status and slow holders always take the live path.
  Research keys use values, so in-place updates remain visible. Cache is bounded
  per immutable definition and weakly owned by its content registry.
- Idle wandering builds collision-mode occupancy only when a worker has a due,
  valid stroll candidate. The pass assigns routes without moving bodies.

After the first three changes the active fixture measured mean **4.238 ms / p99
9.252 ms**. Its full audit remains `2567195133`, with identical engagement counts.
Do not treat small successive timing differences as isolated proof; the local
body snapshot has a structural reduction in repeated work, and all variants
retain the same simulation outcome. Focused coverage includes local escape,
traffic, restored unit-index membership, bridge-floor sweeps, forms, items,
research, progression and snapshot transport.

The standalone `scripts/bench/navigation/flow-field.ts` compares 32 nearby starts
sharing exactly one destination on frozen Heartroot terrain. It measures field
construction, not just lookup. After warm-up, a whole-map reverse integration
field costs **21.5–22.2 ms** (122,521 nodes); restricting it to the union of the
existing coarse corridors costs **3.65–6.39 ms** (14,854 nodes). Extracting all 32
routes then costs **0.03–0.09 ms**. Independent warm grid routes cost **44.6–44.9
ms**; production mesh routes **6.73–6.82 ms**. All field routes pass physical sweep
checks, restricted/unrestricted field costs agree, and grid costs agree too.
Reports: `/tmp/flow-field-probe.json`. This is an optimistic sharing case: it omits
moving blockers, individual formation endpoints and invalidation. There is no
production flow field. A fresh global field per order would violate the CPU
budget; any integration needs bounded, reusable tiles and measured cold costs.

Final measurements including lazy idle occupancy: idle-human mean **2.494 ms /
p99 4.965 ms** (`/tmp/optimized-idle-final.json`), staged assault mean **4.133 ms /
p99 9.385 ms** (`/tmp/optimized-active-final.json`). Full audits remain
`2477931964` and `2567195133`. The **3 ms p99 goal remains unmet**; browser
main-thread/IPC accounting is still outstanding. Ordinary group-order spikes also
remain visible in max timings and must not be hidden by the percentile.

Active checkpoint four-peer replay, tick 10800–12000: all 13
checkpoint comparisons and four end-state full audits agree (`2089598993`).
The ordered transport includes one 32-beat injected stall. Report:
`/tmp/active-optimized-four-peer.json`. This validates replay/restore correctness,
not single-client timing.

### 13. Retry attribution and rejected field experiments (October 5)

The next retained changes preserve the existing active fixture's full audit
`2567195133` and all engagement counts:

- Ground shortcut validation checks center-line reservations before sweeping
  the complete terrain/body corridor. A reservation in the first few cells no
  longer wastes a long terrain sweep. Both predicates still run when needed.
- Published content has registry-owned ability/status indexes. Runtime form,
  status and immunity resolution avoids repeatedly searching and flattening the
  catalogue. Drafts remain mutable; publication creates new frozen declarations
  and a separate index. Latest-form selection uses a linear scan with the same
  timestamp/cast/identity tie order. Actor status state is never cached.

An isolated before/after shortcut run measured mean **4.128 → 4.090 ms**, p99
**9.243 → 9.127 ms**. Including declaration indexing measured mean **4.102 ms /
p99 9.094 ms**. These are small changes, not evidence of a breakthrough or a
reliable isolated indexing gain. Reports: `/tmp/reservation-order-before.json`,
`/tmp/reservation-order-after.json`, `/tmp/declaration-after.json`.

Diagnostics now distinguish repeated and failed traffic queries. Of 1,573
queries, 807 repeat the same actor/start/goal/cost/static-revision request, but
**none have the same complete global blocker set**. Failed queries consume only
8,228 expansions and 21 ms total; successful ones consume 1,294,995 expansions
and 511 ms. Thus successful long routes account for over 99% of expansions;
failed-query caching is not the next major opportunity. These are diagnostic
run totals, not per-frame budget values (`/tmp/retry-cost-active.json`).

Experiments were kept outside production and are **not enabled**:

- Waiting behind recently moving, aligned friendly traffic reduced expansions
  to 889,205, but mean CPU stayed 4.143 ms and p99 8.872 ms; combat timing changed.
  That does not justify shipping a new traffic policy yet (`/tmp/convoy-active.json`).
- Four terrain-only landmark distance fields cost 116.6 ms to construct and did
  not help the tail (4.054 ms mean / 9.392 ms p99). Ignoring harvestable obstacles
  makes their bound too weak here (`/tmp/landmark-active.json`).
- Reverse fields restricted to route corridors and shared by destination sector
  incurred 101 builds, 210 hits and 251 ms total construction. Mean was 4.000 ms,
  but p99 worsened to 10.184 ms. Invalidation/reuse and cold work cannot be omitted
  from a field comparison (`/tmp/corridor-field-active.json`).
- Caching exact transitions between sight footprints achieved 15,438 hits versus
  22,191 misses, but no overall gain (4.175 ms mean / 9.188 ms p99). It remains out
  of production (`/tmp/vision-delta-active.json`).

Validation: 140 tests in 14 files cover definitions/publication, forms, status
composition, immunity, traffic/collision, and ability/navigation lockstep.
Type-checking passes. Four peers restored at tick 10800 remain equal through
12000, including the injected transport stall: full audit `2089598993`, 243
units each (`/tmp/declaration-four-peer.json`). The **3 ms p99 goal remains
unmet**; these measurements still exclude browser input/HUD and real IPC CPU.

Additional observation experiments also remain outside production: compressing
sight footprints into cached contiguous runs measured 4.136 ms mean / 9.174 ms
p99; restricting obsolete ground-scenery memory checks to changed records
measured 4.125 ms / 9.177 ms. Neither establishes a worthwhile improvement in
this match. Both retained full audit `2567195133` in the replay, but were not
promoted solely on that evidence (`/tmp/vision-runs-active.json`,
`/tmp/stale-observation-active.json`).

A separate browser smoke test used Heartroot 512, one human and three AI players
at 2560×1440 / DPR 2, with detailed profiling enabled. It displayed 120 FPS while
worker-tick p99 rose from roughly 5 ms to 9 ms as the match progressed. The later
rolling panel also showed projection p99 0.50 ms, encoding 0.10 ms, decoding
0.10 ms, input 0.20 ms, and HUD/minimap data 0.70 ms. These are separate rolling
percentiles, **not additive measurements of the full budget**. Worker delivery
latency includes scheduling/waiting and is not interchangeable with CPU time.
The ten-second capture completed with no dropped samples, but copying/exporting
the trace through the browser tooling did not produce a verified local report.
Consequently this is UI smoke evidence, not a retained browser acceptance trace.
The isolated test tab was closed before further headless measurements.


### 14. Traffic destinations and exact-field costs (October 5)

The A* expansion loop now checks live reservation masks first and reads already
known terrain-edge bits directly. It preserves cardinal/diagonal clearance,
frontier ordering, route choices and replay state. The active fixture measured
4.041 ms mean / 8.901 ms p99 with full audit `2567195133`; this is a modest
single-run result, not a new acceptance baseline. Navigation, traffic budgets,
layered movement, mesh integration and lockstep passed 36 tests in five files;
TypeScript checking passed (`/tmp/edge-mask-tests.log`, `/tmp/edge-mask-types.log`).

`match-budget.ts --trace-routes` now reports traffic demand grouped by destination:
query/failure counts, expanded cells, time, distinct origins/actors and static
revisions. This complements the existing 32 slowest queries. Collection is
bounded and opt-in; untracked queries and capped distinct counts are explicit.
These instrumented runs are diagnostic, not budget acceptance evidence.

The longer diagnostic found 131 distinct traffic destinations. The most costly
one had only 20 queries but 139,451 expanded cells; another had 197 queries and
124,299 expansions. Several outliers are formation moves from approximately
(80,440) to (80,76–92), with different nearby endpoints per unit. They are not
one shared destination. `/tmp/route-groups-active.json` retains the evidence.

Further experiments, **not shipped**:

- Trying the existing mesh before traffic-aware grid fallback reduced grid
  expansions to 1,061,547 but incurred 372 rejected mesh routes. Total p99 was
  9.461 ms. This shifted combat/route choices without improving the CPU target.
- Exact-destination reverse fields, with corridor-local terrain invalidation,
  reduced grid expansions to 381,456. However, 167 field builds cost 464 ms
  in total and expanded another 2,265,697 cells. Mean was 4.061 ms and p99
  9.749 ms. Search work must include constructing the guide itself.
- Reusing fields across a growing union of corridors reduced builds to 122
  and construction to 353 ms, but p99 remained 9.612 ms. In addition, different
  warm/cold guide domains could affect equal-cost path ties; this design has
  **not** established restore/lockstep equivalence and is not production-safe
  merely because every resulting route is geometrically valid.
- Smaller terrain visibility bounds and a bounded exact sight-ray cache did
  not improve the complete active-match measurement (p99 9.111 and 9.066 ms).

Reports are `/tmp/traffic-mesh-active.json`, `/tmp/exact-local-field-active.json`,
`/tmp/shared-local-field-active.json`, `/tmp/tactical-eight-active.json` and
`/tmp/tactical-cached-active.json`. These experiments do not satisfy the 3 ms
p99 objective. Reusable incremental search remains a candidate, but must account
for initialization, changed edges, memory, and deterministic cold restoration;
see the original [D* Lite paper](https://idm-lab.org/bib/abstracts/papers/aaai02b.pdf).

### 15. Incremental fields and avoiding irrelevant work (October 5)

Additional routing prototypes remain **outside production**:

- An exact corridor distance field repaired locally after terrain edits passed
  600 cold-versus-warm distance comparisons. Active-match p99 was 8.556 ms
  (3.986 ms mean), with 137 builds / 195 hits and 179 ms of field construction
  and repair. Enlarging domains to reuse nearby corridors increased p99 to
  10.254 ms. This still does not justify the extra field storage and complexity.
- A D* Lite-style traffic solver reuses previous search values across moving
  starts, body reservations and terrain changes. In 360 directed/undirected
  graph cases, warm routes matched cold routes and reference shortest costs.
  Updating only predecessors whose best successor changed reduced prototype
  repair time from 528 ms to 185 ms in the match. Total active-match p99 was
  still 8.805 ms (3.988 ms mean). Real-game cold restoration, bottleneck behavior
  and heap memory bounds remain unverified; this is not a shipped replacement.
- Even a 1% heuristic bias in dense long-distance traffic degraded opposing
  streams: in the rotated three-cell crossing, only 19 units per side crossed
  instead of all 24. This was rejected before active-match performance testing.

The retained changes remove work without changing routes or update cadence:

- Ability hosts can provide live bindings/state without constructing an actor.
  Aura, autocast and release passes materialize combat/source records only when
  their eligibility checks find actual work. Ordinary hosts retain an eager
  fallback; there is no cache of mutable ability state. Event metadata and allied
  mana reads use the same lightweight access. Definitions use the registry index.
- Automatic combat acquisition rejects non-hostile candidates before footprint
  distance, weapon/form eligibility and visibility checks. Friendly formations
  are therefore inexpensive to exclude; explicit forced attacks are unaffected.
- Unmodified, non-flying entities return their authored form definition directly.
- Sight footprint generation samples observer height once and uses direct grid
  heights for integer targets. Conservative block minimum/maximum bounds can
  prove an entire footprint unobstructed. Cliffs and uncertain footprints retain
  individual ray tests, including the interpolation halo. No fog resolution,
  visibility rules or update frequencies change.

The same active 6000→10800 fixture (32-unit human attack and three AI players)
measured 3.553 ms mean / 8.303 ms p99 after these changes. The preceding candidate
pruning run measured 3.650 / 8.532 ms. Sight-mask mean fell from 0.410 to 0.311 ms.
A repeat measured 3.550 ms mean / 8.378 ms p99
(`/tmp/candidate-sight-repeat.json`). All ended with full audit `2567195133`,
identical engagement and 257 units. These are isolated headless runs, not a
browser acceptance result. Reports:
`/tmp/ability-candidates-active.json`, `/tmp/candidate-pruning-active.json`,
`/tmp/sight-batch-active.json`; experiments:
`/tmp/incremental-field-active.json`, `/tmp/canonical-field-active.json`,
`/tmp/incremental-route-fast-active.json`, `/tmp/mild-weight-crossings.log`.

Validation includes 154 ability/combat tests in 14 files, 46 focused candidate/form
checks in seven files, and 27 sight/movement tests in five files (suites overlap).
The sight cases include 360 complete footprints compared with unaccelerated rays.
Four restored peers agree at all 13 checkpoints from 10800→12000, including the
transport stall; final full audit `2089598993`, 243 units each. Type-checking and
whitespace checks pass. The 3 ms p99 objective remains open: movement retry tails
still dominate, and browser input/HUD plus real IPC CPU are not included here.

### 16. Reused visibility coverage and navigation buffers (October 5)

Retained changes preserve the active fixture's full state and engagement:

- Grid expansion skips known impassable directions before coordinate/heuristic
  work. Collision DDA uses its already-known crossing axes instead of deriving
  adjacency again for every footprint ray; ordered collision probes are unchanged.
- The mesh frontier reuses storage rather than allocating an entry per portal.
  It keeps the exact priority/triangle-ID order and releases consumed or retired
  geometry references. It does not change the mesh heuristic or selected route.
- Forest views reuse the existing per-observer static coverage. Live detection
  and layered-floor visibility still apply. Stale-memory checks track only
  changed/missing footprints; ordinary scout movement no longer rechecks every
  remembered tree. This index is rebuilt from knowledge after restoration.
- Empty concealment/detection queries return immediately; active declarations
  use the existing immutable registry index.

The active 6000→10800 run measured **3.378 ms mean / 7.979 ms p99**
(`/tmp/stale-index-active.json`), compared with 3.550 / 8.378 ms before this pass.
A repeat measured 3.419 / 7.795 ms (`/tmp/reused-coverage-repeat.json`).
Scenery-knowledge mean fell from approximately 0.089 to 0.046 ms. The final full
state audit remains `2567195133`, with 257 units, 4,271 combat ticks and identical
attacks. These are headless accounted CPU measurements, still excluding real
browser IPC and input/HUD. The 3 ms p99 goal is not achieved.

Validation: 81 tests in 15 focused files pass, including the 3,000 ordered sweep
comparisons, edited/cold mesh queries, scenery reveal/hide/move/remove/restore,
concealment and layered movement. Type-checking passes. Four peers agree at all
13 checkpoints through tick 12000 and the transport stall; full state audit
`2089598993`, 243 units each (`/tmp/reused-coverage-four-peer.json`).

Further experiments remain outside production:

- Shared obstacle-aware landmark fields: 8.019 ms p99, but a 90 ms cold-build
  spike. Precomputed dynamic direction masks and cached mesh transit distances
  added storage without a useful match-level improvement.
- A local traffic head joined to a static route reduced grid expansions from
  1.30 million to about 69,000 and measured 6.890 ms p99. A narrow-passage guard
  plus exact-query memoization measured 6.804 ms after the safe changes above.
  Opposing single-file streams remain uneven/regressed in one orientation, so
  this route-policy change is not shipped. Sources and reports remain under
  `/tmp/local-head*`; all 24 units per direction crossed the wider three-cell passages.

### 17. Local static-observation edits and bundled measurement (October 5)

Creation/removal receipts now update building/resource membership and only their
old/new visibility footprints. Adding one building no longer classifies every
forest object or clears/rebuilds the map-sized static index. Overlapping footprints
retain their order; fog coverage is refreshed with the existing visibility rules.
Unknown edits, forms, editor refreshes and restoration still use full classification.
Tests compare incremental state, observations and full checksums with full rebuilds,
including overlap removal, transient objects and hidden memories.

Use `npm run bench:match -- --resume <checkpoint> --human-army 32 --ticks 4800
--output <report>` for the bundled headless runtime. The runner bypasses authoring
Vite plugins, bundles into a temporary `.asset-work` directory, forwards benchmark
arguments and removes its bundle afterwards. It measures the same workload and
codecs as `vite-node`; it still excludes real browser IPC and input/HUD CPU.
Do not compare different runners as if the difference were a game optimization.

Before this change the bundled baseline measured 3.209 ms mean / 7.383 ms p99.
The local-static run measured 3.265 / 7.053 ms; the new runner's repeat measured
3.128 / 6.514 ms. Treat this variation as a range, not a guaranteed speedup.
All end at audit `2567195133`, 257 units and identical engagement. Reports:
`/tmp/bundled-active.json`, `/tmp/static-receipts-active.json`,
`/tmp/bundled-runner-verified.json`. Four restored peers agree at all 13 checkpoints
through tick 12000 including the transport stall; audit `2089598993`, 243 units
(`/tmp/static-receipts-four-peer.json`). The 39 focused tests pass in ten files.

Routing experiments remain unshipped. An opposing-order guard preserves the eight
crossing fixtures but reduces the local-head speedup (7.25–7.43 ms p99 through
`vite-node`). A failure-proof cache found no expensive reusable failures: the
costly active-match searches mostly succeed. Per-pass target-query caching reused
16% of queries without a convincing match-level improvement. The next routing
work must reduce repeated successful long searches without regressing traffic.
The complete 3 ms p99 goal remains open.

### 18. Worker field deltas and bounded local-search storage (October 5)

Worker snapshots now send complete entity records only for new identities or a
reset. Existing entities send changed top-level fields and explicit removals;
nested JSON values are compared because projections recreate idle control/status
objects. Decoding creates new changed records and preserves unaffected references.
Private selection has its own baseline. The acknowledged/coalesced stream, fog
receipts and scenery-revision rules remain unchanged. This operates on immutable
presentation snapshots, not on simulation state or the network checksum.

The paired bundled active run measured combined encode + transfer-clone + decode
at **0.231 ms mean / 0.457 ms p99** before and **0.168 / 0.281 ms** with field deltas.
This is one measured span, not a sum of percentiles. Overall accounted CPU was
3.200 / 6.999 ms versus 3.120 / 6.538 ms. Reports are
`/tmp/entity-delta-reference-active.json` and `/tmp/entity-delta-final-active.json`.
The transfer remains an in-process clone proxy, not browser IPC.

`bench:match --verify-projection` compares every decoded frame with its source
outside the timed span; use this for correctness only, since its allocations can
perturb subsequent samples. All 4,800 active-match frames matched in
`/tmp/entity-delta-projection-verified.json`. Protocol tests cover nested changes,
absent versus undefined fields, unchanged values, removed fields, reset, private
selection, coalescing, transfer ownership and retained previous entity records.
The worker-client fixture now supplies the existing navigation-overlay reset API.
The focused worker/session/item/aura suite passes 86 tests in nine files.

Local escape searches reuse a small pool of typed-array cost/predecessor/stamp
buffers and frontiers. Nested clearance searches borrow separate buffers; returned
points never alias scratch storage. Closed/dominated neighbors are rejected before
point allocation. An offline comparison matched paths and ordered clearance
probes for 2,000 layouts; 83 movement/navigation tests in 11 files pass, including
nested searches, throwing callbacks and retained returned paths. Empty equipment
no longer creates aura/proc duplicate-suppression Sets. The resulting active run
measured **3.031 ms mean / 6.541 ms p99** (`/tmp/local-scratch-active.json`), retaining
full audit `2567195133`, 257 units and identical combat. Type-checking passes.
Four restored peers also agree at all 13 checkpoints through tick 12000, including
a transport stall: full audit `2089598993`, 243 units each
(`/tmp/worker-delta-local-scratch-four-peer.json`).

Further experiments were not retained:

- Bidirectional grid search expanded 9,039 nodes for a captured 6,858-node query;
  allowing 5% extra distance still expanded 8,526. No win from that direction.
- Repairing only 24 m of the existing route reduced grid work substantially, but
  regressed one dense opposing narrow crossing. Earlier yielding improved some
  crossings alone; combining it with local repair still regressed others.
- A six-cell band around the computed static route measured 6.753 ms p99 and
  changed combat trajectories; insufficient benefit to adopt that constraint.
- A conservative exact-result cache invalidated by occupancy changes within the
  inspected bounding region had zero useful hits (6.965 ms p99). Most relevant
  live occupancy is changing; a scalar terrain-budget cache is not evidence that
  the dynamic route itself is reusable.
- Smaller terrain-height blocks, native visibility-row intervals, and reusable
  reverse-reachability probes had no convincing match-wide improvement. Sources
  and reports remain in `/tmp`, not production.

The detailed tail profile still attributes the largest search cost to traffic
retries' grid A* expansion, followed by mesh queries and sight masks. The 3 ms
**whole non-render p99** goal remains open; browser IPC and input/HUD also still
need acceptance measurements. Do not interpret these headless gains as completion.

### 19. Compact sight coverage and convoy search priority (October 5)

Visibility now retains half-open cell intervals. Clear circles produce row spans
without generating thousands of interior cell IDs; occluded rows split at hidden
cells. `VisionMask` skips equal interiors when updating coverage. Dense arrays
remain available lazily for other callers. Both forms count against the bounded
cache budget. Mixed dense/interval inputs, overlap, radius/elevation changes,
removal, map edges and restoration match full recomputation. The visibility-only
active run retains audit `2567195133`; sight-mask mean/p99 changed from
0.301/0.954 ms to 0.252/0.881 ms (`/tmp/sight-spans-active.json`).

Long traffic retries now allow the existing 1.2 search bias for dense convoys,
not just sparse traffic. Same-controller crossing orders retain exact priority;
other controllers' opposing orders do so within 16 cells. Distant activity by
other controllers cannot disable the convoy fast path. All bodies remain blockers,
all accepted steps retain full clearance, and the existing route-cost cap still
applies. This deliberately changes some route choices and resulting combat; it
is not claimed equivalent to the old match trajectory. The eight opposing-stream
fixtures retain their previous outcomes (including existing narrow-gate jams).

With both changes, the production repeat measured **2.992 ms mean / 5.736 ms p99**
(`/tmp/convoy-spans-final-active.json`); the preceding variant measured 5.668 ms
p99. Grid expansions fell from 1,304,152 to 551,410. The revised active trajectory
ends at audit `3664380072`, 254 units, 3,955 combat ticks and 83 attackers; all 32
human units survive. This is still headless CPU with a transfer-clone proxy, and
**does not meet the 3 ms whole non-render p99 goal**.

Validation: 122 tests in 22 focused files pass; type-checking passes. All 4,800
worker projections match their decoded frames. `--verify-restore` reconstructs
a cold runtime halfway through the same active run; full audits match at 13
checkpoints through tick 10800, and final complete snapshots match. Four peers
then agree at all 13 checkpoints through tick 12000, including a transport stall;
full audit `2155292931`, 239 units each. Reports:
`/tmp/convoy-spans-correctness.json`, `/tmp/convoy-spans-four-peer.json`.

Measurement correction: some earlier experimental bundles were launched using
shell Node 22 while the standard runner uses project Node 24. Their correctness
results remain valid, but their times cannot establish a speedup over Node 24.
`bench:match --vite-config <path>` now applies source variants using the same
executable and bundle settings as production and prints runtime identity. Rechecks
under Node 24 found no useful gain from smaller terrain blocks or reverse-probe
buffer reuse; those remain unshipped. Correctness flags perturb allocation/CPU
and must not be used for budget acceptance.

The post-change diagnostic (`/tmp/convoy-spans-next-profile.json`) puts sight-mask
work first in the slow-frame self-time breakdown (~0.699 ms), followed by economy
(~0.454 ms) and movement's grid expansion (~0.433 ms). Mesh corridor searches still
contribute in both combat planning and movement (~0.365/0.323 ms). These are
conditional means in instrumented slow frames, not independently additive p99s.
The next pass should follow this updated distribution rather than assuming the
old grid-search spike still dominates.


### 20. Resource timers and sight-query allocation (October 5)

The economy checked every entity every tick for pending regrowth, even when no
resource was growing. A derived pending-resource index now handles those timers.
Scheduling, cancellation, removal and restore maintain membership; candidates
retain authoritative entity order rather than timer insertion order. Due sites
still run the original clearance and maturation logic. This removes the idle
forest scan, not the remaining full occupancy rebuild when a tree actually matures.
Economy jobs/production mean fell from 0.101 to 0.031 ms in the active fixture;
intermittent unit deployment still produces its roughly 1 ms p99.

Combat sight no longer spreads an entire entity into a temporary object to sample
its precise flight elevation. Sector queries deduplicate overlapping entries via
their first shared bucket, preserving query order without allocating a visited set.
Their iterators are read-only during consumption; nested queries remain independent.
Randomized query/order checks include negative coordinates, exact boundaries,
large footprints, updates and removals.

New opt-in scopes separate `Resource regrowth` from economy self time and
`Terrain sight footprint` from `Sight masks`. The latter measured ~0.105 ms mean
versus ~0.053 ms for coverage merging/publication in `/tmp/regrowth-sight-profile.json`.
These are diagnostic means, not independent p99 contributions.

The combined candidate measured **2.904 ms mean / 5.649 ms p99** in
`/tmp/sector-first-bucket-active.json`, compared with 2.992/5.736 before this pass.
The large confirmed change is removing the repeated forest scan; the smaller
whole-match tail difference is within run-to-run variability. The active match
still ends at full audit `3664380072`, 254 units, with unchanged routing and combat.
A production repeat (`/tmp/local-index-final-active.json`) measured 2.933 ms mean /
5.826 ms p99, confirming that this pass has not established a whole-match tail
speedup. The goal remains open, including real browser transport/input/HUD accounting.

Validation: 61 focused tests in 13 files, TypeScript and whitespace checks pass.
All 4,800 worker projections match decoded frames; cold/warm restore agrees at
13 full-audit checkpoints and final complete snapshots (`/tmp/local-index-verified.json`).
Four peers then agree through tick 12000 with one transport stall, full audit
`2155292931` and 239 units each (`/tmp/local-index-four-peer.json`).

Additional experiments remain outside production:

- A coarse connected-region route followed by polygon search in that region
  corridor (with or without a neighboring-region halo) reduced polygon expansions
  by ~17%/~51%, but produced no convincing whole-match p99 improvement and changed
  route choices. `/tmp/mesh-region-active.json`, `/tmp/mesh-region-narrow-active.json`.
- An 8,192-entry exact terrain sight-ray cache hit ~95% of calls, but key/cache
  overhead consumed the savings. `/tmp/sight-ray-cache-active.json`.

A fresh CPU sample (`/tmp/regrowth-elevation.cpuprofile`) identifies player-view
construction, terrain rays and movement/visibility index maintenance as substantial
remaining costs. Profiling samples/GC must not be treated as precise per-tick
budgets; use them to select focused work, then compare unprofiled runs.

### 21. Actor projection and local scenery coverage (October 5)

New view scopes separate actor assembly, known scenery, colony summaries and
ordering. In the diagnostic run, actor assembly dominated human projection
(~0.150 ms inclusive mean, versus ~0.027 ms for known scenery). The actor builder
now assigns optional fields directly instead of constructing many conditional
spread objects. Privacy rules, field presence and nested copies remain intact;
hero progression bonuses additionally get an independent copy, fixing an existing
alias into simulation state.

A matched old-builder control measured projection mean/p99 **0.268/0.445 ms**;
the new builder measured **0.233/0.395 ms**. Whole accounted headless CPU changed
from **2.914/5.851 ms** to **2.838/5.575 ms**, with the same final audit
`3664380072` and 254 units. Reports: `/tmp/actor-projection-control.json` and
`/tmp/actor-projection-final-active.json`. A differential harness compared 3,072
private/public actor-field combinations against the historical builder. Focused
tests additionally cover private-state redaction and independent nested views.

Local static edits previously updated footprint membership locally, then rescanned
every player's visible terrain to reconstruct scenery coverage. Receipt-driven
updates now recount only changed footprints against the new sight mask. Ordinary
mask deltas update all other footprints; bulk edits/initialization retain the full
fallback. Tests exercise overlaps, creation/removal, simultaneous scout movement,
hidden memories and restore against full recomputation. A separate test verifies
that adding a building/removing a tree never iterates the whole visible-cell set.
The active repeat measured **2.875 ms mean / 5.609 ms p99** with unchanged audit;
this removes a global invalidation but does not establish a whole-match tail gain.
Report: `/tmp/local-coverage-active.json`.

All 4,800 worker projections and 13 cold/warm restore audit checkpoints agree,
including final complete snapshots (`/tmp/local-coverage-verified.json`).
The combined version passed four-peer transport validation at all 13 checkpoints
through tick 12000 with one synthetic stall, full audit `2155292931`, 239 units
each (`/tmp/local-coverage-four-peer.json`). All 53 focused tests in 12 files pass.

A stable-membership UnitIndex prototype remains outside production. It skips
rebuilding identity membership when the input sequence is unchanged, but its
2.848/5.613 ms whole-match result did not justify another retained cache.
Report: `/tmp/unit-index-stable-members-active.json`.

The first live browser capture used the normal local save loader, adapting only
fixture player labels/revision metadata to the UI's content revision. It ran the
active Heartroot checkpoint with one human and three AI. Detailed profiling was
enabled: worker tick p99 was 13.6 ms and HUD/minimap-data p99 7.6 ms. These are
diagnostic observations, **not normal-play acceptance results**: hierarchy sampling,
large debug reports, real rendering and a later match interval differ from the
headless fixture. The 29.6 ms snapshot-delivery p99 is elapsed latency, not CPU.
Report: `/tmp/browser-heartroot-active-capture.json`. The temporary browser match
was closed before further isolated tests. Next: separate basic budget sampling
from detailed profiling, and split HUD/hover/minimap attribution. The 3 ms p99
goal remains open; neither adding category percentiles nor the headless clone
proxy establishes the complete browser CPU budget.

### 22. Browser budget capture and incremental minimap fog (October 5)

`game_performance` now distinguishes `mode:'budget'` from `mode:'details'`.
Budget mode retains core timing samples while disabling the hierarchical worker
profiler, trace event allocation and debug display updates during the capture.
Reports record these settings explicitly. Detailed mode remains available for
attribution. Switching modes discards pending samples from the previous mode.
HUD scopes now separate fog state, settlement/mission controls, selection overlays
and actual hover raycasts. The whole HUD parent remains inclusive.

Two matched live-browser repeats restored the active-army checkpoint through the
ordinary save loader and captured ticks 11000–11400 after five seconds of warmup
(fetch completed at 11440). Each has 1,200 render frames and 400 simulation ticks.
Before the fog change, budget mode measured fog-state mean/p99 **0.084/0.5 ms**
and HUD/minimap **0.147/0.8 ms**. Afterward, fog-state mean/p99 was
**0.0013/0.1 ms**, repeated **0.0025/0.1 ms**; HUD/minimap was
**0.068/0.3 ms**, repeated **0.066/0.3 ms**. Timer precision limits interpretation
of very small samples. Reports: `/tmp/browser-budget-first.json`,
`/tmp/browser-budget-fog-receipts.json`, `/tmp/browser-budget-fog-repeat.json`.

Previously every fog revision resized a 512² canvas, allocated a new RGBA image,
scanned every cell and uploaded it. The minimap now retains its pixels and consumes
the decoder's existing packed change indices through a bounded local journal.
This adds no wire fields or independent state scan. Explicit cursors handle mutable
decode buffers; buffer identity alone is not a change signal. Empty/reverted
updates upload nothing, changed pixels upload their bounding rectangle, and
replacement/untracked buffers or expired receipts safely compare the full image.
Canvas dimensions change only on a raster-size change. Fog-disabled views allocate
nothing. Tests cover coalescing, history bounds, owner/reset replacement, removal,
untracked views and changing dimensions.

Actual worker `postMessage` CPU and inclusive main-thread receive-handler CPU
are separately sampled: both measured **0.2 ms p99** in both repeats. Receive
includes decode/hooks/ack; do not add decode twice. The send sample arrives with
the following snapshot. Delivery latency remains separately labelled. Native
deserialization before the callback is not measured by these JS scopes.

The worker tick remains **6.3–6.6 ms p99** in the live captures. This is not a
3 ms success, nor can component percentiles be summed into a total. Fresh detailed
headless attribution still identifies combat planning and movement/route searches
as leading tail contributors (`/tmp/heartroot-post-browser-details.json`).
The updated decoder passed all 4,800 projection comparisons and the full restore
audit run with final checksum `3664380072`, 254 units
(`/tmp/browser-fog-decoder-verified.json`). All 32 focused tests in seven files
and TypeScript checking pass. Temporary browser matches were closed before
headless verification; no benchmark overlapped tests/builds.

### 23. Convex navigation regions and static minimap reuse (October 5)

The ground query now merges adjacent clearance triangles into deterministic
convex regions with at most six vertices. Merging preserves exact obstacle and
tile boundaries, including collinear edge subdivisions needed for portal links.
Only the changed tiles are rebuilt. The debug overlay uses the same generator
and reports both searchable polygons and source triangles. Live Heartroot overlay
verification displayed 19,524 polygons from 38,738 source triangles.

On the frozen Heartroot 64-pair routing benchmark (four repeats), the old graph
had 40,414 triangles. The merged graph has 20,335 polygons. Mesh-query mean/p99
changed from **0.319/1.199 ms** to **0.106/0.326 ms**; fully checked production
routing from **0.374/1.326 ms** to **0.167/0.384 ms**. Cold construction increased
from 98 to 154 ms. Both return the same 58 reachable and six unreachable pairs;
all returned routes pass clearance checks. For these pairs, mean/max path length
relative to smoothed grid routing is 1.005/1.078. These are frozen-query results,
not a whole-match speedup or a guarantee for every possible route.
Reports: `/tmp/triangle-global-quality-control.json`,
`/tmp/convex-global-production-repeat.json`.

The active 4,800-tick replay measured **2.749 ms mean / 5.516 ms p99** accounted
headless CPU. Mesh expansion fell from 626,131 to 173,882 in the corresponding
active runs, although changed corridors also change battle trajectories and
traffic retries. The new run has 244 units and audit `1189458789`; all 4,800
projection comparisons and 13 cold/warm restore checkpoints agree. Reports:
`/tmp/convex-production-active.json`, `/tmp/convex-production-verified.json`.
The offline four-peer verifier now uses full-state hashes at checkpoints and
compares final complete snapshots, rather than relying on the sampled live hash.
All four peers agree through tick 12000 with a synthetic 32-beat stall, 244 units
and final full audit `2881829671` (`/tmp/convex-production-four-peer.json`).

This trajectory exposed a browser minimap spike: discovering a few resources
reclassified, reindexed and sorted the unchanged static scenery. Immutable
scenery compositions now publish their static/dynamic parts through weakly owned
presentation metadata. Filters reuse their static result; the minimap retains
separate sorted indexes and merges them, preserving static-first equal-Y painter
order. Raw mutable editor inputs retain full validation. Removal-only updates,
skipped publications, reordered resources, replacement bases and transitions
between immutable game and mutable authoring data have dedicated tests.

Matched ten-second browser captures restored the same active checkpoint through
the ordinary save loader. Minimap indexing event mean/p99 improved from
**3.310/3.5 ms** to **0.263/0.4 ms**; HUD parent p99 improved from **3.8 ms** to
**0.8 ms**. The latter capture has 41 indexing events and 1,200 HUD frames.
Reports: `/tmp/convex-browser-budget.json`,
`/tmp/convex-browser-partitioned-minimap.json`. These samples do not establish the
complete 3 ms non-render budget: simulation remains over budget, render CPU is
excluded separately, and independent category percentiles cannot be summed.
The minimap/filter changes pass 14 focused tests and TypeScript checking.

A follow-up also stopped unit recruitment/death from invalidating the resource
scenery revision merely because an entity-order packet arrived. The decoder now
compares resource order during its already-required entity assembly; capability
changes, actual removals, appearance changes and surviving-resource reorder still
invalidate. All 21 related tests pass. The combined decoder passed 4,800 exact
projection comparisons and 13 restore checkpoints with unchanged full audit
`1189458789`, 244 units (`/tmp/scenery-decoder-verified.json`). TypeScript passes.

Fresh diagnostic attribution (`/tmp/convex-current-details.json` and
`/tmp/convex-current.cpuprofile`) still points to combat planning and movement.
Individual long traffic retries expand 2,396–9,560 grid cells; they bypass the
terrain-only mesh because moving bodies are present. The final browser capture
above measured **5.9 ms worker-tick p99**, so the complete 3 ms goal remains open.
Profiled runs are for attribution, not budget acceptance. The previous rejected
corridor-repair/flow-field experiments remain relevant: reducing expansions must
also preserve successful arrivals and avoid cold construction spikes.

### 24. Correlated tails and allocation/lookup cleanup — 2026-10-05

`bench:match -- --budget-tail` retains the slowest 1% of accounted-total ticks
with their existing settlement/AI stage timers, without enabling the heavier
hierarchical profiler. It remains diagnostic capture, not budget acceptance.
In `/tmp/heartroot-budget-tail.json`, the 46 slow ticks contain overlapping
navigation parents averaging 4.52 ms, movement 2.83 ms, combat planning 1.54 ms,
and observation 0.93 ms. These are costs on the same ticks; parents and children
must not be summed. Individual near-p99 ticks have different causes, including
movement, combat planning and one 3.83 ms AI decision.

Three redundant operations were removed without changing replay results:

- Large-body sweep lattices repeated their center/corner rays. A 500-radius
  footprint now traces nine rays instead of fourteen; pure collision results
  and retained probe order agree across 3,000 randomized cases. Adjacent sweeps
  still additionally deduplicate shared cell edges.
- Unit-index rectangle queries no longer allocate/delegate an empty iterator
  for every unoccupied cell. The nearby matched headless run changed from
  3.171/6.229 ms mean/p99 to 3.058/6.166 ms, with identical full audit.
- Worker collision and economy lookups now share a maintained job-ID index.
  `GameContext.addJob/removeJob` own membership edits; mutable job fields remain
  the authoritative objects, and `reindex` rebuilds membership on restore.
  Observation reuses this lookup instead of constructing another job map.
  Creation, cancellation, collision policy and replacement identities after
  restore have a regression test, including no list searches during lookup.

The final clean 4,800-tick production run is **3.060 ms mean / 6.084 ms p99**
accounted headless CPU (`/tmp/lookup-production-active.json`). A separate
correctness run passes every projection comparison and 13 cold/warm restore
checkpoints, finishing with 244 units and unchanged full audit `1189458789`
(`/tmp/lookup-verified.json`). Do not treat the correctness run's timings as a
budget result. The broad game/session suite passed 624 tests initially; two
stale fixtures were repaired and their seven tests pass: direct test terrain
edits must invalidate the prebuilt mesh, and mocked sessions must initialize the
new profiling-detail setting. No production behavior was relaxed for those tests.

Several additional prototypes were rejected rather than shipped. Exact traffic
query reuse with fine touched-cell dependencies reduced grid expansions about
30%, but the whole-budget gain was small and inconsistent when combined with
finer sight bounds. Raising the traffic heuristic to 2 doubled down on bad route
choices: queries rose from 1,828 to 5,303 and p99 reached 7.238 ms. Trying the
terrain mesh before every long traffic search produced 770 body-blocked mesh
fallbacks and no meaningful tail reduction. Reusable reverse-pocket buffers and
per-cell sight-sample reuse likewise did not improve the whole-match result.
Flow fields remain an experiment, not the production solver; the earlier cold
build and opposing-traffic qualifications still apply. The **3 ms p99 goal
remains unmet**.

The separate quiet browser capture (`/tmp/lookup-browser-budget.json`) restores
that same active trajectory and records 399 worker ticks and 1,200 HUD frames.
Worker-tick mean/p99 is 3.020/5.400 ms; main receive CPU p99 is 0.200 ms,
postMessage CPU p99 0.200 ms, projection p99 0.600 ms, and HUD parent p99
1.100 ms. These populations differ and must not be added as independent
percentiles. The browser ran without console errors; its temporary tab was
closed after capture. TypeScript and whitespace checks pass.

Content changed in the shared workspace during the final four-peer check; the
old save was correctly rejected. Benchmark runners now optionally export their
exact definitions with `--save-content` and reload them with `--content`, retaining
fingerprint validation. `--four-peer` runs the existing multiplayer verifier
through the same production bundler/Node executable as the match benchmark.
This is experiment input capture, not version pinning in the game/editor.

The replacement fixture captures content `8393df8a`, seed 731942, Heartroot,
one human and three AI, first advancing 6,000 ticks and then adding the same
32-unit human assault. Its clean active run is **3.088 ms mean / 5.842 ms p99**
(`/tmp/heartroot-8393-active.json`), finishing with 255 units and full audit
`1392099972`. It is a new trajectory, not a matched speedup over the previous
content. The corresponding correctness run passes all 4,800 projection checks
and 13 restore comparisons (`/tmp/heartroot-8393-verified.json`). Reproduce from
`/tmp/heartroot-8393-6000-save.json` with content input
`/tmp/heartroot-content-8393df8a.json`.

The four-peer verifier then agrees through tick 12000, including one synthetic
32-beat upstream stall and exact final snapshot equality. All 13 full-state
checkpoints match; final full audit is `1665532744`
(`/tmp/heartroot-8393-four-peer.json`). Its timings are not performance results:
it runs four worlds together with expensive correctness audits.

### 25. Terrain-distance fields and moving-body bookkeeping

A four-landmark terrain-distance prototype was tested as an A* lower bound.
It excludes dynamic occupied/resource cells so adding a building does not
rebuild its fields. On Heartroot it costs **4 MiB** and approximately **245 ms**
to build. The decisive comparison freezes the 6,000-tick state and runs 48
identical long queries against the same body blockers, alternating plain and
guided exact A* four times. Reachability and grid route cost agree for every
query (45 reachable, 3 unreachable). Excluding the first repetitions, expansion
count falls only from 1,856,313 to 1,850,235 (**0.33%**); mean query time rises
from 5.323 to 6.058 ms. Report: `/tmp/landmark-frozen-comparison.json`. This
prototype is **not integrated**. Its small search reduction does not justify
per-node field lookups, initialization, memory, or terrain-edit invalidation.

Whole-match experiments in this session were affected by changing host load.
The unchanged active control produced 10.663 ms mean / 25.494 ms p99 while
retaining full audit `1392099972`, versus the earlier quiet 3.088 / 5.842 ms.
An optional `--thread-cpu` diagnostic was added to distinguish elapsed time from
Node thread CPU; it does not replace wall-clock acceptance. Another unchanged
control measured 8.525 / 18.356 ms wall and 8.189 / 15.424 ms thread CPU. Its
wall-minus-thread diagnostic averaged 0.336 ms. This is not solely a scheduling
pause, and it does not identify the cause of reduced throughput. Reports:
`/tmp/landmark-matched-control.json`, `/tmp/landmark-thread-control.json`.

A CPU sample then identified repeated moving-body index refresh/update work.
The retained optimization stores each body's cell and yield reservation in one
membership record. Updating an unchanged body now resolves that record once
and does not rewrite its entity lookup. It retains all planning/movement
refresh boundaries and live eligibility checks; it does not cache collision
policy across state changes. Restore removes the old object identities before
inserting replacement records.

An alternating same-process comparison of 2,500 refreshes on the frozen
257-unit population, excluding two warm-up rounds, measures a median **79.58 ms
before / 59.03 ms after** (25.8% less refresh time). This microbenchmark only
establishes the local bookkeeping gain. Full active runs retained the exact
same audit `1392099972`, but their 5.252 / 12.764 ms versus 6.163 / 11.727 ms
mean/p99 results are too noisy to establish a whole-match gain. Reports:
`/tmp/unitindex-comparison.json`, `/tmp/index-records-active.json`,
`/tmp/index-prior-active.json`.

All 50 focused movement/index/traffic/job/layer/air tests pass. The full active
correctness replay passes **4,800 exact projection comparisons and 13 restore
checks**, ending with the same full audit (`/tmp/index-records-verified.json`).
The **3 ms p99 goal remains unmet**; neither these isolated refresh timings nor
the diagnostic thread-CPU result substitutes for complete browser accounting.

The four-peer check also passes all 13 full-state checkpoints through tick
12,000, including the synthetic 32-beat delivery stall. All peers finish with
242 units and audit `1665532744`, and their final snapshots are exactly equal
(`/tmp/index-records-four-peer.json`). TypeScript and whitespace checks pass.

### 26. Local steering reuses terrain without reusing traffic

The captured-content detailed run (`/tmp/route-bursts-current.json`) places local
detour terrain sweeps among the largest contributors to the same slow-tick
population: 1.101 ms mean self time there, versus 0.781 ms for traffic A*
expansion. These are diagnostic, contended-host timings, not acceptance numbers.
Repeated quarter-cell detour edges were resweeping unchanged terrain.

`LocalTerrainSweeps` now memoizes exact directed terrain clearance for quarter-cell
neighbors. This is not a destination flow field and does not select routes. It
uses lazy 8-cell tiles, capped at 128 tiles per radius and four radius profiles:
at most 2 MiB of typed buffers across all profiles, independent of map area.
Reservations and moving-body geometry remain live. Buildings/resource occupancy
changes invalidate only intersecting tiles plus the swept-body halo. Explicit
terrain rebuilds/restore clear the cache. Non-grid endpoints, long rays, layered
bridges and flying actors retain the reference sweep behavior.

Local detours also test nearby bodies before terrain. Both predicates are still
required, with the same search order, limits and returned waypoints. In a frozen
257-unit battle, 80 local queries (50 successful) are repeated in alternating
order across ten rounds. All four implementations return exactly the same paths.
Excluding two warm-ups, median times are **25.588 ms original, 14.680 ms
body-first only, 18.518 ms cache only, 9.314 ms combined**. The combined change
reduces that local-query workload by **63.6%**. This is a local mechanism check,
not a whole-match speedup claim (`/tmp/local-sweep-order-comparison.json`).

Separate full active runs retain audit `1392099972`, all 1,964 grid searches /
493,797 expansions, and 611 accepted mesh routes. The unchanged control measured
6.063 ms mean / 11.483 ms p99; cache-only 5.880 / 10.855; combined 4.283 / 8.237.
Host load remains variable, so these sequential samples do not isolate the
whole-budget improvement. Reports: `/tmp/local-sweeps-control.json`,
`/tmp/local-sweeps-active.json`, `/tmp/local-sweeps-body-first.json`.

The 68 focused movement, local path, traffic, layered, flight, navigation and
profiling tests pass. Additional oracle cases check directed terrain predicates,
multiple body radii, arbitrary endpoints, near/far invalidation, live reservations,
real building insertion/removal, explicit terrain edits and bounded eviction.
TypeScript and whitespace checks pass. The 3 ms p99 goal remains unmet.

The full active correctness replay passes 4,800 exact snapshot projection
comparisons and 13 warm/cold restore checks, ending at unchanged audit
`1392099972` (`/tmp/local-sweeps-verified.json`). Four peers then agree at all
13 full-state checkpoints through tick 12,000, including the synthetic delayed
connection; final snapshots match exactly with audit `1665532744` and 242 units
per peer (`/tmp/local-sweeps-four-peer.json`). Their correctness timings are not
budget measurements.

### 27. Remove a duplicate movement sweep; reject low-value route experiments

Ordinary movement previously called `clearSegment` twice for the same physical
step: first without reservations to classify broken terrain routes, then with
reservations to classify temporary traffic. The second call repeated the full
terrain sweep. `movementSegmentBlocker` preserves those two outcomes while
checking terrain once and then the live center-line reservations. Multi-floor
portals retain their full surface-aware second check. Physical unit collisions,
retry timing and route-clearing behavior are unchanged.

The fixed active-state comparison samples 215 solid actors' short movement
steps, repeats each batch 200 times and alternates old/new order across ten
rounds. All obstruction classifications agree. After two warm-ups, median batch
time is **34.342 ms before / 19.988 ms after** (41.8% less clearance-query time).
Report: `/tmp/movement-clearance-comparison.json`. This isolates the repeated
check, not whole-game CPU.

Lower-contention full active runs produce **2.914 ms mean / 5.618 ms p99** after
and **2.896 / 5.498 ms** in the unchanged control, both at full audit `1392099972`.
There is no established whole-match timing improvement in this pair. The
retained change removes redundant physical queries with exact outcomes; the
**3 ms p99 target is still unmet**, even before actual browser transport/HUD
costs are included. Reports: `/tmp/movement-clearance-{active,control}.json`.
The 51 focused classification, movement, traffic, bridge and flight tests pass,
including 3,000 randomized comparisons against the separate original checks.

Two additional experiments remain outside production:

- Broader reuse of long terrain detours, gated by clear local connections at
  both endpoints and a relative route-length limit, saved only three mesh
  searches in the full battle (611 to 608, reuse 69 to 72). It does not justify
  the extra route-quality policy (`/tmp/shared-detours-active.json`).
- A bounding-cell proof before short terrain sweeps produced no whole-match
  gain: 2.905 ms mean / 5.614 ms p99, with unchanged full state
  (`/tmp/short-proof-active.json`). The original sweep remains the implementation.

The sampled CPU stack in `/tmp/heartroot-current-cpu.json` attributes 1,145 ms
across that diagnostic run to bundled line 61, confirmed as
`SimulationProfiler.wrap`'s rest-argument closure. Its disabled path still
forwards every instrumented call. This is an investigation lead, not an estimate
of recoverable budget or proof that changing wrappers improves JIT behavior.

Movement-clearance validation passes all 4,800 exact projection comparisons and
13 restore checks with unchanged audit `1392099972`
(`/tmp/movement-clearance-verified.json`). The four-peer run retains exact final
snapshot equality and all 13 matching checkpoints, including the delayed link,
ending at audit `1665532744` (`/tmp/movement-clearance-four-peer.json`).

A diagnostic-only wrapper bypass (which cannot support later enabling profiles
and therefore is not production code) measured 2.861 ms mean / 5.348 ms p99,
with unchanged full audit (`/tmp/profile-bypass-active.json`). This small
sequential difference is not enough to justify replacing runtime profiling
registration yet. The lower-contention production stage breakdown still places
orders/navigation at 1.074 ms mean, observation at 0.374 ms, projection at
0.281 ms and ability lifecycle at 0.159 ms. Those are inclusive stage means;
their independently computed tails cannot be added. Further work should target
remaining movement and terrain sight bursts, rather than assuming diagnostic
wrappers account for most of the missing budget.

### 28. Skip proven-clear portions of terrain sight rays

Terrain sight keeps its original quarter-cell samples and visibility rules.
After the existing whole-ray bound fails, a four-cell maximum grid bounds groups
of eight samples. Only groups strictly below the sight line are skipped; the
rest use the original sample indices and interpolation arithmetic. This adds
32 KiB of immutable bounds on Heartroot 512. It changes no fog update cadence.

The 2,457-sensor fixed-state comparison, alternating order across ten rounds,
measured **6.079 ms before / 5.661 ms after** median cold-footprint batches after
two warm-ups (`/tmp/tactical-chunk-comparison.json`). Matched active runs measured
sight masks at **0.317 / 0.278 ms mean** and **1.056 / 0.817 ms p99**, respectively.
Whole headless accounted CPU was 2.867 / 2.834 ms mean and 5.638 / 5.515 ms p99;
that smaller whole-match difference should not be confused with the isolated
sight improvement (`/tmp/tactical-chunk-{control,active}.json`).

The brute-force oracle covers random terrain rays, complete footprints, clamped
edges, fractional grazing contacts and ridges inside sample groups. The full
battle audit remains `1392099972`. All 4,800 exact projection comparisons and
13 warm/cold restore checks pass (`/tmp/tactical-chunk-verified.json`). Four peers
retain 13 matching checkpoints and exact final snapshots, with audit
`1665532744` (`/tmp/tactical-chunk-four-peer.json`).

### 29. Reduce the actual work inside navigation tile updates

The fresh detailed trace (`/tmp/post-sight-details.json`) still attributes part
of the slowest ticks to tile updates before route search. Updates already use
local tiles; two avoidable costs remained within those tiles:

- Convex polygon merging rebuilt coordinate strings and edge keys on every
  merge pass. Vertices now receive canonical coordinate IDs once, and directed
  edges use numeric pairs. Duplicate input vertices still match. Merge order,
  convexity decisions, polygon coordinates and portal subdivisions are exact.
  Across all 256 Heartroot tiles (24,818 triangles), ten alternating runs give
  **45.623 / 14.863 ms** median merge time after warm-up, a 67.4% reduction
  (`/tmp/mesh-indexed-comparison.json`). Every polygon and its order agrees.
- A small collision edit previously recomputed each affected tile's complete
  clearance mask. Ground navigation now retains the changed-cell receipt and
  recomputes only mask samples in its conservative influence bounds. Unaffected
  mask samples survive. Broad changes, absent receipts and radii above two use
  the original full-mask prefix-table calculation. Any changed mask still
  rebuilds the tile's contours normally. A 200-edit alternating comparison
  measures **44.869 / 24.632 ms**, 45.1% less builder time
  (`/tmp/mesh-local-mask-comparison.json`).

Randomized local-mask tests compare every updated tile and rebuilt-tile ID
against full-mask rebuilding through obstacle additions/removals, height edits,
map/tile edges, large edits and changed clearance profiles. Full battle route
counts, expanded nodes and audit remain unchanged. The indexed-merge run was
2.846 ms mean / 5.512 ms p99; adding localized masks was 2.834 / 5.429 ms
(`/tmp/mesh-indexed-active.json`, `/tmp/mesh-local-mask-active.json`). These small
whole-match timing differences remain host-sensitive. **The 3 ms p99 objective
is not achieved.** Browser IPC/input/HUD are still additional accounting work,
not covered by these headless values.

Final retained implementation: 31 focused tests, TypeScript and whitespace checks
pass. The 4,800-tick projection verification and 13 restore comparisons retain
full audit `1392099972` (`/tmp/local-mesh-final-verified.json`). Four peers agree
at all 13 checkpoints, including the delayed connection, and finish with exact
snapshot equality and audit `1665532744`
(`/tmp/local-mesh-final-four-peer.json`). The final unprofiled headless run is
**2.851 ms mean / 5.461 ms p99** (`/tmp/local-mesh-final-budget.json`). Orders and
navigation remain the largest stage at 1.059 ms mean / 2.928 ms p99; sight masks
are 0.283 / 0.820 ms. Those stage percentiles are not additive.

### 30. Attribute allocation/GC spikes before retaining more index machinery

The new `bench:match -- --allocation-profile /tmp/profile.json --gc-report …`
uses Inspector allocation sampling (including collected objects) after warm-up
and records GC overlap with the same measured tick intervals. No forced GC or
simulation scheduling changes are involved. Its profiled times are not budget
acceptance, and estimated allocation volume includes benchmark bookkeeping.

The diagnostic `/tmp/active-allocation-diagnostic.json` captured 249 GC events,
236 ms of total pauses, and 1.87 ms mean GC overlap within its slowest 1% of
ticks. That is evidence that allocations contribute to the tail, not that all
remaining latency is GC. Sampled allocations led to two exact retained changes:

- Status lifecycle formerly copied all 4,464 entity references every tick.
  `entitySnapshot()` retains immutable membership until create/remove/reindex.
  Entity fields stay live; a status attached to a later existing entity during
  the pass is still seen. A newly created entity remains outside the already
  captured pass, and removing an entity cannot shift that pass's cursor.
- Observation repeatedly created identical building/unit footprint arrays.
  Its private weak cache now retains cells until definition, position, rotation,
  floor or entity identity changes. Ownership, detection, sight and fog tests
  still run live. Restored entities cannot pick up another object's cached cells.

Both traces finish with audit `1392099972`. Estimated allocation volume falls
from 15,417 to 14,470 MiB (about 6.1%) in matched sampling runs
(`/tmp/active-non-render-allocations.json`,
`/tmp/visibility-non-render-allocations.json`). This is a sampling estimate, not
an exact byte counter. The second trace has fewer GC events (235) but more
pause time (280 ms); it does **not** establish a reduction in GC pause duration.
The unprofiled prototype is 2.875 ms mean / 5.527 ms p99
(`/tmp/visibility-allocation-active.json`), so there is no established whole-match
latency improvement over the preceding 2.851 / 5.461 result yet.

Not retained: a persistent target lookup using the existing `SectorIndex` was
slower in a fixed 297-body/40-query comparison (46.275 versus 45.138 ms per
500-pass batch). Compact numeric sector keys improve that micro-case but the
full battle did not demonstrate a consistent gain. Production target lookup
and shared sector key behavior remain unchanged. Scratch prototypes remain
outside source code; the new allocation evidence takes priority over adding
index machinery for small, uncertain wins.

### 31. Guided navigation and visibility breakdown (diagnosis, not optimization)

User requested larger structural targets instead of marginal local wins. Added
bounded, opt-in work counters and finer scopes, with no changes to decisions,
search limits, update frequency or visibility rules. The worker/debug/MCP path
keeps counts separate from timing samples. The benchmark retains same-tick work,
GC overlap by disjoint coarse stage, and per-actor repeated route demand.

The frozen active Heartroot fixture still ends with full audit `1392099972`.
The final detailed run is `/tmp/deep-navigation-fog-final.json`; a separate V8
sample is `/tmp/deep-navigation-fog.cpuprofile`. Instrumented means are diagnostic
and materially inflated: 4.532 ms mean / 7.469 ms p99. With instrumentation off,
`/tmp/deep-breakdown-disabled-budget.json` is 2.738 / 5.324 ms. This is not a claimed
optimization win; host/run variance is significant and no gameplay algorithm was
optimized in this pass. Browser transport/HUD remain outside these totals.

Concrete work over 4,600 measured ticks (120-second replay, excluding warm-up):

- Movement visits 256.7 units/tick; 55.7 have usable movement, about 49.5 segments
  advance and 2.14 encounter reservations or bodies. Most visits are not movement.
- Local detours expand 277,559 nodes. 1,068 searches hit the full 256-node limit;
  one exhausts its frontier, 110 find a searched route, and some succeed directly.
  These are small repeated failed searches, not one gigantic global search.
- Across the entire 4,800-tick trace, route requests total 4,139; 1,256 immediately
  repeat that actor's prior precise start, destination and static revision.
  Neutral hornet #77 issues 800 requests, 698 repeated, without advancing.
- The saved hornet already targets absent entity #4412 at tick 6000. Its target,
  goal and route persist through tick 10800. Combat's invalidation guard requires
  a truthy resolved target; the missing-target/no-pursuit branch can retain obsolete
  navigation. Movement retries every six ticks. This is a lifecycle defect to fix
  before optimizing those searches, while preserving deliberate last-seen pursuit
  under fog. Other actors' repeated requests are not automatically the same bug.
- Live sight indexing processes roughly 490 sensors/tick in combat planning and
  combat resolution, from almost two pass-wide refreshes. These costs belong to
  combat scopes, so the standalone Observation timer is not all sight work.
- Fog considers 1,092 sensor/observer pairs, retains 114.7 contributions and reuses
  106.9 of them per tick. About 7.82 change position. There are 3.99 terrain
  footprint cache misses and 3.84 hits per tick; most misses use clear shelf spans.
- Nontrivial footprints test 2,072 rays/tick; conservative coarse bounds clear
  1,616. Fine groups skip 2,925 of 3,372 groups; 3,257 bilinear samples remain.
- Coverage differences touch 639 cells/tick, only 77.4 change fog state. Immutable
  publication copies 427,124 bytes/tick (417 KiB, approximately 16.3 MiB/s at 40 Hz).
  Direct copy time is only 0.019 ms/tick in this diagnostic; potential GC pressure
  is a different question and must not be assumed to dominate.

Observation's instrumented 0.477 ms mean consists of about 0.136 terrain
footprints, 0.118 sensor preparation/owner selection, 0.071 scenery knowledge,
0.048 contribution comparison, 0.028 span merging, 0.038 fog transitions including
copies, and the remaining publication/index/bookkeeping. Combat and movement
retain substantial self time; the independent V8 sample confirms reservation
construction, body-index queries, target queries and live sight indexing alongside
normal loop/state work. A flow field would not eliminate these categories.

60 focused tests and TypeScript pass. New tests cover count reset/disabled paths,
worker transport and mode switching, exact fog copy/change counters, unchanged
terrain visibility, and local search failure reasons. Instrumented and ordinary
battle runs retain the same full audit. Next priority: stale intention cleanup
and repeated blocked recovery; then the scope of live sensor/index refreshes.

### 32. Combat intention lifecycle repair

The hornet retry loop was an orphaned movement plan, not an expensive legitimate
search. Witnessed-death cleanup deleted pursuit memory but retained the target,
route and goal. After removal, the invalid-target guard skipped an undefined
lookup. Collision recovery then retried that abandoned goal every six ticks.

`src/sim/game/combatIntent.ts` centralizes three distinct transitions: release
engagement state, suspend an approach while retaining orders, and complete an
attack. Navigation disposal clears the route, goal, segment and local detour,
never the precise physical position. Cleanup respects navigation owned by work,
plain move/follow orders and camp return. Charge cooldowns remain spent; reissuing
attack on the same target preserves an active charge. Queued orders and the
original attack-move/patrol destination survive engagement completion.

Weapon and spell deaths share observer-aware completion. Hidden removals retain
last-seen search and do not reveal death. Missing targets without memory are
repaired during ordinary planning, including old checkpoints. Entering camp
return discards the chase immediately. Spell casting and weapon-cast cancellation
use the same cleanup instead of leaving old pursuit/segments behind. This adds
no world rebuild, search-throttling concession or new serialized state.

Frozen Heartroot evidence (`52de6e71`, content `8393df8a`, ticks 6000–10800):

- Hornet #77: **800 route calls → 0**; final target/goal null and route empty.
- Whole-run route calls: 4,139 → 3,472; repeated unchanged requests: 1,256 → 508.
- Measured local-search expansion: **277,559 → 8,713 nodes** (96.9% fewer);
  visit-limit failures: 1,068 → 6. Combat trajectories change with the correction,
  so aggregate counts are workload evidence, not an isolated algorithm speedup.
- Final detailed trace: `/tmp/intent-fixed-final-trace.json`, full audit
  `843116604`. Ordinary run `/tmp/intent-fixed-budget.json` has the same audit:
  **2.554 ms mean / 4.909 ms p99** accounted CPU. The 3 ms goal is still unmet;
  actual browser transport/input/HUD remain outside this headless measurement.
- Four-peer continuation: `/tmp/intent-fixed-four-peer.json`, 13 full-state
  checkpoints agree, final snapshots identical, final full audit `2809486683`.
  Includes the synthetic 32-beat stall; not a real-network performance result.

177 final targeted tests and TypeScript pass. Coverage includes automatic and
explicit pursuit, both kill paths, orphaned segment/detour checkpoint repair,
unseen removals, queued orders, charge continuity, camp leash, spell interruption
and category lockstep. The broader 1,351-test run exposed eight failures also
reproduced against the pre-fix combat/economy code (map/deposit dimensions, Root
economy and delivery statistics). Its additional charge regression was fixed
and verified in the final targeted run. Those eight baseline failures were then
repaired before further optimization:

- Enlarged 15×15 deposits made Rootworks' 12-cell placement radius impossible.
  Its radius is now 20; content validation rejects radii that cannot preserve
  resource access, using the same footprint calculation as construction.
- Oakfall's two mirrored camp units no longer overlap amber. Threewater has
  seven local forest-mask clearings around deposits, and its southern amber
  deposit is three cells clear of the starting warriors. Map connectivity,
  both Rootworks sites and buildable base cores still pass their checks.
- Economy tests derive footprints and separation from definitions. The receipt
  test now observes completed cargo delivery rather than requiring a temporary
  delivery job to survive a tick. No assertions were skipped or removed.

Full-suite follow-up also repaired a stale renderer mock, regenerated published
map preview metadata, and restored team-configuration identity to the cheap
checksum. Participant configuration is hashed once at match construction; each
signal mixes that cached integer without serializing it. MCP checkpoint tooling
now publishes an object-root input schema, fixing tool discovery while retaining
save/load payload validation.

Final verification: **427 test files pass, 2,307 tests pass**. The existing
sanctuary-model test remains conditionally skipped while that asset is a
placeholder. TypeScript, map-preview freshness and whitespace checks pass. All
six published maps validate as playable. The network tests ran with loopback
ports available; no test was disabled to accommodate sandbox restrictions.

### 33. Collision-index demand and scheduling boundaries

Re-established the active battle against current content (`35f35466`) after the
Rootworks repair. The 6,000-tick starting checkpoint has three real AIs; the next
4,800 ticks add the same 32-unit human attack. This is a new fixture, not directly
comparable to the old content's 4.909 ms p99.

Combat planning, idle separation and movement each previously refreshed the
moving-body index on entry, even without a collision query. A movement scope now
materializes it at its first query; subsequent body moves update it immediately.
An unused scope does no refresh. Standalone queries still scan live entities,
and each new scope revalidates membership (including restore, death, garrison,
ghost workers and yield reservations). No tick cadence or decisions changed.

The detailed run reduces combat-planning refreshes from 1/tick to approximately
0.227/tick, eliminating 77% of that pass's refreshes. Separation and movement
still refresh once/tick in this workload. The profiler attributes real work to
`Moving-body refresh` and counts `Bodies indexed`; entering a scope is separate.

Paired full-workload runs (`/tmp/index-{before,lazy}-paired.json`) measured
3.094/5.863 versus 2.958/5.836 ms mean/p99; reverse-order confirmation measured
3.535/6.973 versus 3.486/6.665. Absolute timings vary substantially across runs.
This is a modest reduction in redundant work, not a major p99 win or achievement
of the 3 ms budget. Baseline and optimized runs share full audit `4133723339`.
Browser IPC, input and HUD remain outside this headless measurement.

Scheduling candidates must distinguish decisions from invalidations. Ordinary
automatic target acquisition is already staggered by ID every eight ticks;
attack-move acquisition is not, and idle separation is staggered every 20 ticks.
At 40 Hz, 2–4 ticks correspond to 50–100 ms. Any future reduction should distribute
entities across phases, preserve immediate orders/invalidations and deterministic
tick-based scheduling, and measure same-tick p99 rather than merely reducing
average work. No additional delayed update policy is implemented in this pass.

Verification: 429 files / 2,317 tests pass (one existing placeholder-asset skip),
TypeScript passes, and four peers agree at all 13 full-audit checkpoints from
tick 6000 through 7200, including a synthetic 32-beat upstream stall. Final full
snapshots are equal, audit `1183943094` (`/tmp/index-four-peer.json`).

### 34. Fog footprint work without delaying visibility

Kept all tick cadences unchanged. Continued from section 33's frozen Heartroot
battle (content `35f35466`, map `52de6e71`, ticks 6000–10800, three real AIs and
the same 32-unit human attack). Independent V8 sampling still identifies movement,
combat planning and terrain sight among the substantial CPU consumers.

Fog's compact-footprint cache charged each entry for a dense cell array even
when no caller materialized it. This caused 4.627 evictions/tick versus 4.655
misses/tick. Entries now share one LRU that charges actual allocated spans and
dense cells. Dense expansion triggers eviction immediately. The existing 4 MiB
retained typed-array budget and 4,096-entry bound remain; caller-held evicted
arrays remain immutable. No visibility rules or simulation state are cached
across mutations.

A second conservative shelf test uses four-cell minimum/maximum heights when the
sixteen-cell bound fails. This avoids marching every target ray just because a
coarse block contains a cliff beyond the footprint. Unresolved cases retain the
same quarter-cell samples and uphill visibility rule. The extra minimum grid is
32 KiB on a 512-square map.

Deterministic work reduction, from `/tmp/index-lazy-details.json` to
`/tmp/actions-fine-details.json`:

- Footprint misses: 4.655 → 3.474/tick (25.4% fewer).
- Terrain rays: 2,174.61 → 1,438.11/tick (33.9% fewer).
- Bilinear height samples: 3,393.04 → 2,381.23/tick (29.8% fewer).
- Instrumented footprint self time: 0.139 → 0.115 ms/tick. Diagnostic timings
  include profiling overhead and are not the budget acceptance measurement.

Unprofiled whole-workload baseline `/tmp/actions-cache-before.json` measured
3.267 ms mean / 6.266 ms p99; final `/tmp/actions-final-after.json` measured
3.132 / 6.254. This establishes reduced work, with a modest average improvement
in this pair and essentially unchanged p99. It does not meet the 3 ms p99 goal;
host variance remains significant, and real browser delivery/input/HUD remain
outside the headless measurement. All detailed and ordinary battle runs end with
the same full audit `4133723339`.

Four-peer continuation from ticks 6000–7200 agrees at all 13 full-audit checkpoints,
including the synthetic 32-beat upstream stall; final snapshots are identical and
retain audit `1183943094` (`/tmp/actions-final-four-peer.json`). Tests additionally
cover compact retention, dense expansion accounting, LRU eviction, oversized
dense views, and exact equivalence to brute-force terrain rays.

Final verification: 430 test files / 2,325 tests pass, with the one existing
placeholder-asset skip. TypeScript and whitespace checks pass. No tests were
removed, weakened or newly skipped; update cadence is unchanged.

### 35. Target-query experiment and live-traffic routing probe

Continued without changing update cadence. The frozen battle's target lookup
examines 419.87 candidates/tick and rejects 413.31 by allegiance. A prototype
partitioned each spatial bucket by owner, preserving neutral camp policies,
visibility, forced attacks and stable distance/ID ties. It reduced candidates to
7.95/tick and instrumented acquisition self time from 0.113 to 0.078 ms/tick.
However, paired unprofiled whole-match runs were essentially unchanged:
3.132/6.173 versus 3.130/6.175 ms mean/p99, and in reverse order 3.047/5.794 versus
3.046/5.865. All runs retained full audit `4133723339`. **The prototype was removed**:
fewer candidates and faster instrumented queries did not establish a whole-match
benefit sufficient to justify the extra grouping machinery.

Added `bench:match -- --probe-traffic-mesh` for the next structural decision. For
eligible long routes with live body blockers it runs both the production grid
solver and the existing mesh candidate against the same live request, alternating
which runs first. It always returns the production route. The mesh candidate
still passes the real footprint, corner, traffic and cost-bound validation.
Statistics appear under `trafficMeshProbe`; no routing mode is exposed in the
game. This is **duplicate diagnostic work, not budget acceptance timing**. It
also warms derived mesh caches; timings are exploratory, not a promise about a
replacement solver. Diagnostic routing counters exclude the shadow calls.

`/tmp/traffic-mesh-probe.json` contains 451 eligible requests, accounting for
573,132 of 595,968 grid expansions (96.2%). The grid finds 446 routes; the mesh
passes traffic validation for only 25 (5.5%), all already reachable by the grid.
All 25 differ from the production path; the greatest grid-cost stretch is 1.091.
The mesh attempts total 27.05 ms. They replace only 6.73 ms worth of successful
grid requests at a successful-mesh cost of 3.05 ms. Simply trying the mesh before
every traffic route would add failed work. Full audit remains `4133723339`.

The remaining structural candidate is local traffic recovery: preserve a valid
long terrain route and repair/rejoin a short section around nearby bodies,
rather than searching to the distant goal again. Existing local detours primarily
handle parked allies; moving streams retain global traffic replans. Extending
this changes yielding/detour choices, so it is a gameplay decision to discuss,
not an unannounced cadence change or an unconditional solver switch. No such
behavior change is included in this pass.

### 36. Separate long terrain routes from local unit traffic

With approval to change traffic decisions, movement now keeps its long terrain
corridor when a nearby body blocks the next step. It tries the existing bounded
local recovery/rejoin search for moving traffic as well as parked allies, then
waits or yields. It no longer collects all bodies and runs a map-wide traffic
route to the distant destination. Occupied endpoints are adjusted only near
arrival. Actual terrain blockage still clears the stale route for replanning.
The four-cell local search, 256-node limit, collision sweeps, six-tick retry and
five-second cycle recovery cadence remain unchanged. No flow field is introduced.

This changes simulation decisions: build is now `declarative-sim-93`. Benchmark
comparisons use identical frozen build-92 tick-6000 state with a benchmark-only
copy relabeled for build 93 (`/tmp/local-traffic-6000-build93.json`). Production
save/build compatibility is not relaxed. Content remains `35f35466`, Heartroot
map `52de6e71`, three AIs and a staged 32-unit human attack, through tick 10800.

Deterministic diagnostic work (`/tmp/movement-demand.json` versus
`/tmp/local-traffic-details.json`):

- Map-wide grid searches: 2,025 → 78; expanded nodes: 595,968 → 3,882.
- Terrain mesh searches: 700 → 234; expanded polygons: 168,846 → 37,749.
- Local grid expansions: 45,065 → 161,713; successful detours: 111 → 706.
  Recovery becomes local work rather than disappearing from measurement.
- Combat-active ticks: 4,007 → 3,920; distinct attackers: 75 → 74; human
  survivors: 31 in both. End population is 263 versus 260. These are different
  battle trajectories, not bit-identical workloads, despite identical input.

Two unprofiled pairs, reversing run order, measured:

- Movement mean/p99: 0.609/2.323 → 0.516/1.267 ms, then
  0.592/2.252 → 0.482/1.201 ms.
- Whole accounted non-render mean/p99: 3.057/6.002 → 3.064/5.772 ms, then
  2.916/5.886 → 2.767/5.320 ms.

Reports are `/tmp/local-traffic-{before,after}.json` and
`/tmp/local-traffic-{before,after}-confirm.json`. Host variance remains visible;
the repeatable result is roughly halved movement p99 and reduced search work,
not a proportional whole-game improvement. Both new runs end at full audit
`3527651004`; both old runs retain `4133723339`. **The 3 ms whole-match p99 goal
is still unmet**, and actual browser IPC, input and HUD remain outside this
headless accounting.

Regression contracts cover four rotated opposing moves with restore during a
detour, a temporarily blocked gate, a newly placed building, and two compact
eight-unit formations passing through each other. Every step checks terrain
and/or physical body clearance. The old implementation fails five of the new
contracts; at the blocked gate it performs 46 global searches while waiting,
where the replacement performs none and resumes after the gate opens.

Four-peer continuation from the active battle at ticks 10800–12000 agrees at
all 13 full-audit checkpoints, including a synthetic 32-beat upstream stall.
Final snapshots are identical with audit `1278100042`
(`/tmp/local-traffic-four-peer.json`). The complete battle also passes snapshot
encode/decode comparison each tick and warm/cold save reconstruction across
13 checkpoints, ending at audit `3527651004`
(`/tmp/local-traffic-verified.json`). Verification timings are not acceptance data.

The full suite passes 432 files / 2,334 tests with the existing placeholder-asset
skip. The additional opposing-formation regression also passes. Final movement,
save-library and worker-snapshot tests pass on build 93; TypeScript and whitespace
checks pass. No tests were removed, weakened or newly skipped. Recovery remains
a bounded heuristic, not a guarantee against every possible crowd deadlock.

### 37. Local reservation membership and incremental sight indexing

Local detour sweeps now query the existing moving-body cell buckets and yield
reservations instead of filtering the whole army into a new Set for every actor.
`CellReservations` requires only `has(cell)`. Queries retain exact walk-surface
IDs, locomotion, collision exemptions, ownership and live route checks. A lazy
once-per-movement-pass membership Set preserves the original eligibility snapshot;
units released during the pass join reservations next pass. Outside a movement
scope, the query falls back to live records rather than trusting a stale index.

Sight indexing records normal movement changes in a bounded, one-tick receipt
Set. Between phases in the same tick, only those movers are reconciled. Sensor
entries retain their last entity identity, precise coordinates and radius, so
unchanged bounds need no index write. Removed entities cannot be reinserted from
earlier receipts. Tick boundaries, structure changes, explicit editor refreshes,
and untracked motion revisions retain full reconciliation: direct lifecycle
writes still exist in the engine, so removing that safety path would be incorrect.
This optimizes indexing, not sight rules or fog update frequency.

The frozen Heartroot battle retains full audit `3527651004` before and after,
with identical routing counters and engagement. Diagnostic counters in
`/tmp/local-index-details.json` versus `/tmp/local-traffic-details.json` show:

- Full sensor reconciliation: 1.712 → 0.859/tick, with 0.853 incremental refreshes.
- Sensor records examined for the index: 487.07 → 286.08/tick.
- Sensor entries sent to the spatial index: 487.07 → 41.96/tick.
- Local reservation predicates examine 12.97 candidate bodies/tick. A regression
  with 400 units proves that an isolated cell query does not inspect distant
  armies. Other observation passes' sensor selection is unchanged.

Final ordinary confirmation reports `/tmp/local-index-before-confirm.json` and
`/tmp/local-index-after-confirm.json` measure movement mean/p99
0.497/1.241 → 0.389/1.037 ms, combat mean 0.165 → 0.126 ms, and total accounted
non-render mean/p99 2.868/5.594 → 2.772/5.576 ms. An earlier timing pair was worse
overall despite lower movement cost. The supported result is less recurring
movement/visibility work; **whole-match p99 has not materially improved and the
3 ms goal is still unmet**. Instrumented profiles include diagnostic overhead;
actual browser IPC/input/HUD remain outside the headless accounting.

Validation for this pass: 434 test files / 2,342 tests pass, with the existing
placeholder-asset skip; TypeScript and whitespace checks pass. New tests compare
cell membership with materialized reservations, cover remote yield pockets,
stacked surfaces, release eligibility, and compare sight to a full-sensor oracle.
They also exercise lifecycle/editor invalidation and removed movement receipts.
Existing private-helper test callers were updated for the changed signature;
their movement, collision and save assertions remain intact.

`/tmp/local-index-verified.json` verifies snapshot encode/decode every tick and
warm/cold reconstruction at 13 checkpoints, ending with unchanged audit
`3527651004`. Four-peer continuation from ticks 10800–12000 agrees at all
13 full-audit checkpoints, including the synthetic upstream stall, and ends
with identical snapshots and unchanged audit `1278100042`
(`/tmp/local-index-four-peer.json`). Simulation remains build 93: no rule,
update cadence, serialized state or lockstep result changed.

### 38. Replay individual spikes and remove local-event rebuilds

`bench:match -- --capture-ticks 6726,6811,7603,9640` enables hierarchical profiling
only at those absolute tick IDs and retains their complete profiles/work counters
in `capturedTicks`. IDs must lie after warm-up inside the measured interval.
Combine with `--budget-tail` for ordinary coarse timings of the slowest 1%.
Selected-tick profiling, allocation sampling and GC reporting are diagnostic;
use a separate ordinary replay for acceptance timings. CPU/allocation profiles
now retain their matching `.bundle.mjs` and `.bundle.mjs.map` beside the requested
output, so generated stack locations remain inspectable after temporary cleanup.
Sector work is split into local components, boundary links and global connectivity;
AI placement reports site checks, known blocker footprints and approach searches.

The frozen battle exposed three distinct sources rather than a single slow
subsystem. GC can interrupt unrelated scopes; the method recording a pause is
not necessarily the allocation source. Tick 9640 retained a fallen hero through
a full context reindex and forest classification. Tick 6811 removed a harvested
tree and refreshed sector navigation. AI economic decisions at 6726/7603 spent
substantial time checking construction approaches.

Changes preserve the existing decisions and update cadence:

- Retained heroes return to ordered entity/body/sight indexes through membership
  receipts. Unsupported or unsorted inputs retain the full reconstruction path.
- Each AI caches only footprints present in its authorized observation, with
  overlap reference counts and immutable previous results. Changed geometry,
  depletion and disappearance reconcile locally; restore starts a cold cache.
- Placement BFS uses reusable bounded buffers and squared range comparisons.
  Direction order, admission rules and the 4096-node cap remain unchanged.
- Sector connectivity is reused only when exact region IDs and outgoing links
  in the affected neighborhood match. Splits, merges and new isolated regions
  still rebuild. The tree at tick 6811 changes topology and correctly takes
  that rebuild path; this optimization does not eliminate every tree-removal cost.
- Containment sight compares numeric tick/revision stamps instead of constructing
  a string on each cross-owner visibility query.

Ordinary local comparison: `/tmp/spike-before-ordinary.json` versus
`/tmp/spike-acceptance.json`, same frozen content/checkpoint and 32-unit human
assault against three AIs. Mean/p99: **2.590/5.105 → 2.558/4.772 ms**.
The improvement is modest (~6.5% p99); GC outliers remain and **the complete 3 ms
p99 target is not achieved**. Browser IPC, input and HUD CPU remain outside this
headless accounting. Both runs finish with full audit `3527651004`.

Validation: 436 files / 2346 tests pass with the existing placeholder skip;
subsequent visibility and AI refinements pass their focused regressions. TypeScript
and whitespace checks pass. New oracles compare cached footprints to complete
reconstruction, BFS results and expansion counts to the previous search, and
hero membership/visibility to full reindexing. Sector tests cover unchanged
connectivity, splits, joins and isolated components. Simulation remains build 93.

Final transport/projection and restore replay (`/tmp/spike-final-verified.json`)
compares decoded projections on every tick and warm/cold full state at 13
checkpoints; audit remains `3527651004`. Four independent peers from ticks
10800–12000 (`/tmp/spike-final-four-peer.json`) agree at 13 checkpoints and on
final snapshots, audit `1278100042`, including the synthetic upstream stall.
Routing counters and combat engagement also match the pre-change replay exactly.

### 39. Allocation pressure versus expensive ticks

Allocation investigation keeps engine pauses separate from the work interrupted
by them. `node scripts/bench/allocation-report.mjs /tmp/allocations.json` maps the
sampling profile to its retained `.bundle.mjs.map`, ranking self allocations by
source location and caller stack. Estimates include collected objects and bench
bookkeeping; they are not live heap measurements or acceptance timings.
`--gc-report` now also reports percentiles with observed pauses subtracted, as a
diagnostic lower bound. `--pace-ms 25` yields between fixed ticks outside timed
work, to investigate idle GC; it never changes simulation cadence or decisions.
GC totals cover the window including gaps; `overlapMs` covers timed intervals.

Changes in this pass:

- Run status callbacks only for entities with statuses. The old outer loop
  captured an entity in a callback scope even for status-free forest scenery.
- Isolate containment-sight reconstruction from hot visibility queries and avoid
  temporary visibility predicates.
- Reuse combat target-grid buckets with numeric coordinates. Refresh membership
  each planning pass in the same input order; old query results remain independent.
- AI harvesting checks for an assignable worker before searching known resources.
  Nearest-target selection uses one scan instead of sorting all candidates; both
  original tie policies (ID and input order) are preserved. Profiling exposes
  harvest searches, examined resources, distance evaluations and skipped searches.

Frozen Heartroot battle, 4600 measured ticks, 32-unit human assault and three AIs:
`gc-baseline-final-*` versus `gc-final-ai-*` profiles in `/tmp` estimate
**14150 → 12573 MiB allocated** (~11% reduction), **232 → 202 GC events**, and
**257 → 217 ms** total pause overlap. Status-file allocation estimates drop
791 → 11 MiB. Sampling perturbs execution; these are diagnostic comparisons.
Ordinary initial baseline mean/p99 was 2.636/4.962 ms; repeating the baseline later
returned 2.524/4.746 ms. The optimized run returned 2.455/4.736 ms. These ranges
do **not** establish a reliable overall p99 improvement. The 3 ms goal is unmet.

Subtracting all observed GC pauses still leaves ~4.94 ms p99 in the final sampled
run. Captures also identify group-order route sweeps (6201), navmesh tile/link
updates plus tree-removal sector work (6411), and construction/navigation updates
(9371). GC reduction alone cannot resolve these bursts. A pre-harvesting-fix
paced Node experiment moved almost all GC out of timed ticks but was slower
(9.27 ms p99); it is neither a browser result nor evidence of a speed regression
from these changes. Continuous Node timings cannot certify the live-game budget.

Validation: 436 files, 2349 tests passed, one existing skip. New regressions cover
reused target buckets across movement/removal/restored identities, nearest-resource
selection against full sorting, and busy workers becoming available again. Final
state audit and routing counters match the frozen baseline (`3527651004`).
The final correctness replay (`/tmp/gc-verified.json`) also compares decoded
projections every tick and warm/cold restored state at 13 checkpoints. At AI
reviews 8650 and 8730, two harvest searches per review are now skipped because
no worker can use them; no known-resource target scan runs on those branches.
Four independent peers (`/tmp/gc-four-peer.json`, ticks 10800–12000) agree at all
13 checkpoints and on complete final snapshots, audit `1278100042`, including
the synthetic upstream stall. TypeScript and whitespace checks pass. Simulation
build 93 is unchanged; no rules, update frequencies or saved state changed.

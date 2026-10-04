# Performance and match loading

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

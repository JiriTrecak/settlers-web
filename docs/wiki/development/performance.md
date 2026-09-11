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
match. Textured, transparent, seasonal, team-color, animated, and skinned surfaces
are excluded. This reduces submissions without simplifying the source silhouettes.
Merged buffers and replaced source resources are owned and disposed by the layer.

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

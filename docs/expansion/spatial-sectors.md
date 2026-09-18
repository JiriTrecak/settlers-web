# Spatial sectors

Local questions should depend on the nearby world, rather than the total size of the map. The simulation now uses 16×16-cell sectors for sight candidates, harvesting candidates and hierarchical navigation. Existing unit collision and combat target buckets remain in use.

## Visibility and resources

`SectorIndex` stores an entity in every sector intersected by its bounds. A query visits only intersecting sectors, deduplicates candidates and rejects non-overlapping bounds. Sight sensors are indexed by their coverage bounds, allowing a target to find only sensors that could see it. The precise range, ownership, containment and terrain line-of-sight checks still decide visibility. Large building footprints and fractional movement have a conservative border so the broad phase cannot discard a valid sight test.

The sight index synchronizes once per changed simulation phase. This maintenance still scales with live sensors; queries no longer multiply every target by every sensor. It is not a claim that all observation work is constant-time. The incremental sight masks and fog memory described in [combat feedback and profiling](/development/expansion/combat-feedback-performance) remain responsible for explored cells and last-seen information.

Harvesting finds resources within the existing 32-cell search radius through resource sectors. Creation, depletion, regrowth, removal and restore update the index. A specifically targeted capacity-limited mine remains that mine. Candidate distance and entity-ID ordering are unchanged.

These indexes contain authoritative simulation data. Player-facing results still pass observation rules; AI does not gain knowledge of hidden changes.

## Navigation

Each sector contains separate connected regions. A river dividing one square therefore creates two regions, rather than an imaginary crossing. Legal neighboring cell edges establish connections between sectors. Height limits, diagonal corner rules and authored bridge entrances participate in those connections.

For destinations at least 32 cells away on either horizontal axis:

1. Search the small region graph for a sector route.
2. Include one neighboring sector around that route for approaches and local traffic.
3. Run the existing detailed A* inside that corridor.
4. If temporary occupants block the corridor, retry the unrestricted detailed search.

Short routes retain the ordinary local search. Ground and elevated surfaces use the same sector hierarchy, but maintain distinct graph nodes and explicit legal transitions. An arch does not connect to the floor below merely because both occupy the same horizontal sector.

Tree and building blocker changes rebuild the affected sector regions and adjacent boundary links. Connectivity is recomputed on the much smaller region graph. Up to 128 coarse plans are cached and invalidated when topology changes. Loading still constructs the initial indexes for the full map.

All decisions use stable ordering and integer path costs. No command queue delay or time-sliced response was introduced. The corridor prioritizes a plausible coarse route; it does **not** guarantee the globally shortest fine-grid path. The unrestricted fallback preserves reachability when the preferred corridor is blocked, but can still be expensive.

## Scaling evidence

The synthetic benchmark increases square grids from 128 to 256, 512 and 1024 cells while keeping local density fixed. The same local query examines **16 candidates in one sector** at every size, while the population grows from **1,024 to 65,536**. This isolates broad-phase query work; initialization and index maintenance are measured separately.

For cross-map routes around a central lake, the 512-cell case expands about **10,090 cells instead of 33,560**. At 1024 cells it expands about **21,581 instead of 135,324**, an 84% reduction. Those particular routes have the same fine-grid cost as unrestricted A*. They do not establish global optimality on arbitrary terrain. The 1024 grid is an algorithm stress fixture; playable maps remain limited to 512.

Two five-minute Four Crowns runs with four AI players reproduced checksum **2898436630**, 251 living units, 4,238 detailed searches, 4,369,531 expanded cells, 21,266 expanded coarse regions and four corridor fallbacks. The final run measured:

- Simulation tick: **2.42 ms mean**, **4.12 ms p95**, **10.95 ms p99**, **41.42 ms maximum**.
- Observer view projection: **0.49 ms mean**, **0.75 ms p95**, **0.91 ms p99**.
- Observation update within the simulation: **0.54 ms mean**, **0.93 ms p95**, **1.83 ms p99**.

Simulation, observation update and view projection are different scopes; observation update is already included in simulation time. These are local CPU diagnostics without rendering, not an end-to-end FPS claim or slower-machine certification. Corridor route choices change battle outcomes relative to the previous implementation, so its earlier timings are not an identical-workload speedup comparison.

The 8.33 ms whole-frame target remains unmet in the tails. Combat planning remains the dominant spike source in this match. Shared destination searches and more precise portal routing are candidates for further work; simply reducing update frequency would not satisfy immediate command response.

## Reproduce and inspect

```sh
node --import tsx scripts/bench/sector-scaling.ts --output /tmp/sector-scaling.json
npm run bench:sim -- --map four-crowns --ticks 12000 --output /tmp/sector-match.json
```

Debug profiling reports cumulative navigation searches, fine cells expanded, coarse regions expanded and corridor fallbacks. The benchmark artifacts for this pass are `tmp/combat-polish/sector-scaling.json`, `sectors-long.json` and `sectors-final.json`.

Regression coverage includes sector edges and corners, disconnected pieces within a sector, local topology changes, dynamic corridor fallback, spanning footprints, sensor movement and containment, resource removal/restore, and distant routes onto elevated surfaces. Validation passed 908 tests across 217 files: the 907-test full suite plus a focused rerun of the navigation file after adding the corridor-fallback regression. Typecheck, game build and generated wiki build passed. A browser smoke check confirmed squad movement and fog reveal in Heartwood Vault without reported console errors.

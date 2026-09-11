# Authored maps

A `.utcmap` v2 document explicitly declares `size: 256 | 512`. `MAP_SIZE` is only the default for new documents and standalone utilities; runtime indexing must use the loaded map’s size. Halo/fringe constants belong to rendering. The document contains name, scenery stamps, optional height/water/landscape, required player starts, explicit gameplay placements and neutral camps.

Placements reference persistent definition IDs and explicit owners. Starting setup references expand to stable authored keys; each player binds one main-fort objective. Scenery stamps never spawn gameplay units or resources. `playable.ts` validates references, starts and occupancy before a map can be launched. Revision combines canonical map and content fingerprints.

`library.ts` discovers project `.utcmap` files and current-format locally saved maps. Both Editor and Singleplayer use it. New supplies required starts. No generated fallback map, resource inference or old-format loading remains. See [authoring](../../../docs/declarations/README.md).

The New dialog offers both sizes and creates two valid player starts. Loading a different size rebuilds height, brush, terrain, water, fog and camera bounds. Height encoding contains `(size + 33)²` samples; it is rejected when dimensions disagree. Map coordinates are `[0, size)`, cell indices use `y * size + x`, and fixed-point motion uses the same map-specific stride. Snapshots validate their dimensions against the loaded map. Never change a global map-size variable: two different-sized simulations can coexist.

Worldroot Hollow (256 × 256), Terrain Proving Ground (256 × 256), and Four Crowns (512 × 512, four players) are shipped battlefields. See `tacticalTerrain.md` for height rules and authoring. Worldroot Hollow’s saved document is `assets/maps/skirmish/worldroot-hollow.utcmap`; the reproducible scenery pass is `scripts/maps/enrich-worldroot.py`. Two guarded Root sites, ten camps, clustered woodland, four ponds and branching streams surround two home clearings.

Ground units wade through depths up to `WADING_DEPTH_CM` (60 cm). AI briefing and runtime navigation use the same threshold. Deeper water blocks movement; all construction still requires dry ground. The editor's **Paint shallow crossing** brush authors a 32 cm bed and can raise a ford through deeper water. Normal river carving stays adjustable. Water color/transparency follows actual bed depth, so shallow and deep areas are visible without extra map masks.

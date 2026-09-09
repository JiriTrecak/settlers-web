# Authored maps

A `.utcmap` v2 document explicitly declares `size: 256 | 512`. `MAP_SIZE` is only the default for new documents and standalone utilities; runtime indexing must use the loaded map’s size. Halo/fringe constants belong to rendering. The document contains name, scenery stamps, optional height/water/landscape, required player starts, explicit gameplay placements and neutral camps.

Placements reference persistent definition IDs and explicit owners. Starting setup references expand to stable authored keys; each player binds one main-fort objective. Scenery stamps never spawn gameplay units or resources. `playable.ts` validates references, starts and occupancy before a map can be launched. Revision combines canonical map and content fingerprints.

`library.ts` discovers project `.utcmap` files and current-format locally saved maps. Both Editor and Singleplayer use it. New supplies required starts. No generated fallback map, resource inference or old-format loading remains. See [authoring](../../../docs/declarations/README.md).

The New dialog offers both sizes and creates two valid player starts. Loading a different size rebuilds height, brush, terrain, water, fog and camera bounds. Height encoding contains `(size + 33)²` samples; it is rejected when dimensions disagree. Map coordinates are `[0, size)`, cell indices use `y * size + x`, and fixed-point motion uses the same map-specific stride. Snapshots validate their dimensions against the loaded map. Never change a global map-size variable: two different-sized simulations can coexist.

Amberfall Wilds is the authored 512-cell wilderness map. Its reproducible recipe is `scripts/maps/amberfall-wilds.py`; the shipped `.utcmap` is the runtime source. It includes seven amber seams, 23 camps, central island/causeway and outer shore routes.

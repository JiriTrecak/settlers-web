# Authored maps

`MAP_SIZE` is 256 playable cells; halo/fringe constants belong to rendering. A `.utcmap` v2 document contains name, scenery stamps, optional height/water/landscape, required player starts, explicit gameplay placements and neutral camps.

Placements reference persistent definition IDs and explicit owners. Starting setup references expand to stable authored keys; each player binds one main-fort objective. Scenery stamps never spawn gameplay units or resources. `playable.ts` validates references, starts and occupancy before a map can be launched. Revision combines canonical map and content fingerprints.

`library.ts` discovers project `.utcmap` files and current-format locally saved maps. Both Editor and Singleplayer use it. New supplies required starts. No generated fallback map, resource inference or old-format loading remains. See [authoring](../../../docs/declarations/README.md).

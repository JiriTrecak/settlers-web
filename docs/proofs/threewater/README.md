# Threewater Forest

Reference: user-supplied overhead forest map, `codex-clipboard-3e8bce13-c0c7-4338-93d7-368ca778320d.png`.

The only shipped map is `assets/maps/skirmish/threewater-forest.utcmap`. Recreate it with `node --import tsx scripts/maps/create-threewater-forest.ts`.

- 256 × 256, two player starts, six working neutral resource deposits.
- Two curved watercourses form the central island; three timber crossings use the original mesh deck helpers for layered navigation.
- 36 live procedural layers, 1,706 harvestable trees, 2,326 scenery placements including riverbank details, lilies, grass, logs, rocks, mushrooms and acorns.
- Pebble forest trails are original ImageGen albedo, calibrated for the shared lighting. Roughness is packed into alpha; neutral normal/height avoids extra displaced geometry. Source and preparation scripts are retained.
- Terrain → Surface layer preset → Pebble forest trail → Paint / Line / Curve. Painted layers support Add / Subtract. Recipe settings control width and shoulder on courses.
- Ground texture masks now consume generated surface paint. Minimap colors include those surface layers.
- The former shipped maps and map-generation scripts were removed. Biome tests use small programmatic fixtures; frozen/autumn asset support remains intact.

Validation: 56 tests passed across nine focused suites, including actual navigation across each bridge, dry bridge exits, submerged channel preservation, paint subtraction, disabled-layer restoration, and biome generation. Production build passes (existing Vite configuration/chunk-size warnings remain).

Visuals: `overview.jpg`, `west-crossing.jpg`, `island.jpg`. This follows the supplied layout using the current Scouring-style environment assets; it is not a pixel-identical rendering of the Warcraft reference. Units/buildings without replacement art retain the existing missing-asset placeholders.

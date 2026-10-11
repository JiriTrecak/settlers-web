# Warcraft map import

The editor **Import WC3** button opens `.w3x` / `.w3m` files. The same operation is exposed as `editor_import_warcraft` with a local file `path`, optional `preview`, and optional `textures` mapping Warcraft four-character IDs to published ground asset IDs. Preview performs conversion and returns its report without replacing the map. Save any wanted changes before replacing the current document. For automated inspection, use a fresh disposable editor tab and preview first; do not create browser-library copies.

Parsing and conversion run in a disposable worker with a 90-second timeout. MPQ headers, tables and entry sizes are bounded before decompression. Only map information, terrain, unit placements, doodad placements, strings and unit/destructible overrides are read. Scripts are never executed.

## Saved result

The output is an ordinary version-3 `.utcmap`: explicit editable ground/water heights, material coverage and tile variations, authored scenery objects, starting points, amber nodes and camps. The source archive, generator recipes, renderer connections, render meshes and navigation caches are not saved. Changing a cell uses the same terrain operation as a newly authored map.

A Warcraft terrain tile (128 source units) spans **five world/navigation units**, using 25.6 source units per world unit. The source Town Hall pathing width of 512 therefore maps to our 20-world-unit, five-building-cell Hall. The building lattice remains four world units and navigation remains one; neither unit dimensions nor movement speed changes. A 128-tile source map becomes 640 world units (160 C). Y is inverted into map Z, preserving north at the top of the editor. Rectangular source terrain is centered without stretching in the smallest supported square map size. Source absolute elevation is translated into the editable range; relative heights are retained. Source cliff levels form steep boundaries, while source ramp corners remain interpolated. Shallow submerged beds are adapted to the game's wading depth; deeper beds retain depth variation. The imported heights and water surface remain directly editable.

The saved `terrain.textureGrid` records the texture tile size and origin independently of navigation. Ground coverage remains an ordinary one-unit editable raster. Atlas connectivity and variant arrays follow the texture grid through rendering, worker transfer, Save/Load, and repainting.

Ground assets are resolved through each asset's `terrain.sourceIds`, preserving source layer order and full-tile variations. Missing materials stop import with their IDs, or can be explicitly substituted through MCP. Atlas corner connections are resolved by the normal renderer. Installed Classic textures and neutral defaults for their absent material channels are imported separately by `scripts/assets/import-warcraft-terrain.ts`.

Used source cliff types resolve to ordinary cliff-face terrain assets through the same `terrain.sourceIds` mechanism. Their coverage is saved independently from ground coverage and remains editable. `scripts/assets/import-warcraft-cliffs.ts` reads the wall region declared in `content/import/warcraft/cliff-surfaces.json`, preserving original DDS sources and separate material channels. These regions use slope-gated vertical projection on our heightfield; source cliff MDX silhouettes and UV geometry are not imported. The supplied maps use `CLdi`; `CLgr` is also available. Missing cliff-face declarations stop import rather than silently painting an unrelated material.

Trees retain their authored source positions, orientation and uniform scale, with the substitution declared in `content/import/warcraft/policy.json`. Harvestable trees use the game's existing navigation-cell projection. Starts and amber nodes snap to the existing building grid. Expansion gold mines become five ordinary amber nodes in an arc around the source center, with one of each declared full visual variant. A starting mine within the policy search radius instead uses the standard Hall-relative line: outer nodes 24 world units away, inner nodes 28 away, facing the source mine direction. Geography scaling does not change opening extraction travel. Trees obstructing a primary node or its two-unit working apron are removed and counted in `clearedStartingTrees`; the line is never shifted sideways to fit those trees. Remaining unresolvable conflicts are reported for review. Source yield is distributed within the declared node capacity and excess is reported. Each node retains its own starting amount for the shared one-third-remaining and empty visuals.

## Camp substitutions

Source neutral-hostile units are grouped by distance, with a maximum camp diameter to avoid joining distant camps through a chain. This is a heuristic: Warcraft placement records do not provide explicit camp membership. The import report lists every source member, combined level, substitute composition and position so an author can review it.

Combined source levels 1–9 map to easy camps, 10–19 to medium, and 20+ to hard, following [Blizzard's melee map guidance](https://classic.battle.net/mod/dev/melee.shtml). The actual substitute families come from the game's existing neutral camp compositions. Available source positions are reused for the substitute members. Missing source levels are reported. Reforged object overrides can change levels or identify custom trees.

`content/import/warcraft/source.json` contains source unit levels, tree IDs and water offsets extracted from the installed game, plus source hashes. Refresh it with:

```sh
node --import tsx scripts/assets/warcraft/import-metadata.ts .asset-work/tools/casc-reader/casc-extract '/Applications/Warcraft III/.build.info'
```

The installed game is only needed for this offline metadata/asset refresh, never for importing a map or loading the saved result.

## Verification and remaining limits

The supplied Echo Isles and Turtle Rock fixtures exercise W3E 11/12 and W3I 31/33, Reforged object overrides, terrain serialization, source tree positions, full-tile variants, camp tiers and subsequent cell editing. The browser worker and renderer are checked separately in the live editor.

Imported maps still need author review for playable margins, exact cliff silhouettes, source pathing overrides and ramp behavior. Triggers, items, neutral shops, other decorative doodads and source models are outside this import scope. Source height changes and current water rendering can differ from Warcraft; this importer supplies editable geometry and placements, not a pixel-identical scene.

Before camp grouping, discard source neutral-hostile units within the declared 1500-source-unit starting clearance radius of each occupied player start. This mirrors installed `Blizzard.j` (`MeleeClearExcessUnits` / `bj_MELEE_CLEAR_UNITS_RADIUS`) and prevents expansion guards from spawning inside active bases. The report records `clearedStartingCreeps`; resource deposits remain.

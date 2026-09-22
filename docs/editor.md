# Map authoring

Open the game's Editor, or `/?screen=editor&map=threewater-forest`. The top strip names, creates, saves, loads and exports maps. New maps choose a name, dimensions, biome and weather. The biome establishes the base ground and the available river, forest, foliage and landform presets; it is not a separate season switch.

## Layout and tools

The left panel is a searchable hierarchy with All/Layers/Objects filters. Selecting a generated object selects its owning layer. Independent scenery and gameplay entities have their own groups. Group expansion and list scrolling persist while changing selection.

The bottom icon strip contains Select, Place, Terrain, Foliage, Water and Spawn, plus layer undo/redo, Environment and MCP. Place switches between single units/buildings and scenery/landmarks. The right inspector holds contextual settings; authored scenery exposes position, elevation, rotation and scale. Top down, Game and Free camera presets sit above the viewport.

Select picks an object, then an intersecting layer, or clears selection on empty ground. Paint and path authoring work best in Top down view. Water supports Paint lake, Line and Curve. Painted masks have Add/Subtract and one brush-size control; Shift temporarily subtracts. Line/curve drawing uses Enter to finish and Escape to cancel. Curves expose draggable anchors and tangent handles. Terrain offers painted landforms and ground surfaces as well as direct height tools.

## Live layers

Maps retain masks, splines, seeds, recipe IDs and sparse per-layer overrides. Recipe assets own defaults; an instance can change density, spacing or other exposed inputs and reset them to those defaults. Generation follows dependencies: shape ground and water before paths, forests and ground cover. Broad forest strokes can cross a river because placement constraints exclude unsuitable ground.

`src/shared/authoring/mapScene.ts` compiles the same scene for editor and game. Biome choices live in `src/content/biomes.ts`. Generated objects retain layer ownership. Scatter layers can be baked as a whole into independent objects; there is no detach-selected workflow. Terrain, path and river layers remain live. Layer history and entity history are separate; the bottom history buttons explicitly act on layers.

Weather and canopy settings are map properties in Environment. MCP exposes the same validated authoring operations to agents. Asset definitions and publication are managed in the [asset editor](asset-pipeline/publication.md), separate from placing instances on a map.

## Save and verify

Save preserves the authored `.utcmap`, not a dump of generated scatter instances. Check navigation at bridges and water margins, player spawns, resource access, fog visibility and landmark readability in the game view. Use the minimap as a spatial check, then play the map; a visual preview alone does not prove traversal.

# Map authoring

Open the game's Editor, or `/?screen=editor&map=threewater-forest`. The top strip names, creates, saves, loads and exports maps. New maps choose a name, dimensions, biome and weather. The biome establishes the base ground and the available river, forest, foliage and landform presets; it is not a separate season switch.

## Layout and tools

The left panel is a searchable hierarchy with All/Layers/Objects filters. Selecting a generated object selects its owning layer. Select a layer or authored object and choose **Go to selection** in the inspector to move the camera there; search for landmark names such as “Spring Hollow”, “Watchpost” or “ferry” in Threewater. Independent scenery and gameplay entities have their own groups. Group expansion and list scrolling persist while changing selection.

The bottom icon strip contains Select, Place, Terrain, Foliage, Water and Spawn, plus layer undo/redo, Environment and MCP. Place switches between single units/buildings and scenery/landmarks. The right inspector holds contextual settings; authored scenery exposes position, elevation, rotation and scale. Top down, Game and Free camera presets sit above the viewport.

Select picks an object, then an intersecting layer, or clears selection on empty ground. Right-click the canvas to choose any overlapping visible layer from a context menu; right-drag still orbits. With an object or unit selected, Q/E snap backward/forward to the next 15° increment; Shift+Q/E use 90° increments. Bridges can be moved and rotated over water, with their rendered orientation and walk surface updated together. Their ends must still meet a walkable bank at a compatible height. Paint and path authoring work best in Top down view. Water supports Paint lake, Line and Curve. Painted masks have Add/Subtract and one brush-size control; Shift temporarily subtracts. Line/curve drawing uses Enter to finish and Escape to cancel. Curves expose draggable anchors and tangent handles. Terrain offers painted landforms and ground surfaces as well as direct height tools.

## Live layers

Maps retain masks, splines, seeds, recipe IDs and sparse per-layer overrides. Recipe assets own defaults; an instance can change density, spacing or other exposed inputs and reset them to those defaults. Generation follows dependencies: shape ground and water before paths, forests and ground cover. Broad forest strokes can cross a river because placement constraints exclude unsuitable ground.

`src/shared/authoring/mapScene.ts` compiles the same scene for editor and game. Biome choices live in `src/content/biomes.ts`. Generated objects retain layer ownership. Scatter layers can be baked as a whole into independent objects; there is no detach-selected workflow. Terrain, path and river layers remain live. Layer history and entity history are separate; the bottom history buttons explicitly act on layers.

Weather and canopy settings are map properties in Environment. MCP exposes the same validated authoring operations to agents. Asset definitions and publication are managed in the [asset editor](asset-pipeline/publication.md), separate from placing instances on a map.

## Forest-scale scenery

Vibrant Forest and Amberleaf Forest offer **Woodland mushroom patches** in Foliage: paint an additive/subtractive mask and adjust density as with other ground cover. Place **Ancient canopy oak**, **Spreading canopy oak**, **Great broken trunk**, **Great fallen hollow log**, and the two **Giant umbrella** mushrooms individually. These are sparse landmarks; their normal scale already dwarfs harvestable pines. Tree crowns and mushroom caps use the observed-unit cutaway and cast full shadows. Collision covers trunks/stems, not overhangs; the fallen log is a solid obstacle. Threewater includes a small showcase near the southwest player start.

The editable source and geometry live in each canonical asset package. `scripts/assets/build-forest-giants.py` rebuilds the models in background Blender; `scripts/assets/publish-forest-giants.ts` publishes them. Painted bark and mushroom albedos, including their ImageGen prompts, are in `art/assets/asset.textures.forest-giants-*`. Temporary renders stay outside the repository.

## Threewater scenery

Threewater has two protected building glades, three crossings and five local landmarks: the stranded leaf ferry, raised watchpost, spilled trader cargo, Spring Hollow and Southwater landing. Supply tracks skirt the enormous fallen logs; shoreline shelves and driftwood are partially submerged. Forests, landforms, water and foliage remain editable layers. The six waterfront models share the original bark and stone palette and include packed editable Blender sources.

Rebuild the map with `node --import tsx scripts/maps/create-threewater-forest.ts`; its scenery composition lives in `scripts/maps/threewater-scenery.ts`. Rebuild the waterfront kit with background Blender and `scripts/assets/build-waterfront.py`, then publish with `node --import tsx scripts/assets/publish-waterfront.ts`. Run `npx vitest run tests/game/threewater-map.test.ts` to check starting construction space, access to every amber deposit and actual settler movement across each bridge. Gameplay models currently using missing-model placeholders remain a separate art task.

## Save and verify

Project maps and browser saves are separate entries: browser saves are labelled **(local copy)** and never replace the project map of the same name. Autosaved drafts restore only against the map revision they were edited from. After a project update, the editor opens the new map and offers **Open earlier draft** when older unsaved edits were recovered; the earlier data stays preserved in browser storage.

Save preserves the authored `.utcmap`, not a dump of generated scatter instances. Check navigation at bridges and water margins, player spawns, resource access, fog visibility and landmark readability in the game view. Use the minimap as a spatial check, then play the map; a visual preview alone does not prove traversal.

## Performance

Object dragging updates only the selected model’s instance transforms. The document, procedural placement, terrain uploads, inspector and autosave update once on release. Pointer cancellation restores the original pose. Unit-only edits reuse the compiled landscape; object/layer commits reuse their validated compilation instead of compiling twice.

Generation uses exact indexed spline queries, broad river/path bounds and cached vertex wetness. Moving scenery refreshes vegetation coverage but preserves unchanged terrain geometry and water meshes. Debug includes `Editor drag preview` and `Editor drag commit` scopes; commit timings include synchronous regeneration and renderer updates.

Run `npm run bench:authoring` for repeated Threewater CPU compilation timings and a generated-output checksum. Pass another `.utcmap` path after `--` to benchmark it. Benchmarks and profiles belong in temporary storage, not the repository. Full procedural commits still run synchronously; drag previews do not.

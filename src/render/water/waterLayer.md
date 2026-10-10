# Water rendering

Saved terrain samples define the bed and local water height. The water mesh follows those heights and clips dry ground; navigation reads the same saved samples independently of rendering. Nothing in the shader changes shallow-crossing or deep-water passability.

Each biome declares a published `waterProfile`. GPU profile slot zero supplies that default to ordinary grid water and imported Warcraft water. Saved local profiles retain indices 1–255, so applying a river profile changes only assigned cells. Profile assets declare shallow/deep color, clarity, ripples, foam, reflection, caustics, cloud shading and flow speed. Appearance is not duplicated in map snapshots.

The renderer uses depth absorption, refraction, animated swells and broken foam, inspired by [GameIdea's stylized water approach](https://gameidea.org/2026/02/01/creating-a-stylized-3d-water-shader/). A shared world-space wave field drives vertex displacement and fragment normals. Physical depth continuously scales its amplitude, without changing phase: shallow crossings stay calm while deeper water develops swells and occasional crest foam. Waves are centred on the saved local water level, fade to zero at dry edges, and remain below 18% of the water-column depth. Elevated lakes use the same field; there is no sea-level-only assumption.

The reusable water profile's optional `waves` object declares height, length, speed, `depthStart`/`depthEnd`, `shallowStrength`, `shoreWidth` and `crestStrength`. Profiles without it inherit `DEFAULT_WATER_WAVES`. The asset workbench exposes these controls under **Waves & shoreline**, and validates ordered depth thresholds. Maps retain only their profile references. GPU rows 4 and 5 carry the wave controls independently for the biome default and local profiles.

Refraction scales with camera projection and falls back to the original scene sample when a displaced lookup hits foreground geometry. Caustics are subtle, depth-faded and filtered by screen footprint. Wave normals also filter fine ripples at distance. Shore foam estimates horizontal bank distance from bed slope, with antialiasing and broken coverage. Flat submerged crossings retain a readable bed instead of receiving foam across their entire area. Explicit flow foam remains independent. Appearance is shared by the game, map editor and asset workbench.

Original imported source assets still have their own adapter into this renderer. Editable maps always use committed terrain and the declared biome/local profiles. There is no map-load terrain generator or persisted render cache.

Verify appearance at both gameplay and overview camera distances. CPU tests cover profile assignment, topology, depth updates and unchanged saved data; live editor screenshots are needed for shader compilation and visual quality.

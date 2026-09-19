# The Scouring: trees and water

Inspected 2026-09-19 from the user-supplied ShaderCache.sdc, MeshCache, TextureCache and Media/classes. This is a source/asset inspection; it does not establish frame timings, runtime quality settings, render-target sizes or draw-call counts. No game rendering code or maps changed.

## Trees

`fir_a-materials.xml` and `fir_b-materials.xml` describe three material parts: alpha-tested, two-sided foliage; opaque trunk; and an alpha-blended ground underlay snapped to the terrain. Both fir variants share the same foliage/trunk/underlay textures. The small fir also shares the main foliage atlas. Decoded texture examples are in `tree-materials.png`.

- Foliage atlas: 512×512 BC7, eight stored mips. Trunk: 256×512 BC7, seven mips. Main underlay: 256×256 BC7, seven mips. The foliage image encodes detailed branch/needle silhouettes on textured surfaces.
- Foliage material has backside lighting .6, ground-color matching, wind stiffness .8 and a dry/damaged alternate texture. The underlay also has a dry variant. A ground patch plus vertex occlusion helps seat the tree in the scene.
- `Plants.fxs::PatchPlantNormals` replaces foliage normals with a radial/upward-biased shape. This lets thin textured surfaces shade as a fuller crown. Trunk normals are preserved.
- Vertex color is packed animation metadata: RGB gives offsets from foliage pivots and alpha distinguishes foliage/leaf damage marks. The shader separates leaf motion from whole-tree sway, uses material stiffness, instance scale and local shelter/obscurance, and preserves pivot distance during some bending to limit stretching.
- Shared GPU wind and bend textures animate plants. The shader has both instanced and non-instanced paths. The latter also supports falling foliage interacting with terrain and noise-based fade-out. This does not establish the game's complete draw batching or LOD policy.
- Unlike `Grass.fxs`, `Plants.fxs` declares per-vertex fog but does not declare per-vertex lighting. Do not attribute the grass's full lighting optimization to trees. Foliage requests a larger shadow-filter radius, applies macro-color variation and uses stored vertex occlusion.
- `fir_a.xml` supplies 3.2 minimum planting spacing, a 3.5 grass-erasure radius, 2-unit collision radius, 4-unit forest radius, 60 lumber, hit/fall events and stump replacement. Small fir uses a Bush planting group and a separate 1.5 spacing/grass-erasure radius. These values use source-game units.

Mesh records contain modest indexed geometry, but we have not implemented a complete parser for every tree part or LOD. No total tree triangle count is asserted here.

## Water

`Water.fxs` is the surface shader; `WaterCompute.fx` supplies render-to-texture pixel-shader passes named Simulation, Waves, Caustics, Foam and Reflections. The name "Compute" does not mean these are compute-shader dispatches.

- Surface patches use a water-height map and flow data, distance-adaptive tessellation and wave displacement. Low quality reduces tessellation to one. Wave normals, foam and height share a packed wave texture; its supplied source is 512×512 with ten mips.
- Flow-oriented scrolling samples are blended across quantized directions and speeds to avoid abrupt switches. Coarser wave mips depend on distance and view angle; geometry uses coarser mips than pixel shading.
- Simulation stores height offset, foam and disturbance in a 2D texture. A nine-neighbor update transports/decays them, guided by authored flow and constrained at dry areas and texture edges. It is a surface-effects simulation, not a recovered full-volume fluid solver. Update frequency, buffer size and the code injecting disturbances are outside these shaders.
- Refraction samples the already rendered opaque scene with wave distortion. Reconstructed depth drives exponential transparency and color tint. Depth checks prevent foreground/above-water scenery being incorrectly pulled into underwater refraction. Soft depth transitions help contact at shores.
- `WaterCompute.fx::RayMarchScreenVec` implements screen-space reflection against scene depth, bounded to 64 samples in groups of four and a 64-unit ray length, with a variable stride and early hit termination. The water surface blends that result with an environment cubemap fallback and an artistic Fresnel term. Low quality omits the screen-space reflection sample. Screen-space reflection cannot recover off-screen geometry; cubemap capture/update cost is not specified here.
- Water has separate authored diffuse, foam, refracted-light and substance colors, plus opacity/tint depths and biases. Blue/green/dark/ocean definitions are included beside this note. Do not assume the screenshot's exact preset without the map data.
- Caustics are animated texture patterns projected onto the reconstructed bottom, faded/filtered by depth and lit/shadowed to fit the scene. Source caustics texture is 256×256 with nine mips.
- Foam combines mapped foam and simulation foam with wave detail, has its own tint/lighting and soft contact, and contributes to displacement. `WaterCompute.fx` generates animated masks from layered texture samples. Some older alternatives are commented out and were excluded from these findings.
- Water's direct and ambient lighting are prepared on surface vertices, with shadows/refraction/reflections and compositing handled per pixel. Simplified and low-quality branches reduce effects. The implementation is capable, but its cost cannot be inferred from asset sizes alone.

## Implications for our renderer

Our water currently renders a separate bounded planar reflection capture, throttled to 15 Hz with a stationary camera and refreshed when the view moves. The recovered screen-space technique could avoid that extra geometry render for its reflection pass, but adds pixel ray marching and has off-screen limitations. Benchmark both rather than assuming SSR is always faster.

The closest visual gains for trees are matching branch silhouettes, crown normals, backside lighting, ground tint and underlays together. For water, prioritize depth/refraction/shoreline behavior, restrained flow-aware waves and authored color presets before adding expensive reflection features. Hardware tessellation in the HLSL requires an equivalent mesh/LOD strategy in our WebGL renderer; it is not a direct shader translation.

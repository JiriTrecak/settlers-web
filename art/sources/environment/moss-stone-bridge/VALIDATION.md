# Moss Stone Bridge

**What it is:** A broad stone arch refined with weathered limestone, restrained block tints and staggered paving; the walking profile is unchanged.

**Asset folder:** [moss-stone-bridge](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/moss-stone-bridge>).

**Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/moss-stone-bridge/moss-stone-bridge.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/environment/structures/moss-stone-bridge/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/environment/moss-stone-bridge/comparison.png>).

**Live preview:** [Studio](http://127.0.0.1:8896).

**Geometry:** 6,684 exported triangles; one mesh, seven material primitives; one 1024² albedo image; 806,172 bytes. Source recipe and editable master retained.

**Runtime features:** 6 × 18 m deck, 2.2 m arch, 0.8 m slab; four separate abutment blockers. No animations or team-color surface.

**Validation:** Final saved Blender validation and full 1200 × 900 render passed. Exported GLB loaded and inspected from top, back and low side; final in-level view inspected. All four stone tint factors verified in the GLB. 54 ray samples remain within 3.5002 cm of the declared floor. Eight focused crossing/chapter/journey tests passed. Prior eight-ant browser traversal predates this material/paving refinement; navigation declarations are unchanged. Source reference and sampled palette retained.

**Game integration:** Published through the asset manifest; the outdoor Hollow Gate crossing uses this runtime GLB. Navigation and rendering share the declared crossing profile.

**Limitations:** Paving is 3.5 cm above the continuous navigation profile; gaps are cosmetic. Banks must meet the landings. Exact texture edge tiling is not guaranteed; stone UV boundaries interrupt repetition. Moss remains simplified geometry. This refinement is not a claim of final level quality or balance.

The limestone was generated with the built-in imagegen tool; the exact prompt and provenance are retained in `art/sources/textures/weathered-limestone/generation.json`. Source image is retained at full resolution, with a Lanczos-resized 1024² runtime PNG and JPEG embedded in the GLB. Blender 5.2 exports the modern Mix/RGBA/Multiply node as a base-color factor; the older MixRGB node dropped the tint in the GLB and is not used.

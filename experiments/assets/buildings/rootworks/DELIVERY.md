# Rootworks — production building

- **What it is:** An open root-processing workshop with red curved roofing, paired toothed rollers, a side flywheel, loading apron, banded vat and ownership pennant.
- **Asset folder:** [Rootworks](/Users/jiritrecak/Documents/Supernova/Development/Settlers%203%20Web/experiments/assets/buildings/rootworks/).
- **Files:** [Blender](/Users/jiritrecak/Documents/Supernova/Development/Settlers%203%20Web/experiments/assets/buildings/rootworks/rootworks.blend) · [Game GLB](/Users/jiritrecak/Documents/Supernova/Development/Settlers%203%20Web/assets/ant-colony/rootworks.glb) · [Comparison](/Users/jiritrecak/Documents/Supernova/Development/Settlers%203%20Web/experiments/assets/buildings/rootworks/comparison.png). Recipe, palette, samples and style reference live in the asset folder.
- **Live preview:** [Rootworks studio](http://127.0.0.1:8788/).
- **Geometry:** 11,004 exported triangles; 1 mesh; 17 materials. No LODs delivered.
- **Runtime features:** `TC_TeamColor` on the flag only, authored `#A04B31` red. Static; no animations. No baked red multiplication on the team vertices.
- **Validation:** Background Blender validation passed (finite geometry, indices, camera, black studio, packed reference). Full-resolution 1289×1221 render; GLB loaded in live viewer; front/side/rear orbit inspected; blue flag recoloring inspected; GLB team material and neutral-white vertex colors checked; published export hash matches studio GLB.
- **Game integration:** Exported asset only. Native placement-near-resource and specialized delivery work is underway; content declaration and gameplay integration are not complete.
- **Limitations:** Original architecture inferred from the gameplay brief; the included stonemason image is a shared style/material reference, not an exact Rootworks shape reference. Broad geometry and vertex-baked variation simplify painted grain and fine metal detail. The vat and machinery are static. In-game scale and crowd/performance not yet measured.

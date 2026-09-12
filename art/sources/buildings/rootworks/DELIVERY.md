# Rootworks — production building

- **What it is:** An open root-processing workshop with red curved roofing, paired toothed rollers, a side flywheel, loading apron, banded vat and ownership pennant.
- **Asset folder:** [Rootworks](/Users/jiritrecak/Documents/Supernova/Development/Settlers%203%20Web/experiments/assets/buildings/rootworks/).
- **Files:** [Blender](/Users/jiritrecak/Documents/Supernova/Development/Settlers%203%20Web/experiments/assets/buildings/rootworks/rootworks.blend) · [Game GLB](/Users/jiritrecak/Documents/Supernova/Development/Settlers%203%20Web/assets/ant-colony/rootworks.glb) · [Comparison](/Users/jiritrecak/Documents/Supernova/Development/Settlers%203%20Web/experiments/assets/buildings/rootworks/comparison.png). Recipe, palette, samples and style reference live in the asset folder.
- **Live preview:** [Local studio](http://127.0.0.1:8811/).
- **Geometry:** 11,004 exported triangles; 1 mesh; 17 materials. No LODs delivered.
- **Runtime features:** `TC_TeamColor` on the flag only, authored `#A04B31` red. Static; no animations. No baked red multiplication on the team vertices.
- **Validation:** Background Blender validation passed (finite geometry, indices, camera, black studio, packed reference). Full-resolution 1289×1221 render; GLB loaded in live viewer; front/side/rear orbit inspected; blue flag recoloring inspected; GLB team material and neutral-white vertex colors checked; published export hash matches studio GLB.
- **Game integration:** Integrated as the Tier 1 near-deposit building and only physical Root drop-off; delivered Root credits the colony account.
- **Limitations:** Original architecture inferred from the gameplay brief; the included stonemason image is a shared style/material reference, not an exact Rootworks shape reference. Broad geometry and vertex-baked variation simplify painted grain and fine metal detail. The vat and machinery are static. In-game scale and crowd/performance not yet measured.

Studio availability audit 2026-09-10: replacement viewer http://127.0.0.1:8811/ serves the correct asset and GLB. Source/model unchanged.

Final integration/performance status: see docs/declarations/tier-two-completion.md. Earlier unchecked-integration statements in historical notes are superseded by that audit.

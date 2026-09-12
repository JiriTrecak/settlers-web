**Great Mound — tier-two Ant headquarters**

- **What it is:** An in-place evolution of the Mound with a raised armored command storey, broad roof straps and three ownership banners.
- **Asset folder:** [great-mound](/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/great-mound)
- **Files:** [Blender](/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/great-mound/great-mound.blend) · [Game GLB](/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/ant-colony/great-mound.glb) · [Comparison](/Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/great-mound/comparison.png)
- **Live preview:** [Local studio](http://127.0.0.1:8814/).
- **Geometry:** 58,902 exported triangles; one mesh, 30 materials.
- **Runtime features:** Three flags use `TC_TeamColor`, default #A04B31 with white vertex colors. Static; no animations.
- **Validation:** Saved Blender geometry/reference validation; final 1462×1076 render; loaded GLB front/side/rear inspection; blue flag recoloring with unchanged roofs; material/vertex-color checks; published GLB hash parity. Native upgrade and actual Root→upgrade→research simulation tests pass. Native SettlementLayer/HUD inspection confirms in-place model replacement, selection footprint, HP/level/armor, research purchase/cancellation and Root income in a flat runtime test scene.
- **Game integration:** Integrated as the in-place Mound upgrade, preserving identity and unlocking Tier 2 purchases.
- **Limitations:** Added storey and hidden surfaces are inferred from the original Mound style reference; fine texture is simplified in vertex-baked export. Full forest-map lighting and performance validation remain pending; the runtime inspection uses a flat test scene.

Studio availability audit 2026-09-10: replacement viewer http://127.0.0.1:8814/ serves the correct asset and GLB. Source/model unchanged.

Final integration/performance status: see docs/declarations/tier-two-completion.md. Earlier unchecked-integration statements in historical notes are superseded by that audit.

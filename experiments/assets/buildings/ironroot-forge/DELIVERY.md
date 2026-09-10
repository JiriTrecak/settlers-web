# Ironroot Forge — research building

- **What it is:** Curved red-roof workshop with open anvil bay, masonry furnace and flue, bellows, weapon rack and ownership pennant.
- **Asset folder:** [ironroot-forge](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/ironroot-forge>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/ironroot-forge/ironroot-forge.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/ant-colony/ironroot-forge.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/ironroot-forge/comparison.png>)
- **Live preview:** [Studio](http://127.0.0.1:8789/)
- **Geometry:** 11,684 exported triangles, one mesh, 17 materials. Source retains 300 editable meshes. Runtime hash and color checks are in runtime-validation.json.
- **Runtime features:** Static; no animations. Flag only uses TC_TeamColor, default #A04B31, neutral-white exported vertex colors.
- **Validation:** Saved Blender validation passed (finite geometry, camera, black world, packed reference). Full-resolution 1289×1221 render inspected. GLB loaded in live viewer; front, sides and lower rear inspected during orbit. Blue flag recoloring verified without changing roof/masonry. Final GLB matches runtime copy. 128×128 icon generated from model render.
- **Game integration:** Connected as building.ants.ironroot-forge in the basic build card and editor via definitions. 140 Amber/70 Wood, 30 seconds construction; three queued research slots, Serrated Tools, Reinforced Carapace and Broadheads. Gameplay test builds it and researches Warrior health/armor. In-game visual scale/performance inspection is still pending.
- **Limitations:** New architecture and hidden surfaces inferred from the text brief; stonemason image supplies shared style/material reference. Fine painted detail simplified to broad geometry and vertex color. Full app build currently blocked by another new neutral icon exceeding the 128px limit.

Managed studio session: 59743. Browser tab: 109. Do not restart based only on this recorded handle; verify it is live.

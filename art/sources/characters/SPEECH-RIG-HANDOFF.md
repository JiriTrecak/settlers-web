# Ant speech rig handoff

Existing character geometry was retained. Sources were refined in background Blender; backups are in each asset history folder. Runtime exports match the saved-source exports byte-for-byte.

**Ant Worker — animated player unit**

- **What it is:** Existing ant refined with independent left/right mandible bones for dialogue.
- **Asset folder:** [ant-family](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family/ant-family.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/worker/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8911/), 3D viewer → Speaking.
- **Geometry:** 3,752 triangles; 1 exported meshes; 9 materials. No separate LODs delivered.
- **Runtime features:** `TC_TeamColor` on the existing chitin/team surfaces, default red. Clips: `attack_bow`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `chop`, `death`, `hit`, `idle`, `run`, `walk`. Runtime attack-state aliases select the role's attack clip. Independent mandible articulation overlays body animation.
- **Validation:** Saved Blender geometry/reference checks and mandible weights passed. Runtime GLB loading and per-clone jaw/attack/death tests passed. Live front/side or rear inspection and blue team recolouring checked across the four source rigs; not every clip of every variant was manually watched.
- **Game integration:** Published in the asset registry and runtime folder. Mission dialogue drives the explicitly tagged speaker, or a unique observed matching unit. Heartwood Vault identifies its speakers explicitly.
- **Limitations:** Text-paced silent speech, not audio visemes. Existing low-poly geometry and materials retained; this is a rig refinement. 2D UI portraits are static.

**Ant Warrior — animated player unit**

- **What it is:** Existing ant refined with independent left/right mandible bones for dialogue.
- **Asset folder:** [ant-family](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family/ant-family.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/warrior/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8911/), 3D viewer → Speaking.
- **Geometry:** 4,829 triangles; 2 exported meshes; 9 materials. No separate LODs delivered.
- **Runtime features:** `TC_TeamColor` on the existing chitin/team surfaces, default red. Clips: `attack_bow`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `chop`, `death`, `hit`, `idle`, `run`, `walk`. Runtime attack-state aliases select the role's attack clip. Independent mandible articulation overlays body animation.
- **Validation:** Saved Blender geometry/reference checks and mandible weights passed. Runtime GLB loading and per-clone jaw/attack/death tests passed. Live front/side or rear inspection and blue team recolouring checked across the four source rigs; not every clip of every variant was manually watched.
- **Game integration:** Published in the asset registry and runtime folder. Mission dialogue drives the explicitly tagged speaker, or a unique observed matching unit. Heartwood Vault identifies its speakers explicitly.
- **Limitations:** Text-paced silent speech, not audio visemes. Existing low-poly geometry and materials retained; this is a rig refinement. 2D UI portraits are static.

**Ant Archer — animated player unit**

- **What it is:** Existing ant refined with independent left/right mandible bones for dialogue.
- **Asset folder:** [ant-family](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family/ant-family.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/archer/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-family/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8911/), 3D viewer → Speaking.
- **Geometry:** 4,146 triangles; 2 exported meshes; 11 materials. No separate LODs delivered.
- **Runtime features:** `TC_TeamColor` on the existing chitin/team surfaces, default red. Clips: `attack_bow`, `attack_sword`, `attack_unarmed`, `build`, `carry`, `chop`, `death`, `hit`, `idle`, `run`, `walk`. Runtime attack-state aliases select the role's attack clip. Independent mandible articulation overlays body animation.
- **Validation:** Saved Blender geometry/reference checks and mandible weights passed. Runtime GLB loading and per-clone jaw/attack/death tests passed. Live front/side or rear inspection and blue team recolouring checked across the four source rigs; not every clip of every variant was manually watched.
- **Game integration:** Published in the asset registry and runtime folder. Mission dialogue drives the explicitly tagged speaker, or a unique observed matching unit. Heartwood Vault identifies its speakers explicitly.
- **Limitations:** Text-paced silent speech, not audio visemes. Existing low-poly geometry and materials retained; this is a rig refinement. 2D UI portraits are static.

**Ant Marshal — animated player unit**

- **What it is:** Existing ant refined with independent left/right mandible bones for dialogue.
- **Asset folder:** [ant-marshal](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-marshal>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-marshal/ant-marshal.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/marshal/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-marshal/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8910/), 3D viewer → Speaking.
- **Geometry:** 6,512 triangles; 2 exported meshes; 8 materials. No separate LODs delivered.
- **Runtime features:** `TC_TeamColor` on the existing chitin/team surfaces, default red. Clips: `attack_mace`, `carry`, `cast`, `death`, `hit`, `idle`, `run`, `walk`. Runtime attack-state aliases select the role's attack clip. Independent mandible articulation overlays body animation.
- **Validation:** Saved Blender geometry/reference checks and mandible weights passed. Runtime GLB loading and per-clone jaw/attack/death tests passed. Live front/side or rear inspection and blue team recolouring checked across the four source rigs; not every clip of every variant was manually watched.
- **Game integration:** Published in the asset registry and runtime folder. Mission dialogue drives the explicitly tagged speaker, or a unique observed matching unit. Heartwood Vault identifies its speakers explicitly.
- **Limitations:** Text-paced silent speech, not audio visemes. Existing low-poly geometry and materials retained; this is a rig refinement. 2D UI portraits are static.

**Ant Hunter — animated player unit**

- **What it is:** Existing ant refined with independent left/right mandible bones for dialogue.
- **Asset folder:** [ant-hunter](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-hunter>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-hunter/ant-hunter.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/hunter/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-hunter/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8912/), 3D viewer → Speaking.
- **Geometry:** 4,328 triangles; 2 exported meshes; 9 materials. No separate LODs delivered.
- **Runtime features:** `TC_TeamColor` on the existing chitin/team surfaces, default red. Clips: `attack_spear`, `carry`, `charge`, `death`, `hit`, `idle`, `run`, `walk`. Runtime attack-state aliases select the role's attack clip. Independent mandible articulation overlays body animation.
- **Validation:** Saved Blender geometry/reference checks and mandible weights passed. Runtime GLB loading and per-clone jaw/attack/death tests passed. Live front/side or rear inspection and blue team recolouring checked across the four source rigs; not every clip of every variant was manually watched.
- **Game integration:** Published in the asset registry and runtime folder. Mission dialogue drives the explicitly tagged speaker, or a unique observed matching unit. Heartwood Vault identifies its speakers explicitly.
- **Limitations:** Text-paced silent speech, not audio visemes. Existing low-poly geometry and materials retained; this is a rig refinement. 2D UI portraits are static.

**Ant Bombardier — animated player unit**

- **What it is:** Existing ant refined with independent left/right mandible bones for dialogue.
- **Asset folder:** [ant-bombardier](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-bombardier>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-bombardier/ant-bombardier.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/models/units/ants/bombardier/model.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/ant-bombardier/comparison.png>).
- **Live preview:** [Studio](http://127.0.0.1:8913/), 3D viewer → Speaking.
- **Geometry:** 5,008 triangles; 2 exported meshes; 7 materials. No separate LODs delivered.
- **Runtime features:** `TC_TeamColor` on the existing chitin/team surfaces, default red. Clips: `attack_mortar`, `carry`, `death`, `hit`, `idle`, `run`, `walk`. Runtime attack-state aliases select the role's attack clip. Independent mandible articulation overlays body animation.
- **Validation:** Saved Blender geometry/reference checks and mandible weights passed. Runtime GLB loading and per-clone jaw/attack/death tests passed. Live front/side or rear inspection and blue team recolouring checked across the four source rigs; not every clip of every variant was manually watched.
- **Game integration:** Published in the asset registry and runtime folder. Mission dialogue drives the explicitly tagged speaker, or a unique observed matching unit. Heartwood Vault identifies its speakers explicitly.
- **Limitations:** Text-paced silent speech, not audio visemes. Existing low-poly geometry and materials retained; this is a rig refinement. 2D UI portraits are static.

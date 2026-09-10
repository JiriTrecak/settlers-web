# Ant Hunter — animated player unit

- **What it is:** Light spear infantry with a buckler, steel chest armor, and a swept bronze crest; derived from the existing animated ant family.
- **Asset folder:** [ant-hunter](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/characters/ant-hunter>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/characters/ant-hunter/ant-hunter.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/ant-colony/characters/hunter.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/characters/ant-hunter/comparison.png>)
- **Live preview:** [Local studio](http://127.0.0.1:8815/).
- **Geometry:** 4,328 exported triangles; 2 meshes; 9 materials; 1 skeleton. No LOD variants.
- **Runtime features:** TC_TeamColor body, antennae and belt tab, default #A04B31; other equipment retains its material. Clips: idle, walk, run, carry, charge, attack_spear, hit, death. Attack state maps to attack_spear, visual hit at 55%; default playback 1.5×. In-place locomotion, +Z forward, Y up. Death holds; carry is an equipment-ready idle pose, not resource hauling.
- **Validation:** Saved Blender finite-geometry/packed-reference/camera checks; actual runtime GLB loading, clip mappings, independent rigs and recoloring, loop seams, one attack event and held death tests. Front/side/rear orbit, all states, workshop scale and blue ownership inspected. Native SettlementLayer duel inspected for charge/movement/attack and team colors. Runtime GLB matches final studio export byte-for-byte. Full game suite: 450 tests passed; app build passed.
- **Game integration:** Integrated at the Barracks behind Great Mound; physical Worker recruitment, automatic charge, Driving Spear research and persistent state verified.
- **Limitations:** Broad stylized forms intentionally match existing game ants rather than reproduce the reference's fine painted metal. Spear equipment and hidden surfaces are inferred. No full-army performance benchmark yet. AI tech planning remains part of the active T2 goal.

Studio availability audit 2026-09-10: replacement viewer http://127.0.0.1:8815/ serves the correct asset and GLB. Source/model unchanged.

Final integration/performance status: see docs/declarations/tier-two-completion.md. Earlier unchecked-integration statements in historical notes are superseded by that audit.

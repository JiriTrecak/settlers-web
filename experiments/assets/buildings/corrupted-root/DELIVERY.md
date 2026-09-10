# Corrupted Root — neutral resource deposit

- **What it is:** Intertwined dark roots exposing a pale fibrous core, fungal shelves and tapered ground roots; includes a small carried Root bundle.
- **Asset folder:** [corrupted-root](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/corrupted-root>)
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/corrupted-root/corrupted-root.blend>) · [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/ant-colony/corrupted-root.glb>) · [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/corrupted-root/comparison.png>) · [Cargo source](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/experiments/assets/buildings/corrupted-root/root-bundle.blend>)
- **Live preview:** [Studio](http://127.0.0.1:8790/)
- **Geometry:** Deposit: 8,106 triangles, one mesh, 13 materials. Cargo: 114 triangles, three meshes, three materials. Runtime hashes in runtime-validation.json.
- **Runtime features:** Static; no animations. No team-color surfaces (neutral resource).
- **Validation:** Final Blender validation passed, full-resolution 1312×1199 render inspected, GLB loaded and front/side/rear orbit inspected. Neutral-material contract checked. Runtime copies match exports. Cargo GLB exported and structurally counted; carried placement still needs in-game visual inspection.
- **Game integration:** building.neutral.corrupted-root and item.root available through declarations/editor. 3,000 finite resource, five gatherers, ten per full trip, specialized Rootworks drop-off, shared spendable colony credit. Rootworks is in the basic build card and requires a visible nonempty source within twelve cells. Tests cover actual content delivery, capacity, final seven-unit load, lost drop-off and deterministic restoration.
- **Limitations:** New design inferred from the brief using the Amber Seam as a forest material/style reference. Fine detail simplified to broad faceted geometry. Guarded map placement, AI use and in-game visual/performance verification remain pending; no claim the full Tier 2 pass is finished.

Studio managed session 98995; browser tab110. Verify live handles before reusing; do not restart based solely on these recorded identifiers.

# Ant Archer

Reference-generated Tripo H3.1 character for the existing `unit.ants.archer` definition. `reference-sheet.png` is the supplied design; `reference.png` isolates one character without a fused bow. `source.glb` preserves the provider's packed 4K atlas, 10 editable parts, Mixamo rig, and six animation takes.

`model.py` imports the character, preserves its painted textures, repairs rigid head/quiver weights, adds ownership masking, and exports disposable optimized copies. `bow.py` builds the low-triangle timber bow, ivory tips, moving string and held arrow. The generated shot's hunched upper body and low hands were corrected with baked arm IK and an upright torso. No runtime IK is required. The nocked arrow disappears at release frame 39/71, synchronized to simulation projectile creation; `socket_projectile` follows the bow hand. Walk, run, idle, hit and death remain provider motions.

Runtime: 4,715 triangles including bow and arrow, four material primitives, three 2K painted surface maps. Source height 2.02; global unit scale is applied only by the game. Leaf collar and cloth take independent player colors; body, eyes, acorn helmet, leather and quiver retain natural colors. The saved Blender file retains packed 4K images, editable parts, reference and actions.

Rebuild through the existing studio server on port 8795. Publish with `node --import tsx scripts/assets/publish-tripo-unit.ts ant-archer-tripo`. Canonical package: `art/assets/asset.models.units.ants-archer`; runtime mirror: `assets/library/asset.models.units.ants-archer`.

Verified: exported studio draw/release, blue ownership, live combat projectile and elevated tower firing, normalized skin weights, retained keyed string/arrow animation, opaque team mask and runtime budget. The short-armed draw is adapted for this stylized body rather than a human competitive archery stance. No facial speech rig is included.

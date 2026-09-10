# Bombardier Workshop

Original Ant Tier 2 production building: twin armored red-roof sheds, open mortar assembly bay, loading gantry, shell racks, rear workbench and one ownership flag.

- Editable source: `bombardier-workshop.blend`; deterministic `model.py`, `asset.json`.
- User's Ant workshop image retained as `reference.png`, used for materials and construction language rather than exact architecture. Sample coordinates, palette and annotated samples included.
- Full-resolution render: 1280×1200, with `comparison.png`.
- Runtime: `assets/ant-colony/bombardier-workshop.glb`, copied from this folder's `model.glb`.
- Export: **17,594 triangles, 1 mesh, 16 materials**. SHA and color checks in `runtime-validation.json`.
- `TC_TeamColor` affects only the flag, authored #A04B31. Exported normalized unsigned-short vertex colors are all 65535 (white). Static; no animations.
- Saved Blender validation passed: finite geometry, camera, black world, packed reference. Live GLB loaded, front/rear/side inspected, blue flag verified independently of roofs and structure.
- Live studio: http://127.0.0.1:8795/ (8794 had an inaccessible stale server).
- Gameplay declarations connected: Great Mound prerequisite, advanced build category, worker conversion to Bombardier, Amber/Wood/Root recruitment bill. Physical Root dropoff remains Rootworks-only; Workshop storage is not a dropoff.
- Native tests pass for prerequisite, recruitment, Root refund and Saturating Shells research. In-game visual scale/combat inspection and army performance remain pending.
- Limitations: hidden construction inferred, fine surface painting simplified. Studio's realtime shading differs from Cycles.

# Ant colony replacement assets

Original geometry authored in Blender through MCP for the approved Ant settlement target:
`assets/visual_tests/ant-base/compare.png`.

These are **work in progress**, not a completed visual match.

## Sources and reproduction

- `scripts/ant-colony/models.py`: fort, woodcutter, sawmill, forester, Ant worker and guard, loose resources and stacks.
- `scripts/ant-colony/forest.py`: layered conifers, ferns, broad leaves, grass, stones, lilies and reeds.
- `Ant-colony-source.blend` and `Ant-forest-source.blend`: editable Blender collections with individual modeling parts.
- `model-manifest.json` and `forest-manifest.json`: geometry counts from successful exports.
- `scripts/ant-colony/blender.mjs`: sends the source script to the running Blender MCP. A client timeout does not necessarily cancel Blender; inspect manifest modification times before retrying.
- `scripts/ant-colony/compose.py`: deterministic scene authoring; writes `assets/maps/showcase/ant-colony-compare.utcmap`, catalog entries and local MCP capture calls.

Assets use metres with Blender Z up, front toward -Y, and an origin at soil level. GLB export converts to glTF Y up (front +Z). Geometry is merged by material for runtime instancing while editable parts remain in the Blender files. Buried conifer roots intentionally extend below zero.

The new buildings, Ant worker and individual resources also replace the gameplay renderer's prototypes. Corresponding older GLBs have been removed; legacy catalog IDs resolve to these replacements. The remaining legacy nature assets and other building types are still pending replacement and removal.

## Live inspection

- Editor: `/?screen=editor&map=ant-colony-compare`
- Comparison: `/visual-compare.html?target=ants`
- Capture camera: perspective, target (128,127), relative game zoom .8, yaw 0°, pitch 48°, aspect 1681/937, fixed animation time 12.
- Map environment: Forest, summer, 10:00, clock paused.

Actual captures are written by editor MCP to `tmp/editor-shot.png`; milestone captures are kept under `tmp/ant-colony/`. The pre-rebuild editor document is preserved at `tmp/ant-colony/editor-recovery.utcmap` (Twinwater Reach, 876 stamps).

## Remaining fidelity work

The first passes establish new geometry, instancing, scene composition, shared Ant material treatment, canopy reflections and a warmer Forest palette. The target still requires substantially more sculpted roof/body detail, better workshop silhouettes, proper root integration, fuller fine ground cover, riverbank shaping and water detail. Model and material evaluation must use actual engine captures, not just export success or unit tests.

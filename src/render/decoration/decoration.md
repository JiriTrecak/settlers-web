# decoration

Prop sprites on top of the landscape mesh.

- `decorationSheets.ts` — loads `/graphics/catalog.json` groups `props/tree-1..7`, `props/tree-fall-1..4`, `props/stone`, `props/waves`, `props/stack-{material}`. Missing catalog → layer no-ops, no crash.
- `decorationLayer.ts` — waves once; trees/stones/stacks diffed from the sim snapshot. Chopping plays fall frames (or scales if fall dump is missing). Growing saplings skip the fall clip and wind, and scale around the tile (0.35 / 0.6 / 0.85). z = `isoDepth` on the shared iso container.

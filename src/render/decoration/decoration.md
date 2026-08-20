# decoration

Prop sprites on top of the landscape mesh.

- `decorationSheets.ts` — loads `/graphics/catalog.json` groups `props/tree-1..7`, `props/tree-fall-1..4`, `props/stone`, `props/waves`, `props/stack-{material}`, `props/corn`, `props/found-{sign}` (falls back to `props/site-sign`), `props/border`. Missing catalog → layer no-ops, no crash.
- `decorationLayer.ts` — waves once; trees/stones/stacks/signs diffed from the sim snapshot (live tiles plus fog snapshots in grey). Chopping plays fall frames (or scales if fall dump is missing). Growing saplings skip the fall clip and wind, and scale around the tile (0.35 / 0.6 / 0.85). Signs pick a frame by deposit fill. z = `isoDepth` on the shared iso container. Sprite alpha is `sight/100`; hidden at 0.

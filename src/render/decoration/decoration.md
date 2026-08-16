# decoration

Prop sprites on top of the landscape mesh.

- `decorationSheets.ts` — loads `/graphics/catalog.json` groups `props/tree-1..7`, `props/stone`, `props/waves`. Missing catalog → layer no-ops, no crash.
- `decorationLayer.ts` — iso + height offsets; z = `y*2` (waves) vs `y*2+1` (trees/stones). Tree look is `deco.sheet`. Stone frame is `seqLength - capacity - 1` (full pile last, empty first). Waves animate from the sheet.

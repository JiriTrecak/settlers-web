# data

One file per building / settler. The file is the whole def: footprint, stacks, worker, sheet, step time, flags. Registry files only re-export.

Building flags: `occupies` (stamp a land disk **while garrisoned**), `garrison` (infantry slots; T1 = 1), `workRadius` (outdoor search circle; `hut.work` is the origin, default the hut; 0 = indoor / no Area button), `viewDistance` (fog look radius once built), `flatten` (omit → diggers level protected tiles before bricklayers; `false` skips), `mine` (pull this deposit from a random blocked tile). Settler flags: `needsPlayersGround` (omit → true; pioneer/geologist/thief/soldier set `false`), `restMs`, `chopMs`, `workplace`, `tool` (occupy consumes this goods pile first), optional `viewDistance` (omit → 8), `attackable` / `controllable` / `health` / `strength` / `searchRadius` / `attackRange` (combat + click-command; omit → not a target / not selectable), `sheet` (catalog folder; omit → `kind`).

Add a hut → new `buildings/{kind}.ts` + one line in `buildings/index.ts`. Same for professions. Mines set `flatten: false` and `mine` (iron / gold). Miner `tool: "pick"` — occupy equips that pile first.

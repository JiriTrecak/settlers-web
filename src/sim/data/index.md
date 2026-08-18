# data

One file per building / settler. The file is the whole def: footprint, stacks, worker, sheet, step time, flags. Registry files only re-export.

Building flags: `occupies` (stamp a land disk **while garrisoned**), `garrison` (infantry slots; T1 = 1), `workRadius` (outdoor search), `viewDistance` (fog look radius once built), `flatten` (diggers level protected tiles before bricklayers). Settler flags: `needsPlayersGround` (omit → true; pioneer/thief/soldier set `false`), `restMs`, `chopMs`, `workplace`, optional `viewDistance` (omit → 8), `attackable` / `controllable` / `health` / `strength` / `searchRadius` / `attackRange` (combat + click-command; omit → not a target / not selectable), `sheet` (catalog folder; omit → `kind`).

Add a hut → new `buildings/{kind}.ts` + one line in `buildings/index.ts`. Same for professions.

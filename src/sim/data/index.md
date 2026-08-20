# data

One file per building / settler. The file is the whole def: footprint, stacks, worker, sheet, step time, flags. Registry files only re-export.

Building flags: `occupies` (stamp a land disk **while garrisoned**), `garrison` (infantry slots; T1 = 1), `workRadius` (outdoor search circle; `hut.work` is the origin, default the hut; 0 = indoor / no Area button), `viewDistance` (fog look radius once built), `flatten` (omit → diggers level protected tiles before bricklayers; `false` skips). Settler flags: `needsPlayersGround` (omit → true; pioneer/thief/soldier set `false`), `restMs`, `chopMs`, `workplace`, optional `viewDistance` (omit → 8), `attackable` / `controllable` / `health` / `strength` / `searchRadius` / `attackRange` (combat + click-command; omit → not a target / not selectable), `sheet` (catalog folder; omit → `kind`).

Add a hut → new `buildings/{kind}.ts` + one line in `buildings/index.ts`. Same for professions.

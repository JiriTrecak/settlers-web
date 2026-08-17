# data

One file per building / settler. The file is the whole def: footprint, stacks, worker, sheet, step time, flags. Registry files only re-export.

Building flags: `occupies` (stamp a land disk), `workRadius` (outdoor search), `viewDistance` (fog look radius once built). Settler flags: `needsPlayersGround` (omit → true; pioneer/thief/soldier set `false`), `restMs`, `chopMs`, `workplace`, optional `viewDistance` (omit → 8).

Add a hut → new `buildings/{kind}.ts` + one line in `buildings/index.ts`. Same for professions.

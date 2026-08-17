# building

Built sprites from `buildings/{civ}/{kind}` variant `built`; plans use `scaffold` (falls back to built). While `building`, scaffold stays and the finished sprite is clipped from the bottom with a 10-tooth saw edge (`buildProgress` 0→1). z = `isoDepth` on the shared iso container.

Flags wave at `def.flag`. `props/flag-door` sorts as a prop on that tile; `props/flag-roof` uses the hut's depth so it sits on the building. Torso × `PLAYER_COLORS[player]`. Missing catalog groups → no flags.

`GhostLayer` is the placement preview: scaffold at ~0.55 alpha, blocked-tile fill, `buildMarks` strokes. Red if the plot is illegal.

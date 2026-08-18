# building

Built sprites from `buildings/{civ}/{kind}` variant `built`; scaffold from `scaffold`. Plan is fence posts (`props/site-post` / `site-sign`) — no hut sprite. While `building`, scaffold grows bottom-up through the first half of `buildProgress`, then the finished hut through the second (10-tooth saw edge). z = `isoDepth` on the shared iso container. Root alpha is `sight/100`; hidden at 0. Grey tiles draw the fog snapshot, not the live hut.

Flags wave at `def.flag`, parented to the hut (after the built sprite) so a roof flag isn't buried under the building. Torso × `PLAYER_COLORS[player]`. Missing catalog groups → no flags.

`GhostLayer` is the placement preview: fence posts + blocked-tile fill. Red if the plot is illegal. `ConstructionMarkLayer` is the screen-wide pip grid while that tool is out (same sprites as the health sequence).

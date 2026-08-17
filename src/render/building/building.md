# building

Built sprites from `buildings/{civ}/{kind}` variant `built`; plans use `scaffold` (falls back to built). While `building`, scaffold stays and the finished sprite is clipped from the bottom with a 10-tooth saw edge (`buildProgress` 0→1). z = `isoDepth` on the shared iso container.

`GhostLayer` is the placement preview: scaffold at ~0.55 alpha, blocked-tile fill, `buildMarks` strokes. Red if the plot is illegal.

# fog

Per-player sight 0–100. Finished huts and units stamp padded view circles into ref buckets; a dimmer walks `sight` toward that target at 30/s. Once a tile has been ≥50 it never returns to 0. Match start snaps to the target so the HQ is fully lit on the first frame; later circles still fade.

View distance: plan 0, empty worker hut 5, occupied / workerless hut = `def.viewDistance` (tower 38). Units default 8.

Crossing down through 50 freezes landscape, height, object, and hut origin for the renderer. Sim itself stays omniscient. Destroying a hut resizes its circle to 0 — sight walks back to 50 (grey), never to black.

`FogView.player` + `generation` is the cache key. Two snapped colonies often share generation 1 — landscape/minimap must not treat that as “fog already applied.”

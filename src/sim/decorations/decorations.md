# decorations

What sits on tiles besides terrain.

Trees and stones come from the dump, already decoded. Each tree carries `sheet` (0–6) — which of the 7 looks to draw. Conversion assigns it; the engine stores it. Stones store remaining `capacity`.

Waves are not in the dump. `waveDecorations` stamps them on a 4-hex lattice (`y % 4 == 0` and `(x + y/2) % 4 == 0`) where all 6 hex neighbors are water. Out of bounds is not water, so map edges get none.

Original object-byte decoding (trees 68–80/84, stones 115–127) lives in `original_conv`, not here.

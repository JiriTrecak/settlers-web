# settler

Clips keyed by profession: `settlers/roman/{type}/{walk,idle,action1,bend}/{none,trunk,plank,tree,...}/{dir}`. Chop/saw/plant loop `action1` once per second for the whole work window. Pickup/drop/deliver play `bend` once. Missing clip → that profession's idle, then bearer.

`SettlerLayer.draw` skips `inside` units (in the hut) and units on tiles with sight ≤50. Otherwise lerps `from`→`pos` with `moveProgress` plus the session's leftover tick fraction. Root alpha is `sight/100`. z = `isoDepth` (same container as props, so stones can cover the unit). Missing catalog → yellow dot.

Layers: shadow, body, torso. Torso is grayscale × `PLAYER_COLORS[movable.player]`.

# settler

Clips keyed by profession: `settlers/roman/{type}/{walk,idle,action1,bend}/{none,trunk,plank,tree,...}/{dir}`. Chop/saw/plant loop `action1` once per second for the whole work window. Pickup/drop/deliver play `bend` once. Missing clip → that profession's idle, then bearer.

`SettlerLayer.draw` skips `inside` units (in the hut) and units on tiles with sight ≤50. Otherwise lerps `from`→`pos` with `moveProgress` plus the session's leftover tick fraction. Root alpha is `sight/100`. z = `isoDepth` (same container as props, so stones can cover the unit). Missing catalog → yellow dot.

Layers: shadow, body, torso. Torso is grayscale × `PLAYER_COLORS[movable.player]`. Attackable units (soldier / pioneer) draw the original health pip 38px above the tile — frame 0 full, last almost dead. Selected units draw the original mark 20px above the tile. Clicks sample opaque body/torso pixels of `controllable` units (frontmost wins); bearers / workers are click-through. The marquee uses those sprite AABBs.

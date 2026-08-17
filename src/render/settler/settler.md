# settler

Bearer sprites from `settlers/roman/bearer/{walk,idle}/none/{dir}`. Chop uses `settlers/roman/lumberjack/action1/none/{dir}` (axe swing). Missing lumberjack clip → idle pose.

`SettlerLayer.draw` lerps `from`→`pos` with `moveProgress` plus the session's leftover tick fraction. z = `isoDepth` (same container as props, so stones can cover the unit). Missing catalog → yellow dot.

Layers: shadow, body, torso. Torso is grayscale × `PLAYER_COLORS[movable.player]`.

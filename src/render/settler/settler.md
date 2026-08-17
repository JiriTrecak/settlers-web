# settler

Bearer sprites from `settlers/roman/bearer/{walk,idle}/{none,trunk}/{dir}`. Chop uses lumberjack `action1`. Pickup and drop use `settlers/roman/bearer/bend/trunk/{dir}`. Missing clip → idle pose.

`SettlerLayer.draw` lerps `from`→`pos` with `moveProgress` plus the session's leftover tick fraction. z = `isoDepth` (same container as props, so stones can cover the unit). Missing catalog → yellow dot.

Layers: shadow, body, torso. Torso is grayscale × `PLAYER_COLORS[movable.player]`.

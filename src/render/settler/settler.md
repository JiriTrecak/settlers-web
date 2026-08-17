# settler

Bearer sprites from `settlers/roman/bearer/{walk,idle}/none/{dir}`.

`SettlerLayer.draw` lerps `from`→`pos` with `moveProgress` plus the session's leftover tick fraction. z = `y*2+2` so they sit in front of trees on the same row. Missing catalog → yellow dot.

Layers: shadow, body, torso. Torso is grayscale × `PLAYER_COLORS[movable.player]`.

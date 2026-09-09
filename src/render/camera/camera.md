Editor free-cam is ortho iso and can orbit. Play / Gamecam is WC3 perspective: 70° FoV, 56° pitch, 45° yaw, default distance framed on two 16-blocks, wheel zoom from 0.5× to 2× that distance, pan only, view clamped half a block past the red. `viewGround` is the real frustum ∩ ground (wide far, narrow near). `rev` bumps on every mutation. `pose` is the one-shot look / zoom / orbit used by editor screenshots.

Gamecam follows the height field at its focus and lifts the eye to maintain at least 4 units above terrain beneath it and at least 12 units above water level. The focus plane rises with the eye to preserve pitch and pan scale. Free-cam remains unchanged.

## Wheel zoom tuning

Default zoom is 40 and maximum is 60 (perspective uses eye-to-target distance; orthographic uses its zoom extent). Perspective minimum is 20. Wheel input respects pixel/line/page units and accumulates logarithmic zoom, about 4% per 100 pixels. A 140 ms exponential settling time creates a brief decelerating tail, consistently across frame rates. Reversing direction clears the old tail; reaching a limit or losing focus cancels momentum. Editor brush modifier-wheel shortcuts remain immediate.

Gameplay uses a fixed -45° yaw with the existing 45° pitch and perspective projection. Ground-aligned squares appear diagonal; arrow/edge panning remains screen-relative. Map coordinates and minimap orientation are unchanged. Gamecam reset uses this same diagonal orientation.

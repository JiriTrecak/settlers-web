# session

`Session` is one match: that map, hover/select, camera, 25ms sim accumulator. Match start stamps a tower, small house, goods piles, and bearers at player-slot 0 (`starts[0]`). The finished tower occupies a radius-40 disk. Build strip picks a hut; hover shows a placement ghost (red off-land); click empty valid owned land places a **plan**. Bearers haul construction goods, bricklayers hammer, a bearer occupies when it finishes. Clothing color is independent.

`Minimap.onLookAt` → `Camera.lookAt`. `SpeedControl.onSpeed` multiplies wall-clock dt into the accumulator (quantum stays 25ms). Space → `Renderer.fitCamera`. Escape → `onLeave` (lobby). Each frame pushes debug counts into the HUD (F3). `setShowPaths` / `setShowOwnership` are overlay toggles — stored on the session so they survive if the renderer is not up yet. F3 **claim** dispatches `occupy` at the clicked cell.

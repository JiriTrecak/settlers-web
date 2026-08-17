# session

`Session` is one match: that map, hover/select, camera, 25ms sim accumulator. Match start stamps a tower, small house, goods piles, and bearers at player-slot 0 (`starts[0]`). Build strip picks a hut; hover shows a placement ghost; click empty valid land places a **plan**. Bearers haul construction goods, bricklayers hammer, a bearer occupies when it finishes. Clothing color is independent.

`Minimap.onLookAt` → `Camera.lookAt`. `SpeedControl.onSpeed` multiplies wall-clock dt into the accumulator (quantum stays 25ms). Space → `Renderer.fitCamera`. Escape → `onLeave` (lobby). Each frame pushes debug counts into the HUD (F3).

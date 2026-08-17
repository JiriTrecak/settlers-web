# session

`Session` is one match: that map, hover/select, camera, 25ms sim accumulator. Match start stamps a tower, small house, goods piles, and bearers at player-slot 0 (`starts[0]`). Click empty valid land places a lumberjack hut; shift-click places a sawmill. Clothing color is independent.

`Minimap.onLookAt` → `Camera.lookAt`. `SpeedControl.onSpeed` multiplies wall-clock dt into the accumulator (quantum stays 25ms). Space → `Renderer.fitCamera`. Escape → `onLeave` (lobby).

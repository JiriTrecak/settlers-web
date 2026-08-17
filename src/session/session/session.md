# session

`Session` is one match: that map, hover/select, camera, 25ms sim accumulator. Click land dispatches `moveTo` (or `drop` if carrying); click a tree dispatches `chop`; click a stack dispatches `pickup`. Match start looks at player-slot 0 (`starts[0]`, the first HQ) at zoom 1. Clothing color is independent.

`Minimap.onLookAt` → `Camera.lookAt`. `SpeedControl.onSpeed` multiplies wall-clock dt into the accumulator (quantum stays 25ms). Space → `Renderer.fitCamera`. Escape → `onLeave` (lobby).

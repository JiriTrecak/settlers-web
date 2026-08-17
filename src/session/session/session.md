# session

`Session` is one match: that map, hover/select, camera. Graphics are cached after the first session.

`Minimap.onLookAt` → `Camera.lookAt`. Space → `Renderer.setView` (refit). Escape → `onLeave` (lobby).

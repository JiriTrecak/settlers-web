# session

`Session` is the match: graphics load, map load, hover/select, camera apply.

Map loads are generation-guarded (`loadGen`) so a slow fetch can't clobber a newer selection. Default map is first tutorial dump, else first generated preset.

`Minimap.onLookAt` → `Camera.lookAt`. Space → `Renderer.setView` (refit).

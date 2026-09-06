# minimap

Iso diamond. Canvas 2D. View quad is `camera.viewGround` — perspective frustum ∩ ground (wide far, narrow near). Redraws when `camera.rev` or stamps change. Drag calls `onLookAt`.
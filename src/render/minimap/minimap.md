# minimap

Iso diamond. Canvas 2D. View quad is `camera.viewGround` — perspective frustum ∩ ground (wide far, narrow near). Redraws when `camera.rev` or stamps change. Drag calls `onLookAt`.
The upper-left transparent triangle contains a sun/moon clock with a 24-hour progress ring and HH:MM. Editor and session supply the renderer sky snapshot; clock updates run even when the map canvas is clean. Pointer capture stays on the clipped diamond canvas, leaving the indicator separate from minimap navigation.

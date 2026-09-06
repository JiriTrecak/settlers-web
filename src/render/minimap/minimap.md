# minimap

Iso diamond. Canvas 2D fills the 264 box (a second WebGL context stalls the main renderer). 2px sheet ring is painted on the canvas so clip-path can't eat it. Stamp dots + view quad from the camera. Redraws when `camera.rev` or stamps change. Drag calls `onLookAt`.
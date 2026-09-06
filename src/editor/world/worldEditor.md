# worldEditor

Paints the 256² grid through the game `Renderer`. Holds the current `UtcMap`. Stamp places one asset on click. Brush paints a red mask; Apply scatters the selected asset into stamps. Owns the shared minimap. Camera is free-orbit ortho unless Gamecam is on — then WC3 perspective, two-block frame, pan to half a block past the red.

# worldEditor

Paints the 256² grid through the game `Renderer`. Holds the current `UtcMap`. Stamp places one asset on click (water-type only on wet cells). Brush paints a red mask; Apply scatters the kit into stamps — water slots skip dry land. Clean wipes stamps in a disc (Objects now; Foliage later). Sculpt Live raises / lowers; Water paints a mask and Apply cuts a basin under the sea. Owns the shared minimap. Camera is free-orbit ortho unless Gamecam is on — then WC3 perspective, two-block frame, pan to half a block past the red.

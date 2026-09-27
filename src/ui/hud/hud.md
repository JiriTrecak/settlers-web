# HUD shell

FPS/zoom, Settings and Exit. Singleplayer also exposes Save/Load; failures show a local error dialog. Performance diagnostics are a separate Ctrl+F3 overlay. `ui/settlement/settlementHud.ts` adapts the declarative command card, selected entity information, physical stock summary and production queue. It also owns the minimap and clock slots.

Ctrl+Shift+H toggles the HUD in matches and the map editor; Escape restores it. The shortcut is rebindable under Keyboard shortcuts, ignores text inputs and dialogs, and never pauses play. Visibility resets when changing screens. Dialogs remain available while panels, minimap, portrait and debug controls are hidden.

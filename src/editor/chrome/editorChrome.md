# chrome

The top strip owns the map name and file actions. `SceneToolstrip` owns the persistent bottom icon strip: Select, Place, Terrain, Foliage, Water, Spawn, layer undo/redo, Environment and MCP. Place exposes a second compact strip for units/buildings versus scenery/landmarks. Camera presets sit above the viewport.

`ScenePanel` keeps the left side exclusively for the searchable hierarchy, with All/Layers/Objects filters and collapsible groups. Selection changes preserve hierarchy scrolling and group state. The right side owns contextual settings; generation settings and inspector scrolling persist while editing the same selection. Authored objects expose numeric position, elevation, rotation and scale, with raw data under an advanced disclosure.

Existing entity, terrain, spawn and selected-scenery docks occupy the same right-hand inspector area. Environment and MCP are mutually exclusive overlays there and close when choosing a tool or hierarchy item. Legacy vertical tools, asset chip and camera hints are hidden in the authoring layout.

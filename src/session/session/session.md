# Session

Connects a loaded map and match config to World, Lockstep, HTML HUD, camera, scene and minimap. Singleplayer uses one MemoryChannel per slot; multiplayer receives its authenticated Channel from the app. World only advances with a commit. Camera/render time does not drive economy decisions.

Pointer/keyboard actions choose observed entities and enqueue canonical intentions. Selection and command aggregation live in `presentation/`; the HTML adapter handles targeting and emits requests. Presentation reads `World.view(me)`, including fog memories and the own-player goods ledger.

`snapshotLocal/restoreLocal` preserve World plus Room, unapplied commits, confirmation frontiers and unsent client actions. A candidate World is validated before replacing the running one. Startup focuses the authored spawn. Leaving destroys the session and channels.

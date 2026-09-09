# Spell effects workbench

Open **Effects** in the world editor's top toolbar. Choose an ability and rank, then preview its cast telegraph, impact, or full sequence. Pause and scrub the timeline to inspect a frame. Ring/particle colors, count, size, rise and impact duration edit `rules.spellVisuals`; the JSON pane represents that same declaration. Apply JSON previews the draft; Validate & save validates the whole content graph and writes `content/game.json` atomically.

The preview instantiates `SpellEffects`, the same renderer used in matches. It injects a draft declaration provider instead of changing global content. Replay resets and disposes active materials so particle-count and color edits take effect immediately. Geometry is shared within a preview and freed when closed. No preview action issues gameplay commands, deals damage or advances simulation state.

The existing spell definition selects an explicit effect algorithm (`line`, `blast`, `rally`, `guard`), target mode and rank radius. This workbench edits presentation parameters only. Add or change spell mechanics through the gameplay definitions and explicit systems. Particle count is capped at 64 per cue; duration at 200 ticks. One simulation tick is 25 ms.

Saving uses the content author's revision guard and validates references, models, icons and all project map placements. Concurrent disk edits produce a conflict instead of overwriting another draft. Content JSON changes do not hot-reload active matches or the world editor; explicitly reload the page to use the saved revision. This avoids changing rules mid-match and preserves unsaved map edits. Closing discards unsaved visual changes.

Validation: live Faultline and Crownfall sequence, pause and impact scrubbing inspected. Automated renderer test checks injected colors/counts, replay disposal and cue removal. Live save changed Faultline’s count from 20 to 21 and restored 20, with the workbench staying open and success feedback displayed. Broader battle visual checks continue as part of expansion QA.

Particles are an InstancedMesh: one particle draw call plus one ring/shell draw call per cue, regardless of particle count. The renderer reuses matrix scratch objects and disposes instance buffers on removal/replay.

### Draft retention

Each visual keeps its own JSON text draft while switching abilities, including incomplete JSON. Apply validates the current visual for preview. Validate & save validates all retained drafts as one candidate before writing; an invalid draft identifies its visual and prevents any disk write. Numeric/color fields merge with the visible JSON rather than overwriting other text edits. Closing the workbench still discards unsaved drafts.

### Ability cooldown presentation

The renderer-neutral command binding exposes remaining and total cooldown ticks for learned abilities. The HTML HUD draws a dark radial sweep and rounded-up seconds over the icon; unlearned abilities have no timer. Times use the shared simulation tick duration. Timers are derived only from the local observer's spell state, never private enemy records.

Cooldown, enabled-state and reason changes update existing buttons rather than reconstructing the grid. Click handlers resolve the current binding so a retained button cannot issue a stale command. Live verification: learned Rally, cast with W, observed the 25-second icon timer, cast ring and mana consumption. Ability/presentation tests cover expiration, unavailable abilities and enemy-state privacy.

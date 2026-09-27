# Asset workbench

Run `npm run dev:tools`, then open `http://127.0.0.1:5175/`. The workbench is a
separate application sharing production rendering code with the game. Open an
asset directly with `?asset=<canonical-id>`. Image generation lives at
`/generation.html`; model review returns to the workbench.

The library loads canonical packages from `art/assets/<asset-id>/asset.json`.
Upload resources by role and sequence; the server assigns standard filenames.
Save edits before validating. Save & publish runs the same validation and atomic
publication used by the authoring command API.

For visual acceptance:

1. Select an asset. Inspect triangles, materials, bones and texture counts.
2. Check animation states, transitions, scrubbing, sockets and team colors.
3. Select Custom map and a map. The subject starts at Player 1. Shift-click the
   terrain, or edit placement coordinates, to test elsewhere. Preview placement
   never changes the map or the saved asset transform.
4. Use Game camera for RTS readability, Free camera for inspection, or Top down.
5. Check daylight, night and weather. Lighting overrides are temporary; reset
   returns to the selected environment.

`ProductionPreview` mounts subjects into the game `Renderer`. It shares `Sky`,
day/night phases, global lighting, shadows, environment reflections, weather and
atmosphere/color grading. Isolated previews inherit the selected map's environment
too. The map editor saves explicit lighting in the map; a browser-local preset
name is not sufficient for portable lighting between the two applications.

Model subjects use the game character player and ownership material shader.
Canonical animation capabilities override embedded import metadata. GLB quality
checks enforce 5k triangles for units/creatures including attachments and 10k for
buildings, and validate buffers, weights, clips, event times, sockets and materials.
Decoded texture memory and draw-call cost are reported as review warnings.

Blender build/export adapters live under `experiments/building-studio`. All editable inputs live in canonical `art/assets/<id>/` folders. Build manifests stage tool-facing filenames under ignored `.asset-work/build/`; capture outputs back to a draft before starting another build. Visual acceptance uses this workbench.

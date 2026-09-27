# Blender build adapter

Visual review now lives in the single Asset Workbench: `npm run dev:tools`, then http://127.0.0.1:5175/.

Editable assets live in `art/assets/<id>/`. `source.blend`, numbered source resources, `recipe.py`, and `build.json` preserve the full authoring inputs. The adapter materializes tool-facing filenames only under ignored `.asset-work/build/`.

- Stage: `python3 experiments/building-studio/source_workspace.py <asset-id>`.
- Render an existing building: `npm run building:studio -- render <asset-id> --quick`.
- Rebuild: `npm run building:studio -- build <asset-id>`.
- Character builds also accept `--category characters`.
- Manual staging edits: `node --import tsx scripts/assets/capture-build.ts <asset-id>` immediately after finishing.

Build/render commands capture outputs back into canonical drafts. Publication is separate: review in the workbench and Save & publish. Render a saved model when only inspecting; build reruns the generator and may replace mesh edits. New assets are created in the workbench.

Staging is disposable and the next staging operation refreshes it from canonical files. Do not keep independent editable masters there. The migration recovery snapshot under `.asset-work/recovery/` is an ignored local backup, not an authoring source or runtime dependency.

# Building Studio

A local reference-to-Blender workbench. The browser compares the source image with a real Cycles render of the saved `.blend`. No Blender add-on is required.

From the project root:

```sh
npm run building:studio
```

Open http://127.0.0.1:8766. Click **Open in Blender** to open the asset in a separate Blender process. Edit and save normally: the studio detects the stable file, renders it, and refreshes the browser. The current scene's camera and lights are preserved. The original Blender document in any other window is unaffected.

Choose **3D viewer** to inspect the real model: left-drag rotates, the wheel zooms, and right-drag pans. **Reference angle** resets the camera; **Auto-rotate** and **Wireframe** help inspect the silhouette and topology. Saving Blender refreshes this model without resetting your orbit. The 3D preview uses realtime lighting; the Cycles render is the more accurate image comparison.

`--quick` renders at 65% resolution with 16 samples. The default renders at the file's saved resolution and sample count. Keep the server process running while working; restart the same command after closing the terminal or rebooting.

## What is saved

Each asset lives in `art/sources/buildings/<name>/`:

- `<name>.blend`: editable model, named part collections, camera, lights, materials, and packed reference image.
- `reference.png`: the supplied source image.
- `model.py`: deterministic geometry/material recipe; `asset.json`: its parameters.
- `samples.json`: named source coordinates. `palette.json`: exact source pixels, robust representative pixels, hex, and linear RGB.
- `samples.png`: annotated sample locations.
- `render.png`, `comparison.png`: latest rendered asset and side-by-side comparison.
- `model.glb`, `viewer.json`: evaluated mesh and camera/light metadata for the 3D viewer. Procedural albedo is baked to vertex colors; roughness, metalness and emission are retained. The realtime export reduces small bevel rings, curve cross-sections, and selected root, roof, and cloth surfaces. Simplification runs only in the disposable export process; the editable Blender source keeps its full surface resolution.
- `history/`: earlier renders. `render-info.json`: camera preset, saved-file timestamp, timing and config.
- `emblem-trace.json`: for this hall, a threshold-based geometry trace of the reference emblem.

The hall is a stylized reconstruction from one image. The back and interior are inferred; the geometry and surface detail are not an exact replica. This is an editable source study, not an optimized game export.

## Sampling colors

Hover the reference for exact sRGB values. Click to freeze a pixel, choose or type a material name, and save. Escape returns to hover mode. Each saved sample records the exact pixel plus an actual pixel nearest the surrounding patch's median. Sample markers and numeric data are regenerated together.

The script is also standalone:

```sh
npm run building:studio -- palette rootbound-hall
```

The script applies the standard sRGB transfer function when reporting Blender's linear Base Color values. Source pixels already contain shading, reflections and painted highlights: they are **not measured physical albedo**. The recipe's material multipliers are deliberate calibration, and the rendered comparison is the final visual check. Dominant colors exclude pixels whose largest RGB channel is 24 or lower.

## Agent iteration

Read `reference.png`, `samples.png`, `palette.json`, `model.py`, and `asset.json`. Edit the recipe or parameters, then ask the running studio to rebuild:

```sh
curl -s http://127.0.0.1:8766/api/action \
  -H 'Content-Type: application/json' --data '{"action":"build"}'
curl -s http://127.0.0.1:8766/api/status
```

Wait until `phase` is `idle` and the render `revision` changes, then inspect `comparison.png` with the image-viewing tool. On failure, `phase` is `error`, the message contains the final Blender log lines, and the last good render stays available. This avoids screenshots of Blender's interface and makes every iteration reproducible.

For manual Blender edits, save and let the watcher render, or send `{"action":"render"}`. Optional `view` values are `saved`, `reference`, `front`, `right`, and `back`; presets apply to the preview process only and never save over the model. Return to `saved` for the final comparison.

With the server stopped, the equivalent one-shot commands are:

```sh
npm run building:studio -- build rootbound-hall --quick
npm run building:studio -- render rootbound-hall
```

Use the API when the server is running to avoid duplicate renders from two processes. A **rebuild regenerates the model** from its recipe. It does not merge manual Blender edits; Blender keeps the previous file as `.blend1`. Rendering alone never changes the `.blend`.

## Another reference

```sh
npm run building:studio -- init my-next-building --reference /absolute/path/image.png
npm run building:studio -- serve my-next-building
```

The initializer creates a new asset folder, preserves the reference as a PNG, and prepares the palette/config files. Pick colors in the studio, then ask Codex to author that building's `model.py` using the reference. The studio handles iteration; it does not automatically infer arbitrary 3D geometry from an image. The current hall recipe and the shared `stage.py` provide a working example. Keep each new model in its own asset folder.

## Runtime and checks

Requires Blender, Node and Python with Pillow/NumPy. The launcher discovers the existing Codex image runtime, system Python, or `experiments/building-studio/.venv`. Set `BLENDER_BIN` or `BUILDING_PYTHON` to override discovery. To install a project-local Python environment:

```sh
python3 -m venv experiments/building-studio/.venv
experiments/building-studio/.venv/bin/pip install -r experiments/building-studio/requirements.txt
```

Run `python -m unittest discover -s experiments/building-studio -p 'test_*.py'` with that Python. Tests cover exact sampling and color conversion, save debouncing, queue priorities, failed-render preservation and path bounds.

The actual Blender file can also be checked using Blender's background mode with `--python experiments/building-studio/validate_blend.py`. Adding `-- --resave` performs a real save for an end-to-end watcher check. The validation checks finite mesh coordinates, face indices, the black studio, a camera, and the packed reference image.

The server binds only to `127.0.0.1`. On macOS, Blender needs normal graphics-device access even for background rendering; a restrictive execution sandbox can crash it during Metal initialization. Run the local studio with that access. Nothing is uploaded or published.

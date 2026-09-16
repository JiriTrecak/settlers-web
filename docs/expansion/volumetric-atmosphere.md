# Volumetric mist and sunlight shafts

Maps can opt into drifting, height-dependent mist and shadow-aware sunlight shafts. The prologue uses a light global layer, with denser pockets beside the entrance, old crossing, moss shrine and lakeside. The mission starts at 09:12, with long diagonal morning light. The entrance pocket sits along the tree line rather than covering the party in a bright veil. Rain reduces the shaft contribution. The existing day/night sun supplies direction and color.

## Authoring

Open **Environment → Volumetric mist & light shafts**. Enable atmosphere, then adjust color, global density, base height, height falloff, shaft strength, patchiness, texture scale and drift speed. Numeric controls commit on change/blur. Changes preview immediately and are stored with the map when saved.

**Add mist here** creates a soft ellipsoid at the camera's ground focus. Select a region to move it using X/Z/height, resize its three radii, change its density or remove it. There are at most 16 regions per map. Region height is an absolute world Y, not a terrain offset; place low pockets deliberately beside slopes and water. Zero global density allows local-only mist. Zero drift freezes the density field.

The data lives in `landscape.environment.atmosphere`. Omission leaves the original rendering path intact. `src/shared/landscape/atmosphere.ts` contains the strict schema and defaults. Region IDs must be unique, colors are six-digit hexadecimal strings, and densities/radii/counts are bounded. Both the editor and map loader validate this data.

MCP `editor_landscape` accepts `action: "environment"` with an `atmosphere` object containing the complete validated settings. This operation also supports `weather`. Environment changes preserve the current preview hour unless an explicit `hour` is provided. The graphical editor, MCP and gameplay consume the same data. Editor captures also include the atmosphere.

```json
{
  "action": "environment",
  "atmosphere": {
    "enabled": true,
    "color": "#a8bdc6",
    "density": 0.002,
    "baseHeight": 1,
    "heightFalloff": 3,
    "sunStrength": 2.1,
    "noiseScale": 0.09,
    "noiseStrength": 0.65,
    "driftSpeed": 0.35,
    "regions": [
      {"id":"pond-mist","x":106,"y":1,"z":119,
       "radiusX":19,"radiusY":4,"radiusZ":15,"density":0.035}
    ]
  }
}
```

## Rendering and performance

`AtmospherePass` renders the scene into a linear HDR color target with a depth texture. A reduced-resolution pass reconstructs world positions and integrates single-scattered sunlight and ambient mist along the view ray. Ray integration skips clear air above the highest mist region or five global falloff lengths, concentrating the existing sample budget around canopy occlusion. A broad scattering lobe keeps sunlight readable from the overhead RTS camera; ambient scatter stays subdued. Exponential height falloff and soft ellipsoids supply density; a drifting procedural noise field breaks up uniform areas.

The current sun shadow map supplies occlusion. Soft shadows use Three r185's RG variance-shadow distribution; filtered shadows use its comparison depth texture. No extra light shadow pass is rendered. Turning shadows off retains ambient mist and disables the shafts.

A nine-tap depth-aware filter first smooths the bounded low-resolution fog target. The final pass uses depth-aware four-neighbor upsampling, applies extinction/scattering to the scene color, then performs the existing ACES exposure and output color conversion. The portrait renders afterward, and HTML interface elements are unaffected. The shader handles orthographic and perspective cameras. Integration terminates at opaque depth, or at the water plane when the opaque surface is underwater. This is tailored to the game's single water level; arbitrary transparent volumes do not receive individually depth-correct fog.

Local graphics settings offer **Off / Low / Medium / High**, default Medium. They persist independently of map authoring:

- Low: 16 steps, up to one-third resolution per axis, capped at 180,000 fog pixels.
- Medium: 24 steps, up to half resolution per axis, capped at 360,000 fog pixels.
- High: 40 steps, up to 66% resolution per axis, capped at 900,000 fog pixels.

The full scene target still follows the player's game resolution. Off bypasses the render targets and all three additional draws. Resources are reused and resized only when needed, and disposed with the renderer. The normal match loader's graphics warmup includes the atmosphere before play.

There is no temporal accumulation, so rapid camera movement cannot leave history trails. Spatial jitter and depth-aware upsampling reduce undersampling; fine foliage may still show grain or shimmer at Low. This version supports one directional light, not volumetric contributions from every lantern or spell, multiple scattering, or volumetric clouds.

The debug panel shows the active fog dimensions/sample count, CPU submission, whole-frame GPU timing, and sampled scene/atmosphere GPU scopes. Only one query scope is sampled per frame; queries never nest or block. Do not add subpass timings together: tile-based drivers can attribute shared work to more than one scope. Compare whole-frame timings at a fixed view, resolution, weather and shadow setting with atmosphere enabled/disabled. Browser background throttling means displayed FPS alone is not a reliable GPU benchmark.

## Gameplay visibility

Atmosphere is cosmetic. It does not change line of sight, height-based fog of war, combat, navigation, or lockstep. Integration samples the existing visibility texture and the full-resolution composite masks unexplored terrain again, preventing a bright veil from revealing the map outside explored areas. Already-hidden units remain excluded by the observation system. Debug reveal removes this visual restriction through the existing visibility controls.

## Validation

Automated coverage checks map roundtripping, unchanged omission behavior, malformed and unbounded volume rejection, unique IDs, quality persistence, pixel budgets and the Off bypass. Browser checks cover the prologue, soft/filtered shadows, the editor authoring path and shader compilation. Treat performance as hardware- and scene-dependent; the pixel caps bound fog work, not the rest of the forest renderer.

### Initial measurement (before the visibility tuning)

On the development Mac, a paused prologue opening view at 2674 × 2408, native resolution and soft shadows measured approximately **5.17 ms mean / 5.46 ms p95** for the whole GPU frame with atmosphere Off, versus **6.40 / 6.74 ms** with Medium (632 × 569 fog pixels, 24 samples). That is roughly 1.2 ms additional mean GPU time in this particular view. These are warmed-up browser measurements, not a guarantee for other GPUs or a full-mission benchmark. The browser was throttling frame presentation during parts of the test, so FPS was not used to infer GPU cost.

The lakeside was inspected through the game camera/capture API: mist terminates above the water, canopy shadows form shafts, and turning debug reveal back off leaves the unexplored lake fully black. Soft/filtered/off shadows and High/Medium/Low/Off atmosphere settings were exercised without Three.js shader errors.

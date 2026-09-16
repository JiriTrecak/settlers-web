# Water rendering

A horizontal surface follows the map's water level. Terrain depth controls shallow/deep color, transparency and shore foam; dry cells remain transparent. The shader combines two advected ripple phases, small surface-normal perturbations, depth-dependent cellular caustics, broken shoreline foam and a Fresnel-weighted reflection. Reflections use the existing bounded-resolution, throttled scene capture; this is not screen-space refraction or a fluid simulation.

Map `waterStyle` can set shallow/deep colors, optical clarity and flow speed, in addition to its existing appearance controls. The environment dock and editor MCP expose these values. Per-map color uniforms are cloned so editing one map cannot modify another map's defaults. `tests/shared/water-style.test.ts` checks parsing and constraints.

This is still a visual work in progress. Shoreline geometry, lighting, caustic scale and reflection cost need final tuning in Hollow Gate; shader unit tests alone do not establish the requested water quality or GPU performance.

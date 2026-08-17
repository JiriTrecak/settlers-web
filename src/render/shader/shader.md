# shader

GLSL for Pixi meshes. Source of truth is the `.vert` / `.frag` files — do not embed shader strings in mesh/layer code.

One subfolder per program family. `shader.ts` is the TS door: it builds a Pixi `Shader` from those files.

## Pixi mesh contract

Vertex shaders must declare:

```
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
```

Clip position is that product times `vec3(aPosition, 1.0)`. Camera pan/zoom is on the world `Container`, not a custom view matrix.

WebGL2 / GLSL 300 es (`in` / `out`). Pixi injects `#version` — do not add it here.

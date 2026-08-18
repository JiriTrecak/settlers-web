/**
 * Pixi program for the construction-mark pip mesh. GLSL is the sibling files.
 */
import { Shader, type Texture } from "pixi.js";
import texturedVert from "./textured.vert?raw";
import texturedFrag from "./textured.frag?raw";

export function createConstructionMarkShader(atlas: Texture): Shader {
  return Shader.from({
    gl: { vertex: texturedVert, fragment: texturedFrag, name: "construction-mark" },
    resources: {
      uTexture: atlas.source,
      uSampler: atlas.source.style,
    },
  });
}

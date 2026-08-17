/**
 * Pixi programs for the landscape mesh. GLSL lives in the sibling .vert/.frag files.
 */
import { Shader, type Texture } from "pixi.js";
import colorVert from "./color.vert?raw";
import colorFrag from "./color.frag?raw";
import texturedVert from "./textured.vert?raw";
import texturedFrag from "./textured.frag?raw";

export function createLandscapeShader(atlas: Texture | null): Shader {
  if (atlas) {
    return Shader.from({
      gl: { vertex: texturedVert, fragment: texturedFrag, name: "landscape-tex" },
      resources: {
        uTexture: atlas.source,
        uSampler: atlas.source.style,
      },
    });
  }
  return Shader.from({
    gl: { vertex: colorVert, fragment: colorFrag, name: "landscape" },
  });
}

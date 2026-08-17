/**
 * Landscape mesh: textured if atlas loaded, vertex-color fallback otherwise.
 * Programs live in `render/shader/landscape/`.
 */
import { Geometry, Mesh, type Shader, type Texture } from "pixi.js";
import { createLandscapeShader } from "../shader/shader";
import type { LandscapeGeometryData } from "./landscapeGeometry";

export function createLandscapeMesh(data: LandscapeGeometryData, atlas?: Texture | null): Mesh<Geometry, Shader> {
  const geometry = new Geometry({
    attributes: {
      aPosition: data.positions,
      aColor: { buffer: data.colors, format: "float32x3" },
      aUv: data.uvs,
      aShade: { buffer: data.shades, format: "float32" },
    },
    indexBuffer: data.indices,
  });

  return new Mesh({ geometry, shader: createLandscapeShader(atlas ?? null) });
}

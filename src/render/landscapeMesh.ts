import { Geometry, Mesh, Shader, type Texture } from "pixi.js";
import type { LandscapeGeometryData } from "./landscapeGeometry";

const colorVertex = `
in vec2 aPosition;
in vec3 aColor;

out vec3 vColor;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vColor = aColor;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

const colorFragment = `
in vec3 vColor;
out vec4 finalColor;

void main() {
  finalColor = vec4(vColor, 1.0);
}
`;

const texturedVertex = `
in vec2 aPosition;
in vec2 aUv;
in float aShade;

out vec2 vUv;
out float vShade;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vUv = aUv;
  vShade = aShade;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

const texturedFragment = `
in vec2 vUv;
in float vShade;
uniform sampler2D uTexture;
out vec4 finalColor;

void main() {
  vec4 texel = texture(uTexture, vUv);
  finalColor = vec4(texel.rgb * vShade, 1.0);
}
`;

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

  const shader = atlas
    ? Shader.from({
        gl: { vertex: texturedVertex, fragment: texturedFragment, name: "landscape-tex" },
        resources: {
          uTexture: atlas.source,
          uSampler: atlas.source.style,
        },
      })
    : Shader.from({
        gl: { vertex: colorVertex, fragment: colorFragment, name: "landscape" },
      });

  return new Mesh({ geometry, shader });
}

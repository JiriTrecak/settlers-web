// Atlas terrain. Forwards UV + per-vertex shade; transform matches color.vert.
//
// aUv is 0–1 into landscape-atlas.png (nearest, no mips — set on the texture).
// aShade is north-face darkening (slopeShade); applied in the fragment so the
// atlas texel isn't baked at mesh build time.

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

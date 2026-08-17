// Vertex-color terrain (atlas missing). Shade is already baked into aColor
// by landscapeGeometry — this only transforms and forwards.
//
// aPosition is iso world pixels (Y-down). Camera lives on the world Container.

in vec2 aPosition;
in vec3 aColor;
in float aFog;

out vec3 vColor;
out float vFog;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vColor = aColor;
  vFog = aFog;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}

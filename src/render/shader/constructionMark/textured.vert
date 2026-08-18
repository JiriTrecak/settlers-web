// Construction-mark pips. World pixels, Y-down. Camera lives on the world Container.
// aVisible is 1 on seen tiles, 0 on never-seen fog (alpha kill in the fragment).

in vec2 aPosition;
in vec2 aUv;
in float aVisible;

out vec2 vUv;
out float vVisible;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  vUv = aUv;
  vVisible = aVisible;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}

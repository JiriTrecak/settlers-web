// Pass-through. aColor already includes slope shade and landscape tint.

in vec3 vColor;
in float vFog;
out vec4 finalColor;

void main() {
  finalColor = vec4(vColor * vFog, 1.0);
}

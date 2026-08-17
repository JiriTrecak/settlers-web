// Pass-through. aColor already includes slope shade and landscape tint.

in vec3 vColor;
out vec4 finalColor;

void main() {
  finalColor = vec4(vColor, 1.0);
}

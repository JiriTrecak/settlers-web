// Atlas RGB * slope shade. Alpha ignored — the landscape is a solid mesh.

in vec2 vUv;
in float vShade;
uniform sampler2D uTexture;
out vec4 finalColor;

void main() {
  vec4 texel = texture(uTexture, vUv);
  finalColor = vec4(texel.rgb * vShade, 1.0);
}

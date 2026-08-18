// Health-pip atlas. Premultiply by the sprite alpha and fog visibility.

in vec2 vUv;
in float vVisible;
uniform sampler2D uTexture;
out vec4 finalColor;

void main() {
  vec4 texel = texture(uTexture, vUv);
  finalColor = vec4(texel.rgb, texel.a * vVisible);
}

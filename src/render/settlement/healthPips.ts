import { DataTexture, LinearFilter, RGBAFormat, SpriteMaterial, SRGBColorSpace } from "three";

import { healthPipState } from "../../presentation/health";
export { healthPipState } from "../../presentation/health";

/** Small shared raster sprites: no per-frame texture uploads or individual pip draw calls. */
export class HealthPips {
  private readonly materials = new Map<string, SpriteMaterial>();
  material(hp: number, maxHp: number, building: boolean, blink: boolean) {
    const { count, filled, color } = healthPipState(hp, maxHp, building);
    const key = `${count}:${filled}:${color}:${blink}`;
    let material = this.materials.get(key);
    if (material) return material;
    const width = building ? 256 : 128, height = building ? 24 : 40;
    const pixels = new Uint8Array(width * height * 4);
    for (let pip = 0; pip < count; pip++) {
      const angle = building ? 0 : (pip - 1.5) * .14;
      const cx = building ? 8 + pip * 16 : 19 + pip * 30;
      const cy = building ? 12 : 23 - (2.25 - (pip - 1.5) ** 2) * 3;
      const halfW = building ? 7.6 : 13, halfH = building ? 10 : 13;
      const tint = pip >= filled ? 0x393731 : blink && pip === filled - 1 ? 0xff2727 : color;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const dx = x + .5 - cx, dy = y + .5 - cy;
        const lx = dx * Math.cos(angle) + dy * Math.sin(angle);
        const ly = -dx * Math.sin(angle) + dy * Math.cos(angle);
        if (Math.abs(lx) > halfW || Math.abs(ly) > halfH) continue;
        const border = Math.abs(lx) > halfW - 2 || Math.abs(ly) > halfH - 2;
        const rgb = border ? 0x111711 : tint;
        const i = ((height - 1 - y) * width + x) * 4;
        pixels[i] = rgb >> 16 & 255; pixels[i+1] = rgb >> 8 & 255;
        pixels[i+2] = rgb & 255; pixels[i+3] = 255;
      }
    }
    const map = new DataTexture(pixels, width, height, RGBAFormat);
    map.colorSpace = SRGBColorSpace;
    map.minFilter = map.magFilter = LinearFilter;
    map.needsUpdate = true;
    material = new SpriteMaterial({ map, depthTest: false, depthWrite: false, toneMapped: false });
    this.materials.set(key, material);
    return material;
  }
  dispose() {
    for (const material of this.materials.values()) { material.map?.dispose(); material.dispose(); }
    this.materials.clear();
  }
}

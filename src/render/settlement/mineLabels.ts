import {
  CanvasTexture,
  LinearFilter,
  SpriteMaterial,
  SRGBColorSpace,
} from "three";

/** Shared tiny labels: one texture per observed occupancy, never one canvas per frame. */
export class MineLabels {
  private readonly cache = new Map<string, SpriteMaterial>();
  material(workers: number, capacity: number) {
    const key = `${workers}/${capacity}`;
    const existing = this.cache.get(key);
    if (existing) return existing;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#091016df";
    ctx.beginPath();
    ctx.roundRect(3, 3, 250, 58, 8);
    ctx.fill();
    ctx.strokeStyle = workers >= capacity ? "#daa856" : "#8d9991";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "600 26px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f2dfb1";
    ctx.fillText(`Workers ${key}`, 128, 32);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.generateMipmaps = false;
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.cache.set(key, material);
    return material;
  }
  dispose() {
    for (const material of this.cache.values()) {
      material.map!.dispose();
      material.dispose();
    }
    this.cache.clear();
  }
}

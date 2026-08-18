/**
 * Construction-mark overlay while a hut is selected.
 * One original pip (file 4 seq 6) per placeable origin, batched as a single
 * mesh so the colony disk is one draw — not thousands of sprites.
 * Frame 0 = level/green, last frame = steep. Illegal origins stay empty.
 */
import { Container, Geometry, Mesh, Texture, type Shader } from "pixi.js";
import { gridToWorld } from "../../shared";
import { constructionMarkFrame } from "../../sim/building/flatten";
import type { FogView } from "../../sim/fog/fog";
import type { MapView } from "../../sim/map/mapView";
import { createConstructionMarkShader } from "../shader/shader";
import type { PropFrame } from "../graphics/textures";

export type ConstructionMark = { x: number; y: number; value: number };

type AtlasRect = { u0: number; v0: number; u1: number; v1: number; ox: number; oy: number; w: number; h: number };

export class ConstructionMarkLayer {
  readonly root = new Container();
  private frames: PropFrame[] = [];
  private atlas: Texture | null = null;
  private shader: Shader | null = null;
  private rects: AtlasRect[] = [];
  private view: MapView | null = null;
  private mesh: Mesh<Geometry, Shader> | null = null;
  private cells: ConstructionMark[] = [];
  private fog: FogView | null = null;
  private fogGen = -2;
  private fogPlayer = -2;

  constructor() {
    this.root.eventMode = "none";
  }

  setFrames(frames: readonly PropFrame[]): void {
    this.frames = frames.slice();
    this.shader?.destroy();
    this.atlas?.destroy(true);
    this.shader = null;
    this.atlas = null;
    this.rects = [];
    const packed = atlasFromFrames(this.frames);
    if (!packed) return;
    this.atlas = packed.texture;
    this.rects = packed.rects;
    this.shader = createConstructionMarkShader(packed.texture);
  }

  setView(view: MapView | null): void {
    this.view = view;
  }

  /** Fog overlay. `null` shows every pip (F3 fog off). */
  syncFog(fog: FogView | null): void {
    this.fog = fog;
    const gen = fog?.generation ?? -1;
    const player = fog?.player ?? -1;
    if (this.fogGen === gen && this.fogPlayer === player) return;
    this.applyFog();
  }

  show(marks: readonly ConstructionMark[]): void {
    const view = this.view;
    const shader = this.shader;
    const rects = this.rects;
    if (!view || !shader || this.frames.length === 0) {
      this.hide();
      return;
    }
    this.root.visible = true;
    this.rebuild(marks, view, shader, rects);
    this.fogGen = -2;
    this.applyFog();
  }

  hide(): void {
    this.root.visible = false;
    this.mesh?.destroy();
    this.mesh = null;
    this.cells = [];
    this.fogGen = -2;
  }

  private rebuild(
    marks: readonly ConstructionMark[],
    view: MapView,
    shader: Shader,
    rects: readonly AtlasRect[],
  ): void {
    this.mesh?.destroy();
    this.mesh = null;
    this.cells = marks.slice();
    if (marks.length === 0) return;

    const n = marks.length;
    const positions = new Float32Array(n * 8);
    const uvs = new Float32Array(n * 8);
    const visible = new Float32Array(n * 4);
    const indices = new Uint32Array(n * 6);
    visible.fill(1);

    for (let i = 0; i < n; i++) {
      const mark = marks[i]!;
      const rect = rects[constructionMarkFrame(mark.value, rects.length)] ?? rects[0]!;
      const world = gridToWorld(mark.x, mark.y, view.heightAt(mark.x, mark.y));
      const x0 = world.x + rect.ox;
      const y0 = world.y + rect.oy;
      const x1 = x0 + rect.w;
      const y1 = y0 + rect.h;
      const o = i * 8;
      positions[o] = x0;
      positions[o + 1] = y0;
      positions[o + 2] = x1;
      positions[o + 3] = y0;
      positions[o + 4] = x1;
      positions[o + 5] = y1;
      positions[o + 6] = x0;
      positions[o + 7] = y1;
      uvs[o] = rect.u0;
      uvs[o + 1] = rect.v0;
      uvs[o + 2] = rect.u1;
      uvs[o + 3] = rect.v0;
      uvs[o + 4] = rect.u1;
      uvs[o + 5] = rect.v1;
      uvs[o + 6] = rect.u0;
      uvs[o + 7] = rect.v1;
      const q = i * 4;
      const t = i * 6;
      indices[t] = q;
      indices[t + 1] = q + 1;
      indices[t + 2] = q + 2;
      indices[t + 3] = q;
      indices[t + 4] = q + 2;
      indices[t + 5] = q + 3;
    }

    const geometry = new Geometry({
      attributes: {
        aPosition: positions,
        aUv: uvs,
        aVisible: { buffer: visible, format: "float32" },
      },
      indexBuffer: indices,
    });
    const mesh = new Mesh({ geometry, shader });
    mesh.eventMode = "none";
    mesh.blendMode = "normal";
    this.root.addChild(mesh);
    this.mesh = mesh;
  }

  private applyFog(): void {
    const mesh = this.mesh;
    if (!mesh || this.cells.length === 0) {
      this.fogGen = this.fog?.generation ?? -1;
      this.fogPlayer = this.fog?.player ?? -1;
      return;
    }
    const attr = mesh.geometry.attributes.aVisible;
    if (!attr) return;
    const data = attr.buffer.data as Float32Array;
    const fog = this.fog;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]!;
      const vis = !fog || fog.sightAt(c.x, c.y) !== 0 ? 1 : 0;
      const o = i * 4;
      data[o] = vis;
      data[o + 1] = vis;
      data[o + 2] = vis;
      data[o + 3] = vis;
    }
    attr.buffer.update();
    this.fogGen = fog?.generation ?? -1;
    this.fogPlayer = fog?.player ?? -1;
  }
}

function atlasFromFrames(frames: readonly PropFrame[]): { texture: Texture; rects: AtlasRect[] } | null {
  if (frames.length === 0 || typeof document === "undefined") return null;
  const sizes = frames.map((f) => ({
    w: Math.max(1, Math.round(f.texture.width)),
    h: Math.max(1, Math.round(f.texture.height)),
  }));
  const atlasH = Math.max(...sizes.map((s) => s.h));
  const atlasW = sizes.reduce((sum, s) => sum + s.w + 1, 0);
  const canvas = document.createElement("canvas");
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  const rects: AtlasRect[] = [];
  let x = 0;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const { w, h } = sizes[i]!;
    blit(ctx, frame.texture, x, 0);
    rects.push({
      u0: x / atlasW,
      v0: 0,
      u1: (x + w) / atlasW,
      v1: h / atlasH,
      ox: frame.offsetX,
      oy: frame.offsetY,
      w,
      h,
    });
    x += w + 1;
  }
  const texture = Texture.from(canvas);
  texture.source.autoGenerateMipmaps = false;
  texture.source.scaleMode = "nearest";
  return { texture, rects };
}

function blit(ctx: CanvasRenderingContext2D, texture: Texture, dx: number, dy: number): void {
  const res = texture.source.resource;
  if (
    res instanceof HTMLImageElement ||
    (typeof ImageBitmap !== "undefined" && res instanceof ImageBitmap) ||
    (typeof HTMLCanvasElement !== "undefined" && res instanceof HTMLCanvasElement)
  ) {
    ctx.drawImage(res, dx, dy);
  }
}

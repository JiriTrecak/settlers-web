/**
 * Work-area overlay while an outdoor hut is selected.
 * Four concentric axial-circle rims of original marks (GFX file 1 seq 91),
 * clipped to owned land. Progress picks the mark frame (inner→outer). Session
 * drives this; the mesh is one draw so a radius-30 lumberjack is not hundreds of sprites.
 */
import { Container, Geometry, Graphics, Mesh, Texture, type Shader } from "pixi.js";
import { forEachWorkAreaMark, gridToWorld, type GridPos } from "../../shared";
import type { FogView } from "../../sim/fog/fog";
import type { LandView } from "../../sim/land/land";
import type { MapView } from "../../sim/map/mapView";
import { createConstructionMarkShader } from "../shader/shader";
import type { PropFrame } from "../graphics/textures";

type AtlasRect = { u0: number; v0: number; u1: number; v1: number; ox: number; oy: number; w: number; h: number };
type PackedFrame = { body: AtlasRect; shadow?: AtlasRect };

type Pip = { x: number; y: number; progress: number };

export class WorkAreaLayer {
  readonly root = new Container();
  private readonly fallback = new Graphics();
  private frames: PropFrame[] = [];
  private packed: PackedFrame[] = [];
  private atlas: Texture | null = null;
  private shader: Shader | null = null;
  private view: MapView | null = null;
  private land: LandView | null = null;
  private landGen = -2;
  private fog: FogView | null = null;
  private fogGen = -2;
  private fogPlayer = -2;
  private zoom = 1;
  private center: GridPos | null = null;
  private radius = 0;
  private player = 0;
  private mesh: Mesh<Geometry, Shader> | null = null;
  private pips: Pip[] = [];

  constructor() {
    this.fallback.eventMode = "none";
    this.root.eventMode = "none";
    this.root.zIndex = 999_000;
    this.root.addChild(this.fallback);
  }

  setFrames(frames: readonly PropFrame[]): void {
    this.frames = frames.slice();
    this.shader?.destroy();
    this.atlas?.destroy(true);
    this.shader = null;
    this.atlas = null;
    this.packed = [];
    const packed = atlasFromFrames(this.frames);
    if (!packed) {
      this.paint();
      return;
    }
    this.atlas = packed.texture;
    this.packed = packed.frames;
    this.shader = createConstructionMarkShader(packed.texture);
    this.paint();
  }

  setView(view: MapView | null): void {
    this.view = view;
    this.paint();
  }

  setLand(land: LandView | null): void {
    const gen = land?.generation ?? -1;
    if (this.land === land && this.landGen === gen) return;
    this.land = land;
    this.landGen = gen;
    this.paint();
  }

  /** Fog overlay. `null` shows every post (F3 fog off). */
  syncFog(fog: FogView | null): void {
    this.fog = fog;
    const gen = fog?.generation ?? -1;
    const player = fog?.player ?? -1;
    if (this.fogGen === gen && this.fogPlayer === player) return;
    this.applyFog();
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    if (this.packed.length === 0) this.paintFallback();
  }

  show(center: GridPos, radius: number, player = 0): void {
    this.center = center;
    this.radius = radius;
    this.player = player;
    this.paint();
  }

  hide(): void {
    this.center = null;
    this.radius = 0;
    this.clearDraw();
    this.root.visible = false;
  }

  private paint(): void {
    const view = this.view;
    const at = this.center;
    const r = this.radius;
    if (!at || !(r > 0)) {
      this.clearDraw();
      this.root.visible = false;
      return;
    }
    if (!view) return;
    this.root.visible = true;
    if (this.shader && this.packed.length > 0) {
      this.fallback.clear();
      this.rebuild(at, view, this.shader, this.packed);
      this.fogGen = -2;
      this.applyFog();
      return;
    }
    this.mesh?.destroy();
    this.mesh = null;
    this.pips = [];
    this.paintFallback();
  }

  private clearDraw(): void {
    this.pips = [];
    this.fallback.clear();
    this.mesh?.destroy();
    this.mesh = null;
  }

  private rebuild(at: GridPos, view: MapView, shader: Shader, packed: readonly PackedFrame[]): void {
    this.mesh?.destroy();
    this.mesh = null;
    const pips = collectPips(at, this.radius, view, this.land, this.player);
    this.pips = pips;
    if (pips.length === 0) return;

    let quads = 0;
    for (const pip of pips) {
      const frame = packed[frameOf(pip.progress, packed.length)] ?? packed[0]!;
      quads += frame.shadow ? 2 : 1;
    }

    const positions = new Float32Array(quads * 8);
    const uvs = new Float32Array(quads * 8);
    const visible = new Float32Array(quads * 4);
    const indices = new Uint32Array(quads * 6);
    visible.fill(1);

    let q = 0;
    const push = (rect: AtlasRect, wx: number, wy: number): void => {
      const x0 = wx + rect.ox;
      const y0 = wy + rect.oy;
      const x1 = x0 + rect.w;
      const y1 = y0 + rect.h;
      const o = q * 8;
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
      const i = q * 6;
      const b = q * 4;
      indices[i] = b;
      indices[i + 1] = b + 1;
      indices[i + 2] = b + 2;
      indices[i + 3] = b;
      indices[i + 4] = b + 2;
      indices[i + 5] = b + 3;
      q += 1;
    };

    for (const pip of pips) {
      const frame = packed[frameOf(pip.progress, packed.length)] ?? packed[0]!;
      const world = gridToWorld(pip.x, pip.y, view.heightAt(pip.x, pip.y));
      if (frame.shadow) push(frame.shadow, world.x, world.y);
      push(frame.body, world.x, world.y);
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
    if (!mesh || this.pips.length === 0) {
      this.fogGen = this.fog?.generation ?? -1;
      this.fogPlayer = this.fog?.player ?? -1;
      return;
    }
    const attr = mesh.geometry.attributes.aVisible;
    if (!attr) return;
    const data = attr.buffer.data as Float32Array;
    const fog = this.fog;
    const packed = this.packed;
    let q = 0;
    for (const pip of this.pips) {
      const vis = !fog || fog.sightAt(pip.x, pip.y) !== 0 ? 1 : 0;
      const frame = packed[frameOf(pip.progress, packed.length)] ?? packed[0];
      const copies = frame?.shadow ? 2 : 1;
      for (let i = 0; i < copies; i++) {
        const o = q * 4;
        data[o] = vis;
        data[o + 1] = vis;
        data[o + 2] = vis;
        data[o + 3] = vis;
        q += 1;
      }
    }
    attr.buffer.update();
    this.fogGen = fog?.generation ?? -1;
    this.fogPlayer = fog?.player ?? -1;
  }

  private paintFallback(): void {
    this.fallback.clear();
    const view = this.view;
    const at = this.center;
    const r = this.radius;
    if (!view || !at || !(r > 0)) return;
    const width = 1.35 / this.zoom;
    const pips = collectPips(at, r, view, this.land, this.player);
    for (const pip of pips) {
      this.fallback.poly(cellVerts(view, pip.x, pip.y)).stroke({
        color: 0xffe14a,
        width,
        alpha: 0.55 + pip.progress * 0.35,
        alignment: 0.5,
      });
    }
  }
}

function collectPips(at: GridPos, radius: number, view: MapView, land: LandView | null, player: number): Pip[] {
  const out: Pip[] = [];
  const w = view.width - 1;
  const h = view.height - 1;
  forEachWorkAreaMark(at.x, at.y, radius, (x, y, progress) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    if (land && land.playerAt(x, y) !== player) return;
    out.push({ x, y, progress });
  });
  return out;
}

/** Inner ring → frame 0, outer → last. */
function frameOf(progress: number, n: number): number {
  if (n <= 1) return 0;
  return Math.min((progress * n) | 0, n - 1);
}

function cellVerts(view: MapView, x: number, y: number): { x: number; y: number }[] {
  return [
    gridToWorld(x, y, view.heightAt(x, y)),
    gridToWorld(x + 1, y, view.heightAt(x + 1, y)),
    gridToWorld(x + 1, y + 1, view.heightAt(x + 1, y + 1)),
    gridToWorld(x, y + 1, view.heightAt(x, y + 1)),
  ];
}

function atlasFromFrames(frames: readonly PropFrame[]): { texture: Texture; frames: PackedFrame[] } | null {
  if (frames.length === 0 || typeof document === "undefined") return null;
  const layers: { tex: Texture; ox: number; oy: number; px: number }[] = [];
  const index: { body: number; shadow?: number }[] = [];
  for (const f of frames) {
    const body = layers.length;
    layers.push({ tex: f.texture, ox: f.offsetX, oy: f.offsetY, px: f.px });
    let shadow: number | undefined;
    if (f.shadow) {
      shadow = layers.length;
      layers.push({ tex: f.shadow.texture, ox: f.shadow.offsetX, oy: f.shadow.offsetY, px: f.shadow.px });
    }
    index.push({ body, shadow });
  }
  const sizes = layers.map((l) => ({
    w: Math.max(1, Math.round(l.tex.width)),
    h: Math.max(1, Math.round(l.tex.height)),
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
  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i]!;
    const { w, h } = sizes[i]!;
    blit(ctx, layer.tex, x, 0);
    const px = layer.px >= 1 ? layer.px : 1;
    rects.push({
      u0: x / atlasW,
      v0: 0,
      u1: (x + w) / atlasW,
      v1: h / atlasH,
      ox: layer.ox,
      oy: layer.oy,
      w: w / px,
      h: h / px,
    });
    x += w + 1;
  }
  const texture = Texture.from(canvas);
  texture.source.autoGenerateMipmaps = false;
  texture.source.scaleMode = "nearest";
  return {
    texture,
    frames: index.map((i) => ({
      body: rects[i.body]!,
      shadow: i.shadow != null ? rects[i.shadow] : undefined,
    })),
  };
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

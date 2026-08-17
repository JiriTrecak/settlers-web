/**
 * Trees, stones, stacks, waves as sprites. Depth is `isoDepth` on the shared iso container
 * so props and settlers interleave (south in front, stones cover units).
 * Waves are static; trees/stones/stacks sync from the sim snapshot each draw.
 */
import { Container, Sprite } from "pixi.js";
import { gridToWorld, isoDepth, ISO_DEPTH_PROP, ISO_DEPTH_WAVE } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import type { MapDecoration } from "../../sim/decorations/decorations";
import type { MapObjectView } from "../../sim/object/object";
import type { DecorationSheets, PropFrame } from "./decorationSheets";

type Placed = {
  deco: MapDecoration;
  body: Sprite;
  shadow: Sprite | null;
  lastFrame: number;
};

export class DecorationLayer {
  private waves: Placed[] = [];
  private props = new Map<string, Placed>();
  private sheets: DecorationSheets | null = null;
  private view: MapView | null = null;
  private animationStep = 0;

  constructor(private readonly parent: Container) {}

  setSheets(sheets: DecorationSheets | null): void {
    this.sheets = sheets;
  }

  setView(view: MapView | null): void {
    this.view = view;
  }

  setWaves(view: MapView, waves: readonly MapDecoration[]): void {
    this.view = view;
    for (const p of this.waves) {
      p.body.destroy();
      p.shadow?.destroy();
    }
    this.waves = [];
    for (const deco of waves) {
      if (deco.kind !== "wave") continue;
      const placed = this.spawn(deco);
      if (placed) this.waves.push(placed);
    }
  }

  /** Diff trees/stones/stacks against the last snapshot. Waves stay put. */
  syncObjects(objects: readonly MapObjectView[]): void {
    const view = this.view;
    const sheets = this.sheets;
    if (!view || !sheets) return;
    const want = new Set<string>();
    for (const obj of objects) {
      const key = `${obj.x},${obj.y}`;
      want.add(key);
      const deco = objectToDeco(obj);
      const existing = this.props.get(key);
      if (!existing) {
        const placed = this.spawn(deco);
        if (placed) this.props.set(key, placed);
        continue;
      }
      existing.deco = deco;
      this.applyFrame(existing, view, sheets, this.animationStep);
    }
    for (const [key, p] of this.props) {
      if (want.has(key)) continue;
      p.body.destroy();
      p.shadow?.destroy();
      this.props.delete(key);
    }
  }

  tick(nowMs: number): void {
    const sheets = this.sheets;
    const view = this.view;
    if (!sheets || !view) return;
    this.animationStep = ((nowMs / 100) | 0) & 0x7fffffff;
    for (const p of this.waves) this.applyFrame(p, view, sheets, this.animationStep);
    for (const p of this.props.values()) this.applyFrame(p, view, sheets, this.animationStep);
  }

  private spawn(deco: MapDecoration): Placed | null {
    const sheets = this.sheets;
    const view = this.view;
    if (!sheets || !view) return null;
    const frame = this.frameOf(deco, sheets, this.animationStep);
    if (!frame) return null;
    const world = gridToWorld(deco.x, deco.y, view.heightAt(deco.x, deco.y));
    const z = isoDepth(world.x, world.y, deco.kind === "wave" ? ISO_DEPTH_WAVE : ISO_DEPTH_PROP);
    let shadow: Sprite | null = null;
    if (frame.shadow) {
      shadow = new Sprite(frame.shadow.texture);
      shadow.eventMode = "none";
      shadow.zIndex = z;
      this.parent.addChild(shadow);
    }
    const body = new Sprite(frame.texture);
    body.eventMode = "none";
    body.zIndex = z;
    this.parent.addChild(body);
    const placed: Placed = { deco, body, shadow, lastFrame: -1 };
    this.applyFrame(placed, view, sheets, this.animationStep);
    return placed;
  }

  private applyFrame(p: Placed, view: MapView, sheets: DecorationSheets, step: number): void {
    const index = this.indexOf(p.deco, sheets, step);
    const frame = this.frameAt(p.deco, sheets, index);
    if (!frame) return;
    p.lastFrame = index;
    const world = gridToWorld(p.deco.x, p.deco.y, view.heightAt(p.deco.x, p.deco.y));
    p.body.texture = frame.texture;
    p.body.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
    p.body.zIndex = isoDepth(world.x, world.y, p.deco.kind === "wave" ? ISO_DEPTH_WAVE : ISO_DEPTH_PROP);
    const treeProgress = p.deco.kind === "tree" ? (p.deco.stateProgress ?? 1) : 1;
    const chopping = p.deco.kind === "tree" && treeProgress < 1 && !this.fallOf(p.deco, sheets);
    p.body.scale.set(chopping ? 0.35 + 0.65 * treeProgress : 1);
    if (p.shadow && frame.shadow) {
      p.shadow.texture = frame.shadow.texture;
      p.shadow.position.set(world.x + frame.shadow.offsetX, world.y + frame.shadow.offsetY);
      p.shadow.zIndex = p.body.zIndex;
      p.shadow.scale.set(p.body.scale.x);
    }
  }

  private indexOf(deco: MapDecoration, sheets: DecorationSheets, step: number): number {
    if (deco.kind === "tree") {
      const progress = deco.stateProgress ?? 1;
      const fall = this.fallOf(deco, sheets);
      if (fall && progress < 1) {
        const i = ((1 - progress) * fall.length) | 0;
        return Math.min(fall.length - 1, i);
      }
      const frames = sheets.trees[deco.sheet] ?? sheets.trees[0]!;
      const anim = 0x0fffffff & ((step + deco.x * 167 + deco.y * 1223) | 0);
      return frames.length === 0 ? 0 : anim % frames.length;
    }
    if (deco.kind === "wave") {
      const n = sheets.waves.length;
      if (n === 0) return 0;
      return (((step / 2) | 0) + ((deco.x / 2) | 0) + ((deco.y / 2) | 0)) % n;
    }
    if (deco.kind === "stack") {
      const frames = stackFrames(deco, sheets);
      const n = frames.length;
      if (n === 0) return 0;
      return Math.max(0, Math.min(n - 1, deco.capacity - 1));
    }
    const n = sheets.stones.length;
    if (n === 0) return 0;
    return Math.max(0, Math.min(n - 1, n - deco.capacity - 1));
  }

  private frameOf(deco: MapDecoration, sheets: DecorationSheets, step: number): PropFrame | null {
    return this.frameAt(deco, sheets, this.indexOf(deco, sheets, step));
  }

  private frameAt(deco: MapDecoration, sheets: DecorationSheets, index: number): PropFrame | null {
    if (deco.kind === "tree") {
      const progress = deco.stateProgress ?? 1;
      const fall = this.fallOf(deco, sheets);
      if (fall && progress < 1) return fall[index] ?? fall[0] ?? null;
      const frames = sheets.trees[deco.sheet] ?? sheets.trees[0];
      return frames?.[index] ?? frames?.[0] ?? null;
    }
    if (deco.kind === "wave") return sheets.waves[index] ?? null;
    if (deco.kind === "stack") {
      const frames = stackFrames(deco, sheets);
      return frames[index] ?? frames[0] ?? null;
    }
    return sheets.stones[index] ?? null;
  }

  private fallOf(deco: MapDecoration, sheets: DecorationSheets): PropFrame[] | undefined {
    if (deco.kind !== "tree") return undefined;
    const clip = sheets.falls[deco.sheet % 4];
    return clip && clip.length > 0 ? clip : undefined;
  }
}

function objectToDeco(obj: MapObjectView): MapDecoration {
  if (obj.kind === "tree") {
    return { kind: "tree", x: obj.x, y: obj.y, sheet: obj.sheet, stateProgress: obj.stateProgress };
  }
  if (obj.kind === "stack") {
    return { kind: "stack", x: obj.x, y: obj.y, capacity: obj.capacity, material: obj.material };
  }
  return { kind: "stone", x: obj.x, y: obj.y, capacity: obj.capacity };
}

function stackFrames(deco: MapDecoration, sheets: DecorationSheets): PropFrame[] {
  if (deco.kind !== "stack") return [];
  const mat = deco.material;
  return (mat ? sheets.stacks[mat] : undefined) ?? sheets.stacks.trunk ?? [];
}

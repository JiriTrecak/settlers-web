import { Container, Sprite } from "pixi.js";
import { gridToWorld } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import type { MapDecoration } from "../../sim/decorations/decorations";
import type { DecorationSheets, PropFrame } from "./decorationSheets";

type Placed = {
  deco: MapDecoration;
  body: Sprite;
  shadow: Sprite | null;
  lastFrame: number;
};

export class DecorationLayer {
  readonly root = new Container();
  private placed: Placed[] = [];
  private decorations: MapDecoration[] = [];
  private sheets: DecorationSheets | null = null;
  private view: MapView | null = null;
  private animationStep = 0;

  constructor() {
    this.root.eventMode = "none";
    this.root.sortableChildren = true;
  }

  setSheets(sheets: DecorationSheets | null): void {
    this.sheets = sheets;
    if (this.view) this.setDecorations(this.view, this.decorations);
  }

  setDecorations(view: MapView, decorations: readonly MapDecoration[]): void {
    this.view = view;
    this.decorations = decorations.slice();
    this.root.removeChildren();
    for (const p of this.placed) {
      p.body.destroy();
      p.shadow?.destroy();
    }
    this.placed = [];
    const sheets = this.sheets;
    if (!sheets) return;

    for (const deco of decorations) {
      const frame = this.frameOf(deco, sheets, this.animationStep);
      if (!frame) continue;
      const world = gridToWorld(deco.x, deco.y, view.heightAt(deco.x, deco.y));
      const z = deco.kind === "wave" ? deco.y * 2 : deco.y * 2 + 1;
      let shadow: Sprite | null = null;
      if (frame.shadow) {
        shadow = new Sprite(frame.shadow.texture);
        shadow.eventMode = "none";
        shadow.zIndex = z;
        shadow.position.set(world.x + frame.shadow.offsetX, world.y + frame.shadow.offsetY);
        this.root.addChild(shadow);
      }
      const body = new Sprite(frame.texture);
      body.eventMode = "none";
      body.zIndex = z;
      body.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
      this.root.addChild(body);
      this.placed.push({ deco, body, shadow, lastFrame: this.indexOf(deco, sheets, this.animationStep) });
    }
  }

  tick(nowMs: number): void {
    const sheets = this.sheets;
    const view = this.view;
    if (!sheets || !view) return;
    this.animationStep = ((nowMs / 100) | 0) & 0x7fffffff;
    for (const p of this.placed) {
      const index = this.indexOf(p.deco, sheets, this.animationStep);
      if (index === p.lastFrame) continue;
      const frame = this.frameAt(p.deco, sheets, index);
      if (!frame) continue;
      p.lastFrame = index;
      p.body.texture = frame.texture;
      const world = gridToWorld(p.deco.x, p.deco.y, view.heightAt(p.deco.x, p.deco.y));
      p.body.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
      if (p.shadow && frame.shadow) {
        p.shadow.texture = frame.shadow.texture;
        p.shadow.position.set(world.x + frame.shadow.offsetX, world.y + frame.shadow.offsetY);
      }
    }
  }

  private indexOf(deco: MapDecoration, sheets: DecorationSheets, step: number): number {
    if (deco.kind === "tree") {
      const frames = sheets.trees[deco.sheet] ?? sheets.trees[0]!;
      const anim = 0x0fffffff & ((step + deco.x * 167 + deco.y * 1223) | 0);
      return frames.length === 0 ? 0 : anim % frames.length;
    }
    if (deco.kind === "wave") {
      const n = sheets.waves.length;
      if (n === 0) return 0;
      return (((step / 2) | 0) + ((deco.x / 2) | 0) + ((deco.y / 2) | 0)) % n;
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
      const frames = sheets.trees[deco.sheet] ?? sheets.trees[0];
      return frames?.[index] ?? frames?.[0] ?? null;
    }
    if (deco.kind === "wave") return sheets.waves[index] ?? null;
    return sheets.stones[index] ?? null;
  }
}

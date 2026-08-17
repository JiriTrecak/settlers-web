/**
 * Debug polylines of remaining walk queues. Visual only; sits above the iso
 * container so paths are not buried under huts. Off until the HUD toggle.
 */
import { Graphics } from "pixi.js";
import { gridToWorld } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import type { MovableView } from "../../sim/movable/movable";

const STROKE = 0x7ee8ff;

export class PathLayer {
  readonly root = new Graphics();
  private view: MapView | null = null;
  private zoom = 1;
  private on = false;

  constructor() {
    this.root.eventMode = "none";
    this.root.zIndex = 999_000;
  }

  setView(view: MapView | null): void {
    this.view = view;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!on) this.root.clear();
  }

  draw(movables: readonly MovableView[], alpha: number): void {
    this.root.clear();
    const view = this.view;
    if (!this.on || !view) return;
    const width = 1.25 / this.zoom;
    for (const m of movables) {
      if (m.inside) continue;
      const pts = pointsOf(m, view, alpha);
      if (pts.length < 2) continue;
      this.root.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) this.root.lineTo(pts[i]!.x, pts[i]!.y);
      this.root.stroke({ color: STROKE, width, alpha: 0.85, alignment: 0.5 });
      const end = pts[pts.length - 1]!;
      this.root.circle(end.x, end.y, 2 / this.zoom).fill({ color: STROKE, alpha: 0.9 });
    }
  }
}

function pointsOf(m: MovableView, view: MapView, alpha: number): { x: number; y: number }[] {
  const p = visualProgress(m, alpha);
  const x = m.from.x + (m.pos.x - m.from.x) * p;
  const y = m.from.y + (m.pos.y - m.from.y) * p;
  const h0 = view.heightAt(m.from.x, m.from.y);
  const h1 = view.heightAt(m.pos.x, m.pos.y);
  const out = [gridToWorld(x, y, h0 + (h1 - h0) * p)];
  if (m.action === "walk") out.push(gridToWorld(m.pos.x, m.pos.y, h1));
  for (const t of m.path) out.push(gridToWorld(t.x, t.y, view.heightAt(t.x, t.y)));
  return out;
}

function visualProgress(m: MovableView, alpha: number): number {
  if (m.action === "walk") return Math.min(1, m.moveProgress + alpha / m.stepTicks);
  return 0;
}

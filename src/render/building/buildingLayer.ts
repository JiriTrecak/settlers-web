/**
 * Instant-built huts. One sprite at the def origin; DAT offsets place the art.
 * Depth is `isoDepth` on the shared iso container.
 */
import { Container, Sprite } from "pixi.js";
import { gridToWorld, isoDepth, ISO_DEPTH_BUILDING } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import type { BuildingView } from "../../sim/building/building";
import type { BuildingSheets } from "./buildingSheets";

type Drawn = {
  id: number;
  body: Sprite;
  shadow: Sprite | null;
};

export class BuildingLayer {
  private sheets: BuildingSheets | null = null;
  private view: MapView | null = null;
  private drawn = new Map<number, Drawn>();

  constructor(private readonly parent: Container) {}

  setSheets(sheets: BuildingSheets | null): void {
    this.sheets = sheets;
  }

  setView(view: MapView | null): void {
    this.view = view;
  }

  sync(buildings: readonly BuildingView[]): void {
    const view = this.view;
    const sheets = this.sheets;
    if (!view || !sheets) return;
    const want = new Set<number>();
    for (const b of buildings) {
      want.add(b.id);
      if (this.drawn.has(b.id)) continue;
      const placed = this.spawn(b, view, sheets);
      if (placed) this.drawn.set(b.id, placed);
    }
    for (const [id, d] of this.drawn) {
      if (want.has(id)) continue;
      d.body.destroy();
      d.shadow?.destroy();
      this.drawn.delete(id);
    }
  }

  private spawn(b: BuildingView, view: MapView, sheets: BuildingSheets): Drawn | null {
    const frame = sheets[b.kind];
    if (!frame) return null;
    const world = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
    const z = isoDepth(world.x, world.y, ISO_DEPTH_BUILDING);
    let shadow: Sprite | null = null;
    if (frame.shadow) {
      shadow = new Sprite(frame.shadow.texture);
      shadow.eventMode = "none";
      shadow.zIndex = z;
      shadow.position.set(world.x + frame.shadow.offsetX, world.y + frame.shadow.offsetY);
      this.parent.addChild(shadow);
    }
    const body = new Sprite(frame.texture);
    body.eventMode = "none";
    body.zIndex = z;
    body.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
    this.parent.addChild(body);
    return { id: b.id, body, shadow };
  }
}

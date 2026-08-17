/**
 * Huts. Scaffold while `plan`, finished sprite once `built`.
 * Depth is `isoDepth` on the shared iso container.
 */
import { Container, Sprite } from "pixi.js";
import { gridToWorld, isoDepth, ISO_DEPTH_BUILDING } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import type { BuildingState, BuildingView } from "../../sim/building/building";
import type { BuildingSheet, BuildingSheets } from "./buildingSheets";
import type { PropFrame } from "../graphics/textures";

type Drawn = {
  id: number;
  body: Sprite;
  shadow: Sprite | null;
  state: BuildingState;
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
      const existing = this.drawn.get(b.id);
      if (!existing) {
        const placed = this.spawn(b, view, sheets);
        if (placed) this.drawn.set(b.id, placed);
        continue;
      }
      if (existing.state === b.state) continue;
      this.apply(existing, b, view, sheets);
    }
    for (const [id, d] of this.drawn) {
      if (want.has(id)) continue;
      d.body.destroy();
      d.shadow?.destroy();
      this.drawn.delete(id);
    }
  }

  private spawn(b: BuildingView, view: MapView, sheets: BuildingSheets): Drawn | null {
    const sheet = sheets[b.kind];
    const frame = frameOf(sheet, b.state);
    if (!sheet || !frame) return null;
    const world = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
    const z = isoDepth(world.x, world.y, ISO_DEPTH_BUILDING);
    let shadow: Sprite | null = null;
    if (frame.shadow) {
      shadow = new Sprite(frame.shadow.texture);
      shadow.eventMode = "none";
      this.parent.addChild(shadow);
    }
    const body = new Sprite(frame.texture);
    body.eventMode = "none";
    this.parent.addChild(body);
    const drawn: Drawn = { id: b.id, body, shadow, state: b.state };
    this.paint(drawn, frame, world, z);
    return drawn;
  }

  private apply(d: Drawn, b: BuildingView, view: MapView, sheets: BuildingSheets): void {
    const frame = frameOf(sheets[b.kind], b.state);
    if (!frame) return;
    d.state = b.state;
    const world = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
    this.paint(d, frame, world, isoDepth(world.x, world.y, ISO_DEPTH_BUILDING));
  }

  private paint(d: Drawn, frame: PropFrame, world: { x: number; y: number }, z: number): void {
    d.body.texture = frame.texture;
    d.body.zIndex = z;
    d.body.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
    if (d.shadow && frame.shadow) {
      d.shadow.texture = frame.shadow.texture;
      d.shadow.zIndex = z;
      d.shadow.position.set(world.x + frame.shadow.offsetX, world.y + frame.shadow.offsetY);
      d.shadow.visible = true;
    } else if (d.shadow) {
      d.shadow.visible = false;
    }
  }
}

function frameOf(sheet: BuildingSheet | undefined, state: BuildingState): PropFrame | undefined {
  if (!sheet) return undefined;
  return state === "plan" ? sheet.scaffold : sheet.built;
}

/**
 * Placement preview while a build tool is selected: scaffold sprite + blocked fill + mark strokes.
 * Hidden when hovering an existing hut (session decides). Red tint when the plot is illegal.
 */
import { Container, Graphics, Sprite } from "pixi.js";
import { gridToWorld, type GridPos } from "../../shared";
import { buildingDef, type BuildingKind } from "../../sim/data/buildings";
import type { MapView } from "../../sim/map/mapView";
import type { BuildingSheets } from "./buildingSheets";

const GHOST_Z = 999_000;
const FILL = 0xe8c36a;
const BAD = 0xff6b5a;
const MARK = 0xfff3c4;

export class GhostLayer {
  readonly root = new Container();
  private sheets: BuildingSheets | null = null;
  private view: MapView | null = null;
  private zoom = 1;
  private readonly body = new Sprite();
  private readonly plot = new Graphics();

  constructor() {
    this.root.eventMode = "none";
    this.root.zIndex = GHOST_Z;
    this.body.eventMode = "none";
    this.body.alpha = 0.55;
    this.plot.eventMode = "none";
    this.root.addChild(this.plot, this.body);
    this.hide();
  }

  setSheets(sheets: BuildingSheets | null): void {
    this.sheets = sheets;
  }

  setView(view: MapView | null): void {
    this.view = view;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
  }

  show(kind: BuildingKind, pos: GridPos, ok: boolean): void {
    const view = this.view;
    if (!view) {
      this.hide();
      return;
    }
    this.root.visible = true;
    const def = buildingDef(kind);
    const tint = ok ? 0xffffff : BAD;
    const fill = ok ? FILL : BAD;
    const stroke = ok ? MARK : BAD;
    const width = 1.25 / this.zoom;

    this.plot.clear();
    for (const r of def.blocked) {
      const quad = cellQuad(view, pos.x + r.dx, pos.y + r.dy);
      if (quad) this.plot.poly(quad).fill({ color: fill, alpha: 0.14 });
    }
    for (const r of def.buildMarks) {
      const quad = cellQuad(view, pos.x + r.dx, pos.y + r.dy);
      if (quad) this.plot.poly(quad).stroke({ color: stroke, width, alignment: 0.5 });
    }

    const frame = this.sheets?.[kind]?.scaffold;
    if (!frame) {
      this.body.visible = false;
      return;
    }
    const world = gridToWorld(pos.x, pos.y, view.heightAt(pos.x, pos.y));
    this.body.visible = true;
    this.body.texture = frame.texture;
    this.body.tint = tint;
    this.body.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
  }

  hide(): void {
    this.root.visible = false;
    this.body.visible = false;
    this.plot.clear();
  }
}

function cellQuad(view: MapView, x: number, y: number): { x: number; y: number }[] | null {
  if (x < 0 || y < 0 || x >= view.width - 1 || y >= view.height - 1) return null;
  return [
    gridToWorld(x, y, view.heightAt(x, y)),
    gridToWorld(x + 1, y, view.heightAt(x + 1, y)),
    gridToWorld(x + 1, y + 1, view.heightAt(x + 1, y + 1)),
    gridToWorld(x, y + 1, view.heightAt(x, y + 1)),
  ];
}

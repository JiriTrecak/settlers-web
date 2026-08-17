/**
 * Huts. Scaffold while `plan` / `building`; the finished sprite grows from the
 * bottom over the scaffold while bricklayers hammer (saw-edge mask, 10 teeth).
 * Depth is `isoDepth` on the shared iso container.
 */
import { Container, Graphics, Sprite } from "pixi.js";
import { gridToWorld, isoDepth, ISO_DEPTH_BUILDING } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import type { BuildingState, BuildingView } from "../../sim/building/building";
import type { BuildingSheet, BuildingSheets } from "./buildingSheets";
import type { PropFrame } from "../graphics/textures";

/** Same as the original construction mask: 10 triangles, 5% of sprite height. */
const GROW_TILES = 10;
const GROW_JAG = 0.05;

type Drawn = {
  id: number;
  root: Container;
  scaffold: Sprite;
  built: Sprite;
  mask: Graphics;
  shadow: Sprite;
  state: BuildingState;
  progress: number;
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
      if (existing.state === b.state && existing.progress === b.buildProgress) continue;
      this.apply(existing, b, view, sheets);
    }
    for (const [id, d] of this.drawn) {
      if (want.has(id)) continue;
      d.root.destroy({ children: true });
      this.drawn.delete(id);
    }
  }

  private spawn(b: BuildingView, view: MapView, sheets: BuildingSheets): Drawn | null {
    const sheet = sheets[b.kind];
    if (!sheet) return null;
    const world = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
    const z = isoDepth(world.x, world.y, ISO_DEPTH_BUILDING);
    const root = new Container();
    root.eventMode = "none";
    root.sortableChildren = false;
    this.parent.addChild(root);

    const shadow = new Sprite();
    shadow.eventMode = "none";
    const scaffold = new Sprite(sheet.scaffold.texture);
    scaffold.eventMode = "none";
    const built = new Sprite(sheet.built.texture);
    built.eventMode = "none";
    const mask = new Graphics();
    mask.eventMode = "none";
    root.addChild(shadow, scaffold, built, mask);

    const drawn: Drawn = {
      id: b.id,
      root,
      scaffold,
      built,
      mask,
      shadow,
      state: b.state,
      progress: b.buildProgress,
    };
    this.paint(drawn, sheet, world, z, b);
    return drawn;
  }

  private apply(d: Drawn, b: BuildingView, view: MapView, sheets: BuildingSheets): void {
    const sheet = sheets[b.kind];
    if (!sheet) return;
    d.state = b.state;
    d.progress = b.buildProgress;
    const world = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
    this.paint(d, sheet, world, isoDepth(world.x, world.y, ISO_DEPTH_BUILDING), b);
  }

  private paint(d: Drawn, sheet: BuildingSheet, world: { x: number; y: number }, z: number, b: BuildingView): void {
    d.root.zIndex = z;
    d.root.position.set(world.x, world.y);
    placeSprite(d.scaffold, sheet.scaffold);
    placeSprite(d.built, sheet.built);

    const finished = b.state === "built" || b.buildProgress >= 1;
    const growing = b.state === "building" && !finished;
    d.scaffold.visible = !finished;
    d.built.visible = finished || growing;
    if (growing) {
      paintGrowMask(d.mask, sheet.built, b.buildProgress);
      d.built.mask = d.mask;
      d.mask.visible = true;
    } else {
      d.built.mask = null;
      d.mask.clear();
      d.mask.visible = false;
    }

    const shadowFrame = finished ? sheet.built.shadow : sheet.scaffold.shadow;
    if (shadowFrame) {
      d.shadow.visible = true;
      d.shadow.texture = shadowFrame.texture;
      d.shadow.position.set(shadowFrame.offsetX, shadowFrame.offsetY);
    } else {
      d.shadow.visible = false;
    }
  }
}

function placeSprite(sprite: Sprite, frame: PropFrame): void {
  sprite.texture = frame.texture;
  sprite.position.set(frame.offsetX, frame.offsetY);
}

/** Bottom-up clip plus a saw edge — `drawWithConstructionMask`. */
function paintGrowMask(g: Graphics, frame: PropFrame, progress: number): void {
  g.clear();
  const w = frame.texture.width;
  const h = frame.texture.height;
  if (progress <= 0 || w <= 0 || h <= 0) return;
  const p = Math.min(1, progress);
  const x = frame.offsetX;
  const y = frame.offsetY;
  const shown = h * p;
  const solidTop = y + h - shown;
  g.rect(x, solidTop, w, shown).fill({ color: 0xffffff });
  if (p >= 1) return;
  const peak = Math.max(y, solidTop - h * GROW_JAG);
  const tw = w / GROW_TILES;
  for (let i = 0; i < GROW_TILES; i++) {
    g.poly([x + i * tw, solidTop, x + (i + 0.5) * tw, peak, x + (i + 1) * tw, solidTop]).fill({ color: 0xffffff });
  }
}

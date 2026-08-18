/**
 * Placement preview: fence posts + blocked fill. Hidden when hovering an
 * existing hut (session decides). Red tint when the plot is illegal.
 */
import { Container, Graphics, Sprite } from "pixi.js";
import { gridToWorld, type GridPos } from "../../shared";
import { buildingDef, type BuildingKind } from "../../sim/data/buildings";
import type { MapView } from "../../sim/map/mapView";
import type { BuildingSheets } from "./buildingSheets";
import type { PropFrame } from "../graphics/textures";

const GHOST_Z = 999_000;
const FILL = 0xe8c36a;
const BAD = 0xff6b5a;
const MARK = 0xfff3c4;

export class GhostLayer {
  readonly root = new Container();
  private sheets: BuildingSheets | null = null;
  private view: MapView | null = null;
  private zoom = 1;
  private readonly plot = new Graphics();
  private readonly posts: Sprite[] = [];
  private readonly sign = new Sprite();

  constructor() {
    this.root.eventMode = "none";
    this.root.zIndex = GHOST_Z;
    this.plot.eventMode = "none";
    this.sign.eventMode = "none";
    this.sign.alpha = 0.85;
    this.root.addChild(this.plot, this.sign);
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
    const fill = ok ? FILL : BAD;
    const stroke = ok ? MARK : BAD;
    const tint = ok ? 0xffffff : BAD;
    const width = 1.25 / this.zoom;
    const post = this.sheets?.sitePost ?? null;
    const sign = this.sheets?.siteSign ?? null;

    this.plot.clear();
    for (const r of def.blocked) {
      const quad = cellQuad(view, pos.x + r.dx, pos.y + r.dy);
      if (quad) this.plot.poly(quad).fill({ color: fill, alpha: 0.14 });
    }
    if (!post) {
      for (const r of def.buildMarks) {
        const quad = cellQuad(view, pos.x + r.dx, pos.y + r.dy);
        if (quad) this.plot.poly(quad).stroke({ color: stroke, width, alignment: 0.5 });
      }
    }

    this.ensurePosts(def.buildMarks.length);
    for (let i = 0; i < this.posts.length; i++) {
      const sprite = this.posts[i]!;
      const mark = def.buildMarks[i];
      if (!post || !mark) {
        sprite.visible = false;
        continue;
      }
      placeAt(sprite, post, view, pos.x + mark.dx, pos.y + mark.dy, tint);
    }
    if (sign) placeAt(this.sign, sign, view, pos.x, pos.y, tint);
    else this.sign.visible = false;
  }

  hide(): void {
    this.root.visible = false;
    this.sign.visible = false;
    for (const p of this.posts) p.visible = false;
    this.plot.clear();
  }

  private ensurePosts(n: number): void {
    while (this.posts.length < n) {
      const s = new Sprite();
      s.eventMode = "none";
      s.alpha = 0.85;
      this.root.addChild(s);
      this.posts.push(s);
    }
  }
}

function placeAt(sprite: Sprite, frame: PropFrame, view: MapView, x: number, y: number, tint: number): void {
  const world = gridToWorld(x, y, view.heightAt(x, y));
  sprite.visible = true;
  sprite.texture = frame.texture;
  sprite.tint = tint;
  sprite.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
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

/**
 * Debug fill of owned cells. Player tint at 50% alpha on the same diamonds as
 * hover. Off until the HUD toggle. Hover preview of a pending occupy disk is
 * a rim of those diamonds while the claim tool is armed.
 */
import { Container, Graphics } from "pixi.js";
import { PLAYER_COLORS, clampPlayer, gridToWorld, type GridPos } from "../../shared";
import { TOWER_RADIUS, forEachCircleBorder } from "../../shared/shape/mapCircle";
import type { MapView } from "../../sim/map/mapView";
import { UNOWNED, type LandView } from "../../sim/land/land";

export class LandLayer {
  readonly root = new Container();
  private readonly fill = new Graphics();
  private readonly preview = new Graphics();
  private view: MapView | null = null;
  private zoom = 1;
  private on = false;
  private painted = -1;
  private previewAt: GridPos | null = null;
  private previewPlayer = 0;

  constructor() {
    this.fill.eventMode = "none";
    this.preview.eventMode = "none";
    this.root.eventMode = "none";
    this.root.zIndex = 998_000;
    this.root.addChild(this.fill, this.preview);
  }

  setView(view: MapView | null): void {
    this.view = view;
    this.painted = -1;
  }

  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.paintPreview();
  }

  setOn(on: boolean): void {
    this.on = on;
    if (!on) {
      this.fill.clear();
      this.preview.clear();
      this.painted = -1;
    }
  }

  setPreview(pos: GridPos | null, player = 0): void {
    this.previewAt = pos;
    this.previewPlayer = player;
    this.paintPreview();
  }

  draw(land: LandView | undefined): void {
    if (!this.on || !this.view || !land) {
      this.fill.clear();
      this.painted = -1;
      return;
    }
    if (this.painted === land.generation) return;
    this.painted = land.generation;
    this.fill.clear();
    const view = this.view;
    const w = Math.min(land.width, view.width) - 1;
    const h = Math.min(land.height, view.height) - 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = land.playerAt(x, y);
        if (p === UNOWNED) continue;
        this.fill.poly(cellVerts(view, x, y)).fill({
          color: PLAYER_COLORS[clampPlayer(p)],
          alpha: 0.5,
        });
      }
    }
  }

  private paintPreview(): void {
    this.preview.clear();
    const view = this.view;
    const at = this.previewAt;
    if (!this.on || !view || !at) return;
    const color = PLAYER_COLORS[clampPlayer(this.previewPlayer)];
    const width = 1.25 / this.zoom;
    forEachCircleBorder(at.x, at.y, TOWER_RADIUS, (x, y) => {
      if (x < 0 || y < 0 || x >= view.width - 1 || y >= view.height - 1) return;
      this.preview.poly(cellVerts(view, x, y)).stroke({ color, width, alpha: 0.85, alignment: 0.5 });
    });
  }
}

function cellVerts(view: MapView, x: number, y: number): { x: number; y: number }[] {
  return [
    gridToWorld(x, y, view.heightAt(x, y)),
    gridToWorld(x + 1, y, view.heightAt(x + 1, y)),
    gridToWorld(x + 1, y + 1, view.heightAt(x + 1, y + 1)),
    gridToWorld(x, y + 1, view.heightAt(x, y + 1)),
  ];
}

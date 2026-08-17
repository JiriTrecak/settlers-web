/**
 * Pixi world: landscape mesh, decorations, buildings, placement ghost, hover/select, camera.
 * Reads `MapView`; never writes sim.
 */
import { Application, Container, Graphics, type Texture } from "pixi.js";
import { gridToWorld, pickCell, type GridPos } from "../../shared";
import type { BuildingKind } from "../../sim/data/buildings";
import type { MapDecoration } from "../../sim/decorations/decorations";
import type { MapView } from "../../sim/map/mapView";
import type { ViewSnapshot } from "../../sim/world/world";
import { BuildingLayer } from "../building/buildingLayer";
import { GhostLayer } from "../building/ghostLayer";
import type { BuildingSheets } from "../building/buildingSheets";
import { Camera } from "../camera/camera";
import { DecorationLayer } from "../decoration/decorationLayer";
import type { DecorationSheets } from "../decoration/decorationSheets";
import { buildLandscapeGeometry } from "../landscape/landscapeGeometry";
import { createLandscapeMesh } from "../landscape/landscapeMesh";
import { SettlerLayer } from "../settler/settlerLayer";
import type { SettlerSheets } from "../settler/settlerSheets";

export class Renderer {
  readonly camera = new Camera();
  readonly world = new Container();
  private readonly iso = new Container();
  private readonly decorations: DecorationLayer;
  private readonly buildings: BuildingLayer;
  private readonly settlers: SettlerLayer;
  private readonly ghostPlot = new GhostLayer();

  private view: MapView | null = null;
  private atlas: Texture | null = null;
  private waves: readonly MapDecoration[] = [];
  private readonly hover = new Graphics();
  private readonly select = new Graphics();

  constructor(private readonly app: Application) {
    this.app.stage.addChild(this.world);
    this.world.sortableChildren = true;
    this.iso.sortableChildren = true;
    this.iso.eventMode = "none";
    this.decorations = new DecorationLayer(this.iso);
    this.buildings = new BuildingLayer(this.iso);
    this.settlers = new SettlerLayer(this.iso);
    this.hover.eventMode = "none";
    this.select.eventMode = "none";
    this.hover.zIndex = 1_000_000;
    this.select.zIndex = 1_000_001;
    this.world.addChild(this.iso, this.select, this.hover, this.ghostPlot.root);
  }

  setAtlas(atlas: Texture | null): void {
    this.atlas = atlas;
    if (this.view) this.setView(this.view);
  }

  setSheets(sheets: DecorationSheets | null): void {
    this.decorations.setSheets(sheets);
  }

  setBuildingSheets(sheets: BuildingSheets | null): void {
    this.buildings.setSheets(sheets);
    this.ghostPlot.setSheets(sheets);
  }

  setSettlerSheets(sheets: SettlerSheets | null): void {
    this.settlers.setSheets(sheets);
  }

  setView(view: MapView, waves: readonly MapDecoration[] = this.waves, fit = true): void {
    this.view = view;
    this.waves = waves;
    const mesh = createLandscapeMesh(buildLandscapeGeometry(view), this.atlas);
    mesh.eventMode = "none";
    mesh.zIndex = -1;
    this.world.removeChildren();
    this.world.addChild(mesh, this.iso, this.select, this.hover, this.ghostPlot.root);
    this.decorations.setWaves(view, waves);
    this.buildings.setView(view);
    this.settlers.setView(view);
    this.ghostPlot.setView(view);

    if (fit) this.fitCamera();
    this.applyCamera();
  }

  /** Diamond AABB of the four map corners. Space / HUD fit calls this. */
  fitCamera(): void {
    const view = this.view;
    if (!view) return;
    const w = view.width;
    const h = view.height;
    const corners = [
      gridToWorld(0, 0),
      gridToWorld(w - 1, 0),
      gridToWorld(0, h - 1),
      gridToWorld(w - 1, h - 1),
    ];
    this.camera.fit(
      {
        minX: Math.min(...corners.map((c) => c.x)),
        maxX: Math.max(...corners.map((c) => c.x)),
        minY: Math.min(...corners.map((c) => c.y)),
        maxY: Math.max(...corners.map((c) => c.y)),
      },
      this.app.renderer.width,
      this.app.renderer.height,
    );
    this.applyCamera();
  }

  tick(nowMs: number): void {
    this.decorations.tick(nowMs);
  }

  /** Movables + map objects from the last sim snapshot. `alpha` is leftover ms into the next tick. */
  draw(snapshot: ViewSnapshot, alpha: number): void {
    this.decorations.syncObjects(snapshot.objects);
    this.buildings.sync(snapshot.buildings);
    this.settlers.draw(snapshot.movables, alpha);
  }

  applyCamera(): void {
    this.world.position.set(this.camera.panX, this.camera.panY);
    this.world.scale.set(this.camera.zoom);
    this.ghostPlot.setZoom(this.camera.zoom);
  }

  /** Screen pixel → cell whose height-displaced diamond is under the cursor. */
  pick(screen: { x: number; y: number }): GridPos | null {
    if (!this.view) return null;
    const world = this.camera.screenToWorld(screen.x, screen.y);
    const view = this.view;
    return pickCell(world.x, world.y, view.width, view.height, (x, y) => view.heightAt(x, y));
  }

  /** Diamond outline on the four verts of a cell, stroke width inverse to zoom. */
  highlight(pos: GridPos | null, kind: "hover" | "select"): void {
    const g = kind === "hover" ? this.hover : this.select;
    g.clear();
    if (!pos || !this.view) return;
    const { x, y } = pos;
    if (x >= this.view.width - 1 || y >= this.view.height - 1) return;
    const pts = [
      gridToWorld(x, y, this.view.heightAt(x, y)),
      gridToWorld(x + 1, y, this.view.heightAt(x + 1, y)),
      gridToWorld(x + 1, y + 1, this.view.heightAt(x + 1, y + 1)),
      gridToWorld(x, y + 1, this.view.heightAt(x, y + 1)),
    ];
    const color = kind === "hover" ? 0xfff3c4 : 0xffffff;
    g.poly(pts).stroke({
      color,
      width: 1.25 / this.camera.zoom,
      alignment: 0.5,
    });
  }

  /** Scaffold + footprint while a build tool is selected. `kind` null hides it. */
  ghost(kind: BuildingKind | null, pos: GridPos | null, ok: boolean): void {
    if (!kind || !pos) {
      this.ghostPlot.hide();
      return;
    }
    this.ghostPlot.setZoom(this.camera.zoom);
    this.ghostPlot.show(kind, pos, ok);
  }

  destroy(): void {
    this.world.removeFromParent();
    this.world.destroy({ children: true });
  }
}

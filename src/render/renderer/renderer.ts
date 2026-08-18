/**
 * Pixi world: landscape mesh, decorations, buildings, placement ghost, hover/select, camera.
 * Reads `MapView`; never writes sim. Debug path / ownership / fog overlays are HUD toggles.
 */
import { Application, Container, Geometry, Graphics, Mesh, Shader, type Texture } from "pixi.js";
import { gridToWorld, pickCell, type GridPos } from "../../shared";
import type { BuildingKind } from "../../sim/data/buildings";
import type { BuildingView } from "../../sim/building/building";
import type { MapDecoration } from "../../sim/decorations/decorations";
import type { FogView } from "../../sim/fog/fog";
import { FOG_VISIBLE } from "../../sim/fog/fog";
import type { MapView } from "../../sim/map/mapView";
import type { MapObjectView } from "../../sim/object/object";
import type { MovableView } from "../../sim/movable/movable";
import type { ViewSnapshot } from "../../sim/world/world";
import { BuildingLayer } from "../building/buildingLayer";
import { GhostLayer } from "../building/ghostLayer";
import type { BuildingSheets } from "../building/buildingSheets";
import { Camera } from "../camera/camera";
import { DecorationLayer } from "../decoration/decorationLayer";
import type { DecorationSheets } from "../decoration/decorationSheets";
import { buildLandscapeGeometry } from "../landscape/landscapeGeometry";
import { createLandscapeMesh } from "../landscape/landscapeMesh";
import { PathLayer } from "../debug/pathLayer";
import { LandLayer } from "../debug/landLayer";
import { BorderLayer } from "../land/borderLayer";
import { SettlerLayer } from "../settler/settlerLayer";
import type { SettlerSheets } from "../settler/settlerSheets";

export class Renderer {
  readonly camera = new Camera();
  readonly world = new Container();
  private readonly iso = new Container();
  private readonly decorations: DecorationLayer;
  private readonly buildings: BuildingLayer;
  private readonly settlers: SettlerLayer;
  private readonly borders: BorderLayer;
  private readonly ghostPlot = new GhostLayer();
  private readonly paths = new PathLayer();
  private readonly land = new LandLayer();

  private view: MapView | null = null;
  private atlas: Texture | null = null;
  private waves: readonly MapDecoration[] = [];
  private mesh: Mesh<Geometry, Shader> | null = null;
  private cells: Uint32Array | null = null;
  private mapWidth = 0;
  private fogGen = -1;
  private fog: FogView | null = null;
  private fogOn = true;
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
    this.borders = new BorderLayer(this.iso);
    this.hover.eventMode = "none";
    this.select.eventMode = "none";
    this.hover.zIndex = 1_000_000;
    this.select.zIndex = 1_000_001;
    this.world.addChild(this.iso, this.select, this.hover, this.ghostPlot.root, this.land.root, this.paths.root);
  }

  setAtlas(atlas: Texture | null): void {
    this.atlas = atlas;
    if (this.view) this.setView(this.view);
  }

  setSheets(sheets: DecorationSheets | null): void {
    this.decorations.setSheets(sheets);
    this.borders.setFrames(sheets?.border ?? []);
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
    const data = buildLandscapeGeometry(view);
    const mesh = createLandscapeMesh(data, this.atlas);
    mesh.eventMode = "none";
    mesh.zIndex = -1;
    this.mesh = mesh;
    this.cells = data.cells;
    this.mapWidth = data.width;
    this.fogGen = -1;
    this.world.removeChildren();
    this.world.addChild(mesh, this.iso, this.select, this.hover, this.ghostPlot.root, this.land.root, this.paths.root);
    this.decorations.setWaves(view, waves);
    this.buildings.setView(view);
    this.settlers.setView(view);
    this.ghostPlot.setView(view);
    this.paths.setView(view);
    this.land.setView(view);
    this.borders.setView(view);

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
    this.buildings.tick(nowMs);
  }

  /** Movables + map objects from the last sim snapshot. `alpha` is leftover ms into the next tick. */
  draw(snapshot: ViewSnapshot, alpha: number): void {
    const fog = this.fogOn ? snapshot.fog : CLEAR_FOG;
    this.fog = this.fogOn ? snapshot.fog : null;
    this.applyLandscapeFog(fog);
    this.decorations.setFog(this.fog);
    this.decorations.syncObjects(visibleObjects(snapshot, fog));
    this.buildings.sync(visibleBuildings(snapshot, fog), fog);
    this.settlers.draw(visibleMovables(snapshot.movables, fog), alpha, fog);
    this.paths.draw(snapshot.movables, alpha);
    this.land.draw(snapshot.land);
    this.borders.draw(snapshot.land, this.fogOn ? fog : undefined);
  }

  applyCamera(): void {
    this.world.position.set(this.camera.panX, this.camera.panY);
    this.world.scale.set(this.camera.zoom);
    this.ghostPlot.setZoom(this.camera.zoom);
    this.paths.setZoom(this.camera.zoom);
    this.land.setZoom(this.camera.zoom);
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
    if (!kind || !pos || (this.fog && this.fog.sightAt(pos.x, pos.y) === 0)) {
      this.ghostPlot.hide();
      return;
    }
    this.ghostPlot.setZoom(this.camera.zoom);
    this.ghostPlot.show(kind, pos, ok);
  }

  /** Remaining walk queues. Sticky until toggled off — F3 does not have to stay open. */
  setShowPaths(on: boolean): void {
    this.paths.setOn(on);
  }

  /** Owned cells, player tint at 50%. Sticky like paths. */
  setShowOwnership(on: boolean): void {
    this.land.setOn(on);
  }

  /** Fog of war. Off = full sight. Sticky like paths. Default on. */
  setShowFog(on: boolean): void {
    this.fogOn = on;
    this.fogGen = -1;
  }

  /** Claim-tool hover: rim of the disk that a click would stamp. */
  previewOccupy(pos: GridPos | null, player = 0): void {
    this.land.setPreview(pos, player);
  }

  /** Per-vert sight/100. Positions still use live height — snapshots are objects/huts only until flatten. */
  private applyLandscapeFog(fog: FogView): void {
    const mesh = this.mesh;
    const cells = this.cells;
    if (!mesh || !cells || this.fogGen === fog.generation) return;
    this.fogGen = fog.generation;
    const attr = mesh.geometry.attributes.aFog;
    if (!attr) return;
    const data = attr.buffer.data as Float32Array;
    const w = this.mapWidth;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i] ?? 0;
      data[i] = fog.sightAt(cell % w, (cell / w) | 0) / FOG_VISIBLE;
    }
    attr.buffer.update();
  }

  destroy(): void {
    this.world.removeFromParent();
    this.world.destroy({ children: true });
  }
}

function visibleObjects(snapshot: ViewSnapshot, fog: FogView): MapObjectView[] {
  const out: MapObjectView[] = [];
  for (const o of snapshot.objects) {
    if (fog.sightAt(o.x, o.y) === 0 || fog.isHidden(o.x, o.y)) continue;
    out.push(o);
  }
  fog.forEachHidden((_x, _y, tile) => {
    if (tile.object && fog.sightAt(tile.object.x, tile.object.y) > 0) out.push(tile.object);
  });
  return out;
}

function visibleBuildings(snapshot: ViewSnapshot, fog: FogView): BuildingView[] {
  const out: BuildingView[] = [];
  for (const b of snapshot.buildings) {
    if (fog.sightAt(b.x, b.y) === 0 || fog.isHidden(b.x, b.y)) continue;
    out.push(b);
  }
  fog.forEachHidden((_x, _y, tile) => {
    if (tile.building && fog.sightAt(tile.building.x, tile.building.y) > 0) out.push(tile.building);
  });
  return out;
}

function visibleMovables(movables: readonly MovableView[], fog: FogView): MovableView[] {
  return movables.filter((m) => fog.isClear(m.pos.x, m.pos.y));
}

/** Debug cheat: every tile fully lit, no snapshots. */
const CLEAR_FOG: FogView = {
  width: 0,
  height: 0,
  generation: 0,
  sightAt: () => FOG_VISIBLE,
  isHidden: () => false,
  hiddenAt: () => undefined,
  forEachHidden: () => undefined,
  isClear: () => true,
};

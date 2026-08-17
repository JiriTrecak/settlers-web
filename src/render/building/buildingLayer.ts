/**
 * Huts. Scaffold while `plan` / `building`; the finished sprite grows from the
 * bottom over the scaffold while bricklayers hammer (saw-edge mask, 10 teeth).
 * Depth is `isoDepth` on the shared iso container.
 *
 * Flags sit at `def.flag`, parented to the hut so the roof flag draws on top of
 * the building sprite (door flags stick out south and were already visible).
 * Torso is grayscale × player color.
 */
import { Container, Graphics, Sprite } from "pixi.js";
import { gridToWorld, isoDepth, ISO_DEPTH_BUILDING, PLAYER_COLORS, clampPlayer } from "../../shared";
import { buildingDef } from "../../sim/data/buildings";
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
  flagShadow: Sprite;
  flagBody: Sprite;
  flagTorso: Sprite;
  state: BuildingState;
  progress: number;
  building: BuildingView;
};

export class BuildingLayer {
  private sheets: BuildingSheets | null = null;
  private view: MapView | null = null;
  private drawn = new Map<number, Drawn>();
  private animationStep = 0;

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
      existing.building = b;
      if (existing.state === b.state && existing.progress === b.buildProgress) {
        this.paintFlag(existing, b, view, sheets, this.animationStep);
        continue;
      }
      this.apply(existing, b, view, sheets);
    }
    for (const [id, d] of this.drawn) {
      if (want.has(id)) continue;
      d.root.destroy({ children: true });
      this.drawn.delete(id);
    }
  }

  tick(nowMs: number): void {
    const sheets = this.sheets;
    const view = this.view;
    if (!sheets || !view) return;
    this.animationStep = ((nowMs / 100) | 0) & 0x7fffffff;
    for (const d of this.drawn.values()) this.paintFlag(d, d.building, view, sheets, this.animationStep);
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
    const flagShadow = new Sprite();
    flagShadow.eventMode = "none";
    const flagBody = new Sprite();
    flagBody.eventMode = "none";
    const flagTorso = new Sprite();
    flagTorso.eventMode = "none";
    root.addChild(shadow, scaffold, built, mask, flagShadow, flagBody, flagTorso);

    const drawn: Drawn = {
      id: b.id,
      root,
      scaffold,
      built,
      mask,
      shadow,
      flagShadow,
      flagBody,
      flagTorso,
      state: b.state,
      progress: b.buildProgress,
      building: b,
    };
    this.paint(drawn, sheet, world, z, b);
    this.paintFlag(drawn, b, view, sheets, this.animationStep);
    return drawn;
  }

  private apply(d: Drawn, b: BuildingView, view: MapView, sheets: BuildingSheets): void {
    const sheet = sheets[b.kind];
    if (!sheet) return;
    d.state = b.state;
    d.progress = b.buildProgress;
    d.building = b;
    const world = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
    this.paint(d, sheet, world, isoDepth(world.x, world.y, ISO_DEPTH_BUILDING), b);
    this.paintFlag(d, b, view, sheets, this.animationStep);
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

  private paintFlag(d: Drawn, b: BuildingView, view: MapView, sheets: BuildingSheets, step: number): void {
    const frames = b.flag === "door" ? sheets.flags.door : b.flag === "roof" ? sheets.flags.roof : undefined;
    if (!b.flag || !frames?.length) {
      d.flagShadow.visible = false;
      d.flagBody.visible = false;
      d.flagTorso.visible = false;
      return;
    }
    const def = buildingDef(b.kind);
    const fx = b.x + def.flag.dx;
    const fy = b.y + def.flag.dy;
    const flagWorld = gridToWorld(fx, fy, view.heightAt(fx, fy));
    const hutWorld = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
    const ox = flagWorld.x - hutWorld.x;
    const oy = flagWorld.y - hutWorld.y;
    const frame = frames[step % frames.length]!;
    d.flagBody.visible = true;
    d.flagBody.texture = frame.texture;
    d.flagBody.position.set(ox + frame.offsetX, oy + frame.offsetY);
    if (frame.torso) {
      d.flagTorso.visible = true;
      d.flagTorso.texture = frame.torso.texture;
      d.flagTorso.tint = PLAYER_COLORS[clampPlayer(b.player)];
      d.flagTorso.position.set(ox + frame.torso.offsetX, oy + frame.torso.offsetY);
    } else {
      d.flagTorso.visible = false;
    }
    if (frame.shadow) {
      d.flagShadow.visible = true;
      d.flagShadow.texture = frame.shadow.texture;
      d.flagShadow.position.set(ox + frame.shadow.offsetX, oy + frame.shadow.offsetY);
    } else {
      d.flagShadow.visible = false;
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

/**
 * Huts. Plan is fence posts (no sprite). Bricklayers grow the scaffold
 * through the first half of `buildProgress`, then the finished hut through
 * the second — saw-edge mask, 10 teeth. Depth is `isoDepth` on the shared iso container.
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
import type { FogView } from "../../sim/fog/fog";
import { FOG_VISIBLE } from "../../sim/fog/fog";
import type { BuildingSheet, BuildingSheets } from "./buildingSheets";
import { constructionVisual } from "./constructionVisual";
import { frameWorldSize, placeLayer, type PropFrame } from "../graphics/textures";

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
  sign: Sprite;
  signShadow: Sprite;
  posts: Sprite[];
  postShadows: Sprite[];
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

  sync(buildings: readonly BuildingView[], fog?: FogView): void {
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
      } else if (existing.state === b.state && existing.progress === b.buildProgress) {
        existing.building = b;
        const world = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
        existing.root.position.set(world.x, world.y);
        existing.root.zIndex = isoDepth(world.x, world.y, ISO_DEPTH_BUILDING);
        if (constructionVisual(b.buildProgress).fence) {
          this.paintFence(existing, b, view, sheets, true, world);
        }
        this.paintFlag(existing, b, view, sheets, this.animationStep);
      } else {
        this.apply(existing, b, view, sheets);
      }
      const drawn = this.drawn.get(b.id);
      if (drawn) this.tintFog(drawn, fog?.sightAt(b.x, b.y) ?? FOG_VISIBLE);
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
    const sign = new Sprite();
    sign.eventMode = "none";
    const signShadow = new Sprite();
    signShadow.eventMode = "none";
    const posts: Sprite[] = [];
    const postShadows: Sprite[] = [];
    for (let i = 0; i < buildingDef(b.kind).buildMarks.length; i++) {
      const post = new Sprite();
      post.eventMode = "none";
      posts.push(post);
      const postShadow = new Sprite();
      postShadow.eventMode = "none";
      postShadows.push(postShadow);
    }
    const flagShadow = new Sprite();
    flagShadow.eventMode = "none";
    const flagBody = new Sprite();
    flagBody.eventMode = "none";
    const flagTorso = new Sprite();
    flagTorso.eventMode = "none";
    root.addChild(shadow, signShadow, ...postShadows, scaffold, built, mask, sign, ...posts, flagShadow, flagBody, flagTorso);

    const drawn: Drawn = {
      id: b.id,
      root,
      scaffold,
      built,
      mask,
      shadow,
      sign,
      signShadow,
      posts,
      postShadows,
      flagShadow,
      flagBody,
      flagTorso,
      state: b.state,
      progress: b.buildProgress,
      building: b,
    };
    this.paint(drawn, sheet, world, z, b, view, sheets);
    this.paintFlag(drawn, b, view, sheets, this.animationStep);
    return drawn;
  }

  private tintFog(d: Drawn, sight: number): void {
    d.root.visible = sight > 0;
    d.root.alpha = sight / FOG_VISIBLE;
  }

  private apply(d: Drawn, b: BuildingView, view: MapView, sheets: BuildingSheets): void {
    const sheet = sheets[b.kind];
    if (!sheet) return;
    d.state = b.state;
    d.progress = b.buildProgress;
    d.building = b;
    const world = gridToWorld(b.x, b.y, view.heightAt(b.x, b.y));
    this.paint(d, sheet, world, isoDepth(world.x, world.y, ISO_DEPTH_BUILDING), b, view, sheets);
    this.paintFlag(d, b, view, sheets, this.animationStep);
  }

  private paint(
    d: Drawn,
    sheet: BuildingSheet,
    world: { x: number; y: number },
    z: number,
    b: BuildingView,
    view: MapView,
    sheets: BuildingSheets,
  ): void {
    d.root.zIndex = z;
    d.root.position.set(world.x, world.y);
    placeLayer(d.scaffold, sheet.scaffold, 0, 0);
    placeLayer(d.built, sheet.built, 0, 0);

    const vis = constructionVisual(b.buildProgress);
    paintLayer(d.scaffold, d.mask, sheet.scaffold, vis.scaffold);
    paintLayer(d.built, d.mask, sheet.built, vis.built);
    const growing = (vis.scaffold > 0 && vis.scaffold < 1) || (vis.built > 0 && vis.built < 1);
    d.mask.visible = growing;
    if (!growing) {
      d.scaffold.mask = null;
      d.built.mask = null;
      d.mask.clear();
    }
    this.paintFence(d, b, view, sheets, vis.fence, world);

    const shadowFrame = vis.built >= 1 ? sheet.built.shadow : vis.scaffold > 0 ? sheet.scaffold.shadow : undefined;
    if (shadowFrame && !vis.fence) {
      d.shadow.visible = true;
      placeLayer(d.shadow, shadowFrame, 0, 0);
    } else {
      d.shadow.visible = false;
    }
  }

  private paintFence(
    d: Drawn,
    b: BuildingView,
    view: MapView,
    sheets: BuildingSheets,
    on: boolean,
    hutWorld: { x: number; y: number },
  ): void {
    const post = sheets.sitePost;
    const sign = sheets.siteSign;
    if (!on || !post) {
      d.sign.visible = false;
      d.signShadow.visible = false;
      for (const s of d.posts) s.visible = false;
      for (const s of d.postShadows) s.visible = false;
      return;
    }
    const marks = buildingDef(b.kind).buildMarks;
    for (let i = 0; i < d.posts.length; i++) {
      const mark = marks[i];
      const body = d.posts[i]!;
      const shadow = d.postShadows[i]!;
      if (!mark) {
        body.visible = false;
        shadow.visible = false;
        continue;
      }
      const at = { x: b.x + mark.dx, y: b.y + mark.dy };
      placeRelative(body, post, hutWorld, view, at);
      if (post.shadow) placeRelative(shadow, post.shadow, hutWorld, view, at);
      else shadow.visible = false;
    }
    if (sign) {
      placeRelative(d.sign, sign, hutWorld, view, b);
      if (sign.shadow) placeRelative(d.signShadow, sign.shadow, hutWorld, view, b);
      else d.signShadow.visible = false;
    } else {
      d.sign.visible = false;
      d.signShadow.visible = false;
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
    placeLayer(d.flagBody, frame, ox, oy);
    if (frame.torso) {
      d.flagTorso.visible = true;
      d.flagTorso.tint = PLAYER_COLORS[clampPlayer(b.player)];
      placeLayer(d.flagTorso, frame.torso, ox, oy);
    } else {
      d.flagTorso.visible = false;
    }
    if (frame.shadow) {
      d.flagShadow.visible = true;
      placeLayer(d.flagShadow, frame.shadow, ox, oy);
    } else {
      d.flagShadow.visible = false;
    }
  }
}

function placeRelative(
  sprite: Sprite,
  frame: { texture: Sprite["texture"]; offsetX: number; offsetY: number; px: number },
  hutWorld: { x: number; y: number },
  view: MapView,
  at: { x: number; y: number },
): void {
  const world = gridToWorld(at.x, at.y, view.heightAt(at.x, at.y));
  sprite.visible = true;
  placeLayer(sprite, frame, world.x - hutWorld.x, world.y - hutWorld.y);
}

function paintLayer(sprite: Sprite, mask: Graphics, frame: PropFrame, amount: number): void {
  if (amount <= 0) {
    sprite.visible = false;
    if (sprite.mask === mask) sprite.mask = null;
    return;
  }
  sprite.visible = true;
  if (amount >= 1) {
    if (sprite.mask === mask) sprite.mask = null;
    return;
  }
  paintGrowMask(mask, frame, amount);
  sprite.mask = mask;
  mask.visible = true;
}

/** Bottom-up clip plus a saw edge. */
function paintGrowMask(g: Graphics, frame: PropFrame, progress: number): void {
  g.clear();
  const { w, h } = frameWorldSize(frame);
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

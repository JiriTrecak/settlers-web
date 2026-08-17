/**
 * Movable sprites. Interpolates `from`→`pos` with moveProgress (+ frame leftover).
 * One container per unit: shadow → body → torso so player-color clothing stays on top.
 */
import { Container, Graphics, Sprite } from "pixi.js";
import { gridToWorld } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import type { MovableView } from "../../sim/movable/movable";
import type { PropFrame } from "../graphics/textures";
import { PLAYER_COLORS, clampPlayer } from "../../shared";
import type { SettlerSheets } from "./settlerSheets";

type Drawn = {
  id: number;
  root: Container;
  body: Sprite;
  torso: Sprite;
  shadow: Sprite;
  fallback: Graphics;
};

export class SettlerLayer {
  readonly root = new Container();
  private sheets: SettlerSheets | null = null;
  private view: MapView | null = null;
  private drawn = new Map<number, Drawn>();

  constructor() {
    this.root.eventMode = "none";
    this.root.sortableChildren = true;
  }

  setSheets(sheets: SettlerSheets | null): void {
    this.sheets = sheets;
  }

  setView(view: MapView | null): void {
    this.view = view;
  }

  /** `alpha` is leftover accumulator / tickMs — visual only, not sim. */
  draw(movables: readonly MovableView[], alpha: number): void {
    const view = this.view;
    if (!view) return;
    const seen = new Set<number>();
    for (const m of movables) {
      seen.add(m.id);
      const drawn = this.ensure(m);
      const p = visualProgress(m, alpha);
      const x = m.from.x + (m.pos.x - m.from.x) * p;
      const y = m.from.y + (m.pos.y - m.from.y) * p;
      const h0 = view.heightAt(m.from.x, m.from.y);
      const h1 = view.heightAt(m.pos.x, m.pos.y);
      const world = gridToWorld(x, y, h0 + (h1 - h0) * p);
      drawn.root.zIndex = (y * 2 + 2) | 0;
      const frame = this.frameOf(m, p);
      if (frame) {
        drawn.fallback.visible = false;
        drawn.body.visible = true;
        drawn.body.texture = frame.texture;
        drawn.body.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
        if (frame.torso) {
          drawn.torso.visible = true;
          drawn.torso.texture = frame.torso.texture;
          drawn.torso.tint = PLAYER_COLORS[clampPlayer(m.player)];
          drawn.torso.position.set(world.x + frame.torso.offsetX, world.y + frame.torso.offsetY);
        } else {
          drawn.torso.visible = false;
        }
        if (frame.shadow) {
          drawn.shadow.visible = true;
          drawn.shadow.texture = frame.shadow.texture;
          drawn.shadow.position.set(world.x + frame.shadow.offsetX, world.y + frame.shadow.offsetY);
        } else {
          drawn.shadow.visible = false;
        }
      } else {
        drawn.body.visible = false;
        drawn.torso.visible = false;
        drawn.shadow.visible = false;
        drawn.fallback.visible = true;
        drawn.fallback.position.set(world.x, world.y);
      }
    }
    for (const [id, d] of this.drawn) {
      if (seen.has(id)) continue;
      d.root.destroy({ children: true });
      this.drawn.delete(id);
    }
  }

  private ensure(m: MovableView): Drawn {
    const existing = this.drawn.get(m.id);
    if (existing) return existing;
    const unit = new Container();
    unit.eventMode = "none";
    const shadow = new Sprite();
    shadow.eventMode = "none";
    const body = new Sprite();
    body.eventMode = "none";
    const torso = new Sprite();
    torso.eventMode = "none";
    const fallback = new Graphics();
    fallback.eventMode = "none";
    fallback.circle(0, -4, 4).fill({ color: 0xe8c36a });
    unit.addChild(shadow, body, torso, fallback);
    this.root.addChild(unit);
    const drawn: Drawn = { id: m.id, root: unit, body, torso, shadow, fallback };
    this.drawn.set(m.id, drawn);
    return drawn;
  }

  private frameOf(m: MovableView, progress: number): PropFrame | null {
    const sheets = this.sheets;
    if (!sheets) return null;
    const clip = m.action === "walk" ? sheets.walk[m.direction] : sheets.idle[m.direction];
    if (!clip || clip.length === 0) return null;
    if (m.action === "walk") {
      const i = progress >= 1 ? clip.length - 1 : (progress * clip.length) | 0;
      return clip[i] ?? clip[0]!;
    }
    return clip[0]!;
  }
}

function visualProgress(m: MovableView, alpha: number): number {
  if (m.action !== "walk") return 0;
  return Math.min(1, m.moveProgress + alpha / m.stepTicks);
}

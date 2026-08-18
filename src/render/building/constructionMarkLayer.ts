/**
 * Screen-wide construction marks while a hut is selected.
 * One original pip (file 4 seq 6) per placeable origin: frame 0 = level/green,
 * last frame = steep. Illegal origins stay empty.
 */
import { Container, Sprite } from "pixi.js";
import { gridToWorld } from "../../shared";
import { constructionMarkFrame } from "../../sim/building/flatten";
import type { MapView } from "../../sim/map/mapView";
import type { PropFrame } from "../graphics/textures";

export type ConstructionMark = { x: number; y: number; value: number };

export class ConstructionMarkLayer {
  readonly root = new Container();
  private frames: PropFrame[] = [];
  private view: MapView | null = null;
  private readonly sprites: Sprite[] = [];

  constructor() {
    this.root.eventMode = "none";
  }

  setFrames(frames: readonly PropFrame[]): void {
    this.frames = frames.slice();
  }

  setView(view: MapView | null): void {
    this.view = view;
  }

  show(marks: readonly ConstructionMark[]): void {
    const view = this.view;
    const frames = this.frames;
    if (!view || frames.length === 0) {
      this.hide();
      return;
    }
    this.root.visible = true;
    this.ensure(marks.length);
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i]!;
      const mark = marks[i];
      if (!mark) {
        sprite.visible = false;
        continue;
      }
      const frame = frames[constructionMarkFrame(mark.value, frames.length)]!;
      const world = gridToWorld(mark.x, mark.y, view.heightAt(mark.x, mark.y));
      sprite.visible = true;
      sprite.texture = frame.texture;
      sprite.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
    }
  }

  hide(): void {
    this.root.visible = false;
    for (const s of this.sprites) s.visible = false;
  }

  private ensure(n: number): void {
    while (this.sprites.length < n) {
      const s = new Sprite();
      s.eventMode = "none";
      this.root.addChild(s);
      this.sprites.push(s);
    }
  }
}

/**
 * Player-tinted occupy rim. Catalog `props/border` (GFX file 13 seq 65).
 * Always on — this is the land edge, not an F3 overlay. Sits at wave depth
 * so trees and huts cover the posts.
 */
import { Container, Sprite } from "pixi.js";
import { PLAYER_COLORS, clampPlayer, gridToWorld, isoDepth, ISO_DEPTH_WAVE } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import { UNOWNED, type LandView } from "../../sim/land/land";
import type { PropFrame } from "../graphics/textures";

type Post = {
  key: string;
  body: Sprite;
  torso: Sprite;
  shadow: Sprite;
  x: number;
  y: number;
};

export class BorderLayer {
  private frames: PropFrame[] = [];
  private view: MapView | null = null;
  private painted = -1;
  private readonly posts = new Map<string, Post>();

  constructor(private readonly parent: Container) {}

  setFrames(frames: PropFrame[]): void {
    this.frames = frames;
  }

  setView(view: MapView | null): void {
    this.view = view;
    this.painted = -1;
  }

  draw(land: LandView | undefined): void {
    const view = this.view;
    const frame = this.frames[0];
    if (!view || !frame || !land) {
      this.clear();
      return;
    }
    if (this.painted === land.generation) return;
    this.painted = land.generation;
    const want = new Set<string>();
    const w = land.width;
    const h = land.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!land.isBorder(x, y)) continue;
        const p = land.playerAt(x, y);
        if (p === UNOWNED) continue;
        const key = `${x},${y}`;
        want.add(key);
        const existing = this.posts.get(key);
        if (existing) {
          this.place(existing, view, frame, x, y, p);
          continue;
        }
        this.posts.set(key, this.spawn(view, frame, x, y, p));
      }
    }
    for (const [key, post] of this.posts) {
      if (want.has(key)) continue;
      post.body.destroy();
      post.torso.destroy();
      post.shadow.destroy();
      this.posts.delete(key);
    }
  }

  private spawn(view: MapView, frame: PropFrame, x: number, y: number, player: number): Post {
    const body = new Sprite(frame.texture);
    const torso = new Sprite();
    const shadow = new Sprite();
    body.eventMode = "none";
    torso.eventMode = "none";
    shadow.eventMode = "none";
    this.parent.addChild(shadow, body, torso);
    const post: Post = { key: `${x},${y}`, body, torso, shadow, x, y };
    this.place(post, view, frame, x, y, player);
    return post;
  }

  private place(post: Post, view: MapView, frame: PropFrame, x: number, y: number, player: number): void {
    const world = gridToWorld(x, y, view.heightAt(x, y));
    const z = isoDepth(world.x, world.y, ISO_DEPTH_WAVE);
    post.body.texture = frame.texture;
    post.body.position.set(world.x + frame.offsetX, world.y + frame.offsetY);
    post.body.zIndex = z;
    const color = PLAYER_COLORS[clampPlayer(player)];
    if (frame.torso) {
      post.torso.visible = true;
      post.torso.texture = frame.torso.texture;
      post.torso.tint = color;
      post.torso.position.set(world.x + frame.torso.offsetX, world.y + frame.torso.offsetY);
      post.torso.zIndex = z;
      post.body.tint = 0xffffff;
    } else {
      post.torso.visible = false;
      post.body.tint = color;
    }
    if (frame.shadow) {
      post.shadow.visible = true;
      post.shadow.texture = frame.shadow.texture;
      post.shadow.position.set(world.x + frame.shadow.offsetX, world.y + frame.shadow.offsetY);
      post.shadow.zIndex = z;
    } else {
      post.shadow.visible = false;
    }
  }

  private clear(): void {
    for (const post of this.posts.values()) {
      post.body.destroy();
      post.torso.destroy();
      post.shadow.destroy();
    }
    this.posts.clear();
    this.painted = -1;
  }
}

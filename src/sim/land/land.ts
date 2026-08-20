/**
 * Player land. Finished occupying buildings and debug clicks stamp a
 * radius-40 disk. Pioneers flip **one** unenforced tile (`towerCount == 0`);
 * they do not steal tower-covered ground. Tiles already enforced by another
 * player's occupy are left alone except the tower ground cell, which is always taken.
 *
 * No goods partitions — owner + tower-count only. Overlapping same-player
 * disks increment the counter so a later release can restore the rest.
 */
import {
  TOWER_RADIUS,
  circleContains,
  distanceSquared,
  forEachCircleTile,
} from "../../shared/shape/mapCircle";
import { HEX_DELTAS } from "../../shared";
import { decodeI8, encodeI8 } from "../world/bytes";
import type { LandOccupySnap } from "../world/snapshot";

export const UNOWNED = -1;

export type LandView = {
  width: number;
  height: number;
  generation: number;
  playerAt(x: number, y: number): number;
  isBorder(x: number, y: number): boolean;
};

type Occupy = {
  player: number;
  x: number;
  y: number;
  radius: number;
};

export class LandGrid {
  readonly width: number;
  readonly height: number;
  generation = 0;
  private readonly owner: Int8Array;
  private readonly towers: Int8Array;
  private readonly borders: Uint8Array;
  private readonly occupies: Occupy[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.owner = new Int8Array(width * height).fill(UNOWNED);
    this.towers = new Int8Array(width * height);
    this.borders = new Uint8Array(width * height);
  }

  capture(): { generation: number; owner: string; towers: string; occupies: LandOccupySnap[] } {
    return {
      generation: this.generation,
      owner: encodeI8(this.owner),
      towers: encodeI8(this.towers),
      occupies: this.occupies.map((o) => ({ player: o.player, x: o.x, y: o.y, radius: o.radius })),
    };
  }

  restore(
    snap: { generation: number; owner: string; towers: string; occupies: LandOccupySnap[] },
    blocked: (x: number, y: number) => boolean,
  ): boolean {
    const n = this.width * this.height;
    const owner = decodeI8(snap.owner, n);
    const towers = decodeI8(snap.towers, n);
    if (!owner || !towers) return false;
    this.owner.set(owner);
    this.towers.set(towers);
    this.occupies.length = 0;
    for (const o of snap.occupies) this.occupies.push({ player: o.player, x: o.x, y: o.y, radius: o.radius });
    this.generation = snap.generation;
    this.rebuildBorders(blocked);
    return true;
  }

  playerAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return UNOWNED;
    return this.owner[y * this.width + x] ?? UNOWNED;
  }

  /** Same player, or no occupy disks yet (test maps without HQ). */
  owns(x: number, y: number, player: number): boolean {
    if (!this.hasLand()) return true;
    return this.playerAt(x, y) === player;
  }

  isBorder(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.borders[y * this.width + x] === 1;
  }

  /** Any occupy disk has been stamped — placement starts requiring owner. */
  hasLand(): boolean {
    return this.occupies.length > 0;
  }

  /** This player already has at least one occupy disk (not pioneer tiles). */
  hasPlayer(player: number): boolean {
    return this.occupies.some((o) => o.player === player);
  }

  ownsFootprint(rels: readonly { dx: number; dy: number }[], at: { x: number; y: number }, player: number): boolean {
    return rels.every((r) => this.playerAt(at.x + r.dx, at.y + r.dy) === player);
  }

  /** Plot is in-bounds and nobody owns it — fair game for a player's first HQ. */
  unownedFootprint(rels: readonly { dx: number; dy: number }[], at: { x: number; y: number }): boolean {
    return rels.every((r) => {
      const x = at.x + r.dx;
      const y = at.y + r.dy;
      return this.inBounds(x, y) && this.playerAt(x, y) === UNOWNED;
    });
  }

  towerCountAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.towers[y * this.width + x] ?? 0;
  }

  /** Unenforced and not already this player's. Buildings/water are the caller's problem. */
  canClaim(x: number, y: number, player: number): boolean {
    if (!this.inBounds(x, y)) return false;
    if (this.towerCountAt(x, y) > 0) return false;
    return this.playerAt(x, y) !== player;
  }

  view(): LandView {
    return {
      width: this.width,
      height: this.height,
      generation: this.generation,
      playerAt: (x, y) => this.playerAt(x, y),
      isBorder: (x, y) => this.isBorder(x, y),
    };
  }

  /**
   * Stamp a tower disk at `at` for `player`. Same-player overlap extends the
   * blob and bumps counters. Enemy tiles with towerCount > 0 stay put, except
   * the ground cell (the click). `blocked` skips water for the rim posts.
   */
  occupy(
    at: { x: number; y: number },
    player: number,
    radius = TOWER_RADIUS,
    blocked: (x: number, y: number) => boolean = () => false,
  ): void {
    if (!this.inBounds(at.x, at.y)) return;
    const tower: Occupy = { player, x: at.x, y: at.y, radius };
    const idx = at.y * this.width + at.x;
    this.towers[idx] = 0;
    this.takeDisk(tower);
    this.occupies.push(tower);
    this.recountGround(tower);
    this.rebuildBorders(blocked);
    this.generation += 1;
  }

  /**
   * Pioneer: take one unenforced tile. `towerCount > 0` stays put (no ground-cell
   * steal — that exception is tower occupy only). Does not bump tower counts.
   */
  claim(
    at: { x: number; y: number },
    player: number,
    blocked: (x: number, y: number) => boolean = () => false,
  ): boolean {
    if (!this.inBounds(at.x, at.y)) return false;
    const i = at.y * this.width + at.x;
    if ((this.towers[i] ?? 0) > 0) return false;
    if (this.owner[i] === player) return false;
    this.owner[i] = player;
    this.rebuildBorders(blocked);
    this.generation += 1;
    return true;
  }
  release(
    at: { x: number; y: number },
    blocked: (x: number, y: number) => boolean = () => false,
  ): void {
    const i = this.occupies.findIndex((o) => o.x === at.x && o.y === at.y);
    if (i < 0) return;
    const remaining = this.occupies.filter((_, k) => k !== i);
    this.occupies.length = 0;
    this.owner.fill(UNOWNED);
    this.towers.fill(0);
    this.borders.fill(0);
    if (remaining.length === 0) {
      this.generation += 1;
      return;
    }
    for (const t of remaining) this.occupy({ x: t.x, y: t.y }, t.player, t.radius, blocked);
  }

  /**
   * Owned, not blocked, and a hex neighbor is a different owner (also not blocked).
   * Water neighbors do not make a rim.
   */
  rebuildBorders(blocked: (x: number, y: number) => boolean): void {
    this.borders.fill(0);
    const w = this.width;
    const h = this.height;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (blocked(x, y)) continue;
        const p = this.owner[y * w + x] ?? UNOWNED;
        if (p < 0) continue;
        for (const { dx, dy } of HEX_DELTAS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (blocked(nx, ny)) continue;
          if ((this.owner[ny * w + nx] ?? UNOWNED) !== p) {
            this.borders[y * w + x] = 1;
            break;
          }
        }
      }
    }
  }

  private takeDisk(tower: Occupy): void {
    const { player, radius } = tower;
    forEachCircleTile(tower.x, tower.y, radius, (x, y) => {
      if (!this.inBounds(x, y)) return;
      const i = y * this.width + x;
      if ((this.towers[i] ?? 0) <= 0 && this.owner[i] !== player) this.owner[i] = player;
    });
    forEachCircleTile(tower.x, tower.y, radius, (x, y) => {
      if (!this.inBounds(x, y)) return;
      const i = y * this.width + x;
      if (this.owner[i] === player) this.towers[i] = (this.towers[i] ?? 0) + 1;
    });
  }

  private recountGround(tower: Occupy): void {
    const i = tower.y * this.width + tower.x;
    this.towers[i] = 0;
    for (const other of this.occupies) {
      if (other.player !== tower.player || !this.circlesOverlap(tower, other)) continue;
      if (this.areaContains(other, tower.x, tower.y)) this.towers[i] = (this.towers[i] ?? 0) + 1;
    }
  }

  private areaContains(tower: Occupy, x: number, y: number): boolean {
    return this.inBounds(x, y) && circleContains(tower.x, tower.y, tower.radius, x, y);
  }

  private circlesOverlap(a: Occupy, b: Occupy): boolean {
    const sq = distanceSquared(a.x, a.y, b.x, b.y) | 0;
    const max = a.radius + b.radius;
    return sq <= max * max;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
}

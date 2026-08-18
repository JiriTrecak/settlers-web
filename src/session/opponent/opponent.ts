/**
 * Other slot: delay-enqueue the same Actions a human would click.
 * Not a brain — no construction finder, no extra fog.
 */
import { hexDist, type GridPos } from "../../shared";
import type { World } from "../../sim";

/** ~2s at 25ms. Pioneer toward the human HQ. */
export const OPPONENT_CONVERT_TICK = 80;
/** ~5s. Tower plan on own land toward the opponent. */
export const OPPONENT_TOWER_TICK = 200;

export class Opponent {
  private phase = 0;

  constructor(
    readonly player: number,
    private readonly home: GridPos,
    private readonly toward: GridPos,
  ) {}

  /** Call after `world.tick()`. Enqueues for the next beat. */
  onTick(world: World): void {
    const t = world.clock.tickIndex;
    if (this.phase === 0 && t >= OPPONENT_CONVERT_TICK && this.convertPioneer(world)) this.phase = 1;
    if (this.phase >= 1 && this.phase < 2 && t >= OPPONENT_TOWER_TICK && this.placeTower(world)) this.phase = 2;
  }

  private convertPioneer(world: World): boolean {
    const id = this.idleBearerId(world);
    if (id == null) return false;
    world.enqueue({ type: "convert", id, to: "pioneer" });
    world.enqueue({ type: "pioneerWork", id, to: this.toward });
    return true;
  }

  private placeTower(world: World): boolean {
    const seed = stepToward(this.home, this.toward, 16);
    const at = findTower(world, seed, this.player) ?? findTower(world, this.home, this.player);
    if (!at) return false;
    world.enqueue({ type: "placeBuilding", kind: "tower", at, player: this.player });
    return true;
  }

  private idleBearerId(world: World): number | null {
    for (const v of world.view(this.player).movables) {
      if (v.player !== this.player || v.type !== "bearer" || v.inside) continue;
      const m = world.movable(v.id);
      if (m && m.material === "none") return m.id;
    }
    return null;
  }
}

function stepToward(from: GridPos, to: GridPos, steps: number): GridPos {
  let x = from.x;
  let y = from.y;
  for (let i = 0; i < steps; i++) {
    const sx = Math.sign(to.x - x);
    const sy = Math.sign(to.y - y);
    if (sx === 0 && sy === 0) break;
    x += sx;
    y += sy;
  }
  return { x, y };
}

function findTower(world: World, around: GridPos, player: number): GridPos | null {
  if (world.canPlaceBuilding("tower", around, player)) return around;
  for (let r = 1; r <= 28; r++) {
    for (let y = around.y - r; y <= around.y + r; y++) {
      for (let x = around.x - r; x <= around.x + r; x++) {
        if (hexDist(around.x, around.y, x, y) !== r) continue;
        if (!world.grid.inBounds(x, y)) continue;
        if (world.canPlaceBuilding("tower", { x, y }, player)) return { x, y };
      }
    }
  }
  return null;
}

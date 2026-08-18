/**
 * Other slots: every ~5s send the same Actions a human would click.
 * Economy first (lumberjack → sawmill → stonecutter), then extra towers toward the local HQ.
 */
import { hexDist, type Action, type GridPos } from "../../shared";
import type { BuildingKind, World } from "../../sim";

/** First think (~2s at 25ms). */
export const OPPONENT_START_TICK = 80;
/** Cadence between thinks (~5s). */
export const OPPONENT_THINK_TICKS = 200;

const ECONOMY = ["lumberjack", "sawmill", "stonecutter"] as const;

export class Opponent {
  private lastThink = -1;

  constructor(
    readonly player: number,
    private readonly home: GridPos,
    private readonly toward: GridPos,
    private readonly send: (action: Action) => void,
  ) {}

  /** Call after `world.tick()`. Sends for this slot's next confirm (tick + D). */
  onTick(world: World): void {
    const t = world.clock.tickIndex;
    if (t < OPPONENT_START_TICK) return;
    if (this.lastThink >= 0 && t - this.lastThink < OPPONENT_THINK_TICKS) return;
    this.lastThink = t;
    this.think(world);
  }

  private think(world: World): void {
    if (this.convertPioneer(world)) return;
    this.nudgePioneer(world);
    const huts = world.view(this.player).buildings.filter((b) => b.player === this.player);
    for (const kind of ECONOMY) {
      if (!huts.some((b) => b.kind === kind)) {
        this.placeHut(world, kind);
        return;
      }
      if (huts.some((b) => b.kind === kind && b.state !== "built")) return;
    }
    if (huts.some((b) => b.kind === "tower" && b.state !== "built")) return;
    this.placeHut(world, "tower");
  }

  private convertPioneer(world: World): boolean {
    const snap = world.view(this.player);
    if (snap.movables.some((m) => m.player === this.player && m.type === "pioneer")) return false;
    const id = this.idleBearerId(world);
    if (id == null) return false;
    this.send({ type: "convert", id, to: "pioneer" });
    this.send({ type: "pioneerWork", id, to: this.toward });
    return true;
  }

  private nudgePioneer(world: World): void {
    for (const v of world.view(this.player).movables) {
      if (v.player !== this.player || v.type !== "pioneer" || v.job) continue;
      this.send({ type: "pioneerWork", id: v.id, to: this.toward });
    }
  }

  private placeHut(world: World, kind: (typeof ECONOMY)[number] | "tower"): void {
    const at = this.seedFor(world, kind);
    const pos = findPlace(world, kind, at, this.player) ?? findPlace(world, kind, this.home, this.player);
    if (!pos) return;
    this.send({ type: "placeBuilding", kind, at: pos, player: this.player });
  }

  private seedFor(world: World, kind: BuildingKind): GridPos {
    if (kind === "lumberjack") return nearestResource(world, this.player, this.home, "tree") ?? this.home;
    if (kind === "stonecutter") return nearestResource(world, this.player, this.home, "stone") ?? this.home;
    if (kind === "sawmill") {
      const lj = world.view(this.player).buildings.find((b) => b.player === this.player && b.kind === "lumberjack");
      return lj ? { x: lj.x, y: lj.y } : this.home;
    }
    return this.towerSeed(world);
  }

  private towerSeed(world: World): GridPos {
    let seed = this.home;
    let best = hexDist(this.home.x, this.home.y, this.toward.x, this.toward.y);
    for (const b of world.view(this.player).buildings) {
      if (b.player !== this.player || b.kind !== "tower" || b.state !== "built") continue;
      const d = hexDist(b.x, b.y, this.toward.x, this.toward.y);
      if (d < best) {
        best = d;
        seed = { x: b.x, y: b.y };
      }
    }
    return stepToward(seed, this.toward, 16);
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

function nearestResource(world: World, player: number, from: GridPos, kind: "tree" | "stone"): GridPos | null {
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (const obj of world.view(player).objects) {
    if (obj.kind !== kind) continue;
    if (kind === "tree" && (obj.growing || (obj.stateProgress ?? 1) < 1)) continue;
    if (kind === "stone" && obj.capacity <= 0) continue;
    const d = hexDist(from.x, from.y, obj.x, obj.y);
    if (d > 56) continue;
    if (d < bestD) {
      bestD = d;
      best = { x: obj.x, y: obj.y };
    }
  }
  return best;
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

function findPlace(world: World, kind: BuildingKind, around: GridPos, player: number, maxR = 36): GridPos | null {
  if (world.canPlaceBuilding(kind, around, player)) return around;
  for (let r = 1; r <= maxR; r++) {
    for (let y = around.y - r; y <= around.y + r; y++) {
      for (let x = around.x - r; x <= around.x + r; x++) {
        if (hexDist(around.x, around.y, x, y) !== r) continue;
        if (!world.grid.inBounds(x, y)) continue;
        if (world.canPlaceBuilding(kind, { x, y }, player)) return { x, y };
      }
    }
  }
  return null;
}

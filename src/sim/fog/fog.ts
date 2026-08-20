/**
 * Per-player fog. Sight is 0–100. View circles (buildings + units) bump
 * per-tile ref buckets; the dimmer walks sight toward that target and never
 * drops a once-seen tile below explored (50). Crossing into explored freezes
 * landscape / height / object / hut for the renderer.
 *
 * Sim stays omniscient — this is a view layer. No extra threads: World ticks it.
 */
import { landscapeIndex, LANDSCAPE_TYPES, type LandscapeType } from "../../shared";
import type { GridPos } from "../../shared";
import type { BuildingView } from "../building/building";
import { buildingDef } from "../data/buildings";
import type { MapObjectView } from "../object/object";
import { viewCircle } from "./viewCircle";
import {
  FOG_DIM,
  FOG_EXPLORED,
  FOG_REF_STEP,
  FOG_VISIBLE,
  UNCONSTRUCTED_VIEW_DISTANCE,
  UNOCCUPIED_VIEW_DISTANCE,
} from "./constants";
import { decodeU8, encodeU8 } from "../world/bytes";
import type { FogLayerSnap } from "../world/snapshot";

export {
  DEFAULT_UNIT_VIEW_DISTANCE,
  FOG_DIM,
  FOG_EXPLORED,
  FOG_PADDING,
  FOG_REF_STEP,
  FOG_VISIBLE,
  MAX_VIEW_DISTANCE,
  UNCONSTRUCTED_VIEW_DISTANCE,
  UNOCCUPIED_VIEW_DISTANCE,
} from "./constants";

export type HiddenTile = {
  landscape: LandscapeType;
  height: number;
  object?: MapObjectView;
  building?: BuildingView;
};

export type FogView = {
  width: number;
  height: number;
  player: number;
  generation: number;
  sightAt(x: number, y: number): number;
  isHidden(x: number, y: number): boolean;
  hiddenAt(x: number, y: number): HiddenTile | undefined;
  forEachHidden(fn: (x: number, y: number, tile: HiddenTile) => void): void;
  /** Currently lit — units and border posts draw. */
  isClear(x: number, y: number): boolean;
};

export type FogWorld = {
  landscapeAt(x: number, y: number): LandscapeType;
  heightAt(x: number, y: number): number;
  objectAt(x: number, y: number): MapObjectView | undefined;
  buildingAt(x: number, y: number): BuildingView | undefined;
};

type PlayerFog = {
  sight: Uint8Array;
  refs: (Int16Array | undefined)[];
  hidden: Uint8Array;
  hiddenLandscape: Uint8Array;
  hiddenHeight: Int8Array;
  hiddenObject: (MapObjectView | undefined)[];
  hiddenBuilding: (BuildingView | undefined)[];
  hiddenIdx: Set<number>;
  dirty: Uint8Array;
  generation: number;
};

const ADD = 1;
const REMOVE = 2;
const DIM = 4;

/** Look radius for a hut: 0 while planned, 5 if a worker hut is empty, else def.viewDistance. */
export function buildingViewDistance(
  kind: Parameters<typeof buildingDef>[0],
  state: "plan" | "building" | "built",
  occupied: boolean,
): number {
  if (state !== "built") return UNCONSTRUCTED_VIEW_DISTANCE;
  const def = buildingDef(kind);
  if (def.worker && !occupied) return UNOCCUPIED_VIEW_DISTANCE;
  return def.viewDistance;
}

export class FogGrid {
  readonly width: number;
  readonly height: number;
  private readonly layers = new Map<number, PlayerFog>();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  capture(): FogLayerSnap[] {
    const n = this.width * this.height;
    const out: FogLayerSnap[] = [];
    for (const [player, layer] of this.layers) {
      const refs: { i: number; v: number[] }[] = [];
      for (let i = 0; i < n; i++) {
        const arr = layer.refs[i];
        if (arr && arr.length) refs.push({ i, v: [...arr] });
      }
      const tiles: FogLayerSnap["tiles"] = [];
      for (const i of layer.hiddenIdx) {
        tiles.push({
          i,
          landscape: layer.hiddenLandscape[i] ?? 0,
          height: layer.hiddenHeight[i] ?? 0,
          object: layer.hiddenObject[i] ? { ...layer.hiddenObject[i]! } : undefined,
          building: layer.hiddenBuilding[i] ? { ...layer.hiddenBuilding[i]! } : undefined,
        });
      }
      out.push({
        player,
        generation: layer.generation,
        sight: encodeU8(layer.sight),
        hidden: encodeU8(layer.hidden),
        dirty: encodeU8(layer.dirty),
        refs,
        tiles,
      });
    }
    return out.sort((a, b) => a.player - b.player);
  }

  restore(layers: readonly FogLayerSnap[]): boolean {
    const n = this.width * this.height;
    this.layers.clear();
    for (const snap of layers) {
      const sight = decodeU8(snap.sight, n);
      const hidden = decodeU8(snap.hidden, n);
      const dirty = decodeU8(snap.dirty, n);
      if (!sight || !hidden || !dirty) return false;
      const layer = this.layer(snap.player);
      layer.sight.set(sight);
      layer.hidden.set(hidden);
      layer.dirty.set(dirty);
      layer.generation = snap.generation;
      layer.refs = new Array(n);
      for (const r of snap.refs) {
        if (r.i < 0 || r.i >= n) continue;
        layer.refs[r.i] = Int16Array.from(r.v);
      }
      layer.hiddenIdx.clear();
      layer.hiddenObject.fill(undefined);
      layer.hiddenBuilding.fill(undefined);
      for (const t of snap.tiles) {
        if (t.i < 0 || t.i >= n) continue;
        layer.hiddenIdx.add(t.i);
        layer.hiddenLandscape[t.i] = t.landscape;
        layer.hiddenHeight[t.i] = t.height;
        layer.hiddenObject[t.i] = t.object ? { ...t.object } : undefined;
        layer.hiddenBuilding[t.i] = t.building ? { ...t.building } : undefined;
      }
    }
    return true;
  }

  view(player: number): FogView {
    const layer = this.layers.get(player);
    const w = this.width;
    const h = this.height;
    if (!layer) {
      return {
        width: w,
        height: h,
        player,
        generation: 0,
        sightAt: () => 0,
        isHidden: () => false,
        hiddenAt: () => undefined,
        forEachHidden: () => undefined,
        isClear: () => false,
      };
    }
    return {
      width: w,
      height: h,
      player,
      generation: layer.generation,
      sightAt: (x, y) => (this.inBounds(x, y) ? (layer.sight[y * w + x] ?? 0) : 0),
      isHidden: (x, y) => this.inBounds(x, y) && layer.hidden[y * w + x] === 1,
      hiddenAt: (x, y) => this.hiddenAt(layer, x, y),
      forEachHidden: (fn) => {
        for (const i of layer.hiddenIdx) {
          const x = i % w;
          const y = (i / w) | 0;
          const tile = this.hiddenAt(layer, x, y);
          if (tile) fn(x, y, tile);
        }
      },
      isClear: (x, y) => this.inBounds(x, y) && (layer.sight[y * w + x] ?? 0) > FOG_EXPLORED,
    };
  }

  /** Stamp `to`, unstamp `from`. `0` means no circle. */
  resizeCircle(at: GridPos, player: number, from: number, to: number): void {
    if (to > 0) this.drawCircle(at, player, to, ADD);
    if (from > 0) this.drawCircle(at, player, from, REMOVE);
    this.drawCircle(at, player, to > from ? to : from, DIM);
  }

  moveCircle(player: number, from: GridPos | null, to: GridPos | null, viewDistance: number): void {
    if (to) this.drawCircle(to, player, viewDistance, ADD | DIM);
    if (from) this.drawCircle(from, player, viewDistance, REMOVE | DIM);
  }

  /** Walk sight toward the ref target. Snapshots on the explored threshold. */
  tickDim(tickMs: number, world: FogWorld): void {
    const step = Math.max(1, Math.round((FOG_DIM * tickMs) / 1000));
    for (const layer of this.layers.values()) this.dimLayer(layer, step, world);
  }

  private drawCircle(at: GridPos, player: number, viewDistance: number, state: number): void {
    if (viewDistance < 0) return;
    const layer = this.layer(player);
    const w = this.width;
    const h = this.height;
    for (const t of viewCircle(viewDistance)) {
      const x = at.x + t.dx;
      const y = at.y + t.dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = y * w + x;
      const idx = t.refIndex;
      if (state & ADD) this.addRef(layer, i, idx);
      if (state & REMOVE) this.removeRef(layer, i, idx);
      if (state & DIM && layer.sight[i] !== this.refSight(layer, i)) layer.dirty[i] = 1;
    }
  }

  private dimLayer(layer: PlayerFog, step: number, world: FogWorld): void {
    const n = layer.sight.length;
    let changed = false;
    for (let i = 0; i < n; i++) {
      if (!layer.dirty[i]) continue;
      const x = i % this.width;
      const y = (i / this.width) | 0;
      const ref = this.refSight(layer, i);
      const dimTo = targetSight(layer.sight[i] ?? 0, ref);
      const old = layer.sight[i] ?? 0;
      const next = dimToward(old, dimTo, step);
      if (old <= FOG_EXPLORED && next > FOG_EXPLORED) this.clearHidden(layer, i);
      else if ((old > FOG_EXPLORED && next <= FOG_EXPLORED) || (old <= FOG_EXPLORED && ref < old)) {
        this.recordHidden(layer, i, x, y, world);
      }
      layer.sight[i] = next;
      if (next === dimTo) layer.dirty[i] = 0;
      if (next !== old) changed = true;
    }
    if (changed) layer.generation += 1;
  }

  private addRef(layer: PlayerFog, i: number, idx: number): void {
    let arr = layer.refs[i];
    if (!arr || arr.length <= idx) {
      const next = new Int16Array(idx + 1);
      if (arr) next.set(arr);
      layer.refs[i] = next;
      arr = next;
    }
    arr[idx] = (arr[idx] ?? 0) + 1;
  }

  private removeRef(layer: PlayerFog, i: number, idx: number): void {
    const arr = layer.refs[i];
    if (!arr || idx >= arr.length) return;
    arr[idx] = (arr[idx] ?? 0) - 1;
    if (idx === arr.length - 1 && arr[idx] === 0) {
      let last = arr.length - 1;
      while (last >= 0 && (arr[last] ?? 0) <= 0) last--;
      layer.refs[i] = last < 0 ? undefined : arr.slice(0, last + 1);
    }
  }

  private refSight(layer: PlayerFog, i: number): number {
    const refs = layer.refs[i];
    if (!refs || refs.length === 0) return 0;
    let value = FOG_VISIBLE;
    for (let k = 0; k < refs.length; k++) {
      if ((refs[k] ?? 0) > 0) break;
      value -= FOG_REF_STEP;
    }
    return value < 0 ? 0 : value;
  }

  private recordHidden(layer: PlayerFog, i: number, x: number, y: number, world: FogWorld): void {
    layer.hidden[i] = 1;
    layer.hiddenIdx.add(i);
    layer.hiddenLandscape[i] = landscapeIndex[world.landscapeAt(x, y)] ?? 0;
    layer.hiddenHeight[i] = world.heightAt(x, y);
    const obj = world.objectAt(x, y);
    layer.hiddenObject[i] = obj ? { ...obj } : undefined;
    const hut = world.buildingAt(x, y);
    layer.hiddenBuilding[i] = hut ? { ...hut } : undefined;
  }

  private clearHidden(layer: PlayerFog, i: number): void {
    layer.hidden[i] = 0;
    layer.hiddenIdx.delete(i);
    layer.hiddenObject[i] = undefined;
    layer.hiddenBuilding[i] = undefined;
  }

  private hiddenAt(layer: PlayerFog, x: number, y: number): HiddenTile | undefined {
    if (!this.inBounds(x, y)) return undefined;
    const i = y * this.width + x;
    if (layer.hidden[i] !== 1) return undefined;
    return {
      landscape: LANDSCAPE_TYPES[layer.hiddenLandscape[i] ?? 0] ?? "grass",
      height: layer.hiddenHeight[i] ?? 0,
      object: layer.hiddenObject[i],
      building: layer.hiddenBuilding[i],
    };
  }

  private layer(player: number): PlayerFog {
    let layer = this.layers.get(player);
    if (layer) return layer;
    const n = this.width * this.height;
    layer = {
      sight: new Uint8Array(n),
      refs: new Array(n),
      hidden: new Uint8Array(n),
      hiddenLandscape: new Uint8Array(n),
      hiddenHeight: new Int8Array(n),
      hiddenObject: new Array(n),
      hiddenBuilding: new Array(n),
      hiddenIdx: new Set<number>(),
      dirty: new Uint8Array(n),
      generation: 0,
    };
    this.layers.set(player, layer);
    return layer;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
}

function targetSight(current: number, ref: number): number {
  if (current >= FOG_EXPLORED && ref < FOG_EXPLORED) return FOG_EXPLORED;
  if (current <= FOG_EXPLORED && ref < current) return current;
  return ref;
}

function dimToward(value: number, dimTo: number, step: number): number {
  const d = Math.abs(value - dimTo);
  if (d <= step) return dimTo;
  return value < dimTo ? value + step : value - step;
}

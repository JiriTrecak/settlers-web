/**
 * Converted map dump. The engine never sees .map / DAT — ingest JSON only.
 */
import type { GridPos, LandscapeType } from "../../shared";
import { MapGrid } from "./mapGrid";
import { treeSheetAt, type MapDecoration } from "../decorations/decorations";

/** HQ / first-tower tile from the original player-info block. */
export type MapStart = GridPos;

/** Converted map dump JSON. */
export type DumpedMap = {
  width: number;
  heights: number[];
  landscape: LandscapeType[];
  trees: { x: number; y: number; sheet?: number }[];
  stones: { x: number; y: number; capacity: number }[];
  /** One entry per original player slot. Older dumps omit this. */
  starts?: MapStart[];
};

export type MapGroup = "tutorial" | "single" | "multi";

export type MapCatalogEntry = {
  id: string;
  name: string;
  file: string;
  group: MapGroup;
  size: number;
  players: number;
  quest: string;
};

export function isDumpedMap(value: unknown): value is DumpedMap {
  if (!value || typeof value !== "object") return false;
  const v = value as DumpedMap;
  return (
    typeof v.width === "number" &&
    Array.isArray(v.heights) &&
    Array.isArray(v.landscape) &&
    Array.isArray(v.trees) &&
    Array.isArray(v.stones)
  );
}

/** Player-slot start, else slot 0. Undefined if the dump has none. */
export function startForPlayer(starts: readonly MapStart[] | undefined, player: number): MapStart | undefined {
  if (!starts?.length) return undefined;
  return starts[player] ?? starts[0];
}

/**
 * Starts for a match. Uses dump slots as-is; missing slot 0 is map center,
 * later missing slots are map-opposite of slot 0 (not a second HQ on the same tile).
 */
export function matchStarts(
  starts: readonly MapStart[],
  players: number,
  size: { width: number; height: number },
): MapStart[] {
  const n = Math.max(1, players | 0);
  const out: MapStart[] = [];
  for (let i = 0; i < n; i++) {
    const given = starts[i];
    if (given) {
      out.push(given);
      continue;
    }
    if (i === 0) {
      out.push({ x: (size.width / 2) | 0, y: (size.height / 2) | 0 });
      continue;
    }
    const a = out[0]!;
    out.push({ x: size.width - 1 - a.x, y: size.height - 1 - a.y });
  }
  return out;
}

export function startsFromDumpedMap(map: DumpedMap): MapStart[] {
  if (!Array.isArray(map.starts)) return [];
  return map.starts.filter((s) => s && typeof s.x === "number" && typeof s.y === "number");
}

export function gridFromDumpedMap(map: DumpedMap): MapGrid {
  // Dumps are square: width is both axes; arrays are row-major.
  const grid = new MapGrid(map.width, map.width);
  for (let i = 0; i < map.width * map.width; i++) {
    const x = i % map.width;
    const y = (i / map.width) | 0;
    grid.setLandscape(x, y, map.landscape[i]!);
    grid.setHeight(x, y, map.heights[i] ?? 0);
  }
  return grid;
}

export function decorationsFromDumpedMap(map: DumpedMap): MapDecoration[] {
  return [
    ...map.trees.map((t) => ({
      kind: "tree" as const,
      x: t.x,
      y: t.y,
      // Old dumps omit sheet; same hash the converter uses.
      sheet: t.sheet ?? treeSheetAt(t.x, t.y),
    })),
    ...map.stones.map((s) => ({ kind: "stone" as const, x: s.x, y: s.y, capacity: s.capacity })),
  ];
}

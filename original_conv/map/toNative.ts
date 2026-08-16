import type { DumpedMap } from "../../src/sim/dumpedMap";
import { ORIGINAL_HEIGHT_SCALE, originalLandscapeType } from "./landscape";
import { isTreeObject, stoneCapacity } from "./objects";
import type { ParsedOriginalMap } from "./parseOriginalMap";

export function toDumpedMap(map: ParsedOriginalMap): DumpedMap {
  const { width, objects } = map;
  const n = width * width;
  const landscape: DumpedMap["landscape"] = new Array(n);
  const heights: number[] = new Array(n);
  const trees: DumpedMap["trees"] = [];
  const stones: DumpedMap["stones"] = [];
  for (let i = 0; i < n; i++) {
    const x = i % width;
    const y = (i / width) | 0;
    landscape[i] = originalLandscapeType(map.landscape[i]!);
    heights[i] = Math.round((map.heights[i] ?? 0) * ORIGINAL_HEIGHT_SCALE);
    const id = objects[i]!;
    if (id === 0) continue;
    if (isTreeObject(id)) trees.push({ x, y });
    else {
      const capacity = stoneCapacity(id);
      if (capacity !== null) stones.push({ x, y, capacity });
    }
  }
  return { width, heights, landscape, trees, stones };
}

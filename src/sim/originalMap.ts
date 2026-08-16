import { MapGrid } from "./mapGrid";
import { originalLandscapeType, ORIGINAL_HEIGHT_SCALE, type ParsedOriginalMap } from "../assets/map";

export function originalMapToGrid(map: ParsedOriginalMap): MapGrid {
  const { width } = map;
  const grid = new MapGrid(width, width);
  for (let i = 0; i < width * width; i++) {
    const x = i % width;
    const y = (i / width) | 0;
    grid.setLandscape(x, y, originalLandscapeType(map.landscape[i]!));
    grid.setHeight(x, y, Math.round((map.heights[i] ?? 0) * ORIGINAL_HEIGHT_SCALE));
  }
  return grid;
}

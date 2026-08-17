/**
 * Read-only map snapshot for render/UI. Out-of-bounds landscape is `water8`
 * so the mesh edge doesn't sample garbage.
 */
import { isWater, type LandscapeType } from "../../shared";
import type { MapGrid } from "./mapGrid";

export type MapView = {
  width: number;
  height: number;
  landscapeAt(x: number, y: number): LandscapeType;
  heightAt(x: number, y: number): number;
};

export function mapViewFromGrid(grid: MapGrid): MapView {
  return {
    width: grid.width,
    height: grid.height,
    landscapeAt: (x, y) => (grid.inBounds(x, y) ? grid.landscapeAt(x, y) : "water8"),
    heightAt: (x, y) => grid.heightAt(x, y),
  };
}

export function isLand(type: LandscapeType): boolean {
  return !isWater(type);
}

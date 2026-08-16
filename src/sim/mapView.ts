import { isWater, type LandscapeType } from "../shared/landscape";
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

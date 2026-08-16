import type { LandscapeType } from "../../src/shared/landscape/landscape";

const ORIGINAL_LANDSCAPE: Record<number, LandscapeType> = {
  0: "water1",
  1: "water2",
  2: "water3",
  3: "water4",
  4: "water5",
  5: "water6",
  6: "water7",
  7: "water8",
  16: "grass",
  17: "mountainBorderOuter",
  20: "desertBorderOuter",
  21: "moorBorderOuter",
  23: "mudBorderOuter",
  32: "mountain",
  33: "mountainBorder",
  35: "snowBorderOuter",
  48: "sand",
  64: "desert",
  65: "desertBorder",
  80: "moor",
  81: "moorBorder",
  96: "river1",
  97: "river2",
  98: "river3",
  99: "river4",
  128: "snow",
  129: "snowBorder",
  144: "mud",
  145: "mudBorder",
};

export function originalLandscapeType(id: number): LandscapeType {
  return ORIGINAL_LANDSCAPE[id] ?? "grass";
}

/** Original height 0–225 → remake 0–127. */
export const ORIGINAL_HEIGHT_SCALE = 127 / 225;

/**
 * Landscape types. Domain API is the string; atlasSlot indexes landscape-atlas.png.
 */

export const LANDSCAPE_TYPES = [
  "grass",
  "dryGrass",
  "desert",
  "earth",
  "mountain",
  "snow",
  "sand",
  "flattened",
  "river1",
  "river2",
  "river3",
  "river4",
  "mountainBorder",
  "mountainBorderOuter",
  "water1",
  "water2",
  "water3",
  "water4",
  "water5",
  "water6",
  "water7",
  "water8",
  "moor",
  "moorBorder",
  "moorBorderOuter",
  "flattenedDesert",
  "sharpFlattenedDesert",
  "gravel",
  "desertBorder",
  "desertBorderOuter",
  "snowBorder",
  "snowBorderOuter",
  "mud",
  "mudBorder",
  "mudBorderOuter",
  "road",
  "dryEarth",
] as const;

export type LandscapeType = (typeof LANDSCAPE_TYPES)[number];

export const landscapeIndex: Record<LandscapeType, number> = Object.fromEntries(
  LANDSCAPE_TYPES.map((name, i) => [name, i]),
) as Record<LandscapeType, number>;

type LandscapeInfo = {
  atlasSlot: number;
  /** sRGB 0–1 */
  color: readonly [number, number, number];
  water: boolean;
  flat: boolean;
};

const rgb = (hex: number): readonly [number, number, number] => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

export const landscapeInfo: Record<LandscapeType, LandscapeInfo> = {
  grass: { atlasSlot: 0, color: rgb(0x156e15), water: false, flat: false },
  dryGrass: { atlasSlot: 1, color: rgb(0xad8432), water: false, flat: false },
  desert: { atlasSlot: 18, color: rgb(0xa09738), water: false, flat: false },
  earth: { atlasSlot: 2, color: rgb(0xa2653e), water: false, flat: false },
  mountain: { atlasSlot: 21, color: rgb(0x5c5c5c), water: false, flat: false },
  snow: { atlasSlot: 24, color: rgb(0xc0cdcf), water: false, flat: false },
  sand: { atlasSlot: 31, color: rgb(0xadab00), water: false, flat: false },
  flattened: { atlasSlot: 35, color: rgb(0x105910), water: false, flat: false },
  river1: { atlasSlot: 17, color: rgb(0x4786fc), water: false, flat: false },
  river2: { atlasSlot: 17, color: rgb(0x4786fc), water: false, flat: false },
  river3: { atlasSlot: 17, color: rgb(0x4786fc), water: false, flat: false },
  river4: { atlasSlot: 17, color: rgb(0x4786fc), water: false, flat: false },
  mountainBorder: { atlasSlot: 22, color: rgb(0x424142), water: false, flat: false },
  mountainBorderOuter: { atlasSlot: 23, color: rgb(0x105910), water: false, flat: false },
  water1: { atlasSlot: 17, color: rgb(0x1863f0), water: true, flat: true },
  water2: { atlasSlot: 16, color: rgb(0x1562e0), water: true, flat: true },
  water3: { atlasSlot: 15, color: rgb(0x1260d0), water: true, flat: true },
  water4: { atlasSlot: 14, color: rgb(0x0e5cc8), water: true, flat: true },
  water5: { atlasSlot: 13, color: rgb(0x0c53c0), water: true, flat: true },
  water6: { atlasSlot: 12, color: rgb(0x084cb8), water: true, flat: true },
  water7: { atlasSlot: 11, color: rgb(0x0443b0), water: true, flat: true },
  water8: { atlasSlot: 10, color: rgb(0x003cab), water: true, flat: true },
  moor: { atlasSlot: 7, color: rgb(0x003f1c), water: false, flat: true },
  moorBorder: { atlasSlot: 8, color: rgb(0x003f1c), water: false, flat: true },
  moorBorderOuter: { atlasSlot: 9, color: rgb(0x003f1c), water: false, flat: false },
  flattenedDesert: { atlasSlot: 217, color: rgb(0x949200), water: false, flat: false },
  sharpFlattenedDesert: { atlasSlot: 217, color: rgb(0x949200), water: false, flat: false },
  gravel: { atlasSlot: 230, color: rgb(0x3a3a3a), water: false, flat: false },
  desertBorder: { atlasSlot: 19, color: rgb(0x949200), water: false, flat: false },
  desertBorderOuter: { atlasSlot: 20, color: rgb(0x949200), water: false, flat: false },
  snowBorder: { atlasSlot: 25, color: rgb(0xd7fffe), water: false, flat: false },
  snowBorderOuter: { atlasSlot: 26, color: rgb(0xd7fffe), water: false, flat: false },
  mud: { atlasSlot: 4, color: rgb(0x0e87cc), water: false, flat: false },
  mudBorder: { atlasSlot: 5, color: rgb(0x0e87cc), water: false, flat: false },
  mudBorderOuter: { atlasSlot: 6, color: rgb(0x0e87cc), water: false, flat: false },
  road: { atlasSlot: 34, color: rgb(0x156e15), water: false, flat: false },
  dryEarth: { atlasSlot: 36, color: rgb(0xadab00), water: false, flat: false },
};

export function isWater(type: LandscapeType): boolean {
  return landscapeInfo[type].water;
}

export function isRiver(type: LandscapeType): boolean {
  return type === "river1" || type === "river2" || type === "river3" || type === "river4";
}

const n = (...types: LandscapeType[]): ReadonlySet<LandscapeType> => new Set(types);

/** A triangle only blends if every pair of verts is an allowed neighbor. */
export const landscapeNeighbors: Record<LandscapeType, ReadonlySet<LandscapeType>> = {
  water8: n("water8", "water7"),
  water7: n("water8", "water7", "water6"),
  water6: n("water7", "water6", "water5"),
  water5: n("water6", "water5", "water4"),
  water4: n("water5", "water4", "water3"),
  water3: n("water4", "water3", "water2"),
  water2: n("water3", "water2", "water1"),
  water1: n("water2", "water1", "sand", "river1", "river2", "river3", "river4"),
  sand: n("water1", "sand", "river1", "river2", "river3", "river4", "grass"),
  river1: n("sand", "river1", "river2", "river3", "river4", "grass", "water1"),
  river2: n("sand", "river1", "river2", "river3", "river4", "grass", "water1"),
  river3: n("sand", "river1", "river2", "river3", "river4", "grass", "water1"),
  river4: n("sand", "river1", "river2", "river3", "river4", "grass", "water1"),
  grass: n(
    "sand",
    "grass",
    "river1",
    "river2",
    "river3",
    "river4",
    "flattened",
    "moorBorderOuter",
    "dryGrass",
    "dryEarth",
    "earth",
    "mudBorderOuter",
    "mountainBorderOuter",
    "desertBorderOuter",
    "road",
  ),
  road: n("grass", "road"),
  flattened: n("grass", "flattened"),
  dryGrass: n("grass", "dryGrass", "desert"),
  earth: n("grass", "earth"),
  dryEarth: n("grass", "dryEarth"),
  mountainBorderOuter: n("grass", "mountainBorderOuter", "mountainBorder"),
  mountainBorder: n("mountainBorderOuter", "mountainBorder", "mountain", "gravel"),
  gravel: n("mountain", "gravel"),
  mountain: n("mountainBorder", "mountain", "snowBorderOuter", "gravel"),
  snowBorderOuter: n("mountain", "snowBorderOuter", "snowBorder"),
  snowBorder: n("snowBorderOuter", "snowBorder", "snow"),
  snow: n("snowBorder", "snow"),
  desertBorderOuter: n("grass", "desertBorderOuter", "desertBorder"),
  desertBorder: n("desertBorderOuter", "desertBorder", "desert"),
  desert: n("desertBorder", "desert", "dryGrass", "sharpFlattenedDesert", "flattenedDesert"),
  sharpFlattenedDesert: n("desert", "sharpFlattenedDesert", "flattenedDesert"),
  flattenedDesert: n("desert", "flattenedDesert", "sharpFlattenedDesert"),
  moorBorderOuter: n("grass", "moorBorderOuter", "moorBorder"),
  moorBorder: n("moorBorderOuter", "moorBorder", "moor"),
  moor: n("moorBorder", "moor"),
  mudBorderOuter: n("grass", "mudBorderOuter", "mudBorder"),
  mudBorder: n("mudBorderOuter", "mudBorder", "mud"),
  mud: n("mudBorder", "mud"),
};

export function isAllowedNeighbor(a: LandscapeType, b: LandscapeType): boolean {
  return landscapeNeighbors[a].has(b);
}

/** North-face darkening from the height delta to the northern neighbor. */
export function slopeShade(height: number, northHeight: number): number {
  let color = 0.875 + (northHeight - height) * 0.125;
  if (color < 0.4) color = 0.4;
  return color;
}

/** Six neighbors on the diamond grid (not cube-hex axial). Order = ne, e, se, sw, w, nw. */
export const HEX_DELTAS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

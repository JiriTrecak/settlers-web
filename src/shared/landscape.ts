/**
 * S3 landscape types. Colors and image ids from Java ELandscapeType.
 * Domain API is the string; s3Image is the DAT landscape sequence index.
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
  s3Image: number;
  /** sRGB 0–1, from Java Color(0xffRRGGBB) */
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
  grass: { s3Image: 0, color: rgb(0x156e15), water: false, flat: false },
  dryGrass: { s3Image: 1, color: rgb(0xad8432), water: false, flat: false },
  desert: { s3Image: 18, color: rgb(0xa09738), water: false, flat: false },
  earth: { s3Image: 2, color: rgb(0xa2653e), water: false, flat: false },
  mountain: { s3Image: 21, color: rgb(0x5c5c5c), water: false, flat: false },
  snow: { s3Image: 24, color: rgb(0xc0cdcf), water: false, flat: false },
  sand: { s3Image: 31, color: rgb(0xadab00), water: false, flat: false },
  flattened: { s3Image: 35, color: rgb(0x105910), water: false, flat: false },
  river1: { s3Image: 17, color: rgb(0x4786fc), water: false, flat: false },
  river2: { s3Image: 17, color: rgb(0x4786fc), water: false, flat: false },
  river3: { s3Image: 17, color: rgb(0x4786fc), water: false, flat: false },
  river4: { s3Image: 17, color: rgb(0x4786fc), water: false, flat: false },
  mountainBorder: { s3Image: 22, color: rgb(0x424142), water: false, flat: false },
  mountainBorderOuter: { s3Image: 23, color: rgb(0x105910), water: false, flat: false },
  water1: { s3Image: 17, color: rgb(0x1863f0), water: true, flat: true },
  water2: { s3Image: 16, color: rgb(0x1562e0), water: true, flat: true },
  water3: { s3Image: 15, color: rgb(0x1260d0), water: true, flat: true },
  water4: { s3Image: 14, color: rgb(0x0e5cc8), water: true, flat: true },
  water5: { s3Image: 13, color: rgb(0x0c53c0), water: true, flat: true },
  water6: { s3Image: 12, color: rgb(0x084cb8), water: true, flat: true },
  water7: { s3Image: 11, color: rgb(0x0443b0), water: true, flat: true },
  water8: { s3Image: 10, color: rgb(0x003cab), water: true, flat: true },
  moor: { s3Image: 7, color: rgb(0x003f1c), water: false, flat: true },
  moorBorder: { s3Image: 8, color: rgb(0x003f1c), water: false, flat: true },
  moorBorderOuter: { s3Image: 9, color: rgb(0x003f1c), water: false, flat: false },
  flattenedDesert: { s3Image: 217, color: rgb(0x949200), water: false, flat: false },
  sharpFlattenedDesert: { s3Image: 217, color: rgb(0x949200), water: false, flat: false },
  gravel: { s3Image: 230, color: rgb(0x3a3a3a), water: false, flat: false },
  desertBorder: { s3Image: 19, color: rgb(0x949200), water: false, flat: false },
  desertBorderOuter: { s3Image: 20, color: rgb(0x949200), water: false, flat: false },
  snowBorder: { s3Image: 25, color: rgb(0xd7fffe), water: false, flat: false },
  snowBorderOuter: { s3Image: 26, color: rgb(0xd7fffe), water: false, flat: false },
  mud: { s3Image: 4, color: rgb(0x0e87cc), water: false, flat: false },
  mudBorder: { s3Image: 5, color: rgb(0x0e87cc), water: false, flat: false },
  mudBorderOuter: { s3Image: 6, color: rgb(0x0e87cc), water: false, flat: false },
  road: { s3Image: 34, color: rgb(0x156e15), water: false, flat: false },
  dryEarth: { s3Image: 36, color: rgb(0xadab00), water: false, flat: false },
};

export function isWater(type: LandscapeType): boolean {
  return landscapeInfo[type].water;
}

export function isRiver(type: LandscapeType): boolean {
  return type === "river1" || type === "river2" || type === "river3" || type === "river4";
}

const n = (...types: LandscapeType[]): ReadonlySet<LandscapeType> => new Set(types);

/** Java ELandscapeType.neighbors — a triangle only blends if all 3 verts are an allowed pair. */
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

/** Java Background.addPointToGeometry slope shade. */
export function slopeShade(height: number, northHeight: number): number {
  let color = 0.875 + (northHeight - height) * 0.125;
  if (color < 0.4) color = 0.4;
  return color;
}

export const HEX_DELTAS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

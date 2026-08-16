/** Triangle UVs: atlas cell + diamond orientation + border blends. */

import { TEXTURE_GRID, TEXTURE_POSITIONS, TEXTURE_SIZE } from "./atlasPositions";
import { TILE_WIDTH, isRiver, type LandscapeType, landscapeInfo } from "../../shared";

/** River1–4 are animation frames of the same blend; mixed triangles still need a river slot. */
function blendKey(type: LandscapeType): LandscapeType {
  return isRiver(type) ? "river1" : type;
}

const TEXTUREUNIT_X = 16;
const TEXTUREUNIT_Y = 16;
const TEXTURE_BORDER_OFFSET = 0.5;

type Orientation = readonly [number, number, number, number, number, number];

/** left, bottom, right — diamond orientation inside a tile. */
const CONTINUOUS: readonly [Orientation, Orientation] = [
  [TEXTUREUNIT_X / 2, 0, 0, TEXTUREUNIT_Y, TEXTUREUNIT_X, TEXTUREUNIT_Y],
  [TEXTUREUNIT_X / 2, 0, TEXTUREUNIT_X, TEXTUREUNIT_Y, (TEXTUREUNIT_X * 3) / 2, 0],
];
const ORIENTATION: readonly [Orientation, Orientation] = [
  [TEXTUREUNIT_X, TEXTUREUNIT_Y, TEXTUREUNIT_X / 2, TEXTUREUNIT_Y * 2, (TEXTUREUNIT_X * 3) / 2, TEXTUREUNIT_Y * 2],
  [TEXTUREUNIT_X / 2, 0, TEXTUREUNIT_X, TEXTUREUNIT_Y, (TEXTUREUNIT_X * 3) / 2, 0],
];
const LEFT: readonly [Orientation, Orientation] = [
  [
    TEXTUREUNIT_X / 2 + TEXTURE_BORDER_OFFSET,
    0,
    0 + TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y,
    TEXTUREUNIT_X,
    TEXTUREUNIT_Y,
  ],
  [
    0 + TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y,
    TEXTUREUNIT_X / 2 + TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y * 2,
    TEXTUREUNIT_X + TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y,
  ],
];
const RIGHT: readonly [Orientation, Orientation] = [
  [
    (TEXTUREUNIT_X * 3) / 2 - TEXTURE_BORDER_OFFSET,
    0,
    TEXTUREUNIT_X - TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y,
    TEXTUREUNIT_X * 2 - TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y,
  ],
  [
    TEXTUREUNIT_X - TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y,
    (TEXTUREUNIT_X * 3) / 2 - TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y * 2,
    TEXTUREUNIT_X * 2 - TEXTURE_BORDER_OFFSET,
    TEXTUREUNIT_Y,
  ],
];

type BorderBlend = {
  type1: LandscapeType;
  type1alt: LandscapeType;
  type2: LandscapeType;
  baseIndex: number;
};

function blend(type1: LandscapeType, type2: LandscapeType, baseIndex: number, type1alt: LandscapeType = type1): BorderBlend {
  return { type1, type1alt, type2, baseIndex };
}

/** Extra atlas slots for type-pair diamonds. */
const BORDER_BLENDS: readonly BorderBlend[] = [
  blend("sand", "water1", 37),
  blend("grass", "river1", 52, "sand"),
  blend("grass", "river2", 56, "sand"),
  blend("grass", "river3", 60, "sand"),
  blend("grass", "river4", 64, "sand"),
  blend("sand", "river1", 68),
  blend("sand", "river2", 72),
  blend("sand", "river3", 76),
  blend("sand", "river4", 80),
  blend("water1", "water2", 84),
  blend("water2", "water3", 88),
  blend("water3", "water4", 92),
  blend("water4", "water5", 96),
  blend("water5", "water6", 100),
  blend("water6", "water7", 104),
  blend("water7", "water8", 108),
  blend("sand", "grass", 112),
  blend("grass", "mountainBorderOuter", 116),
  blend("mountainBorderOuter", "mountainBorder", 120),
  blend("mountain", "mountainBorder", 124),
  blend("grass", "desertBorderOuter", 128),
  blend("desertBorderOuter", "desertBorder", 132),
  blend("desert", "desertBorder", 136),
  blend("grass", "mudBorderOuter", 140),
  blend("mudBorderOuter", "mudBorder", 144),
  blend("mud", "mudBorder", 148),
  blend("mountain", "snowBorderOuter", 156),
  blend("snowBorderOuter", "snowBorder", 160),
  blend("snow", "snowBorder", 164),
  blend("mountain", "snow", 156),
  blend("grass", "earth", 168),
  blend("grass", "flattened", 172),
  blend("grass", "road", 185),
  blend("grass", "dryGrass", 193),
  blend("grass", "dryEarth", 197),
  blend("grass", "moorBorderOuter", 201),
  blend("moorBorderOuter", "moorBorder", 205),
  blend("moor", "moorBorder", 209),
  blend("desert", "sharpFlattenedDesert", 218),
  blend("desert", "flattenedDesert", 222),
  blend("mountain", "gravel", 231),
];

export function realModulo(n: number, m: number): number {
  if (m <= 0) return 0;
  const r = n % m;
  return r >= 0 ? r : r + m;
}

export type TriangleTexture = {
  textureIndex: number;
  uvs: Orientation;
};

export function triangleTexture(
  left: LandscapeType,
  a: LandscapeType,
  right: LandscapeType,
  up: boolean,
  useSecondParameter: number,
  cellX: number,
  cellY: number,
): TriangleTexture {
  const orientationIndex = up ? 0 : 1;
  let textureIndex: number;
  let texturePos: Orientation;

  const leftK = blendKey(left);
  const aK = blendKey(a);
  const rightK = blendKey(right);

  if (aK === leftK && aK === rightK) {
    textureIndex = landscapeInfo[a].atlasSlot;
    texturePos = CONTINUOUS[orientationIndex];
  } else {
    textureIndex = landscapeInfo[left].atlasSlot;
    for (const intersect of BORDER_BLENDS) {
      let type1count = 0;
      let type1acount = 0;
      let type2count = 0;
      const tally = (t: LandscapeType): void => {
        if (t === intersect.type1) type1count++;
        else if (t === intersect.type1alt) type1acount++;
        if (t === intersect.type2) type2count++;
      };
      tally(leftK);
      tally(aK);
      tally(rightK);
      if (type1count + type1acount + type2count !== 3 || type1acount === 2 || type2count === 0) continue;
      textureIndex = intersect.baseIndex;
      textureIndex += type2count === 2 ? 2 : 0;
      textureIndex += useSecondParameter & 1;
      break;
    }
    if (leftK === rightK) texturePos = ORIENTATION[orientationIndex];
    else if (leftK === aK) texturePos = LEFT[orientationIndex];
    else texturePos = RIGHT[orientationIndex];
  }

  const positions = TEXTURE_POSITIONS[textureIndex] ?? TEXTURE_POSITIONS[0]!;
  let addDx = 0;
  let addDy = 0;
  if (positions[2] >= 2) {
    addDx = cellX * TILE_WIDTH - Math.trunc((cellY * TILE_WIDTH) / 2);
    addDy = cellY * TEXTUREUNIT_Y;
    addDx = realModulo(addDx, (positions[2] - 1) * TEXTURE_GRID);
    addDy = realModulo(addDy, (positions[2] - 1) * TEXTURE_GRID);
  }
  addDx += positions[0] * TEXTURE_GRID;
  addDy += positions[1] * TEXTURE_GRID;

  return {
    textureIndex,
    uvs: [
      (texturePos[0] + addDx) / TEXTURE_SIZE,
      (texturePos[1] + addDy) / TEXTURE_SIZE,
      (texturePos[2] + addDx) / TEXTURE_SIZE,
      (texturePos[3] + addDy) / TEXTURE_SIZE,
      (texturePos[4] + addDx) / TEXTURE_SIZE,
      (texturePos[5] + addDy) / TEXTURE_SIZE,
    ],
  };
}

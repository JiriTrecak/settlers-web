/**
 * Roman settler clips by profession, 6 directions. Body + torso (player tint) + shadow.
 * Missing clip → idle pose of that profession, then bearer.
 */
import { DIRECTIONS, type Direction } from "../../shared";
import type { MovableMaterial, MovableType } from "../../sim/movable/movable";
import { fetchCatalogSprites, loadGroup, type CatalogSprite, type PropFrame } from "../graphics/textures";
import { loadNote, loadYield } from "../graphics/loadWatch";

export type DirClips = Record<Direction, PropFrame[]>;

export type CarryClips = { walk: DirClips; idle: DirClips };

export type CarryKind = Exclude<MovableMaterial, "none">;

export type UnitClips = {
  walk: DirClips;
  idle: DirClips;
  chop: DirClips;
  /** Farmer plant (ACTION2). Falls back to chop. */
  plant: DirClips;
  pickup: DirClips;
  carry: Partial<Record<CarryKind, CarryClips>>;
};

export type SettlerSheets = Record<MovableType, UnitClips> & {
  /** File 4 seq 6. Frame 0 = full, last = almost dead. */
  health: PropFrame[];
  /** File 4 seq 7. Drawn on selected units. */
  mark: PropFrame | null;
};

const CARRY: Record<MovableType, readonly CarryKind[]> = {
  baker: ["flour", "water", "bread"],
  bearer: ["trunk", "plank", "stone", "coal", "ironore", "goldore", "crop", "flour", "bread", "fish", "meat", "pig", "water", "scythe", "fishingrod"],
  bricklayer: [],
  digger: [],
  farmer: ["crop"],
  fisherman: ["fish"],
  forester: ["tree"],
  lumberjack: ["trunk"],
  miller: ["crop", "flour"],
  miner: ["coal", "ironore", "goldore"],
  pig_farmer: ["crop", "water", "pig"],
  pioneer: [],
  geologist: [],
  sawmiller: ["trunk", "plank"],
  slaughterer: ["pig", "meat"],
  stonecutter: ["stone"],
  swordsman: [],
  waterworker: ["water"],
};

export async function loadSettlerSheets(sprites?: CatalogSprite[] | null): Promise<SettlerSheets | null> {
  sprites ??= await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const bearer = await loadUnit(sprites, "bearer", CARRY.bearer);
    if (!bearer) return null;
    const lumberjack = (await loadUnit(sprites, "lumberjack", CARRY.lumberjack)) ?? bearer;
    const sawmiller = (await loadUnit(sprites, "sawmiller", CARRY.sawmiller)) ?? bearer;
    const bricklayer = (await loadUnit(sprites, "bricklayer", CARRY.bricklayer)) ?? bearer;
    const digger = (await loadUnit(sprites, "digger", CARRY.digger)) ?? bearer;
    const forester = (await loadUnit(sprites, "forester", CARRY.forester)) ?? bearer;
    const stonecutter = (await loadUnit(sprites, "stonecutter", CARRY.stonecutter)) ?? bearer;
    const pioneer = (await loadUnit(sprites, "pioneer", CARRY.pioneer)) ?? bearer;
    const geologist = (await loadUnit(sprites, "geologist", CARRY.geologist)) ?? bearer;
    const miner = (await loadUnit(sprites, "miner", CARRY.miner)) ?? bearer;
    const farmer = (await loadUnit(sprites, "farmer", CARRY.farmer)) ?? bearer;
    const miller = (await loadUnit(sprites, "miller", CARRY.miller)) ?? bearer;
    const bakerClips = (await loadUnit(sprites, "baker", CARRY.baker)) ?? bearer;
    const fisherman = (await loadUnit(sprites, "fisherman", CARRY.fisherman)) ?? bearer;
    const pigFarmer = (await loadUnit(sprites, "pig-farmer", CARRY.pig_farmer)) ?? bearer;
    const slaughterer = (await loadUnit(sprites, "slaughterer", CARRY.slaughterer)) ?? bearer;
    const waterworker = (await loadUnit(sprites, "waterworker", CARRY.waterworker)) ?? bearer;
    const swordsman = (await loadUnit(sprites, "swordsman-l1", CARRY.swordsman)) ?? bearer;
    loadNote("settlers · health");
    const named = await loadGroup(sprites, "props/health");
    const health = named.length > 0 ? named : await loadGroup(sprites, "uncatalogued/settler/04/006");
    const markNamed = await loadGroup(sprites, "props/select-mark");
    const mark = (markNamed[0] ?? (await loadGroup(sprites, "uncatalogued/settler/04/007"))[0]) ?? null;
    return {
      bearer,
      lumberjack,
      sawmiller,
      bricklayer,
      digger,
      forester,
      stonecutter,
      pioneer,
      geologist,
      miner,
      farmer,
      miller,
      baker: bakerClips,
      fisherman,
      pig_farmer: pigFarmer,
      slaughterer,
      waterworker,
      swordsman,
      health,
      mark,
    };
  } catch {
    return null;
  }
}

async function loadUnit(sprites: CatalogSprite[], profession: string, goods: readonly CarryKind[]): Promise<UnitClips | null> {
  loadNote(`settlers · ${profession}`);
  const walk = {} as DirClips;
  const idle = {} as DirClips;
  const chop = {} as DirClips;
  const plant = {} as DirClips;
  const pickup = {} as DirClips;
  const carry: UnitClips["carry"] = {};
  const root = `settlers/roman/${profession}`;
  for (const dir of DIRECTIONS) {
    walk[dir] = await loadGroup(sprites, `${root}/walk/none/${dir}`);
    if (walk[dir].length === 0) return null;
    idle[dir] = await loadGroup(sprites, `${root}/idle/none/${dir}`);
    if (idle[dir].length === 0) idle[dir] = walk[dir].slice(0, 1);
    chop[dir] = await loadGroup(sprites, `${root}/action1/none/${dir}`);
    if (chop[dir].length === 0) chop[dir] = idle[dir];
    plant[dir] = await loadGroup(sprites, `${root}/action2/none/${dir}`);
    if (plant[dir].length === 0) plant[dir] = chop[dir];
    pickup[dir] = [];
    for (const g of goods) {
      pickup[dir] = await loadGroup(sprites, `${root}/bend/${g}/${dir}`);
      if (pickup[dir].length > 0) break;
    }
    if (pickup[dir].length === 0) pickup[dir] = await loadGroup(sprites, `${root}/bend/trunk/${dir}`);
    if (pickup[dir].length === 0) pickup[dir] = await loadGroup(sprites, `${root}/bend/none/${dir}`);
    if (pickup[dir].length === 0) pickup[dir] = idle[dir];
  }
  for (const g of goods) {
    const cw = {} as DirClips;
    const ci = {} as DirClips;
    let any = false;
    for (const dir of DIRECTIONS) {
      cw[dir] = await loadGroup(sprites, `${root}/walk/${g}/${dir}`);
      if (cw[dir].length === 0) cw[dir] = walk[dir];
      else any = true;
      ci[dir] = await loadGroup(sprites, `${root}/idle/${g}/${dir}`);
      if (ci[dir].length === 0) ci[dir] = idle[dir];
    }
    if (any) carry[g] = { walk: cw, idle: ci };
  }
  await loadYield();
  return { walk, idle, chop, plant, pickup, carry };
}

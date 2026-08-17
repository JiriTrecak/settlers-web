/**
 * Roman settler clips by profession, 6 directions. Body + torso (player tint) + shadow.
 * Missing clip → idle pose of that profession, then bearer.
 */
import { DIRECTIONS, type Direction } from "../../shared";
import type { MovableMaterial, MovableType } from "../../sim/movable/movable";
import { fetchCatalogSprites, loadGroup, type CatalogSprite, type PropFrame } from "../graphics/textures";

export type DirClips = Record<Direction, PropFrame[]>;

export type CarryClips = { walk: DirClips; idle: DirClips };

export type CarryKind = Exclude<MovableMaterial, "none">;

export type UnitClips = {
  walk: DirClips;
  idle: DirClips;
  chop: DirClips;
  pickup: DirClips;
  carry: Partial<Record<CarryKind, CarryClips>>;
};

export type SettlerSheets = Record<MovableType, UnitClips>;

const CARRY: Record<MovableType, readonly CarryKind[]> = {
  bearer: ["trunk", "plank", "stone"],
  bricklayer: [],
  forester: ["tree"],
  lumberjack: ["trunk"],
  sawmiller: ["trunk", "plank"],
};

export async function loadSettlerSheets(): Promise<SettlerSheets | null> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const bearer = await loadUnit(sprites, "bearer", CARRY.bearer);
    if (!bearer) return null;
    const lumberjack = (await loadUnit(sprites, "lumberjack", CARRY.lumberjack)) ?? bearer;
    const sawmiller = (await loadUnit(sprites, "sawmiller", CARRY.sawmiller)) ?? bearer;
    const bricklayer = (await loadUnit(sprites, "bricklayer", CARRY.bricklayer)) ?? bearer;
    const forester = (await loadUnit(sprites, "forester", CARRY.forester)) ?? bearer;
    return { bearer, lumberjack, sawmiller, bricklayer, forester };
  } catch {
    return null;
  }
}

async function loadUnit(sprites: CatalogSprite[], profession: string, goods: readonly CarryKind[]): Promise<UnitClips | null> {
  const walk = {} as DirClips;
  const idle = {} as DirClips;
  const chop = {} as DirClips;
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
    pickup[dir] = await loadGroup(sprites, `${root}/bend/trunk/${dir}`);
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
  return { walk, idle, chop, pickup, carry };
}

/**
 * Roman bearer clips, 6 directions. Body + torso (player tint) + shadow.
 * Empty walk/idle plus trunk carry; chop is lumberjack axe; pickup is bearer bend+trunk.
 */
import { DIRECTIONS, type Direction } from "../../shared";
import { fetchCatalogSprites, loadGroup, type PropFrame } from "../graphics/textures";

export type DirClips = Record<Direction, PropFrame[]>;

export type SettlerSheets = {
  walk: DirClips;
  walkTrunk: DirClips;
  idle: DirClips;
  idleTrunk: DirClips;
  chop: DirClips;
  pickup: DirClips;
};

export async function loadSettlerSheets(): Promise<SettlerSheets | null> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const walk = {} as DirClips;
    const walkTrunk = {} as DirClips;
    const idle = {} as DirClips;
    const idleTrunk = {} as DirClips;
    const chop = {} as DirClips;
    const pickup = {} as DirClips;
    for (const dir of DIRECTIONS) {
      walk[dir] = await loadGroup(sprites, `settlers/roman/bearer/walk/none/${dir}`);
      if (walk[dir].length === 0) return null;
      idle[dir] = await loadGroup(sprites, `settlers/roman/bearer/idle/none/${dir}`);
      if (idle[dir].length === 0) idle[dir] = walk[dir].slice(0, 1);
      walkTrunk[dir] = await loadGroup(sprites, `settlers/roman/bearer/walk/trunk/${dir}`);
      if (walkTrunk[dir].length === 0) walkTrunk[dir] = walk[dir];
      idleTrunk[dir] = await loadGroup(sprites, `settlers/roman/bearer/idle/trunk/${dir}`);
      if (idleTrunk[dir].length === 0) idleTrunk[dir] = idle[dir];
      chop[dir] = await loadGroup(sprites, `settlers/roman/lumberjack/action1/none/${dir}`);
      if (chop[dir].length === 0) chop[dir] = idle[dir];
      pickup[dir] = await loadGroup(sprites, `settlers/roman/bearer/bend/trunk/${dir}`);
      if (pickup[dir].length === 0) pickup[dir] = idle[dir];
    }
    return { walk, walkTrunk, idle, idleTrunk, chop, pickup };
  } catch {
    return null;
  }
}

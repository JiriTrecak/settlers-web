/**
 * Roman bearer walk/idle clips, 6 directions. Body + torso (player tint) + shadow.
 */
import { DIRECTIONS, type Direction } from "../../shared";
import { fetchCatalogSprites, loadGroup, type PropFrame } from "../graphics/textures";

export type SettlerSheets = {
  walk: Record<Direction, PropFrame[]>;
  idle: Record<Direction, PropFrame[]>;
  work: Record<Direction, PropFrame[]>;
};

export async function loadSettlerSheets(): Promise<SettlerSheets | null> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const walk = {} as Record<Direction, PropFrame[]>;
    const idle = {} as Record<Direction, PropFrame[]>;
    const work = {} as Record<Direction, PropFrame[]>;
    for (const dir of DIRECTIONS) {
      walk[dir] = await loadGroup(sprites, `settlers/roman/bearer/walk/none/${dir}`);
      idle[dir] = await loadGroup(sprites, `settlers/roman/bearer/idle/none/${dir}`);
      work[dir] = await loadGroup(sprites, `settlers/roman/lumberjack/action1/none/${dir}`);
      if (walk[dir].length === 0) return null;
      if (idle[dir].length === 0) idle[dir] = walk[dir].slice(0, 1);
      if (work[dir].length === 0) work[dir] = idle[dir];
    }
    return { walk, idle, work };
  } catch {
    return null;
  }
}

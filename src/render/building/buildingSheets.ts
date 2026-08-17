/**
 * Built-hut sprites from catalog groups `buildings/{civ}/{kind}`, variant `built`.
 */
import { buildings, type BuildingKind } from "../../sim/data/buildings";
import { fetchCatalogSprites, loadGroup, type PropFrame } from "../graphics/textures";

export type BuildingSheets = Partial<Record<BuildingKind, PropFrame>>;

export async function loadBuildingSheets(): Promise<BuildingSheets | null> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const out: BuildingSheets = {};
    for (const def of Object.values(buildings)) {
      const frames = await loadGroup(sprites, def.sheet, "built");
      if (frames[0]) out[def.kind as BuildingKind] = frames[0];
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Hut sprites from catalog groups `buildings/{civ}/{kind}`.
 * `built` is the finished hut; `scaffold` is the plan (falls back to built).
 * Flags are `props/flag-door` / `props/flag-roof` (waving, torso = player tint).
 */
import { buildings, type BuildingKind } from "../../sim/data/buildings";
import { fetchCatalogSprites, loadGroup, type PropFrame } from "../graphics/textures";

export type BuildingSheet = {
  built: PropFrame;
  scaffold: PropFrame;
};

export type BuildingSheets = Partial<Record<BuildingKind, BuildingSheet>> & {
  flags: { door: PropFrame[]; roof: PropFrame[] };
};

export async function loadBuildingSheets(): Promise<BuildingSheets | null> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const out: BuildingSheets = { flags: { door: [], roof: [] } };
    for (const def of Object.values(buildings)) {
      const built = await loadGroup(sprites, def.sheet, "built");
      if (!built[0]) continue;
      const scaffold = await loadGroup(sprites, def.sheet, "scaffold");
      out[def.kind as BuildingKind] = { built: built[0], scaffold: scaffold[0] ?? built[0] };
    }
    out.flags = {
      door: await loadGroup(sprites, "props/flag-door"),
      roof: await loadGroup(sprites, "props/flag-roof"),
    };
    return out;
  } catch {
    return null;
  }
}

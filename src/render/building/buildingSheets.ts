/**
 * Hut sprites from catalog groups `buildings/{civ}/{kind}`.
 * `built` is the finished hut; `scaffold` is the growing frame (falls back to built).
 * Plan uses `props/site-post` + `props/site-sign` (file 1 seq 92/93).
 * Work-area rims are `props/work-area` (file 1 seq 91).
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
  sitePost: PropFrame | null;
  siteSign: PropFrame | null;
  /** GFX file 1 seq 91. Inner→outer work-area rims. */
  workArea: PropFrame[];
};

export async function loadBuildingSheets(): Promise<BuildingSheets | null> {
  const sprites = await fetchCatalogSprites();
  if (!sprites) return null;
  try {
    const out: BuildingSheets = { flags: { door: [], roof: [] }, sitePost: null, siteSign: null, workArea: [] };
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
    out.sitePost =
      (await loadGroup(sprites, "props/site-post"))[0] ??
      (await loadGroup(sprites, "uncatalogued/settler/01/092"))[0] ??
      null;
    out.siteSign =
      (await loadGroup(sprites, "props/site-sign"))[0] ??
      (await loadGroup(sprites, "uncatalogued/settler/01/093"))[0] ??
      null;
    const workArea = await loadGroup(sprites, "props/work-area");
    out.workArea = workArea.length > 0 ? workArea : await loadGroup(sprites, "uncatalogued/settler/01/091");
    return out;
  } catch {
    return null;
  }
}

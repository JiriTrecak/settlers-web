/**
 * First-stab library: every dump hut, plus plank/stone from the current TS
 * defs when that kind exists (copied across civs — lumberjack is lumberjack).
 */
import { buildings as catalog } from "../../../original_conv/catalog/index";
import { buildings as simBuildings, type BuildingKind } from "../../../src/sim/data/buildings";
import { emptyBuildingsFile, prettyName, type BuildingsFile } from "./format";

export function seedBuildings(): BuildingsFile {
  const file = emptyBuildingsFile();
  for (const entry of catalog) {
    const cost = costOf(entry.building);
    const group = `buildings/${entry.civ}/${entry.building}`;
    file.buildings.push({
      id: entry.building,
      civ: entry.civ,
      name: prettyName(entry.building),
      built: group,
      scaffold: group,
      plank: cost.plank,
      stone: cost.stone,
    });
  }
  return file;
}

function costOf(kind: string): { plank: number; stone: number } {
  if (!(kind in simBuildings)) return { plank: 0, stone: 0 };
  const def = simBuildings[kind as BuildingKind];
  let plank = 0;
  let stone = 0;
  for (const slot of def.constructionStacks) {
    if (slot.material === "plank") plank += slot.required ?? 0;
    if (slot.material === "stone") stone += slot.required ?? 0;
  }
  return { plank, stone };
}

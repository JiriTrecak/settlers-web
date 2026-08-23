/**
 * First-stab library: every dump hut, plus plank/stone from the current TS
 * defs when that kind exists (copied across civs — lumberjack is lumberjack).
 */
import { buildings as catalog } from "../../../original_conv/catalog/index";
import { buildings as simBuildings, type BuildingKind } from "../../../src/sim/data/buildings";
import { copyRels, emptyBuildingsFile, prettyName, type BuildingsFile, type Rel } from "./format";
import { needsFlatten } from "../../../src/sim/building/flatten";

export function seedBuildings(): BuildingsFile {
  const file = emptyBuildingsFile();
  for (const entry of catalog) {
    const cost = costOf(entry.building);
    const plot = plotOf(entry.building);
    const group = `buildings/${entry.civ}/${entry.building}`;
    file.buildings.push({
      id: entry.building,
      civ: entry.civ,
      name: prettyName(entry.building),
      built: group,
      scaffold: group,
      plank: cost.plank,
      stone: cost.stone,
      blocked: plot.blocked,
      protected: plot.protected,
      buildMarks: marksOf(entry.building),
      flatten: flattenOf(entry.building),
    });
  }
  return file;
}

export function plotOf(kind: string): { blocked: Rel[]; protected: Rel[] } {
  if (!(kind in simBuildings)) return { blocked: [], protected: [] };
  const def = simBuildings[kind as BuildingKind];
  return { blocked: copyRels(def.blocked), protected: copyRels(def.protected) };
}

export function marksOf(kind: string): Rel[] {
  if (!(kind in simBuildings)) return [];
  return copyRels(simBuildings[kind as BuildingKind].buildMarks);
}

function flattenOf(kind: string): boolean {
  if (!(kind in simBuildings)) return true;
  return needsFlatten(simBuildings[kind as BuildingKind]);
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

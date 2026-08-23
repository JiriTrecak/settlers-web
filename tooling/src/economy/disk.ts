/**
 * Read/write `assets/game_data` through the tools Vite server.
 * GET/PUT `/game_data/<file>.json` maps onto that folder. Packed tools has no writer.
 */
import { BUILDINGS_FORMAT, parseBuildingsFile, type BuildingsFile } from "./format";

export const GAME_DATA_DIR = "assets/game_data";
export const BUILDINGS_NAME = "buildings.json";
export const BUILDINGS_PATH = `${GAME_DATA_DIR}/${BUILDINGS_NAME}`;

export function buildingsUrl(): string {
  const base = import.meta.env.BASE_URL;
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}game_data/${BUILDINGS_NAME}`;
}

export async function readProjectBuildings(): Promise<BuildingsFile | null> {
  let res: Response;
  try {
    res = await fetch(buildingsUrl(), { cache: "no-store" });
  } catch {
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Load failed (${res.status}).`);
  const parsed = parseBuildingsFile((await res.json()) as unknown);
  if (!parsed) throw new Error(`Not a ${BUILDINGS_FORMAT} file.`);
  return parsed;
}

export async function writeProjectBuildings(text: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(buildingsUrl(), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: text,
    });
  } catch {
    throw new Error("Cannot reach the tools server. Run `npm run dev:tools`.");
  }
  if (res.status === 404 || res.status === 405) {
    throw new Error("Tools server has no writer. Run `npm run dev:tools`.");
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).trim();
    throw new Error(detail || `Save failed (${res.status}).`);
  }
}

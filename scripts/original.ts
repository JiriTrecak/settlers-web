import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Gitignored GOG/S3 extract. Safe to delete once assets/graphics + assets/maps exist. */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ORIGINAL_DIR = join(REPO_ROOT, "original");
export const ORIGINAL_GFX = join(ORIGINAL_DIR, "GFX");
export const ORIGINAL_SND = join(ORIGINAL_DIR, "SND");
export const ORIGINAL_MUSIC = join(ORIGINAL_DIR, "MUSIC");

export function originalMapDir(): string {
  const upper = join(ORIGINAL_DIR, "MAP");
  const mixed = join(ORIGINAL_DIR, "Map");
  if (existsSync(upper)) return upper;
  return mixed;
}

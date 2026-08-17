/**
 * Query-string boot skip: `?map=coast` jumps into a match, `?screen=single` to the picker.
 * `?color=0..7` picks the player tint.
 */
import { clampPlayer } from "../../shared";

export type BootIntent =
  | { kind: "menu"; player?: number }
  | { kind: "single"; player?: number }
  | { kind: "play"; mapId: string; player?: number };

export function parseBootIntent(search = window.location.search): BootIntent {
  const q = new URLSearchParams(search);
  const colorRaw = q.get("color");
  const player = colorRaw !== null && colorRaw !== "" ? clampPlayer(Number(colorRaw)) : undefined;
  const mapId = q.get("map")?.trim();
  if (mapId) return player === undefined ? { kind: "play", mapId } : { kind: "play", mapId, player };
  if (q.get("screen") === "single") return player === undefined ? { kind: "single" } : { kind: "single", player };
  return player === undefined ? { kind: "menu" } : { kind: "menu", player };
}

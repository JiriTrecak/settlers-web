/**
 * Query-string boot skip: `?map=grid` jumps into a match. `?screen=editor` opens the world editor.
 * Unknown maps stay on the menu. `?color=0..7` picks the player tint.
 */
import { clampPlayer } from "../../shared";

export type BootIntent =
  | { kind: "menu"; player?: number }
  | { kind: "campaign"; player?: number }
  | { kind: "single"; player?: number }
  | { kind: "editor"; mapId?: string; player?: number }
  | { kind: "play"; mapId: string; player?: number };

export function parseBootIntent(search = window.location.search): BootIntent {
  const q = new URLSearchParams(search);
  if(q.get("screen")==="campaign") return {kind:"campaign"};
  const colorRaw = q.get("color");
  const player =
    colorRaw !== null && colorRaw !== ""
      ? clampPlayer(Number(colorRaw))
      : undefined;
  const mapId = q.get("map")?.trim();
  if (q.get("screen") === "editor")
    return {
      kind: "editor",
      ...(mapId ? { mapId } : {}),
      ...(player !== undefined ? { player } : {}),
    };
  if (mapId)
    return player === undefined
      ? { kind: "play", mapId }
      : { kind: "play", mapId, player };
  if (["single", "skirmish"].includes(q.get("screen") ?? ""))
    return player === undefined
      ? { kind: "single" }
      : { kind: "single", player };
  return player === undefined ? { kind: "menu" } : { kind: "menu", player };
}

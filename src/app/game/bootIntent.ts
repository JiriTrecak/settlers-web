/**
 * Query-string boot skip: `?map=coast` jumps into a match, `?screen=single` to the picker.
 */
export type BootIntent =
  | { kind: "menu" }
  | { kind: "single" }
  | { kind: "play"; mapId: string };

export function parseBootIntent(search = window.location.search): BootIntent {
  const q = new URLSearchParams(search);
  const mapId = q.get("map")?.trim();
  if (mapId) return { kind: "play", mapId };
  if (q.get("screen") === "single") return { kind: "single" };
  return { kind: "menu" };
}

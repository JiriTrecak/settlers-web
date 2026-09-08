import { BUILDING_KINDS, type BuildingKind } from "../settlement/rules";
/** Shared value types. Actions are the only way the session mutates sim. */
export type GridPos = {
  readonly x: number;
  readonly y: number;
};

/** Wire + enqueue payload. `noop` is dropped. `ping` is lockstep-only (sim ignores it). */
export type Action =
  | { type: "noop" }
  | { type: "ping" }
  | { type: "build"; kind: BuildingKind; x: number; z: number }
  | { type: "cancel-building"; id: number }
  | { type: "move-worker"; id: number; x: number; z: number };
/** Structural validation is repeated in the sim; clients cannot confer ownership. */
export function validAction(raw: unknown): raw is Action {
  if (!raw || typeof raw !== "object") return false;
  const a = raw as Record<string, unknown>;
  const cell = (n: unknown) =>
    typeof n === "number" && Number.isInteger(n) && n >= 0 && n < 256;
  const id = (n: unknown) =>
    typeof n === "number" && Number.isSafeInteger(n) && n > 0;
  if (a.type === "noop" || a.type === "ping") return true;
  if (a.type === "build")
    return (
      BUILDING_KINDS.includes(a.kind as BuildingKind) && cell(a.x) && cell(a.z)
    );
  if (a.type === "cancel-building") return id(a.id);
  return a.type === "move-worker" && id(a.id) && cell(a.x) && cell(a.z);
}

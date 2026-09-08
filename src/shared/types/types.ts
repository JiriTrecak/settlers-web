import { BUILDING_KINDS, type SoldierKind, type BuildingKind } from "../settlement/rules";
/** Shared value types. Actions are the only way the session mutates sim. */
export type GridPos = {
  readonly x: number;
  readonly y: number;
};

/** Wire + enqueue payload. `noop` is dropped. `ping` is lockstep-only (sim ignores it). */
export type Action =
  | { type: 'move-units'; ids: number[]; x:number; z:number; attackMove?:boolean }
  | { type: 'attack-units'; ids:number[]; target:number; force?:boolean }
  | { type: "recruit"; id: number; kind: SoldierKind }
  | { type: "cancel-recruit"; id: number; index: number }
  | { type: "attack"; id: number; target: number; force?: boolean }
  | { type: "stop-unit"; id: number }
  | { type: "rally"; id: number; x: number; z: number }
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
  const ids=(value:unknown)=>Array.isArray(value)&&value.length>0&&value.length<=160&&value.every(id)&&new Set(value).size===value.length;
  if(a.type==='move-units')return ids(a.ids)&&cell(a.x)&&cell(a.z)&&(a.attackMove===undefined||typeof a.attackMove==='boolean');
  if(a.type==='attack-units')return ids(a.ids)&&id(a.target)&&(a.force===undefined||typeof a.force==='boolean');
  if (a.type === "noop" || a.type === "ping") return true;
  if (a.type === "build")
    return (
      BUILDING_KINDS.includes(a.kind as BuildingKind) && cell(a.x) && cell(a.z)
    );
  if (a.type === 'recruit') return id(a.id) && (a.kind === 'warrior' || a.kind === 'archer');
  if (a.type === 'cancel-recruit') return id(a.id) && Number.isInteger(a.index) && (a.index as number)>=0 && (a.index as number)<12;
  if (a.type === 'attack') return id(a.id) && id(a.target) && (a.force===undefined || typeof a.force==='boolean');
  if (a.type === 'stop-unit') return id(a.id);
  if (a.type === 'rally') return id(a.id) && cell(a.x) && cell(a.z);
  if (a.type === "cancel-building") return id(a.id);
  return a.type === "move-worker" && id(a.id) && cell(a.x) && cell(a.z);
}

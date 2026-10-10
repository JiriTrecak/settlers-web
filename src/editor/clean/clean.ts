import type {CleanType} from '../../shared/authoring/cleanup';
export type {CleanType} from '../../shared/authoring/cleanup';
/** UI settings; all removal goes through the shared cleanup operation. */
export const CLEAN_RADIUS_MIN = 1;
export const CLEAN_RADIUS_MAX = 32;

export const CLEAN_TYPES: readonly { id: CleanType; name: string; ready: boolean }[] = [
  { id: "objects", name: "Objects", ready: true },
  { id: "foliage", name: "Foliage", ready: true },
  { id: "trees", name: "Trees", ready: true },
  { id: "decals", name: "Decals", ready: true },
  { id: "props", name: "Props and rocks", ready: true },
];

export class CleanTool {
  radius = 4;
  type: CleanType = "objects";
  setRadius(n: number): void {
    this.radius = clamp(n, CLEAN_RADIUS_MIN, CLEAN_RADIUS_MAX);
  }

  setType(type: CleanType): void {
    if (CLEAN_TYPES.some((t) => t.id === type)) this.type = type;
  }

  sizeBy(steps: number): void {
    this.setRadius(this.radius + steps * 0.5);
  }

}

function clamp(n:number,lo:number,hi:number):number{return Math.min(hi,Math.max(lo,n));}

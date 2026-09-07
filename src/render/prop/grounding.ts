/** Preserve the soil line of trees with buried roots; repair positive import offsets. */
export function prototypeGroundOffset(asset:string,minY:number,floating:boolean):number {
  if(floating||!Number.isFinite(minY)||asset.includes('pillar-arch'))return 0;
  if(/tree-|pine|spruce/.test(asset)&&minY<0)return 0;
  return -minY;
}

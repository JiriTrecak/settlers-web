/** Per-map water appearance. Values are shader controls, independent of river geometry. */
export type WaterStyle = { rippleScale:number; rippleStrength:number; cloudStrength:number; foamStrength:number; causticStrength?:number; reflectionStrength?:number; shadowStrength?:number };
export const DEFAULT_WATER_STYLE:Readonly<WaterStyle>={rippleScale:.13,rippleStrength:.07,cloudStrength:.025,foamStrength:.48};
export function parseWaterStyle(raw:unknown):WaterStyle|undefined {
  if(!raw||typeof raw!=='object')return undefined;
  const o=raw as Record<string,unknown>;
  const ranges={rippleScale:[.01,1],rippleStrength:[0,.5],cloudStrength:[0,.2],foamStrength:[0,1]} as const;
  for(const key of Object.keys(ranges) as (keyof typeof ranges)[]){const v=o[key],range=ranges[key];if(typeof v!=='number'||!Number.isFinite(v)||v<range[0]||v>range[1])return undefined;}
  if(o.causticStrength!==undefined&&(typeof o.causticStrength!=='number'||!Number.isFinite(o.causticStrength)||o.causticStrength<0||o.causticStrength>1))return undefined;
  if(o.reflectionStrength!==undefined&&(typeof o.reflectionStrength!=='number'||!Number.isFinite(o.reflectionStrength)||o.reflectionStrength<0||o.reflectionStrength>1))return undefined;
  if(o.shadowStrength!==undefined&&(typeof o.shadowStrength!=='number'||!Number.isFinite(o.shadowStrength)||o.shadowStrength<0||o.shadowStrength>1))return undefined;
  return {rippleScale:o.rippleScale as number,rippleStrength:o.rippleStrength as number,cloudStrength:o.cloudStrength as number,foamStrength:o.foamStrength as number,...(o.causticStrength!==undefined?{causticStrength:o.causticStrength as number}:{}),...(o.shadowStrength!==undefined?{shadowStrength:o.shadowStrength as number}:{}),...(o.reflectionStrength!==undefined?{reflectionStrength:o.reflectionStrength as number}:{})};
}

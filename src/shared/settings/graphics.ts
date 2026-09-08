export const RESOLUTION_SCALES=[.5,.75,1] as const;
export type ResolutionScale=typeof RESOLUTION_SCALES[number];
export const RESOLUTION_KEY='utc.graphics.resolution-scale';
export const GRAPHICS_CHANGED='utc-graphics-changed';
export function readResolutionScale():ResolutionScale {
 try{const value=Number(localStorage.getItem(RESOLUTION_KEY));if(RESOLUTION_SCALES.includes(value as ResolutionScale))return value as ResolutionScale;}catch{}
 return 1;
}
export function setResolutionScale(value:ResolutionScale):void {
 if(!RESOLUTION_SCALES.includes(value))return;
 try{localStorage.setItem(RESOLUTION_KEY,String(value));}catch{}
 window.dispatchEvent(new CustomEvent(GRAPHICS_CHANGED,{detail:value}));
}
export function renderPixelRatio(scale:ResolutionScale,dpr:number):number{return Math.max(.1,Number.isFinite(dpr)&&dpr>0?dpr:1)*scale;}

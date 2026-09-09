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

export const SHADOW_MODES=['soft','filtered','off'] as const;
export type ShadowMode=typeof SHADOW_MODES[number];
export const SHADOW_KEY='utc.graphics.shadows';
export const SHADOWS_CHANGED='utc-shadows-changed';
export function readShadowMode():ShadowMode {
 try{const value=localStorage.getItem(SHADOW_KEY);if(SHADOW_MODES.includes(value as ShadowMode))return value as ShadowMode;}catch{}
 return 'soft';
}
export function setShadowMode(mode:ShadowMode):void {
 if(!SHADOW_MODES.includes(mode))return;
 try{localStorage.setItem(SHADOW_KEY,mode);}catch{}
 window.dispatchEvent(new CustomEvent(SHADOWS_CHANGED));
}

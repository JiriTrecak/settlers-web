export const RENDER_RESOLUTIONS=['native','1280x720','1280x800','1600x900','1920x1080','1920x1200','2560x1440','2560x1600','3840x2160'] as const;
export type RenderResolution=typeof RENDER_RESOLUTIONS[number];
export const RESOLUTION_KEY='utc.graphics.render-resolution';
export const GRAPHICS_CHANGED='utc-graphics-changed';
export function isRenderResolution(value:unknown):value is RenderResolution {
 return typeof value==='string'&&(RENDER_RESOLUTIONS as readonly string[]).includes(value);
}
export function readRenderResolution():RenderResolution {
 try{const value=localStorage.getItem(RESOLUTION_KEY);if(isRenderResolution(value))return value;}catch{}
 // Deliberately ignore the obsolete percentage setting: it cannot name a stable resolution.
 return 'native';
}
export function setRenderResolution(value:RenderResolution):void {
 if(!isRenderResolution(value))return;
 try{localStorage.setItem(RESOLUTION_KEY,value);}catch{}
 window.dispatchEvent(new CustomEvent(GRAPHICS_CHANGED,{detail:value}));
}
export function renderDimensions(resolution:RenderResolution,width:number,height:number,dpr:number):{width:number;height:number}{
 if(resolution!=='native'){
  const [w,h]=resolution.split('x').map(Number);return {width:w,height:h};
 }
 const ratio=Number.isFinite(dpr)&&dpr>0?dpr:1;
 const dimension=(v:number)=>Math.max(1,Math.floor((Number.isFinite(v)?v:1)*ratio));
 return {width:dimension(width),height:dimension(height)};
}

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

export const ATMOSPHERE_QUALITIES=['off','low','medium','high'] as const;
export type AtmosphereQuality=typeof ATMOSPHERE_QUALITIES[number];
export const ATMOSPHERE_KEY='utc.graphics.atmosphere';
export const ATMOSPHERE_CHANGED='utc-atmosphere-changed';
export function readAtmosphereQuality():AtmosphereQuality {
 try{const v=localStorage.getItem(ATMOSPHERE_KEY);if(ATMOSPHERE_QUALITIES.includes(v as AtmosphereQuality))return v as AtmosphereQuality;}catch{}
 return 'medium';
}
export function setAtmosphereQuality(value:AtmosphereQuality):void {
 if(!ATMOSPHERE_QUALITIES.includes(value))return;
 try{localStorage.setItem(ATMOSPHERE_KEY,value);}catch{}
 window.dispatchEvent(new CustomEvent(ATMOSPHERE_CHANGED));
}

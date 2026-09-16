/** Shared environment library on this device; maps store only a preset id. */
export type GlobalLight = {
  sunTint:string; sunStrength:number; sunDirection:number; sunHeight:number;
  ambientTint:string; ambientStrength:number; skyTint:string; bounceTint:string; fillStrength:number;
  hazeColor:string; hazeDistance:number; shadowSoftness:number;
};
export type EnvironmentPreset={id:string;name:string;light:GlobalLight};
export const FOREST:EnvironmentPreset={id:'forest',name:'Forest',light:{sunTint:'#ffedcf',sunStrength:1.45,sunDirection:10,sunHeight:58,ambientTint:'#b5c3c9',ambientStrength:1.1,skyTint:'#b7c7cc',bounceTint:'#b09b72',fillStrength:1.1,hazeColor:'#8c9586',hazeDistance:260,shadowSoftness:2}};
/** Warm canopy openings with a neutral cool fill to keep shaded armies readable. */
export const UNDER_CANOPY:EnvironmentPreset={id:'under-canopy',name:'Under the Canopy',light:{sunTint:'#ffebc2',sunStrength:1.35,sunDirection:-35,sunHeight:65,ambientTint:'#e4e1d9',ambientStrength:3,skyTint:'#d6dcda',bounceTint:'#c5b89c',fillStrength:3,hazeColor:'#728078',hazeDistance:420,shadowSoftness:5}};
/** Fixed indirect fill and a low key light; authored resin lamps provide local warmth. */
export const HEARTWOOD_INTERIOR:EnvironmentPreset={id:'heartwood-interior',name:'Heartwood interior',light:{sunTint:'#cfbd9c',sunStrength:.55,sunDirection:-35,sunHeight:65,ambientTint:'#d4c4b3',ambientStrength:3,skyTint:'#c0c9d1',bounceTint:'#957151',fillStrength:2.8,hazeColor:'#252329',hazeDistance:140,shadowSoftness:5}};
const BUILT_INS=[FOREST,UNDER_CANOPY,HEARTWOOD_INTERIOR];
export const PRESET_KEY='utc.environment-presets.v1';
export const LIGHT_RANGES={sunStrength:[0,3],sunDirection:[-180,180],sunHeight:[15,85],ambientStrength:[0,3],fillStrength:[0,3],hazeDistance:[40,600],shadowSoftness:[0,8]} as const;
export function validLight(raw:unknown):raw is GlobalLight{
  if(!raw||typeof raw!=='object')return false;const o=raw as Record<string,unknown>;
  return ['sunTint','ambientTint','skyTint','bounceTint','hazeColor'].every(k=>typeof o[k]==='string'&&/^#[0-9a-f]{6}$/i.test(o[k] as string))&&Object.entries(LIGHT_RANGES).every(([k,[min,max]])=>typeof o[k]==='number'&&Number.isFinite(o[k])&&(o[k] as number)>=min&&(o[k] as number)<=max);
}
export function environmentPresets():EnvironmentPreset[]{
  try{const raw:unknown=JSON.parse(globalThis.localStorage?.getItem(PRESET_KEY)??'[]');if(Array.isArray(raw)){
    const valid=raw.filter((p):p is EnvironmentPreset=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.id.length>0&&p.name.length>0&&validLight(p.light));
    return [...BUILT_INS.map(p=>valid.find(v=>v.id===p.id)??structuredClone(p)),...valid.filter(p=>!BUILT_INS.some(b=>b.id===p.id))];
  }}catch{/* Defaults also work in the standalone game. */}
  return BUILT_INS.map(p=>structuredClone(p));
}
export function environmentPreset(id='forest'):EnvironmentPreset{return environmentPresets().find(p=>p.id===id)??structuredClone(FOREST);}
export function saveEnvironmentPreset(p:EnvironmentPreset):void{
  if(!validLight(p.light)||!p.name.trim())throw new Error('Invalid environment preset');
  const list=environmentPresets(),i=list.findIndex(v=>v.id===p.id);if(i<0)list.push(p);else list[i]=p;
  if(!globalThis.localStorage)throw new Error('Preset storage is unavailable');
  localStorage.setItem(PRESET_KEY,JSON.stringify(list));
  globalThis.dispatchEvent?.(new Event('utc-environment-presets'));
}

const KEY='canopy-effect-volume';
export function readEffectVolume(){try{const raw=localStorage.getItem(KEY);if(raw===null)return .65;const value=Number(raw);return Number.isFinite(value)?Math.max(0,Math.min(1,value)):.65;}catch{return .65;}}
export function setEffectVolume(value:number){if(!Number.isFinite(value))return;try{localStorage.setItem(KEY,String(Math.max(0,Math.min(1,value))));}catch{}if(typeof window!=='undefined')window.dispatchEvent(new Event('canopy-audio-change'));}

/** Shared publication/runtime ceilings for decorative model effects. */
export const EFFECT_MODEL_LIMITS={instances:16,triangles:80000,perModelTriangles:10000,cachedModels:8,maxBytes:16*1024*1024} as const;
/** Includes mipmaps; pending entries are capped separately from resident memory. */
export const EFFECT_IMAGE_LIMITS={entries:80,cachedImages:16,maxBytes:8*1024*1024,maxDimension:2048,maxPixels:2048*2048,residentBytes:64*1024*1024} as const;

/** Per complete weapon effect; army volleys share static model primitives. */
export const WEAPON_EFFECT_LIMITS={layers:8,triangles:512,primitives:8,flights:4096} as const;
export function validateWeaponEffectGeometry(reports:readonly {triangles:number;primitives:number;bones:number}[]){
 if(reports.some(r=>r.bones>0))throw Error('Weapon projectile models must be static without skins');
 if(reports.reduce((n,r)=>n+r.triangles,0)>WEAPON_EFFECT_LIMITS.triangles||reports.reduce((n,r)=>n+r.primitives,0)>WEAPON_EFFECT_LIMITS.primitives)throw Error('Weapon projectile exceeds 512 triangles or 8 model primitives');
}

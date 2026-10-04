import type {HeightDirty,HeightField} from './height';
export type HeightChange={bounds:HeightDirty|null;waterUnchanged:boolean};
// Both fields are weak keys: keeping the current terrain must not retain the
// entire undo history through a chain of previous compiled fields.
const changes=new WeakMap<HeightField,WeakMap<HeightField,HeightChange>>();
/** Only immutable compiler outputs may register a delta. Mutable sculpt previews
 * have no provenance and must use the renderer's explicit dirty region instead. */
export function rememberHeightChange(field:HeightField,previous:HeightField,waterUnchanged:boolean):void{
 if(field===previous||field.size!==previous.size||field.source||previous.source)return;
 const before=new Uint32Array(previous.samples.buffer,previous.samples.byteOffset,previous.samples.length),after=new Uint32Array(field.samples.buffer,field.samples.byteOffset,field.samples.length);
 let loX=field.verts,loZ=field.verts,hiX=-1,hiZ=-1;
 for(let i=0;i<after.length;i++)if(before[i]!==after[i]){const x=i%field.verts,z=Math.floor(i/field.verts);loX=Math.min(loX,x);hiX=Math.max(hiX,x);loZ=Math.min(loZ,z);hiZ=Math.max(hiZ,z);}
 const entries=new WeakMap<HeightField,HeightChange>();entries.set(previous,{bounds:hiX<0?null:{loX,hiX,loZ,hiZ},waterUnchanged});changes.set(field,entries);
}
export function heightChange(field:HeightField|null|undefined,previous:HeightField|null|undefined):HeightChange|undefined{
 return field&&previous?changes.get(field)?.get(previous):undefined;
}

import {unpackSourceBytes} from '../../shared/map/importedTerrain';

type MaskOwner={mask?:string};
const bytesByOwner=new WeakMap<MaskOwner,Uint8Array>();
const pack=(bytes:Uint8Array)=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};

/** Native terrain already has mask bytes. Preserve the serialized source contract
 * for export/inspection, but don't base64-encode then decode GPU inputs per edit.
 * Owners and their bytes are immutable once published to a terrain material. */
export function setTerrainMask<T extends MaskOwner>(owner:T,bytes:Uint8Array):T {
 let encoded:string|undefined;
 Object.defineProperty(owner,'mask',{enumerable:true,configurable:true,get:()=>encoded??=pack(bytes)});
 bytesByOwner.set(owner,bytes);
 return owner;
}
export function terrainMaskBytes(owner:MaskOwner|undefined):Uint8Array|undefined {
 if(!owner)return undefined;
 let bytes=bytesByOwner.get(owner);
 if(!bytes&&owner.mask!==undefined){bytes=unpackSourceBytes(owner.mask);bytesByOwner.set(owner,bytes);}
 return bytes;
}
export function sameTerrainMask(a:MaskOwner|undefined,b:MaskOwner|undefined):boolean {
 if(a===b)return true;
 const x=terrainMaskBytes(a),y=terrainMaskBytes(b);
 if(x===y)return true;
 if(!x||!y||x.length!==y.length)return false;
 for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;
 return true;
}

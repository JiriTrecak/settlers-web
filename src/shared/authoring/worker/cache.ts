import {MAP_HALO} from '../../map/map';
import type {UtcMap} from '../../map/utcmap';
import type {SceneSnapshot} from './scene';
import {AuthoringTransferEncoder,type Packet} from './transfer';

const FORMAT=2;
export interface SceneCache {
 key(map:UtcMap):Promise<string>;
 read(key:string):Promise<unknown>;
 write(key:string,snapshot:SceneSnapshot):Promise<void>;
}
export type PackedSceneCacheEntry={encoding:'authoring-transfer';packet:Packet};
export function packedSceneEntry(packet:Packet):PackedSceneCacheEntry{return {encoding:'authoring-transfer',packet};}
export function isPackedSceneEntry(value:unknown):value is PackedSceneCacheEntry{
 return !!value&&typeof value==='object'&&'encoding' in value&&value.encoding==='authoring-transfer'&&'packet' in value;
}
/** Unlike plain JSON, keep undefined, signed zero and non-finite numbers distinct.
 * Map input is plain data. Reject unsupported values rather than risk a false hit. */
function exactData(value:unknown):string{
 if(value===null)return 'null';
 switch(typeof value){
  case 'undefined':return 'u';
  case 'boolean':return value?'true':'false';
  case 'number':return 'n'+(Object.is(value,-0)?'-0':String(value));
  case 'string':return 's'+JSON.stringify(value);
  case 'object':{
   if(Array.isArray(value))return '['+Array.from({length:value.length},(_,i)=>Object.hasOwn(value,i)?exactData(value[i]):'hole').join(',')+']';
   if(Object.getPrototypeOf(value)!==Object.prototype)throw Error('Unsupported map cache input');
   return '{'+Object.keys(value).map(key=>JSON.stringify(key)+':'+exactData((value as Record<string,unknown>)[key])).join(',')+'}';
  }
  default:throw Error('Unsupported map cache input');
 }
}
export async function sceneCacheKey(map:UtcMap,revision:string):Promise<string>{
 const bytes=new TextEncoder().encode(exactData(map));
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return `${FORMAT}:${revision}:${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}`;
}
/** Snapshot storage is disposable, never an authority for authored maps. */
export function validCachedScene(value:unknown,map:UtcMap):value is SceneSnapshot{
 if(!value||typeof value!=='object')return false;
 const s=value as SceneSnapshot,f=s.field;
 if(!f||f.size!==map.size||!Number.isInteger(f.verts)||f.verts!==map.size+MAP_HALO*2+1||f.origin!==-MAP_HALO||f.span!==map.size+MAP_HALO*2||!(f.samples instanceof Float32Array)||f.samples.length!==f.verts*f.verts)return false;
 if(!Array.isArray(s.stamps)||!Array.isArray(s.resources)||!(s.owners instanceof Map))return false;
 for(const name of ['fieldId','terrainId','riversId','paintId','fieldPaintId'] as const)if(!Number.isSafeInteger(s[name])||s[name]<0)return false;
 for(const name of ['source','sourceWater','courseWater'] as const)if(typeof s[name]!=='boolean')return false;
 if(s.generated&&(!Array.isArray(s.generated.objects)||!Array.isArray(s.generated.rivers)||!Array.isArray(s.generated.paint)))return false;
 for(const values of [f.forestCoverage,f.grassCoverage,f.rockCoverage])if(values&&(!(values instanceof Float32Array)||values.length!==f.samples.length))return false;
 return true;
}

/** One latest world per origin: bounded storage even when hundreds of maps are
 * visited. IndexedDB cloning and serialization happen in the compiler worker.
 * Every operation has a deadline; blocked/private/quota-limited storage is optional. */
export function browserSceneCache(revision:string):SceneCache|undefined{
 if(typeof indexedDB==='undefined'||!globalThis.crypto?.subtle)return undefined;
 const database=()=>new Promise<IDBDatabase>((resolve,reject)=>{
  let done=false;
  const timer=setTimeout(()=>finish(new Error('Scene cache open timed out')),400);
  const finish=(error?:Error,db?:IDBDatabase)=>{
   if(done){db?.close();return;}done=true;clearTimeout(timer);
   if(error)reject(error);else resolve(db!);
  };
  const request=indexedDB.open('utc-compiled-world',FORMAT);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('scene'))db.createObjectStore('scene');};
  request.onsuccess=()=>finish(undefined,request.result);
  request.onerror=()=>finish(request.error??new Error('Scene cache unavailable'));
  request.onblocked=()=>finish(new Error('Scene cache blocked'));
 });
 async function transaction<T>(mode:IDBTransactionMode,perform:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await database();
  try{return await new Promise<T>((resolve,reject)=>{
   const tx=db.transaction('scene',mode);
   const timer=setTimeout(()=>{try{tx.abort();}catch{}reject(new Error('Scene cache transaction timed out'));},1500);
   tx.oncomplete=()=>{clearTimeout(timer);resolve(request.result);};
   tx.onabort=tx.onerror=()=>{clearTimeout(timer);reject(tx.error??new Error('Scene cache transaction failed'));};
   let request:IDBRequest<T>;
   try{request=perform(tx.objectStore('scene'));}catch(error){clearTimeout(timer);tx.abort();reject(error);}
  });}finally{db.close();}
 }
 return {
  key:map=>sceneCacheKey(map,revision),
  read:async key=>{
   const packet=await transaction<Packet|undefined>('readonly',store=>store.get(key));
   return packet===undefined?undefined:packedSceneEntry(packet);
  },
  write:async(key,snapshot)=>{
   // Store compact record chunks, not 100k structured-cloned JS objects. The
   // normal transport also preserves typed-array aliases and exceptional values.
   const {packet}=new AuthoringTransferEncoder().encode(snapshot);
   await transaction('readwrite',store=>{store.clear();return store.put(packet,key);});
  },
 };
}

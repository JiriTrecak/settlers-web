import {terrainTextureUrl} from './terrainTextureUrl';

export const TERRAIN_TILE_SIZE=1024;
const TILE_BYTES=TERRAIN_TILE_SIZE*TERRAIN_TILE_SIZE*4;
// Shared CPU pixels, never shared GPU ownership. Bound retained memory and
// decompression concurrency independently; large imported palettes can exceed it.
const MAX_BYTES=64*1024*1024,MAX_LOADING=4;
const cached=new Map<string,Uint8Array>();
const pending=new Map<string,Promise<Uint8Array>>();
const queue:(()=>void)[]=[];
let retainedBytes=0,loading=0;
function schedule<T>(task:()=>Promise<T>):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  const run=()=>{loading++;void task().then(resolve,reject).finally(()=>{loading--;queue.shift()?.();});};
  if(loading<MAX_LOADING)run();else queue.push(run);
 });
}
/** Immutable RGBA channels, without canvas conversion or alpha premultiplication.
 * Callers that edit pixels must copy them. Failed requests are retryable. */
export function terrainTilePixels(name:string,channel:'ar'|'nh'|'om'='ar'):Promise<Uint8Array>{
 const url=terrainTextureUrl(name,channel),hit=cached.get(url);
 if(hit){cached.delete(url);cached.set(url,hit);return Promise.resolve(hit);}
 const inFlight=pending.get(url);if(inFlight)return inFlight;
 const result=schedule(async()=>{
  const response=await fetch(url);
  if(!response.ok||!response.body)throw Error(`Failed terrain texture ${name}`);
  const raw=new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  if(raw.length!==TILE_BYTES)throw Error(`Terrain texture dimensions mismatch: ${name}`);
  cached.set(url,raw);retainedBytes+=raw.byteLength;
  while(retainedBytes>MAX_BYTES){const key=cached.keys().next().value!;retainedBytes-=cached.get(key)!.byteLength;cached.delete(key);}
  return raw;
 });
 pending.set(url,result);
 void result.then(()=>pending.delete(url),()=>pending.delete(url));
 return result;
}

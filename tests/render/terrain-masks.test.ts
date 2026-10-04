import {expect,it} from 'vitest';
import {setTerrainMask,terrainMaskBytes,sameTerrainMask} from '../../src/render/terrain/terrainMasks';

it('retains exact GPU bytes without encoding while preserving serialized terrain masks',()=>{
 const data=new Uint8Array([0,127,255,2]),owner=setTerrainMask({mask:''},data);
 const getter=Object.getOwnPropertyDescriptor(owner,'mask')!.get!;
 let reads=0;Object.defineProperty(owner,'mask',{enumerable:true,get(){reads++;return getter();}});
 expect(terrainMaskBytes(owner)).toBe(data);expect(reads).toBe(0);
 expect(sameTerrainMask(owner,setTerrainMask({mask:''},data.slice()))).toBe(true);expect(reads).toBe(0);
 expect(JSON.parse(JSON.stringify(owner))).toEqual({mask:Buffer.from(data).toString('base64')});expect(reads).toBe(1);
 const encoded={mask:Buffer.from(data).toString('base64')};expect(terrainMaskBytes(encoded)).toEqual(data);
 expect(sameTerrainMask(owner,encoded)).toBe(true);
});

it('compares missing, changed and resized masks without confusing empty data',()=>{
 expect(sameTerrainMask(undefined,{})).toBe(true);
 expect(sameTerrainMask({},setTerrainMask({mask:''},new Uint8Array()))).toBe(false);
 const a=setTerrainMask({mask:''},new Uint8Array([2,3]));
 expect(sameTerrainMask(a,setTerrainMask({mask:''},new Uint8Array([2,4])))).toBe(false);
 expect(sameTerrainMask(a,setTerrainMask({mask:''},new Uint8Array([2])))).toBe(false);
});

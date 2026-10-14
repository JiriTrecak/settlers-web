import {describe,it,expect} from 'vitest';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {landscapeCatalogue} from '../../src/shared/authoring/catalogue';
import {decodeGroundDds,warcraftGroundLayout} from '../../scripts/assets/warcraft/dds';
import {packGroundAtlas} from '../../scripts/assets/warcraft/pack';
import authoring from '../fixtures/content/authoring.json';

describe('declared ground atlases',()=>{
 const dirt=structuredClone(authoring.assets.find(a=>a.kind==='terrain-material'&&'terrain' in a&&(a as {terrain?:{atlas?:unknown}}).terrain?.atlas)!) as any;
 it('publishes terrain channels and a thumbnail through the landscape catalogue',()=>{
  const asset=assetDefinitionSchema.parse(dirt),[entry]=landscapeCatalogue([asset]);
  expect(entry.terrain).toEqual(asset.terrain);
  for(const role of ['albedo','normal','roughness','thumbnail'] as const)expect(entry.terrainImages?.[role]).toMatch(new RegExp(`^assets/library/${asset.id.replaceAll('.','\\.')}/`));
 });
 it('rejects atlas cells outside the image and undeclared channels',()=>{
  const out=structuredClone(dirt);out.terrain.atlas.fullTiles=[32];
  expect(assetDefinitionSchema.safeParse(out).success).toBe(false);
  const missing=structuredClone(dirt);missing.resources=missing.resources.filter((r:{role:string})=>r.role!=='normal');
  expect(assetDefinitionSchema.safeParse(missing).success).toBe(false);
 });
 it('converts source variation numbers and cardinal corners without mirroring',()=>{
  const atlas=warcraftGroundLayout(2048,1024);
  expect(atlas.fullTiles.slice(0,5)).toEqual([4,5,6,7,12]);
  expect(atlas.fullTiles.slice(16)).toEqual([27,0]);
  expect(atlas.corners[0]).toBe(null);
  expect(atlas.corners[1]).toBe(16); // NW: source mask 8, row 2 col 0.
  expect(atlas.corners[2]).toBe(8);  // NE: source mask 4.
  expect(atlas.corners[4]).toBe(2);  // SW: source mask 2.
  expect(atlas.corners[8]).toBe(1);  // SE: source mask 1.
  expect(atlas.corners[15]).toBe(27);
  expect(warcraftGroundLayout(1024,1024).fullTiles).toEqual([0,15]);
  expect(()=>warcraftGroundLayout(2048,512)).toThrow();
 });
 it('expands BC5 normals and rejects truncated source pixels',()=>{
  const bytes=Buffer.alloc(144);bytes.write('DDS ');bytes.writeUInt32LE(124,4);bytes.writeUInt32LE(4,12);bytes.writeUInt32LE(4,16);bytes.writeUInt32LE(4,80);bytes.write('ATI2',84);
  bytes[128]=bytes[129]=128;bytes[136]=bytes[137]=128;
  const result=decodeGroundDds(bytes,true);
  expect([...result.rgba.subarray(0,4)]).toEqual([128,128,255,255]);
  expect(result.rgba).toHaveLength(64);
  expect(()=>decodeGroundDds(bytes.subarray(0,140),true)).toThrow(/Truncated/);
  expect(()=>decodeGroundDds(bytes,false)).toThrow(/normal/);
 });
 it('keeps transparent atlas color separate from opacity and material channels',async()=>{
  const pixels=(rgba:number[])=>Buffer.from(Array.from({length:16},()=>rgba).flat());
  const packed=await packGroundAtlas({width:4,height:4,rgba:pixels([160,90,30,0])},{width:4,height:4,rgba:pixels([128,128,255,255])},{width:4,height:4,rgba:pixels([220,180,12,255])},4);
  expect([...packed.ar.subarray(0,4)]).toEqual([160,90,30,180]);
  expect([...packed.nh.subarray(0,4)]).toEqual([128,128,255,0]);
  expect([...packed.om.subarray(0,4)]).toEqual([220,12,0,255]);
 });
});

it('packs different native channel resolutions without mixing channels or losing atlas alignment',async()=>{
 const plane=(width:number,height:number,value:number[])=>({width,height,rgba:Buffer.from(Array.from({length:width*height},()=>value).flat())});
 const color=plane(8,4,[160,90,30,0]),normal=plane(16,8,[128,128,255,255]),orm=plane(4,2,[220,180,12,255]);
 const packed=await packGroundAtlas(color,normal,orm,4);
 expect([...packed.ar.subarray(0,4)]).toEqual([160,90,30,180]);
 expect([...packed.nh.subarray(0,4)]).toEqual([128,128,255,0]);
 expect([...packed.om.subarray(0,4)]).toEqual([220,12,0,255]);
 expect(color.rgba[3]).toBe(0);
 await expect(packGroundAtlas(color,plane(4,4,[128,128,255,255]),orm,4)).rejects.toThrow('aspect ratios differ');
});

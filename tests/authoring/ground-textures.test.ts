import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {landscapeCatalogue} from '../../src/shared/authoring/catalogue';
import {decodeGroundDds,warcraftGroundLayout} from '../../scripts/assets/warcraft/dds';
import {packGroundAtlas} from '../../scripts/assets/warcraft/pack';

describe('declared ground atlases',()=>{
 const dirt=JSON.parse(readFileSync('art/assets/asset.terrain.warcraft-ldrt/asset.json','utf8'));
 it('publishes terrain channels and a thumbnail through the landscape catalogue',()=>{
  const asset=assetDefinitionSchema.parse(dirt),[entry]=landscapeCatalogue([asset]);
  expect(entry.terrain?.sourceIds).toEqual(['Ldrt']);
  expect(entry.terrainImages?.thumbnail).toBe('assets/library/asset.terrain.warcraft-ldrt/image.png');
  expect(entry.terrainImages?.roughness).toBe('assets/library/asset.terrain.warcraft-ldrt/roughness.png');
  expect(asset.terrain?.atlas.fullTiles).toHaveLength(18);
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
  const packed=await packGroundAtlas(4,4,pixels([160,90,30,0]),pixels([128,128,255,255]),pixels([220,180,12,255]),4);
  expect([...packed.ar.subarray(0,4)]).toEqual([160,90,30,180]);
  expect([...packed.nh.subarray(0,4)]).toEqual([128,128,255,0]);
  expect([...packed.om.subarray(0,4)]).toEqual([220,12,0,255]);
 });
});

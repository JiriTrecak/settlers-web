import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {content} from '../../src/content/builtin';
import {unitDimensions} from '../../src/content/unitScale';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
const folder='art/assets/asset.models.buildings.ants-acorn-hall';
const bytes=readFileSync(folder+'/geometry.glb');
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
describe('Acorn Main Hall',()=>{
 it('replaces both main-building placeholders while keeping the economic and entrance contracts',()=>{
  for(const id of ['building.ants.fort','building.ants.great-mound']){
   const hall=content.get(id),asset=content.asset(hall.asset);
   expect(asset.file).toContain('ants-acorn-hall/geometry.glb');
   expect(hall.footprint).toEqual({width:15,depth:15});expect(hall.entrance).toEqual({x:0,y:9});
   expect(hall.behaviors.storage).toMatchObject({dropoff:true,accepts:['item.wood','item.amber']});
   expect(hall.behaviors.production).toMatchObject({mode:'automatic',population:{capacity:8,intervalTicks:480}});
   expect(content.asset(hall.icon!).image).toContain('ants-acorn-hall/image.png');
  }
 });

 it('publishes the inspected source export with one draw and fewer than 10k triangles',()=>{
  expect(bytes.equals(readFileSync('art/sources/buildings/acorn-hall-tripo/model.glb'))).toBe(true);
  expect(bytes.equals(readFileSync('assets/library/asset.models.buildings.ants-acorn-hall/geometry.glb'))).toBe(true);
  const primitives=gltf.meshes.flatMap((m:any)=>m.primitives);
  expect(primitives).toHaveLength(1);
  expect(gltf.accessors[primitives[0].indices].count/3).toBe(9330);
  const a=gltf.accessors[primitives[0].attributes.POSITION];
  expect(a.min[1]).toBeGreaterThanOrEqual(-.0001);
  expect(a.max[1]).toBeLessThan(9.7);
  expect(a.max[0]-a.min[0]).toBeLessThanOrEqual(15);
  expect(a.max[2]-a.min[2]).toBeLessThanOrEqual(15);
  expect(gltf.images).toHaveLength(3);
  expect(gltf.materials[0].normalTexture).toBeDefined();
 });
 it('carries a per-pixel ownership mask, including the blue ties, without alpha transparency',async()=>{
  const def=assetDefinitionSchema.parse(JSON.parse(readFileSync(folder+'/asset.json','utf8')));
  expect(def.capabilities.teamColor).toEqual({mode:'mask',slots:['TC_TeamColor'],mask:{role:'team_mask',index:1}});
  const material=gltf.materials[0];
  expect(material.name).toBe('TC_TeamColor');
  expect(material.extras.teamColorMask).toBe('baseColorAlpha');
  expect(material.alphaMode??'OPAQUE').toBe('OPAQUE');
  const image=gltf.images[gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index].source];
  const v=gltf.bufferViews[image.bufferView],offset=28+jsonLength+(v.byteOffset??0);
  const {data,info}=await sharp(bytes.subarray(offset,offset+v.byteLength)).raw().toBuffer({resolveWithObject:true});
  expect(info.channels).toBe(4);expect(info.width).toBe(2048);
  let blue=0,natural=0,badBlue=0,badNatural=0;
  for(let i=0;i<data.length;i+=4){
   const [r,g,b,a]=[data[i]!,data[i+1]!,data[i+2]!,data[i+3]!];
   if(b-Math.max(r,g)>65){if(a<220)badBlue++;blue++;}
   if(r>b+50){if(a>30)badNatural++;natural++;}
  }
  // Bilinear downsampling can mix a few ownership-edge texels.
  expect(badBlue/blue).toBeLessThan(.0001);expect(badNatural/natural).toBeLessThan(.0001);
  expect(blue).toBeGreaterThan(200000);expect(natural).toBeGreaterThan(200000);
 });
});

it('keeps the starting company and entrance clear of the enlarged hall footprint',()=>{
 const hall=content.get(content.rules.startingSetup.fort),half=hall.footprint!.depth/2;
 expect(hall.entrance!.y).toBeGreaterThan(half+1);
 for(const unit of content.rules.startingSetup.units){
  const {radius}=unitDimensions(content.rules.unitScale);
  expect(unit.offset.y-radius).toBeGreaterThan(half);
 }
});

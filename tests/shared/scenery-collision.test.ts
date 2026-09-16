import {describe,it,expect} from 'vitest';
import {applySceneryBlockers} from '../../src/shared/map/sceneryCollision';
import {parseCatalogue,type CatalogEntry} from '../../src/shared/asset/catalog';
const fence:CatalogEntry={id:'fence',name:'Fence',file:'fence.glb',category:'landmark',type:'prop',blocker:{width:6,depth:.2}};
describe('authored scenery collision',()=>{
 it('rotates and scales footprints without depending on visible triangles',()=>{
  const land=new Uint8Array(32*32).fill(1);
  applySceneryBlockers({size:32,stamps:[{id:'f',asset:'fence',x:16,y:16,yaw:Math.PI/2,scale:2}]},land,[fence]);
  expect(land[21*32+16]).toBe(0);expect(land[16*32+21]).toBe(1);
 });
 it('clips footprints at map edges and leaves decorative assets passable',()=>{
  const land=new Uint8Array(16*16).fill(1);
  applySceneryBlockers({size:16,stamps:[{id:'f',asset:'fence',x:0,y:0},{id:'d',asset:'flower',x:8,y:8}]},land,[fence]);
  expect(land.length).toBe(256);expect(land[0]).toBe(0);expect(land[8*16+8]).toBe(1);
 });
 it('rounded roots preserve walkable corners, including rotated nonuniform stamps',()=>{
  const root:CatalogEntry={...fence,id:'root',blocker:{width:10,depth:6,shape:'ellipse'}};
  const land=new Uint8Array(32*32).fill(1);
  applySceneryBlockers({size:32,stamps:[{id:'r',asset:'root',x:16,y:16,yaw:Math.PI/2,widthScale:1.5}]},land,[root]);
  expect(land[23*32+16]).toBe(0);
  expect(land[16*32+20]).toBe(1);
  expect(land[23*32+19]).toBe(1);
  expect(parseCatalogue({v:1,name:'Roots',assets:[root]})?.assets[0].blocker).toEqual(root.blocker);
  expect(parseCatalogue({v:1,name:'Roots',assets:[{...root,blocker:{...root.blocker,shape:'triangle'}}]})).toBeNull();
 });
 it('validates and preserves collision declarations',()=>{
  const raw={v:1,name:'kit',assets:[fence]};
  expect(parseCatalogue(raw)?.assets[0].blocker).toEqual(fence.blocker);
  expect(parseCatalogue({...raw,assets:[{...fence,blocker:{width:-1,depth:2}}]})).toBeNull();
 });
 it('keeps a hollow landmark doorway open through rotated, nonuniform transforms',()=>{
  const doorway:CatalogEntry={id:'gate',name:'Gate',file:'gate.glb',type:'prop',category:'landmark',blockers:[
   {x:-4,width:2,depth:10},{x:4,width:2,depth:10},{z:-4,width:10,depth:2},
  ]};
  const land=new Uint8Array(64*64).fill(1);
  applySceneryBlockers({size:64,stamps:[{id:'g',asset:'gate',x:32,y:32,yaw:Math.PI/2,widthScale:2}]},land,[doorway]);
  // The local +Z doorway faces +X after rotation; its entire approach stays open.
  for(let x=32;x<44;x++)expect(land[32*64+x]).toBe(1);
  expect(land[40*64+32]).toBe(0);expect(land[24*64+32]).toBe(0);
  expect(land[32*64+28]).toBe(0);
  expect(parseCatalogue({v:1,name:'kit',assets:[doorway]})?.assets[0].blockers).toEqual(doorway.blockers);
 });
 it('rotates each footprint inside its parent stamp',()=>{
  const wall:CatalogEntry={...fence,blocker:undefined,blockers:[{x:4,z:2,yaw:Math.PI/2,width:6,depth:.2}]};
  const land=new Uint8Array(32*32).fill(1);
  applySceneryBlockers({size:32,stamps:[{id:'w',asset:'fence',x:12,y:12}]},land,[wall]);
  expect(land[16*32+16]).toBe(0);expect(land[14*32+18]).toBe(1);
 });
 it.each([null,[{width:1,depth:2,x:Infinity}],[{width:1,depth:2,yaw:'north'}],Array.from({length:129},()=>({width:1,depth:1}))])('rejects invalid composite collision %j',blockers=>{
  expect(parseCatalogue({v:1,name:'kit',assets:[{...fence,blockers}]})).toBeNull();
 });
});

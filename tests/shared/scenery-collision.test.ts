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
 it('validates and preserves collision declarations',()=>{
  const raw={v:1,name:'kit',assets:[fence]};
  expect(parseCatalogue(raw)?.assets[0].blocker).toEqual(fence.blocker);
  expect(parseCatalogue({...raw,assets:[{...fence,blocker:{width:-1,depth:2}}]})).toBeNull();
 });
});

// Prop contact shade is redrawn incrementally; the result must match a full redraw exactly.
import {describe,it,expect} from 'vitest';
import type {DataTexture} from 'three';
import {TerrainMaterial} from '../../src/render/terrain/terrainMaterial';
type Contact={x:number;z:number;radiusX:number;radiusZ:number;strength:number};
const texture=(m:TerrainMaterial)=>(m as unknown as {contacts:DataTexture}).contacts;
const red=(m:TerrainMaterial)=>(texture(m).image.data as Uint8Array).filter((_,i)=>i%4===0);
function contacts(n:number,seed:number):Contact[]{
 let s=seed;const r=()=>(s=(s*16807)%2147483647)/2147483647;
 return Array.from({length:n},()=>({x:20+r()*200,z:20+r()*200,radiusX:.4+r()*2,radiusZ:.4+r()*2,strength:.2+r()*.2}));
}
describe('terrain contact shade',()=>{
 it('redraws only changed contacts, matching a full redraw and uploading just their rows',()=>{
  const all=contacts(400,7),live=new TerrainMaterial(),fresh=new TerrainMaterial();
  live.setContacts(1,all);texture(live).onUpdate!(texture(live));
  const next=[...all.filter((_,i)=>i!==3&&i!==150),...contacts(2,99)];
  live.setContacts(2,next);fresh.setContacts(1,next);
  expect(red(live)).toEqual(red(fresh));
  const ranges=texture(live).updateRanges;
  expect(ranges.length).toBeGreaterThan(0);
  expect(ranges.reduce((sum,r)=>sum+r.count,0)).toBeLessThan(1024*1024*4/100);
  live.dispose();fresh.dispose();
 });
 it('keeps a queued full upload whole',()=>{
  const m=new TerrainMaterial(),all=contacts(400,3);
  m.setContacts(1,all);m.setContacts(2,all.slice(1));
  expect(texture(m).updateRanges.length).toBe(0);
  m.dispose();
 });
});

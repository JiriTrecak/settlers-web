import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {applySceneryBlockers} from '../../src/shared/map/sceneryCollision';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {biomeById} from '../../src/content/biomes';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import type {LandscapeAsset} from '../../src/shared/authoring/catalogue';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const names=['woodland-canopy-elder','woodland-canopy-spreading','woodland-great-broken-trunk','woodland-great-fallen-log','woodland-giant-mushroom-ochre','woodland-giant-mushroom-russet','woodland-mushrooms-button','woodland-mushrooms-fan'];
describe('original forest-scale landmarks',()=>{
 it.each(names)('publishes a valid editable source and efficient geometry for %s',slug=>{
  const a=assetDefinitionSchema.parse(read('art/assets/asset.models.environment.'+slug+'/asset.json'));
  expect(a.resources.some(r=>r.role==='source'&&r.format==='blend')).toBe(true);
  const bytes=readFileSync('assets/library/'+a.id+'/geometry.glb');const n=bytes.readUInt32LE(12);const gltf=JSON.parse(bytes.subarray(20,20+n).toString());
  let triangles=0;for(const m of gltf.meshes)for(const p of m.primitives)triangles+=gltf.accessors[p.indices].count/3;
  expect(triangles).toBeLessThan(6000);expect(gltf.images.length).toBeGreaterThan(0);
 });
 it.each(['ochre','russet'])('blocks only the %s mushroom stem, leaving routes beneath the cap',color=>{
  const size=64,land=new Uint8Array(size*size).fill(1);
  applySceneryBlockers({size,stamps:[{id:'m',asset:'woodland-giant-mushroom-'+color,x:32,y:32}]},land);
  expect(land[32*size+32]).toBe(0);
  // Four-unit offsets lie inside both caps but outside the curved stems.
  for(const [x,z] of [[28,32],[36,32],[32,28],[32,36]])expect(land[z!*size+x!]).toBe(1);
 });
 it('keeps canopy overhangs walkable and fallen log bodies solid',()=>{
  const size=96,land=new Uint8Array(size*size).fill(1);
  applySceneryBlockers({size,stamps:[{id:'t',asset:'woodland-canopy-elder',x:24,y:24},{id:'l',asset:'woodland-great-fallen-log',x:65,y:65,yaw:Math.PI/2}]},land);
  expect(land[24*size+24]).toBe(0);expect(land[24*size+34]).toBe(1);
  expect(land[75*size+65]).toBe(0);expect(land[65*size+71]).toBe(1);
 });
 it('offers a paintable mushroom recipe and compiles the Threewater showcase without missing assets',()=>{
  expect(biomeById('vibrant-forest').foliage.some(r=>r.id==='recipe.foliage.mushroom-patches')).toBe(true);
  const catalogue=read('assets/authoring/catalogue.json') as LandscapeAsset[];
  const map=parseUtcMap(read('assets/maps/skirmish/threewater-forest.utcmap'))!;
  expect(map.authoring!.objects.filter(o=>o.id.startsWith('forest-scale.'))).toHaveLength(10);
  const scene=compileMapScene(map,catalogue);expect(scene.generated!.issues).toEqual([]);
  expect(scene.stamps.some(s=>s.asset==='woodland-mushrooms-button')).toBe(true);
  expect(scene.stamps.some(s=>s.asset==='woodland-canopy-elder')).toBe(true);
 });
});

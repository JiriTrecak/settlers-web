import {describe,it,expect} from 'vitest';
import {biomeFixture} from './fixture';
import {Scene} from 'three';
import {Game} from '../../src/sim/game/game';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {waterSurface} from '../../src/render/water/waterSurface';
import {bakeLayer} from '../../src/shared/authoring/generate';
import {expandMap,validatePlacements} from '../../src/content/map';
import {content} from '../../src/content/builtin';
import {sampleDaytime} from '../../src/shared/environment/dayCycle';
import {Sky} from '../../src/render/sky/sky';
import {biomeById} from '../../src/content/biomes';
import {sceneryKind,terrainPixel} from '../../src/render/minimap/terrainStyle';
const map=biomeFixture;
describe('Frozen Forest and living woodland',()=>{
 it('persists creation weather independently of biome defaults',()=>{
  const snowy=createBiomeMap('Snow',256,'frozen-forest');expect(snowy.landscape!.environment.weather!.kind).toBe('snow');
  const rain=createBiomeMap('Rain',256,'frozen-forest','rain');const loaded=parseUtcMap(JSON.parse(stringifyUtcMap(rain)))!;
  expect(loaded.landscape!.environment.weather).toEqual({kind:'rain',intensity:.5,windX:1,windZ:.4});
  expect(createBiomeMap('Clear',256,'frozen-forest','clear').landscape!.environment.weather!.intensity).toBe(0);
  expect(snowy.landscape!.environment.weather!.kind).toBe('snow');
 });
 it('selects the actual winter tile maps and inherited normals',()=>{
  const scene=compileMapScene(createBiomeMap('Snow',256,'frozen-forest'),landscapeAssets),ground=authoredTerrain(scene.field,[],[]);
  expect(ground.layers[0].ar).toBe('asset.terrain.winter-soil');expect(ground.layers[0].nh).toBe('asset.terrain.winter-soil-normal');
  expect(ground.layers[1].ar).toBe('asset.terrain.winter-grass');expect(ground.layers[2].nh).toBe('asset.terrain.winter-dirt-normal');
  expect(biomeById(scene.field.biome).minimap.forest).not.toBe(biomeById().minimap.forest);
 });
 it('compiles both authored maps with distinct biome-bound species and no missing dependencies',()=>{
  for(const slug of ['vibrant-forest','frozen-forest'] as const){
   const doc=map(slug),scene=compileMapScene(doc,landscapeAssets);expect(scene.generated!.issues).toEqual([]);expect(scene.resources.length).toBeGreaterThan(150);
   expect(scene.field.forestCoverage!.some(n=>n>0)).toBe(true);expect(scene.field.grassCoverage!.some(n=>n>0)).toBe(true);
   expect(()=>validatePlacements(doc,content)).not.toThrow();
   expect(expandMap(doc,content).filter(e=>e.definition==='resource.forest.tree')).toEqual(scene.resources.sort((a,b)=>a.id.localeCompare(b.id)));
   if(slug==='frozen-forest')expect(scene.resources.every(r=>r.appearance!.asset!.includes('frost-pine'))).toBe(true);
   else expect(scene.stamps.some(s=>s.asset==='canopy-acorns')).toBe(true);
  }
 });
 it('instantiates generated trees as live harvestable game resources',()=>{
  const doc=map('vibrant-forest'),scene=compileMapScene(doc,landscapeAssets),game=new Game(doc,[{player:0,kind:'human'}]);
  const trees=game.entities.filter(e=>e.definition==='resource.forest.tree');
  expect(trees).toHaveLength(scene.resources.length);
  expect(trees.every(e=>e.resource!.amount>0&&e.resource!.felling!.hp>0)).toBe(true);
  expect(trees.some(e=>e.appearance?.asset==='asset.scenery.canopy-oak')).toBe(true);
 });
 it('bakes a diverse forest without moving, duplicating or dropping its harvestable trees and details',()=>{
  const doc=map('vibrant-forest'),before=compileMapScene(doc,landscapeAssets),baked=bakeLayer(doc.authoring!,'forest.west',before.generated!),after=compileMapScene({...doc,authoring:baked},landscapeAssets);
  const sort=<T extends {id:string}>(xs:T[])=>xs.slice().sort((a,b)=>a.id.localeCompare(b.id));
  expect(sort(after.resources)).toEqual(sort(before.resources));expect(sort(after.stamps)).toEqual(sort(before.stamps));
  expect(after.field.grassCoverage).toEqual(before.field.grassCoverage);expect(after.field.forestCoverage).toEqual(before.field.forestCoverage);
  expect(baked.objects.some(o=>o.asset.includes('mushrooms')&&o.bakedPlacement?.blocksVegetation===false)).toBe(true);
 });
 it('exports local water profile indices and settings, including painted lake holes',()=>{
  const scene=compileMapScene(map('frozen-forest'),landscapeAssets),water=waterSurface(scene.field);
  expect(water.profiles).toBeDefined();expect(water.flow.some((v,i)=>i%4===3&&v>0)).toBe(true);
  expect(water.profiles![7]).toBeCloseTo(3.5); // first profile, shallow row alpha = clarity
  expect(scene.field.wet(166,86)).toBe(true);expect(scene.field.wet(173,84)).toBe(false);
  expect(sceneryKind('frost-pine-a')).toBe('tree');expect(sceneryKind('canopy-oak')).toBe('tree');
  const wet=terrainPixel([200,200,200],-2,-.6,0,0,0,0),dry=terrainPixel([200,200,200],0,-1,0,0,0,0);
  expect(wet[2]).toBeGreaterThan(wet[0]);expect(dry[0]).toBeGreaterThan(wet[0]);
 });
 it('preserves source-style water defaults when a map has no authored water profiles',()=>{
  const scene=compileMapScene(createBiomeMap('Empty',256,'vibrant-forest'),landscapeAssets);
  expect(waterSurface(scene.field).profiles).toBeUndefined();
 });
 it('holds the winter day look and never accumulates cloud dimming',()=>{
  expect(sampleDaytime(12,'winter').look.sunColor.multiplier).toBe(10);expect(sampleDaytime(12,'winter').look.textureColorLUT).toContain('winter');
  expect(sampleDaytime(7,'winter')).toBe(sampleDaytime(16,'winter'));
  const sky=new Sky(new Scene());sky.setProfile('winter');sky.setHour(12);
  for(let i=0;i<1000;i++){sky.tick(i*16);sky.setSunTransmission(.8);}
  expect(sky.sun.intensity).toBeCloseTo(8);sky.setSunTransmission(1);expect(sky.sun.intensity).toBe(10);
  sky.setProfile('temperate');sky.setSunTransmission(.8);expect(sky.sun.intensity).toBeCloseTo(12.8);
 });
});

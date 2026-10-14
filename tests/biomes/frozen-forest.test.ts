import {describe,it,expect} from 'vitest';
import {biomeFixture} from './fixture';
import {Scene} from 'three';
import {Game} from '../../src/sim/game/game';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {testLandscape} from '../authoring/landscape';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {waterSurface} from '../../src/render/water/waterSurface';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {expandMap,validatePlacements} from '../../src/content/map';
import {content} from '../../src/content/builtin';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {sampleDaytime} from '../../src/shared/environment/dayCycle';
import {Sky} from '../../src/render/sky/sky';
import {biomeById,biomeEnvironment} from '../../src/content/biomes';
import {terrainPixel} from '../../src/render/minimap/terrainStyle';
const map=biomeFixture;
describe('Frozen Forest and living woodland',()=>{
 it('persists creation weather independently of biome defaults',()=>{
  expect(biomeEnvironment('frozen-forest',createBiomeMap('Default',256,'frozen-forest').landscape!.environment).weather!.kind).toBe('clear');
  const snowy=createBiomeMap('Snow',256,'frozen-forest','snow');expect(biomeEnvironment(snowy.biome,snowy.landscape!.environment).weather!.kind).toBe('snow');
  const rain=createBiomeMap('Rain',256,'frozen-forest','rain');const loaded=parseUtcMap(JSON.parse(stringifyUtcMap(rain)))!;
  expect(loaded.landscape!.environment.weather).toEqual({kind:'rain'});
  expect(biomeEnvironment('frozen-forest',createBiomeMap('Clear',256,'frozen-forest','clear').landscape!.environment).weather!.intensity).toBe(0);
  expect(biomeEnvironment(snowy.biome,snowy.landscape!.environment).weather!.kind).toBe('snow');
 });
 it('selects the actual winter tile maps and inherited normals',()=>{
  const scene=compileMapScene(createBiomeMap('Snow',256,'frozen-forest'),testLandscape),ground=authoredTerrain(scene.field,[],[]);
  const tiles=biomeById('frozen-forest').terrainTiles!;
  expect(ground.layers[0].ar).toBe(tiles.soil!.ar);expect(ground.layers[0].nh).toBe(tiles.soil!.nh);
  expect(ground.layers[1].ar).toBe(tiles.grass!.ar);expect(ground.layers[1].nh).toBe(tiles.grass!.nh);  expect(biomeById(scene.field.biome).minimap.forest).not.toBe(biomeById().minimap.forest);
 });
 // ENGINE-COUPLED: map expansion and Game projection use the shipped landscape catalogue and harvest definitions
 // (src/shared/authoring/project.ts) with no injection point, so these two tests compile with the same shipped
 // catalogue and content and derive every id from the compiled scene.
 const shipped=(slug:'vibrant-forest'|'frozen-forest')=>({...map(slug),entities:[]});
 it('compiles biome maps whose applied trees expand to valid harvestable placements',()=>{
  for(const slug of ['vibrant-forest','frozen-forest'] as const){
   const preview=shipped(slug),compiled=compileMapScene(preview,landscapeAssets),history=new AuthoringHistory(preview.authoring);history.apply(compiled);const doc={...preview,authoring:history.document},scene=compileMapScene(doc,landscapeAssets);expect(scene.generated!.issues).toEqual([]);expect(scene.resources.length).toBeGreaterThan(150);
   expect(scene.field.forestCoverage!.some(n=>n>0)).toBe(true);expect(scene.field.grassCoverage!.some(n=>n>0)).toBe(true);
   expect(()=>validatePlacements(doc,content)).not.toThrow();
   const definitions=new Set(scene.resources.map(r=>r.definition));expect(definitions.size).toBe(1);
   expect(expandMap(doc,content).filter(e=>definitions.has(e.definition))).toEqual(scene.resources.sort((a,b)=>a.id.localeCompare(b.id)));
  }
 });
 it('instantiates generated trees as live harvestable game resources',()=>{
  const preview=shipped('vibrant-forest'),scene=compileMapScene(preview,landscapeAssets),history=new AuthoringHistory(preview.authoring);history.apply(scene);const doc={...preview,authoring:history.document},game=new Game(doc,[{player:0,kind:'human'}],content);
  const definitions=new Set(scene.resources.map(r=>r.definition)),trees=game.entities.filter(e=>definitions.has(e.definition));
  expect(trees).toHaveLength(scene.resources.length);
  expect(trees.every(e=>e.resource!.amount>0&&e.resource!.felling!.hp>0)).toBe(true);
  expect(trees.every(e=>content.asset(e.appearance!.asset!).sceneryAsset)).toBe(true);
 });
 it('bakes a diverse forest without moving, duplicating or dropping its harvestable trees and details',()=>{
  const doc=map('vibrant-forest'),before=compileMapScene(doc,testLandscape),history=new AuthoringHistory(doc.authoring!);history.apply(before);const baked=history.document,after=compileMapScene({...doc,authoring:baked},testLandscape);
  const sort=<T extends {id:string}>(xs:T[])=>xs.slice().sort((a,b)=>a.id.localeCompare(b.id));
  expect(sort(after.resources)).toEqual(sort(before.resources));expect(sort(after.stamps)).toEqual(sort(before.stamps));
  expect(after.field.grassCoverage).toEqual(before.field.grassCoverage);expect(after.field.forestCoverage).toEqual(before.field.forestCoverage);
  expect(baked.objects.every(o=>!('bakedPlacement' in o)&&!('owner' in o))).toBe(true);
 });
 it('exports local water profile indices and settings, including painted lake holes',()=>{
  const scene=compileMapScene(map('frozen-forest'),testLandscape),water=waterSurface(scene.field);
  expect(water.profiles).toBeDefined();expect(water.flow.some((v,i)=>i%4===3&&v>0)).toBe(true);
  expect(water.profiles![7]).toBeCloseTo(3.5); // first profile, shallow row alpha = clarity
  expect(scene.field.wet(166,86)).toBe(true);expect(scene.field.wet(173,84)).toBe(false);
  const wet=terrainPixel([200,200,200],-2,-.6,0,0,0,0),dry=terrainPixel([200,200,200],0,-1,0,0,0,0);
  expect(wet[2]).toBeGreaterThan(wet[0]);expect(dry[0]).toBeGreaterThan(wet[0]);
 });
 it('uses the declared biome profile when a map has no local water profiles',()=>{
  const scene=compileMapScene(createBiomeMap('Empty',256,'vibrant-forest'),testLandscape);
  expect(waterSurface(scene.field).profiles![3]).toBeCloseTo(testLandscape.find(a=>a.id===biomeById(scene.field.biome).waterProfile)!.water!.clarity);
 });
 it('holds the winter day look and never accumulates cloud dimming',()=>{
  const winterSun=sampleDaytime(12,'winter').look.sunColor.multiplier;
  expect(sampleDaytime(7,'winter')).toBe(sampleDaytime(16,'winter'));
  const sky=new Sky(new Scene());sky.setProfile('winter');sky.setHour(12);
  for(let i=0;i<1000;i++){sky.tick(i*16);sky.setSunTransmission(.8);}
  expect(sky.sun.intensity).toBeCloseTo(winterSun*.8);sky.setSunTransmission(1);expect(sky.sun.intensity).toBe(winterSun);
  sky.setProfile('temperate');sky.setSunTransmission(.8);expect(sky.sun.intensity).toBeCloseTo(sampleDaytime(12,'temperate').look.sunColor.multiplier*.8);
 });
});

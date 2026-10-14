import {describe,it,expect,vi,afterEach} from 'vitest';
import {BIOMES,biomeById,biomeEnvironment,biomeLandscape} from '../../src/content/biomes';
import {FOREST,environmentLight} from '../../src/shared/environment/presets';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
// ENGINE-COUPLED: biomes are code-owned (src/content/biomes.ts) with no injectable registry, so these tests select
// biomes generically from BIOMES rather than naming shipped ones.
const biome=BIOMES[0]!.id;
afterEach(()=>vi.unstubAllGlobals());
describe('authoritative biome appearance',()=>{
 it('strips old visual snapshots on load/export and ignores them in the renderer resolver',()=>{
  const map=createBiomeMap('Legacy',256,biome),conditions={hour:18,playing:false,weather:{kind:'rain' as const}};
  const old={...emptyLandscape(),water:{rippleScale:.9},environment:{...conditions,preset:'private-preset',light:{...FOREST.light,sunStrength:0},season:'autumn',interior:true,canopy:{enabled:false},atmosphere:{enabled:false},weather:{kind:'rain' as const,intensity:1,windX:10,windZ:10}}};
  const parsed=parseLandscape(old)!;expect(parsed.environment).toEqual(conditions);expect(parsed).not.toHaveProperty('water');
  const copy=parseUtcMap(JSON.parse(stringifyUtcMap({...map,landscape:old as any})))!;expect(copy.landscape!.environment).toEqual(conditions);
  const look=biomeLandscape(map.biome,old as any).environment;
  expect(look.light).toEqual(biomeById(map.biome).environment.light);expect(look.atmosphere).toEqual(biomeById(map.biome).environment.atmosphere);expect(look.interior).not.toBe(true);
  expect(look.weather).toEqual(biomeEnvironment(map.biome,{weather:{kind:'rain'}}).weather);
 });
 it('inherits current biome defaults rather than a creation-time copy',()=>{
  const map=createBiomeMap('Forest',256,biome),definition=biomeById(map.biome),previous=definition.environment.light.sunStrength;
  expect(Object.keys(map.landscape!.environment).sort()).toEqual(['hour','playing']);
  try{definition.environment.light.sunStrength=.73;expect(biomeEnvironment(map.biome,map.landscape!.environment).light!.sunStrength).toBe(.73);}finally{definition.environment.light.sunStrength=previous;}
 });
 it('uses identical lighting across browser origins and does not mutate biome definitions',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify([{id:'forest',name:'Wrong',light:{...FOREST.light,sunStrength:0}}])});
  const resolved=biomeEnvironment(biome);expect(environmentLight(resolved)).toEqual(biomeById(biome).environment.light);resolved.light!.sunStrength=0;expect(biomeEnvironment(biome).light!.sunStrength).toBe(biomeById(biome).environment.light.sunStrength);
 });
 it('honors requested weather conditions while each biome owns its default and appearance',()=>{
  for(const b of BIOMES){
   expect(biomeEnvironment(b.id).weather!.kind).toBe(b.environment.weather?.kind??'clear');
   for(const kind of ['clear','rain','snow'] as const)expect(biomeEnvironment(b.id,{weather:{kind}}).weather!.kind).toBe(kind);
   const map=createBiomeMap(b.name,256,b.id);expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))!.biome).toBe(b.id);expect(biomeEnvironment(b.id).atmosphere).toBeDefined();
  }
 });
});

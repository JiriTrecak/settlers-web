import {describe,it,expect,vi,afterEach} from 'vitest';
import {BIOMES,biomeById,biomeEnvironment,biomeLandscape} from '../../src/content/biomes';
import {FOREST,environmentLight} from '../../src/shared/environment/presets';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
afterEach(()=>vi.unstubAllGlobals());
describe('authoritative biome appearance',()=>{
 it('strips old visual snapshots on load/export and ignores them in the renderer resolver',()=>{
  const map=createBiomeMap('Legacy',256,'vibrant-forest'),conditions={hour:18,playing:false,weather:{kind:'rain' as const}};
  const old={...emptyLandscape(),water:{rippleScale:.9},environment:{...conditions,preset:'private-preset',light:{...FOREST.light,sunStrength:0},season:'autumn',interior:true,canopy:{enabled:false},atmosphere:{enabled:false},weather:{kind:'rain' as const,intensity:1,windX:10,windZ:10}}};
  const parsed=parseLandscape(old)!;expect(parsed.environment).toEqual(conditions);expect(parsed).not.toHaveProperty('water');
  const copy=parseUtcMap(JSON.parse(stringifyUtcMap({...map,landscape:old as any})))!;expect(copy.landscape!.environment).toEqual(conditions);
  const look=biomeLandscape(map.biome,old as any).environment;expect(look.light).toEqual(biomeById(map.biome).environment.light);expect(look.atmosphere!.enabled).toBe(true);expect(look.interior).not.toBe(true);expect(look.weather!.intensity).toBe(.5);
 });
 it('inherits current biome defaults rather than a creation-time copy',()=>{
  const map=createBiomeMap('Forest',256,'vibrant-forest'),biome=biomeById(map.biome),previous=biome.environment.light.sunStrength;
  expect(Object.keys(map.landscape!.environment).sort()).toEqual(['hour','playing']);
  try{biome.environment.light.sunStrength=.73;expect(biomeEnvironment(map.biome,map.landscape!.environment).light!.sunStrength).toBe(.73);}finally{biome.environment.light.sunStrength=previous;}
 });
 it('uses identical lighting across browser origins and does not mutate biome definitions',()=>{
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify([{id:'forest',name:'Wrong',light:{...FOREST.light,sunStrength:0}}])});
  const resolved=biomeEnvironment('vibrant-forest');expect(environmentLight(resolved)).toEqual(biomeById('vibrant-forest').environment.light);resolved.light!.sunStrength=0;expect(biomeEnvironment('vibrant-forest').light!.sunStrength).toBe(biomeById('vibrant-forest').environment.light.sunStrength);
 });
 it('shares assets in a deliberate deeper-forest variant but changes only its profile',()=>{
  const a=biomeById('vibrant-forest'),b=biomeById('deep-forest');expect(a.foliage).toEqual(b.foliage);expect(a.rivers).toEqual(b.rivers);expect(b.environment.canopy!.coverage).toBeGreaterThan(a.environment.canopy!.coverage);expect(b.environment.light.sunStrength).toBeLessThan(a.environment.light.sunStrength);
 });
 it('supports weather conditions while biomes own their intensity, wind, and default',()=>{
  expect(biomeEnvironment('frozen-forest').weather!.kind).toBe('snow');expect(biomeEnvironment('frozen-forest',{weather:{kind:'clear'}}).weather!.intensity).toBe(0);
  expect(biomeEnvironment('frozen-forest',{weather:{kind:'snow'}}).weather).toEqual(biomeById('frozen-forest').environment.weather);
  for(const b of BIOMES){const map=createBiomeMap(b.name,256,b.id);expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))!.biome).toBe(b.id);expect(biomeEnvironment(b.id).atmosphere).toBeDefined();}
 });
});

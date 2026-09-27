import {describe,it,expect,vi,afterEach} from 'vitest';
import {atmosphereSchema,DEFAULT_ATMOSPHERE,PROLOGUE_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
import {parseUtcMap,stringifyUtcMap,emptyUtcMap} from '../../src/shared/map/utcmap';
import {ATMOSPHERE_KEY,readAtmosphereQuality,setAtmosphereQuality} from '../../src/shared/settings/graphics';
afterEach(()=>vi.unstubAllGlobals());
describe('biome atmosphere',()=>{
 it('removes legacy atmosphere from map roundtrips',()=>{
  const map={...emptyUtcMap(),landscape:{...emptyLandscape(),environment:{...emptyLandscape().environment,atmosphere:PROLOGUE_ATMOSPHERE}}};
  const copy=parseUtcMap(JSON.parse(stringifyUtcMap(map)))!;
  expect(copy.landscape!.environment).not.toHaveProperty('atmosphere');expect(copy.mission).toEqual(map.mission);
  expect(DEFAULT_ATMOSPHERE.enabled).toBe(false);
 });
 it.each([
  {density:-1},{shaftDensity:-1},{shaftDensity:.1},{heightFalloff:0},{color:'not-a-color'},{density:Infinity},
  {regions:Array.from({length:17},(_,i)=>({...PROLOGUE_ATMOSPHERE.regions[0],id:String(i)}))},
  {regions:[PROLOGUE_ATMOSPHERE.regions[0],PROLOGUE_ATMOSPHERE.regions[0]]},
  {regions:[{...PROLOGUE_ATMOSPHERE.regions[0],radiusX:0}]},
 ])('rejects unsafe density/volume data: %j',patch=>{
  const atmosphere={...PROLOGUE_ATMOSPHERE,...patch};expect(atmosphereSchema.safeParse(atmosphere).success).toBe(false);
  expect(parseLandscape({...emptyLandscape(),environment:{...emptyLandscape().environment,atmosphere}})?.environment).not.toHaveProperty('atmosphere');
 });
 it('supports clear-air shafts without introducing global fog extinction',()=>{
  const look=atmosphereSchema.parse({...DEFAULT_ATMOSPHERE,density:0,shaftDensity:.003});
  expect(look.density).toBe(0);expect(look.shaftDensity).toBe(.003);
  const {shaftDensity,...legacy}=DEFAULT_ATMOSPHERE;expect(atmosphereSchema.parse(legacy).shaftDensity).toBe(0);
 });
 it('persists local quality independently from the authored map',()=>{
  const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});vi.stubGlobal('window',{dispatchEvent:vi.fn()});
  expect(readAtmosphereQuality()).toBe('medium');setAtmosphereQuality('off');expect(readAtmosphereQuality()).toBe('off');expect(PROLOGUE_ATMOSPHERE.enabled).toBe(true);
  data.set(ATMOSPHERE_KEY,'bad');expect(readAtmosphereQuality()).toBe('medium');
 });
});

import {describe,it,expect,vi,afterEach} from 'vitest';
import {atmosphereSchema,DEFAULT_ATMOSPHERE,PROLOGUE_ATMOSPHERE} from '../../src/shared/landscape/atmosphere';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
import {parseUtcMap,stringifyUtcMap,emptyUtcMap} from '../../src/shared/map/utcmap';
import {ATMOSPHERE_KEY,readAtmosphereQuality,setAtmosphereQuality} from '../../src/shared/settings/graphics';
afterEach(()=>vi.unstubAllGlobals());
describe('map atmosphere',()=>{
 it('accepts older maps without enabling a new visual effect',()=>{expect(parseLandscape(emptyLandscape())?.environment.atmosphere).toBeUndefined();expect(DEFAULT_ATMOSPHERE.enabled).toBe(false);});
 it('roundtrips the prologue regions through the actual map format',()=>{
  const map={...emptyUtcMap(),landscape:{...emptyLandscape(),environment:{...emptyLandscape().environment,atmosphere:PROLOGUE_ATMOSPHERE}}};
  expect(map.landscape?.environment.atmosphere?.regions).toEqual(PROLOGUE_ATMOSPHERE.regions);
  expect(map.landscape?.environment.atmosphere?.sunTint).toBe('#ffe0a6');
  const copy=parseUtcMap(JSON.parse(stringifyUtcMap(map)))!;
  expect(copy.landscape?.environment.atmosphere).toEqual(map.landscape?.environment.atmosphere);
  expect(copy.mission).toEqual(map.mission);
 });
 it.each([
  {density:-1},{heightFalloff:0},{color:'not-a-color'},{density:Infinity},
  {regions:Array.from({length:17},(_,i)=>({...PROLOGUE_ATMOSPHERE.regions[0],id:String(i)}))},
  {regions:[PROLOGUE_ATMOSPHERE.regions[0],PROLOGUE_ATMOSPHERE.regions[0]]},
  {regions:[{...PROLOGUE_ATMOSPHERE.regions[0],radiusX:0}]},
 ])('rejects unsafe density/volume data: %j',patch=>{
  const atmosphere={...PROLOGUE_ATMOSPHERE,...patch};expect(atmosphereSchema.safeParse(atmosphere).success).toBe(false);
  expect(parseLandscape({...emptyLandscape(),environment:{...emptyLandscape().environment,atmosphere}})).toBeUndefined();
 });
 it('persists local quality independently from the authored map',()=>{
  const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)});vi.stubGlobal('window',{dispatchEvent:vi.fn()});
  expect(readAtmosphereQuality()).toBe('medium');setAtmosphereQuality('off');expect(readAtmosphereQuality()).toBe('off');expect(PROLOGUE_ATMOSPHERE.enabled).toBe(true);
  data.set(ATMOSPHERE_KEY,'bad');expect(readAtmosphereQuality()).toBe('medium');
 });
});

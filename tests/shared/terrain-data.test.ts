import {expect,it,vi} from 'vitest';
import {decodeBytes,decodeFloats,encodeFloats,flatTerrainData,terrainDataSchema} from '../../src/shared/map/terrainData';
import {HEIGHT_MIN,HEIGHT_MAX,DRY_WATER_HEIGHT} from '../../src/shared/map/terrainLimits';
import {editTerrainGrid} from '../../src/shared/authoring/gridTerrain';
import {AuthoringHistory} from '../../src/shared/authoring/history';
const sample=(packed:string,value:number)=>{const values=decodeFloats(packed);values[0]=value;return encodeFloats(values);};

it.each([
 ['heights',HEIGHT_MIN-1],['heights',HEIGHT_MAX+1],['waterHeights',DRY_WATER_HEIGHT-1],['waterHeights',HEIGHT_MAX+1],
 ['grass',-.01],['grass',1.01],['rock',-.01],['rock',1.01],
] as const)('rejects %s sample %s before it reaches editable history', (key,value)=>{
 const terrain=flatTerrainData(16),history=new AuthoringHistory({version:1,layers:[],objects:[],terrain});
 const bad={...terrain,[key]:sample(terrain[key],value)};
 expect(terrainDataSchema.safeParse(bad).success).toBe(false);
 expect(()=>history.setTerrain(bad)).toThrow(/outside/);
 expect(history.document.terrain).toEqual(terrain);expect(history.revision).toBe(0);expect(history.canUndo).toBe(false);
});
it('accepts exact height and coverage limits, and rejects invalid paint coverage and duplicate profiles',()=>{
 const terrain=flatTerrainData(16,HEIGHT_MIN,DRY_WATER_HEIGHT);
 terrain.heights=sample(terrain.heights,HEIGHT_MAX);terrain.waterHeights=sample(terrain.waterHeights,HEIGHT_MAX);
 terrain.grass=sample(terrain.grass,1);terrain.rock=sample(terrain.rock,1);
 terrain.paint=[{material:'ground',weights:terrain.grass}];expect(terrainDataSchema.safeParse(terrain).success).toBe(true);
 terrain.paint[0].weights=sample(terrain.grass,-.1);expect(terrainDataSchema.safeParse(terrain).success).toBe(false);
 expect(terrainDataSchema.safeParse({...flatTerrainData(16),waterProfiles:['same','same']}).success).toBe(false);
 expect(terrainDataSchema.safeParse({...flatTerrainData(16),size:17}).success).toBe(false);
});
it('rejects an oversized packed grid before decoding or allocating its payload',()=>{
 const decode=vi.spyOn(globalThis,'atob');
 try{expect(()=>decodeBytes('A'.repeat(4096),4)).toThrow('Wrong dimensions');expect(decode).not.toHaveBeenCalled();}
 finally{decode.mockRestore();}
 expect(()=>decodeBytes('AAAA',1)).toThrow('Wrong dimensions'); // Same encoded length, wrong padding / decoded length.
});
it.each(['shallow','deep'] as const)('rejects an impossible %s water bed instead of changing its requested depth',depth=>{
 const terrain=flatTerrainData(16),selection={type:'rectangle' as const,from:{x:1,z:1},to:{x:3,z:3}};
 expect(()=>editTerrainGrid(terrain,{selection,operation:{type:'water',surfaceLevel:-8,depth}})).toThrow('Water bed would be below');
 const edited=editTerrainGrid(terrain,{selection,operation:{type:'water',surfaceLevel:-7,depth}}).terrain;
 expect(terrainDataSchema.safeParse(edited).success).toBe(true);
 expect(terrain.heights).toBe(flatTerrainData(16).heights);
});

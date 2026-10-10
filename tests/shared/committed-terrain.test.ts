import {expect,it} from 'vitest';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap,type UtcMap} from '../../src/shared/map/utcmap';
import {flatTerrainData} from '../../src/shared/map/terrainData';
import {projectScene,landscapeAssets} from '../../src/shared/authoring/project';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {editTerrainGrid} from '../../src/shared/authoring/gridTerrain';
import {createMapBriefing} from '../../src/sim/ai/briefing';
import {Spatial} from '../../src/sim/game/spatial';
import {content} from '../../src/content/builtin';

it.each([undefined,{version:1,objects:[]}])('rejects a map without committed terrain in every loading path',authoring=>{
 const map={...emptyUtcMap(),authoring} as unknown as UtcMap;
 expect(parseUtcMap(map)).toBeNull();
 for(const read of [()=>stringifyUtcMap(map),()=>compileMapScene(map,landscapeAssets),()=>projectScene(map),()=>new Spatial(map,content,()=>[]),()=>createMapBriefing(map,content)]){
  expect(read).toThrow(/committed terrain/);
 }
});

it('refuses to save mismatched terrain dimensions',()=>{
 const map={...emptyUtcMap(),size:512 as const};
 expect(()=>stringifyUtcMap(map)).toThrow(/dimensions must match/);
 expect(parseUtcMap(map)).toBeNull();
});

it('uses the same saved local water and elevation in rendering, navigation and AI after reopening',()=>{
 let terrain=flatTerrainData(256,2,-10);
 const rectangle=(x:number,z:number,w:number,h:number)=>({type:'rectangle' as const,from:{x,z},to:{x:x+w,z:z+h}});
 for(const [selection,depth] of [[rectangle(24,0,8,64),'deep'],[rectangle(23,30,10,3),'shallow']] as const){
  terrain=editTerrainGrid(terrain,{selection,operation:{type:'water',surfaceLevel:1,depth}}).terrain;
 }
 const original={...emptyUtcMap(),authoring:{version:1 as const,terrain,objects:[]}};
 const map=parseUtcMap(JSON.parse(stringifyUtcMap(original)))!;
 const rendered=projectScene(map).field,spatial=new Spatial(map,content,()=>[]),briefing=createMapBriefing(map,content);
 expect(briefing.heights).toEqual(Array.from(spatial.heights));
 expect(briefing.land).toEqual(Array.from(spatial.terrain));
 for(const [x,z] of [[10,10],[110,90],[110,126],[96,126],[129,90]]){
  const index=z*256+x;
  expect(spatial.heights[index]).toBe(Math.round(rendered.sample(x,z)*100));
  expect(spatial.waterHeights[index]).toBe(Math.round(rendered.waterAt(x,z)*100));
 }
 expect(spatial.walkable(90*256+110)).toBe(false);
 expect(spatial.walkable(126*256+110)).toBe(true);
 const path=spatial.findPath(126*256+85,126*256+145);
 expect(path).not.toBeNull();expect(path!.every(i=>spatial.walkable(i))).toBe(true);
});

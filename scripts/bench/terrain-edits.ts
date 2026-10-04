/** Exact-output CPU benchmark for repeated local height edits. No browser/GPU claim. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {compileMapScene,type CompiledMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {HeightField,encodeHeight,decodeHeight} from '../../src/shared/map/height';
import {applyLandform} from '../../src/shared/landscape/landform';
function identical(a:CompiledMapScene,b:CompiledMapScene,label:string){
 for(const key of ['generated','stamps','resources','owners'] as const)assert(isDeepStrictEqual(a[key],b[key]),`${label}: ${key}`);
 for(const key of ['samples','grassCoverage','rockCoverage','forestCoverage','surfacePaint','watercourses'] as const)assert(isDeepStrictEqual(a.field[key],b.field[key]),`${label}: ${key}`);
}
const paths=process.argv.slice(2);
if(!paths.length)paths.push('assets/maps/skirmish/heartroot-glade.utcmap');
const reports=[];
for(const path of paths){
 const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map)throw Error(`Invalid map: ${path}`);
 const initial=compileMapScene(map,landscapeAssets);let previous=initial;const edits=[];
 for(const height of [2,-3,5]){
  const field=new HeightField(map.size);field.load(map.height?decodeHeight(map.height,map.size)??[]:[],map.waterLevel??0);
  applyLandform(field,{x:map.size/2-12,z:map.size/2-4,radiusX:9,radiusZ:6,height,roughness:.08,rotation:Math.PI/9,plateau:0,seed:42});
  const next={...map,height:encodeHeight(field.samples,map.size)};
  let start=performance.now();const incremental=compileMapScene(next,landscapeAssets,previous),reuseMs=performance.now()-start;
  start=performance.now();const fresh=compileMapScene(next,landscapeAssets),freshMs=performance.now()-start;
  identical(incremental,fresh,`${path} height ${height}`);
  edits.push({height,reuseMs,freshMs,objects:incremental.generated?.objects.length,stages:incremental.profile?.stages});previous=incremental;
 }
 identical(compileMapScene(map,landscapeAssets,previous),initial,`${path} restore`);
 reports.push({map:path,size:map.size,edits});
 console.error(path,edits.map(e=>`${e.reuseMs.toFixed(1)} ms reused / ${e.freshMs.toFixed(1)} ms fresh`).join('; '));
}
console.log(JSON.stringify(reports,null,2));

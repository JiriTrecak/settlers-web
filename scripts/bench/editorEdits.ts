/** CPU-only rotation/elevation commit benchmark. Never modifies or saves the input map. */
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {updateMapScene} from '../../src/shared/authoring/updateMapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {parseUtcMap} from '../../src/shared/map/utcmap';
const path=process.argv[2]??'assets/maps/skirmish/heartroot-glade.utcmap';
const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map?.authoring?.objects.length)throw Error('Map needs an authored object');
const before=compileMapScene(map,landscapeAssets),object=map.authoring.objects.find(o=>!o.locked&&!o.bakedPlacement);if(!object)throw Error('Map needs an editable object');
const next={...map,authoring:{...map.authoring,objects:[...map.authoring.objects.filter(o=>o.id!==object.id),{...object,yaw:object.yaw+Math.PI/12,elevation:object.elevation+.5}]}};
const samples:number[]=[];let result=before;
for(let i=0;i<7;i++){const start=performance.now();result=updateMapScene(map,next,before,landscapeAssets);if(i)samples.push(performance.now()-start);}
const start=performance.now(),full=compileMapScene(next,landscapeAssets),fullMs=performance.now()-start;
for(const key of ['generated','stamps','resources','owners'] as const)if(!isDeepStrictEqual(result[key],full[key]))throw Error('Incremental result differs: '+key);
if(result.field!==before.field)throw Error('Pose edit did not reuse terrain');
const moved={...map,authoring:{...map.authoring,objects:map.authoring.objects.map(o=>o.id===object.id?{...o,x:o.x+2,z:o.z+2}:o)}};
const movementMs:number[]=[];let movement=before;
for(let i=0;i<3;i++){const began=performance.now();movement=updateMapScene(map,moved,before,landscapeAssets);movementMs.push(performance.now()-began);}
const movementFull=compileMapScene(moved,landscapeAssets);
for(const key of ['generated','stamps','resources','owners'] as const)if(!isDeepStrictEqual(movement[key],movementFull[key]))throw Error('Movement result differs: '+key);
if(movement.generated?.terrain!==before.generated?.terrain)throw Error('Movement did not reuse carved surface');
console.log(JSON.stringify({map:path,objects:result.generated?.objects.length,poseCommitMs:samples,meanMs:samples.reduce((a,b)=>a+b)/samples.length,fullCompileMs:fullMs,identicalOutput:true,reusedTerrain:true,movementMs,movementMeanMs:movementMs.reduce((a,b)=>a+b)/movementMs.length,reusedCarvedSurface:true,movementProfile:movement.profile},null,2));

/** Test whether a structured-cloned compiler snapshot is a useful startup seed.
 * Measures CPU/data correctness only; not IndexedDB, network or presentation. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {updateMapScene} from '../../src/shared/authoring/updateMapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {SceneSnapshotReader,SceneSnapshotWriter} from '../../src/shared/authoring/worker/scene';
const paths=process.argv.slice(2);if(!paths.length)paths.push('assets/maps/skirmish/heartroot-glade.utcmap');
const report=[];
for(const path of paths){
 const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map)throw Error(`Invalid map: ${path}`);
 let start=performance.now();const original=compileMapScene(map,landscapeAssets),compileMs=performance.now()-start;
 const snapshot=new SceneSnapshotWriter().write(original);
 start=performance.now();const copy=structuredClone({map,snapshot}),cloneMs=performance.now()-start;
 start=performance.now();const restored=new SceneSnapshotReader(landscapeAssets).read(copy.snapshot,copy.map),restoreMs=performance.now()-start;
 for(const key of ['stamps','resources','owners','generated'] as const)assert.deepStrictEqual(restored[key],original[key],`${path}: ${key}`);
 assert.deepStrictEqual(restored.field.samples,original.field.samples);
 for(let z=0;z<map.size;z+=7)for(let x=0;x<map.size;x+=7){assert.equal(restored.field.sample(x,z),original.field.sample(x,z));assert.equal(restored.field.waterAt(x,z),original.field.waterAt(x,z));}
 const object=copy.map.authoring?.objects[0];if(!object)throw Error('Needs one authored object for first-edit verification');
 const changed={...copy.map,authoring:{...copy.map.authoring!,objects:copy.map.authoring!.objects.map(o=>o===object?{...o,yaw:(o.yaw??0)+.2}:o)}};
 start=performance.now();const edited=updateMapScene(copy.map,changed,restored,landscapeAssets),editMs=performance.now()-start;
 const fresh=compileMapScene(changed,landscapeAssets);
 for(const key of ['stamps','resources','owners','generated'] as const)assert.deepStrictEqual(edited[key],fresh[key],`${path} edited: ${key}`);
 assert.deepStrictEqual(edited.field.samples,fresh.field.samples);
 report.push({path,compileMs,cloneMs,restoreMs,firstPoseEditMs:editMs,terrainReused:edited.field===restored.field,objects:original.generated?.objects.length});
}
console.log(JSON.stringify(report,null,2));

/** CPU authoring benchmark. Run with --cpu-prof for a local V8 profile; no browser/GPU claim. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets,projectScene} from '../../src/shared/authoring/project';
import {parseUtcMap} from '../../src/shared/map/utcmap';
const path=process.argv[2]??'assets/maps/skirmish/threewater-forest.utcmap';
const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map)throw Error('Invalid map');
const samples:number[]=[];let compiled:ReturnType<typeof compileMapScene>;
for(let i=0;i<6;i++){const start=performance.now();compiled=compileMapScene(map,landscapeAssets);if(i)samples.push(performance.now()-start);}
const original=projectScene(map),start=performance.now();
for(let i=0;i<100;i++)if(projectScene({...map,name:'Non-landscape edit '+i,entities:[...map.entities]})!==original)throw Error('Unrelated edit regenerated the landscape');
const unrelatedEditMs=(performance.now()-start)/100;
const hash=createHash('sha256');
for(const values of [compiled!.field.samples,compiled!.field.grassCoverage,compiled!.field.forestCoverage,...compiled!.generated!.paint.map(p=>p.weights)])if(values)hash.update(Buffer.from(values.buffer,values.byteOffset,values.byteLength));
hash.update(JSON.stringify({objects:compiled!.generated!.objects,stamps:compiled!.stamps,resources:compiled!.resources}));
console.log(JSON.stringify({map:path,compileMs:samples,meanMs:samples.reduce((a,b)=>a+b)/samples.length,unrelatedEditMs,objects:compiled!.generated?.objects.length,checksum:hash.digest('hex')},null,2));

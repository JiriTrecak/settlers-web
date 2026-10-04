/** CPU authoring benchmark. Run with --cpu-prof for a local V8 profile; no browser/GPU claim. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets,projectScene} from '../../src/shared/authoring/project';
import {parseUtcMap} from '../../src/shared/map/utcmap';
const path=process.argv[2]??'assets/maps/skirmish/threewater-forest.utcmap';
const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map)throw Error('Invalid map');
const runs=Number(process.env.BENCH_RUNS??6);if(!Number.isInteger(runs)||runs<1)throw Error('BENCH_RUNS must be a positive integer');
const samples:number[]=[];let compiled:ReturnType<typeof compileMapScene>;
for(let i=0;i<runs;i++){const start=performance.now();compiled=compileMapScene(map,landscapeAssets);const elapsed=performance.now()-start;if(i||runs===1)samples.push(elapsed);console.error(`Compile ${i+1}/${runs}: ${elapsed.toFixed(1)} ms (${compiled.generated?.objects.length??0} objects)`);}
const original=projectScene(map),start=performance.now();
for(let i=0;i<100;i++)if(projectScene({...map,name:'Non-landscape edit '+i,entities:[...map.entities]})!==original)throw Error('Unrelated edit regenerated the landscape');
const unrelatedEditMs=(performance.now()-start)/100;
const hash=createHash('sha256');
for(const values of [compiled!.field.samples,compiled!.field.grassCoverage,compiled!.field.forestCoverage,...compiled!.generated!.paint.map(p=>p.weights)])if(values)hash.update(Buffer.from(values.buffer,values.byteOffset,values.byteLength));
hash.update(JSON.stringify({objects:compiled!.generated!.objects,stamps:compiled!.stamps,resources:compiled!.resources}));
console.log(JSON.stringify({map:path,compileMs:samples,meanMs:samples.reduce((a,b)=>a+b)/samples.length,unrelatedEditMs,objects:compiled!.generated?.objects.length,checksum:hash.digest('hex'),build:compiled!.profile},null,2));

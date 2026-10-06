/** Offline water construction timings and exact output hashes. No GPU/FPS claim. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {waterSurface} from '../../src/render/water/waterSurface';
const paths=process.argv.slice(2);if(!paths.length)paths.push('assets/maps/skirmish/amberwake-basin.utcmap');
const reports=[];
for(const path of paths){
 const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map)throw Error(`Invalid map ${path}`);
 const {field}=compileMapScene(map,landscapeAssets),samples:number[]=[];
 let result:ReturnType<typeof waterSurface>;
 for(let i=0;i<7;i++){const t=performance.now();result=waterSurface(field);if(i)samples.push(performance.now()-t);}
 const hash=createHash('sha256');for(const buffer of [result!.flow,result!.ground,result!.profiles,...result!.tiles.map(t=>t.positions)])if(buffer)hash.update(Buffer.from(buffer.buffer,buffer.byteOffset,buffer.byteLength));
 hash.update(JSON.stringify(result!.tiles.map(t=>({x:t.x,z:t.z,indices:t.indices}))));
 reports.push({path,size:map.size,tiles:result!.tiles.length,meanMs:samples.reduce((a,b)=>a+b)/samples.length,samples,hash:hash.digest('hex')});
}
console.log(JSON.stringify(reports,null,2));

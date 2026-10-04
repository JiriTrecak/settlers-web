/** Exact foliage ground-tint bake with real map paints and published tile bytes.
 * node node_modules/vite-node/dist/cli.mjs --config vitest.config.ts scripts/bench/groundTint.ts [map]
 * Includes first texture reads separately; never writes map data. */
import {readFileSync} from 'node:fs';
import {readFile as readAsync} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {nativeGroundColor} from '../../src/render/terrain/nativeGroundColor';
import {HeightField} from '../../src/shared/map/height';

const path=process.argv[2]??'assets/maps/skirmish/heartroot-glade.utcmap';
const map=parseUtcMap(JSON.parse(readFileSync(path,'utf8')));if(!map)throw Error('Invalid map');
const field=compileMapScene(map,landscapeAssets).field;
const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=typeof input==='string'?input:input instanceof URL?input.pathname:input.url;
 const root=resolve('assets/library'),file=resolve('.'+url);
 if(!url.startsWith('/assets/library/')||!file.startsWith(root+'/'))throw Error('Unexpected texture URL '+url);
 return new Response(await readAsync(file));
};
try{
 const runs=[];
 for(let i=0;i<4;i++){
  // Immutable masks are shared, as they are across compatible editor updates;
  // each fresh field bypasses the per-field result cache.
  const next=Object.assign(new HeightField(map.size),field),start=performance.now();
  const result=await nativeGroundColor(next);
  runs.push({milliseconds:performance.now()-start,checksum:createHash('sha256').update(result.rgba).digest('hex'),size:result.size});
 }
 console.log(JSON.stringify({path,paints:field.surfacePaint?.length,first:runs[0],warm:runs.slice(1)},null,2));
}finally{globalThis.fetch=originalFetch;}

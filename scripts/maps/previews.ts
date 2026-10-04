import {readFile,writeFile,readdir,mkdir,stat} from 'node:fs/promises';
import {resolve,relative,basename,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {projectScene} from '../../src/shared/authoring/project';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {playableMapError} from '../../src/shared/map/playable';
import {mapOverview,type MapOverview} from '../../src/shared/map/overview';
import {atlasPixels,atlasSymbols} from './atlas';

const root=resolve('assets/maps'),out=resolve(root,'previews');
const options=process.argv.slice(2),check=options.includes('--check'),force=options.includes('--force'),only=options.find(v=>!v.startsWith('--'));
await mkdir(out,{recursive:true});
const previous=JSON.parse(await readFile(resolve(out,'index.json'),'utf8').catch(()=>'{}')) as Record<string,MapOverview&{generationHash?:string}>;
const next:typeof previous={};
// Include generator and validation dependencies so cached images/eligibility are
// regenerated when recipes, biome palettes, map rules or compiler behavior change.
const hash=createHash('sha256');
for(const path of ['scripts/maps/atlas.ts','scripts/maps/previews.ts','src/content/biomes.ts','content/game.json','assets/authoring/catalogue.json','src/shared/map/playable.ts',
 ...((await readdir('src/shared/authoring',{recursive:true})).filter(p=>p.endsWith('.ts')).sort().map(p=>'src/shared/authoring/'+p))])hash.update(await readFile(path));
const engineHash=hash.digest('hex');
let stale=0;
for(const group of ['campaign','skirmish','showcase'])for(const name of (await readdir(resolve(root,group),{recursive:true})).filter(n=>n.endsWith('.utcmap')).sort()){
 const file=resolve(root,group,name),id=basename(name,'.utcmap').toLowerCase();
 if(next[id])throw Error(`Duplicate map id ${id}`);
 const raw=await readFile(file,'utf8'),map=parseUtcMap(JSON.parse(raw));if(!map)throw Error(`Invalid map ${file}`);
 let custom:Buffer|undefined;
 for(const ext of ['webp','png','jpg','jpeg']){const path=file.replace(/\.utcmap$/,`.preview.${ext}`);try{custom=await readFile(path);break;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 const generationHash=createHash('sha256').update(engineHash).update(raw).update(custom??'generated').digest('hex');
 const old=previous[id],image=`${id}.webp`,exists=await stat(resolve(out,image)).then(()=>true,()=>false);
 if((!force&&old?.generationHash===generationHash&&exists)||(only&&only!==id)){if(old)next[id]=old;continue;}
 stale++;if(check){console.error(`Stale or missing preview: ${relative(root,file)}`);if(old)next[id]=old;continue;}
 const started=performance.now();
 const error=playableMapError(map),scene=projectScene(map)??compileMapScene(map,landscapeAssets);
 const encoded=custom?sharp(custom).resize(512,512,{fit:'cover'}):sharp(atlasPixels(map,scene),{raw:{width:512,height:512,channels:4}}).composite([{input:Buffer.from(atlasSymbols(map))}]);
 await encoded.webp({quality:90}).toFile(resolve(out,image));
 next[id]={...mapOverview(map,raw),playable:!error,...(error?{error}:{}),image,custom:!!custom,generationHash};
 console.log(`${id}: ${Math.round(performance.now()-started)} ms · ${error??'playable'}${custom?' · custom image':''}`);
}
if(check){if(stale)process.exitCode=1;}else{
 await writeFile(resolve(out,'index.json'),JSON.stringify(next,null,2)+'\n');
 console.log(`Previews: ${stale} updated, ${Object.keys(next).length} maps. ${relative(process.cwd(),dirname(resolve(out,'index.json')))}`);
}

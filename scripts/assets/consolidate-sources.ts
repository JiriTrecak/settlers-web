/** One-time, lossless source migration. Legacy working trees are retained only in
 * ignored .asset-work until their canonical rebuilds have been verified. */
import {readFile,readdir,mkdir,writeFile,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readPackages,definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
import {assetDefinitionSchema,assetFolder,resourceFilename,type AssetDefinition,type FileRole} from '../../src/shared/authoring/asset';
const root=process.cwd(),packages=await readPackages(root),byId=new Map(packages.map(a=>[a.id,a]));
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const aliases:Record<string,string>={'buildings/acorn-hall-tripo':'asset.models.buildings.ants-acorn-hall','buildings/mandible-hall':'asset.models.buildings.ants-mandible-hall','characters/ant-warrior-tripo':'asset.models.units.ants-warrior'};
const changed=new Set<string>();let copied=0,reused=0;
for(const category of await readdir('art/sources')){
 if(!(await stat('art/sources/'+category)).isDirectory())continue;
 for(const slug of await readdir('art/sources/'+category)){
  const directory=`art/sources/${category}/${slug}`;if(!(await stat(directory)).isDirectory())continue;
  let config:any={};try{config=JSON.parse(await readFile(directory+'/asset.json','utf8'));}catch{}
  let id=config.publication?.id??aliases[category+'/'+slug]??packages.find(a=>a.id.endsWith('.'+slug))?.id;
  if(id&&!byId.has(id))id=undefined;
  id??='asset.sources.'+category+'-'+slug;
  let asset=byId.get(id);
  if(!asset){asset=assetDefinitionSchema.parse({version:1,id,name:slug,kind:'data',status:'archived',revision:1,resources:[],usesGeometry:false,provenance:{method:'migration'}});packages.push(asset);byId.set(id,asset);}
  const folder=assetFolder(asset.id);await mkdir(folder,{recursive:true});
  const refs:Record<string,{asset:string;role:FileRole;index:number}>={};
  async function add(name:string,bytes:Buffer,role:FileRole,format:string){
   const sha256=hash(bytes),existing=asset!.resources.find(r=>r.sha256===sha256&&r.format===format);
   if(existing){refs[name]={asset:asset!.id,role:existing.role,index:existing.index};reused++;return;}
   const index=Math.max(0,...asset!.resources.filter(r=>r.role===role).map(r=>r.index))+1;
   const r={role,index,format,sha256,bytes:bytes.length};asset!.resources.push(r);await writeFile(folder+'/'+resourceFilename(r),bytes);refs[name]={asset:asset!.id,role,index};copied++;
  }
  for(const name of (await readdir(directory)).sort()){
   const file=directory+'/'+name;if(!(await stat(file)).isFile())continue;
   const ext=path.extname(name).slice(1).toLowerCase();
   // Disposable reports and backups remain in the ignored recovery tree only.
   if(['log','blend1'].includes(ext)||['comparison.png','samples.png','viewer.json','render-info.json','model-stats.json','locomotion.json'].includes(name)||name.startsWith('.'))continue;
   const format=ext==='jpg'?'jpeg':ext;
   if(!['blend','glb','gltf','png','jpeg','webp','svg','json','bin','md','txt','py','ts','mjs','wav','ogg','mp3'].includes(format))throw Error('Unclassified source: '+file);
   let bytes=await readFile(file);
   if(['py','ts','mjs'].includes(ext))bytes=Buffer.from(bytes.toString().replaceAll('art/sources/','.asset-work/build/').replaceAll("'art/sources'","'.asset-work/build'"));
   await add(name,bytes,['py','ts','mjs'].includes(ext)?'recipe':'source',format);
  }
  const build={version:1,category,slug,entry:config.recipe??(refs['model.py']?'model.py':undefined),files:refs};
  const bytes=Buffer.from(JSON.stringify(build,null,2)+'\n');
  await add('__build__',bytes,'build','json');
  asset.revision++;assetDefinitionSchema.parse(asset);changed.add(asset.id);
 }
}
const plan=await planPublication(root,packages.filter(a=>a.status==='published'),new Set([...changed].filter(id=>byId.get(id)!.status==='published')),new Map());
await commitFiles(root,[...packages.filter(a=>changed.has(a.id)).map(a=>({path:assetFolder(a.id)+'/asset.json',bytes:definitionBytes(a)})),...plan.writes]);
await mkdir('.asset-work/recovery',{recursive:true});
await rename('art/sources','.asset-work/recovery/sources-before-consolidation');
console.log({packages:changed.size,canonicalFilesAdded:copied,duplicateFilesReused:reused,recovery:'.asset-work/recovery/sources-before-consolidation'});

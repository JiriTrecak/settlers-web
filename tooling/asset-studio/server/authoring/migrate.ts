/** Audited conversion from the legacy registry. It never deletes the source collection. */
import path from 'node:path';
import {readFile,access} from 'node:fs/promises';
import {assetDefinitionSchema,assetFolder,resourceFilename,ROLE_FORMATS,type AssetDefinition,type FileRole,type AssetResource} from '../../../../src/shared/authoring/asset';
import {records} from '../manifest';
import {filesIn,hash,within,atomic,saveJson} from '../storage';
import type {AssetRecord} from '../../shared/schema';
export type MigrationCopy={source:string;target:string;sha256:string;bytes:number};
export type MigrationPlan={version:1;assets:AssetDefinition[];copies:MigrationCopy[];mapping:Record<string,{asset:string;role:FileRole;index:number}>;excluded:{path:string;reason:string}[];warnings:string[]};
function format(file:string){return path.extname(file).slice(1).toLowerCase().replace(/^jpg$/,'jpeg');}
export function classifyRecord(record:AssetRecord):AssetDefinition['kind']{
 if(record.kind!=='model')return record.kind;
 const files=record.outputs.map(o=>o.path).join(' '),name=(record.id+' '+files).toLowerCase();
 if(record.scenery.some(s=>s.type==='span'))return 'bridge';
 if(/\/buildings\//.test(files))return 'building';
 if(/\/units\//.test(files))return 'unit';
 if(/(?:\/trees\/|\btree\b|reference-fir)/.test(name))return 'tree';
 if(/(?:\/grass\/|\/mushrooms\/|bush|flower|fern|foliage)/.test(name))return 'foliage';
 if(/neutral-(wolf|troll|bandit|goblin)$/.test(record.id))return 'creature';
 return 'prop';
}
function outputRole(file:string,kind:string):FileRole{
 const ext=format(file);if(ext==='glb')return 'geometry';if(['wav','ogg','mp3'].includes(ext))return 'audio';
 if(['png','jpeg','webp','svg'].includes(ext))return kind==='texture'?'albedo':'image';return 'data';
}
export async function planMigration(root:string):Promise<MigrationPlan>{
 const all=await records(root),plan:MigrationPlan={version:1,assets:[],copies:[],mapping:{},excluded:[],warnings:[]};
 async function add(asset:AssetDefinition,source:string,role:FileRole){
  const bytes=await readFile(await within(root,source)),ext=format(source);
  if(!ROLE_FORMATS[role].includes(ext))throw Error(`Cannot map ${source} to ${role}`);
  const resource:AssetResource={role,index:asset.resources.filter(r=>r.role===role).length+1,format:ext,bytes:bytes.length,sha256:hash(bytes)};
  asset.resources.push(resource);plan.copies.push({source,target:assetFolder(asset.id)+'/'+resourceFilename(resource),sha256:resource.sha256,bytes:bytes.length});
  return {asset:asset.id,role,index:resource.index};
 }
 const rawAssets=new Map<string,AssetDefinition>();
 for(const record of all){
  const a:AssetDefinition={version:1,id:record.id,name:record.name,kind:classifyRecord(record),revision:record.revision,status:record.status,tags:record.tags,resources:[],usesGeometry:false,transform:{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'},materials:[],bindings:{faction:record.faction,profile:record.profile,render:[],scenery:[]},capabilities:{},provenance:{method:'migration',sourceHash:record.source.sha256}};
  for(const output of record.outputs){const ref=await add(a,output.path,outputRole(output.path,record.kind)),copy=plan.copies.at(-1)!;if(copy.sha256!==output.sha256)throw Error('Unpublished legacy output: '+output.path);if(plan.mapping[output.path])throw Error('Duplicate legacy output '+output.path);plan.mapping[output.path]=ref;}
  const source=await readFile(await within(root,record.source.path));if(hash(source)!==record.source.sha256)throw Error('Changed legacy source: '+record.source.path);
  // Do not duplicate a runtime-only source already present as geometry/image.
  if(!record.outputs.some(o=>o.sha256===record.source.sha256))await add(a,record.source.path,'source');
  a.usesGeometry=a.resources.some(r=>r.role==='geometry');rawAssets.set(a.id,a);
 }
 // Resolve references only after every asset has a stable role/index address.
 for(const record of all){const a=rawAssets.get(record.id)!;
  const link=(file:string)=>{const ref=plan.mapping[file];if(!ref)throw Error('Undeclared legacy dependency '+file);return ref;};
  a.bindings.render=record.render.map(({file,image,harvestAnimation,...binding})=>({...binding,...(file?{geometry:link(file)}:{}),...(image?{image:link(image)}:{}),...(harvestAnimation?{harvestAnimation:link(harvestAnimation)}:{})}));
  a.bindings.scenery=record.scenery.map(({file,blockers,...binding})=>{const ref=link('assets/'+file);return {...binding,...(blockers?{blockers:[...blockers]}:{}),geometry:{role:ref.role,index:ref.index}};});
  plan.assets.push(assetDefinitionSchema.parse(a));
 }
 for(const absolute of await filesIn(path.join(root,'assets'))){const file=path.relative(root,absolute).replaceAll(path.sep,'/');if(plan.mapping[file])continue;
  if(file.startsWith('assets/library/')){plan.excluded.push({path:file,reason:'Generated publication directory'});continue;}
  const ext=format(file),name=path.basename(file);
  if(name.startsWith('.')||ext==='md'||['assets/manifest.json','assets/maps/catalog.json'].includes(file)){plan.excluded.push({path:file,reason:'Bookkeeping / generated manifest / documentation'});continue;}
  const id='asset.unregistered.'+file.slice(7).replace(/[^a-zA-Z0-9._-]/g,'.');
  const kind:AssetDefinition['kind']=ext==='utcmap'?'map':['png','jpeg','webp'].includes(ext)?'texture':['wav','ogg','mp3'].includes(ext)?'audio':'data';
  const a=assetDefinitionSchema.parse({version:1,id,name:name.replace(/\.[^.]+$/,''),kind,revision:1,status:'published',tags:['migrated','previously-unregistered'],resources:[],usesGeometry:false,provenance:{method:'migration'}});
  let role:FileRole=ext==='gltf'?'source':outputRole(file,kind);
  // Packed normal/height, LUT and other source textures retain original bytes and encoding.
  if(/(?:_nh_|__n_|displacement|lut|cube|occlusion)/.test(file)&&ext==='bin')role='data';
  plan.mapping[file]=await add(a,file,role);
  if(ext==='gltf'){a.status='draft';plan.warnings.push(`${file}: source-only glTF requires a self-contained GLB before publication`);}
  plan.assets.push(assetDefinitionSchema.parse(a));
 }
 return plan;
}
export async function applyMigration(root:string,plan:MigrationPlan){
 // Preflight every hash and target before the first write; reruns are safe, edits are never overwritten.
 for(const copy of plan.copies){const source=await within(root,copy.source),target=await within(root,copy.target);if(hash(await readFile(source))!==copy.sha256)throw Error('Source changed since audit: '+copy.source);
  try{await access(target);if(hash(await readFile(target))!==copy.sha256)throw Error('Authored target already differs: '+copy.target);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 }
 for(const a of plan.assets){const file=await within(root,assetFolder(a.id)+'/asset.json');try{await access(file);if((await readFile(file,'utf8'))!==JSON.stringify(a,null,2)+'\n')throw Error('Authored definition already differs: '+a.id);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 for(const copy of plan.copies)await atomic(await within(root,copy.target),await readFile(await within(root,copy.source)));
 for(const a of plan.assets)await saveJson(await within(root,assetFolder(a.id)+'/asset.json'),a);
}

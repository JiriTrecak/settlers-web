import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {assetDefinitionSchema,assetFolder,resourceFilename,type AssetDefinition,type ResourceRef} from '../../../../src/shared/authoring/asset';
import {filesIn,hash,json,within} from '../storage';
import {recordSchema,type AssetRecord} from '../../shared/schema';
export async function readPackages(root:string):Promise<AssetDefinition[]>{
 const packages:AssetDefinition[]=[];
 for(const file of await filesIn(path.join(root,'art/assets')))if(file.endsWith('/asset.json')){
  const asset=assetDefinitionSchema.parse(await json(file));
  if(path.dirname(file)!==path.join(root,assetFolder(asset.id)))throw Error('Asset folder must match its ID: '+file);
  packages.push(asset);
 }
 return packages;
}
export async function validatePackage(root:string,asset:AssetDefinition){
 assetDefinitionSchema.parse(asset);
 for(const r of asset.resources){const p=await within(root,assetFolder(asset.id)+'/'+resourceFilename(r)),b=await readFile(p);if(hash(b)!==r.sha256||b.length!==r.bytes)throw Error('Unpublished or damaged resource: '+p);}
}
/** Runtime paths are derived outputs. No authored definition chooses a filename. */
export function publishedResource(asset:AssetDefinition,ref:ResourceRef):string{
 const r=asset.resources.find(r=>r.role===ref.role&&r.index===ref.index);if(!r)throw Error(`Undeclared resource ${asset.id}/${ref.role}:${ref.index}`);
 return `assets/library/${asset.id}/${resourceFilename(r)}`;
}
export function compilePackageRecords(all:AssetDefinition[]):AssetRecord[]{
 const byId=new Map(all.map(a=>[a.id,a]));if(byId.size!==all.length)throw Error('Duplicate authored asset IDs');
 const resolve=(ref:ResourceRef&{asset:string})=>{const a=byId.get(ref.asset);if(!a||a.status!=='published')throw Error('Missing published dependency '+ref.asset);return publishedResource(a,ref);};
 return all.filter(a=>a.status==='published').map(a=>{
  const model=a.usesGeometry,kind=model?'model':['icon','interface','texture','audio','map','data'].includes(a.kind)?a.kind:'data';
  const outputs=a.resources.filter(r=>!['source','reference','preview','generation'].includes(r.role)).map(r=>({role:r.role==='geometry'?'model':['image','albedo'].includes(r.role)?'image':'data',path:publishedResource(a,r),sha256:r.sha256,bytes:r.bytes}));
  if(!outputs.length){const bytes=definitionBytes(a);outputs.push({role:'data',path:publishedDefinition(a),sha256:hash(bytes),bytes:bytes.length});}
  const render=a.bindings.render.map(({geometry,image,harvestAnimation,...binding})=>({...binding,...(geometry?{file:resolve(geometry)}:{}),...(image?{image:resolve(image)}:{}),...(harvestAnimation?{harvestAnimation:resolve(harvestAnimation)}:{})}));
  const scenery=a.bindings.scenery.map(({geometry,...binding})=>({...binding,file:publishedResource(a,geometry).replace(/^assets\//,'')}));
  const master=a.resources.filter(r=>r.role==='source'&&['png','jpeg','webp'].includes(r.format)).at(-1);
  return recordSchema.parse({version:1,id:a.id,name:a.name,kind,tags:a.tags,status:'published',revision:a.revision,profile:a.bindings.profile??a.kind,...(a.bindings.faction?{faction:a.bindings.faction}:{}),outputs,render,scenery,source:master?{path:assetFolder(a.id)+'/'+resourceFilename(master),sha256:master.sha256,quality:'master'}:{path:outputs[0]!.path,sha256:outputs[0]!.sha256,quality:'runtime-only'},origin:{method:a.provenance.method==='generated'?'openai':a.provenance.method==='import'?'import':'migration',...(a.provenance.generation?{job:assetFolder(a.id)+'/'+resourceFilename({...a.provenance.generation,format:'json'})}:{})},validation:{checkedAt:'derived',warnings:[]}});
 });
}

export const definitionBytes=(asset:AssetDefinition)=>Buffer.from(JSON.stringify(asset,null,2)+'\n');
export const publishedDefinition=(asset:AssetDefinition)=>`assets/library/${asset.id}/definition.json`;
export const runtimeResources=(asset:AssetDefinition)=>asset.resources.filter(r=>!['source','reference','preview','generation'].includes(r.role));

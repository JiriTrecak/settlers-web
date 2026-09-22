/** Publish original artwork through the same validated, atomic path as the asset editor. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {assetDefinitionSchema,assetFolder,type AssetDefinition,type FileRole} from '../../src/shared/authoring/asset';
import {definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';

export type OriginalPackage={definition:AssetDefinition;files:Map<string,Buffer>};
export function originalPackage(id:string,name:string,kind:AssetDefinition['kind'],method:'authored'|'generated'='generated'):OriginalPackage {
 return {definition:{version:1,id,name,kind,revision:1,status:'published',tags:['original','woodland'],resources:[],usesGeometry:false,
  transform:{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'},materials:[],bindings:{render:[],scenery:[]},capabilities:{},
  provenance:{method,licenseNote:'Original artwork created for Under the Canopy.'}},files:new Map()};
}
export function addBytes(pack:OriginalPackage,role:FileRole,format:string,bytes:Buffer,index=1){
 pack.definition.resources.push({role,index,format,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 pack.files.set(`${assetFolder(pack.definition.id)}/${role}${index===1?'':'_'+index}.${format}`,bytes);
 if(role==='geometry')pack.definition.usesGeometry=true;
 if(role==='generation')pack.definition.provenance.generation={role,index};
}
export async function addFile(pack:OriginalPackage,role:FileRole,format:string,path:string,index=1){addBytes(pack,role,format,await readFile(path),index);}
export async function publishOriginals(packs:OriginalPackage[],edit?:(index:Map<string,AssetDefinition>,changed:Set<string>)=>void){
 await withWorkspaceWriteLock(process.cwd(),async()=>{
  const root=process.cwd(),all=await readPublished(root);if(!all)throw Error('Canonical asset registry is required');
  const index=new Map(all.map(a=>[a.id,a])),changed=new Set<string>(),staged=new Map<string,Buffer>();
  for(const pack of packs){const a=pack.definition;a.revision=(index.get(a.id)?.revision??0)+1;assetDefinitionSchema.parse(a);index.set(a.id,a);changed.add(a.id);for(const [p,b]of pack.files)staged.set(p,b);}
  edit?.(index,changed);
  const plan=await planPublication(root,[...index.values()],changed,staged);
  await commitFiles(root,[...[...staged].map(([path,bytes])=>({path,bytes})),...[...changed].map(id=>({path:assetFolder(id)+'/asset.json',bytes:definitionBytes(index.get(id)!)})),...plan.writes]);
  console.log('Published original assets:',[...changed]);
 });
}

import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {withWorkspaceWriteLock} from '../../tooling/asset-studio/server/writeLock';
import {readPublished,planPublication} from '../../tooling/asset-studio/server/authoring/publication';
import {definitionBytes} from '../../tooling/asset-studio/server/authoring/packages';
import {assetDefinitionSchema,assetFolder} from '../../src/shared/authoring/asset';
import {commitFiles} from '../../tooling/asset-studio/server/transaction';
await withWorkspaceWriteLock(process.cwd(),async()=>{
 const root=process.cwd(),index=new Map((await readPublished(root))!.map(a=>[a.id,a])),changed=new Set<string>(),staged=new Map<string,Buffer>();
 for(const [id,file,name] of [['asset.terrain.pebble-trail','albedo','Forest pebbles · albedo/roughness'],['asset.terrain.pebble-normal','normal','Forest pebbles · normal/height']]){
  const a=structuredClone(index.get('asset.terrain.autumn-leaf-litter')!);a.id=id!;a.name=name!;a.tags=['original','forest','trail'];a.resources=[];
  for(const [role,format,path] of [['data','bin',`/tmp/utc-pebble/${file}.bin`],['generation','json','/tmp/utc-pebble/generation.json'],...(file==='albedo'?[['albedo','png','/tmp/utc-pebble/albedo.png']]:[])]){
   const bytes=await readFile(path!);a.resources.push({role:role as 'data',index:1,format:format!,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});staged.set(assetFolder(a.id)+'/'+role+'.'+format,bytes);
  }
  index.set(a.id,assetDefinitionSchema.parse(a));changed.add(a.id);
 }
 for(const tile of ['grass','soil']){const a=structuredClone(index.get(`asset.terrain.woodland-${tile}`)!);a.kind='terrain-material';index.set(a.id,a);changed.add(a.id);}
 for(const [slug,name,material,clearance] of [['pebbles','Pebble forest trail','asset.terrain.pebble-trail',1],['grass','Grass ground','asset.terrain.woodland-grass',0],['soil','Exposed earth','asset.terrain.woodland-soil',1]] as const){
  const a=structuredClone(index.get('recipe.terrain.bank')!);a.id='recipe.path.'+slug;a.name=name;a.recipe={type:'path',material,width:5,shoulder:1.5,flatten:0,vegetationClearance:clearance};a.tags=['forest','surface','paint','path'];index.set(a.id,assetDefinitionSchema.parse(a));changed.add(a.id);
 }
 const plan=await planPublication(root,[...index.values()],changed,staged);
 await commitFiles(root,[...[...staged].map(([path,bytes])=>({path,bytes})),...[...changed].map(id=>({path:assetFolder(id)+'/asset.json',bytes:definitionBytes(index.get(id)!)})),...plan.writes]);console.log('Published', [...changed]);
});

/** Published snapshots isolate draft edits; one journal commits binaries and every runtime index. */
import path from 'node:path';
import {ContentRegistry,type ContentSource} from '../../../../src/content/registry';
import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {assetDefinitionSchema,assetFolder,resourceFilename,type AssetDefinition,type ResourceRef} from '../../../../src/shared/authoring/asset';
import {modelCatalogue} from '../../../../src/shared/authoring/modelCatalogue';
import {landscapeCatalogue} from '../../../../src/shared/authoring/catalogue';
import {compile,urlModule} from '../manifest';
import {commitFiles} from '../transaction';
import {hash,json,within,filesIn} from '../storage';
import {compilePackageRecords,definitionBytes,publishedDefinition,publishedResource,runtimeResources} from './packages';
import type {Manifest} from '../../shared/schema';
export const RELEASE_PATH='assets/authoring/published.json';
const releaseSchema=z.object({version:z.literal(1),assets:z.array(assetDefinitionSchema)}).strict();
export async function readPublished(root:string):Promise<AssetDefinition[]|undefined>{
 try{return releaseSchema.parse(await json(await within(root,RELEASE_PATH))).assets;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e;}
}
export function validateDependencies(all:readonly AssetDefinition[]){
 const index=new Map(all.map(a=>[a.id,a]));if(index.size!==all.length)throw Error('Duplicate published asset ID');
 for(const asset of all){
  assetDefinitionSchema.parse(asset);if(asset.status!=='published')throw Error('Runtime snapshots must be published: '+asset.id);
  const requireAsset=(id:string,kind?:AssetDefinition['kind'])=>{const target=index.get(id);if(!target)throw Error(`${asset.id} requires published asset ${id}`);if(kind&&target.kind!==kind)throw Error(`${asset.id} requires ${id} to be ${kind}`);return target;};
  const ref=(r:ResourceRef&{asset:string},allowed:readonly string[])=>{const target=requireAsset(r.asset);if(!allowed.includes(r.role)||!runtimeResources(target).some(v=>v.role===r.role&&v.index===r.index))throw Error(`${asset.id} has an invalid runtime resource reference to ${r.asset}/${r.role}:${r.index}`);};
  for(const binding of asset.bindings.render){if(binding.geometry)ref(binding.geometry,['geometry']);if(binding.image)ref(binding.image,['image','albedo']);if(binding.harvestAnimation)ref(binding.harvestAnimation,['geometry','animation']);}
  if(asset.capabilities.harvesting){const replacement=requireAsset(asset.capabilities.harvesting.replacement);if(!replacement.usesGeometry||replacement.id===asset.id)throw Error('Harvest replacement must be a different model');}
  const recipe=asset.recipe;if(!recipe)continue;
  if(recipe.type==='river'){for(const group of Object.values(recipe.details??{}))for(const species of group.species){const target=requireAsset(species.asset);if(!target.usesGeometry||!target.bindings.scenery.length)throw Error('River detail needs a scenery model: '+target.id);}requireAsset(recipe.water,'water-profile');if(recipe.bankMaterial)requireAsset(recipe.bankMaterial,'terrain-material');if(recipe.bedMaterial)requireAsset(recipe.bedMaterial,'terrain-material');}
  if(recipe.type==='path')requireAsset(recipe.material,'terrain-material');
  if('species'in recipe){for(const species of [...recipe.species,...(recipe.type==='forest'?recipe.edge?.species??[]:[])]){const target=requireAsset(species.asset);if(!target.usesGeometry||!target.bindings.scenery.length)throw Error(`${asset.id} species ${target.id} requires a scenery model binding`);}}
 }
}
type Write={path:string;bytes:Buffer};
export type PublicationPlan={assets:AssetDefinition[];manifest:Manifest;writes:Write[]};
/** changed IDs read authoring bytes; unchanged IDs use and verify the previous published bytes. */
export async function planPublication(root:string,assets:AssetDefinition[],changed:ReadonlySet<string>,staged:ReadonlyMap<string,Buffer>=new Map()):Promise<PublicationPlan>{
 const sorted=[...assets].sort((a,b)=>a.id.localeCompare(b.id));validateDependencies(sorted);
 const manifest=compile(compilePackageRecords(sorted)),writes:Write[]=[];
 let content:Omit<ContentSource,'assets'>|undefined;
 try{content=await json(await within(root,'content/game.json'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 if(content)new ContentRegistry({...content,assets:manifest.records.flatMap(a=>a.render)});
 const prior=await readPublished(root),ids=new Set(sorted.map(a=>a.id)),scenery=new Set(manifest.records.flatMap(a=>a.scenery.map(s=>s.id)));
 const removedAssets=new Set((prior??[]).filter(a=>!ids.has(a.id)).map(a=>a.id));
 const removedScenery=new Set((prior??[]).flatMap(a=>a.bindings.scenery.map(s=>s.id)).filter(id=>!scenery.has(id)));
 if(removedAssets.size||removedScenery.size)for(const file of await filesIn(path.join(root,'assets/maps'))){
  if(!file.endsWith('.utcmap'))continue;
  const map=await json<{stamps?:{asset:string}[];authoring?:{layers:{recipe:string}[];objects:{asset:string}[]}}>(file);
  const missing=map.stamps?.find(s=>removedScenery.has(s.asset))?.asset??map.authoring?.layers.find(l=>removedAssets.has(l.recipe))?.recipe??map.authoring?.objects.find(o=>removedAssets.has(o.asset))?.asset;
  if(missing)throw Error(`Map ${path.basename(file)} still uses ${missing}`);
 }

 const add=async(path:string,bytes:Buffer)=>{try{if(hash(await readFile(await within(root,path)))===hash(bytes))return;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}writes.push({path,bytes});};
 for(const asset of sorted){
  if(changed.has(asset.id))for(const resource of asset.resources){
   const source=assetFolder(asset.id)+'/'+resourceFilename(resource),bytes=staged.get(source)??await readFile(await within(root,source));
   if(bytes.length!==resource.bytes||hash(bytes)!==resource.sha256)throw Error('Unpublished or damaged resource: '+source);
  }
  for(const resource of runtimeResources(asset)){
   const target=publishedResource(asset,resource),source=changed.has(asset.id)?assetFolder(asset.id)+'/'+resourceFilename(resource):target;
   const bytes=staged.get(source)??await readFile(await within(root,source));if(bytes.length!==resource.bytes||hash(bytes)!==resource.sha256)throw Error('Damaged publication resource: '+source);
   if(changed.has(asset.id))await add(target,bytes);
  }
  if(!runtimeResources(asset).length)await add(publishedDefinition(asset),definitionBytes(asset));
 }
 await add('assets/authoring/models.json',Buffer.from(JSON.stringify(modelCatalogue(sorted),null,2)+'\n'));
 await add('assets/authoring/catalogue.json',Buffer.from(JSON.stringify(landscapeCatalogue(sorted),null,2)+'\n'));
 await add(RELEASE_PATH,Buffer.from(JSON.stringify({version:1,assets:sorted},null,2)+'\n'));
 await add('src/shared/assets/urls.generated.ts',Buffer.from(urlModule(manifest)));
 await add('assets/manifest.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
 return {assets:sorted,manifest,writes};
}
export async function publishAsset(root:string,current:AssetDefinition,archive=false){
 const released=await readPublished(root);if(!released)throw Error('Initialize canonical publication with assets:publish first');
 const next=assetDefinitionSchema.parse({...current,status:archive?'archived':'published',revision:current.revision+1});
 const assets=[...released.filter(a=>a.id!==next.id),...(archive?[]:[next])];
 const plan=await planPublication(root,assets,new Set(archive?[]:[next.id]));
 // All preflight checks finish before any mutation. Authoring revision and runtime move together.
 await commitFiles(root,[{path:assetFolder(next.id)+'/asset.json',bytes:definitionBytes(next)},...plan.writes]);return next;
}

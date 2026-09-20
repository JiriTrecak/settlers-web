import {assetDefinitionSchema,assetFolder,type AssetDefinition} from '../../../../src/shared/authoring/asset';
import {definitionBytes} from './packages';
import {missingModelPackage,MISSING_MODEL_ID} from './placeholder';

/** Explicit project direction, not a name-based heuristic that hides future authored assets. */
export function legacyStyleModel(asset:AssetDefinition):boolean{
 return asset.usesGeometry&&asset.id!==MISSING_MODEL_ID&&!asset.tags.some(tag=>['forest-warfare','scouring'].includes(tag));
}
export async function retirementPlan(released:AssetDefinition[],working:AssetDefinition[]){
 const retired=released.filter(legacyStyleModel),ids=new Set(retired.map(a=>a.id));
 if(released.some(a=>a.id===MISSING_MODEL_ID))throw Error('Style retirement is already applied; use the recorded audit for subsequent changes');
 const active=working.filter(a=>ids.has(a.id));
 for(const a of active){const previous=released.find(p=>p.id===a.id)!;if(JSON.stringify(a)!==JSON.stringify(previous))throw Error('Unpublished edits must be resolved before retiring '+a.id);}
 const placeholder=await missingModelPackage(),ref={asset:MISSING_MODEL_ID,role:'geometry' as const,index:1};
 placeholder.asset.bindings.render=retired.flatMap(a=>a.bindings.render.map(b=>{
  const {character:_character,carryAsset:_carry,projectileSocket:_socket,...rest}=b;
  return {...rest,geometry:ref,...(b.harvestAnimation?{harvestAnimation:ref}:{}),scale:1};
 }));
 placeholder.asset.bindings.scenery.push(...retired.flatMap(a=>a.bindings.scenery.map(s=>({...s,name:'Missing · '+s.name,editorHidden:true,geometry:{role:'geometry' as const,index:1}}))));
 assetDefinitionSchema.parse(placeholder.asset);
 const next=[...released.filter(a=>!ids.has(a.id)),placeholder.asset];
 const archived=active.map(a=>assetDefinitionSchema.parse({...a,status:'archived',revision:a.revision+1}));
 const prefix=assetFolder(MISSING_MODEL_ID),staged=new Map([[prefix+'/geometry.glb',placeholder.geometry],[prefix+'/albedo.png',placeholder.albedo]]);
 const writes=[...staged].map(([path,bytes])=>({path,bytes}));
 writes.push({path:prefix+'/asset.json',bytes:definitionBytes(placeholder.asset)},...archived.map(a=>({path:assetFolder(a.id)+'/asset.json',bytes:definitionBytes(a)})));
 const audit={version:1,policy:'Keep Scouring references and forest-warfare models. Archive prior styles; preserve required runtime IDs with diagnostic geometry.',placeholder:MISSING_MODEL_ID,retired:retired.map(a=>({id:a.id,name:a.name,tags:a.tags,revision:a.revision,render:a.bindings.render.map(b=>b.id),scenery:a.bindings.scenery.map(b=>b.id),resources:a.resources.map(r=>({role:r.role,index:r.index,sha256:r.sha256,bytes:r.bytes}))})),retainedModels:next.filter(a=>a.usesGeometry).map(a=>a.id)};
 return {assets:next,staged,writes,audit};
}
